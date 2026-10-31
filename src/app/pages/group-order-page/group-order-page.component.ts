import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import {
  catchError,
  EMPTY,
  exhaustMap,
  filter,
  forkJoin,
  merge,
  of,
  Subject,
  switchMap,
  throwError,
  timer,
} from 'rxjs';

import { GroupOrdersService } from '@app/services/group-orders/group-orders.service';
import { ToastService } from '@app/services/toast/toast.service';

import { ParticipantCardComponent } from '@app/components/group-orders/participant-card.component';
import { CustomButtonComponent } from '@app/shared/custom-components/custom-button/custom-button.component';
import { ModalComponent } from '@app/shared/custom-components/modal/modal.component';

import { Participant } from '@app/models/group-orders/participant.model';
import { GroupReservationStatus } from '@app/models/group-orders/group-status.model';
import { consolidatePreOrder } from '@app/shared/helpers/consolidate-pre-order';
import { HttpErrorResponse } from '@angular/common/http';
import { Order } from '@app/models/orders/order.model';
import { GroupSessionsResponse } from '@app/models/group-orders/group-sessions-response.model';
import { GroupStatusResponse } from '@app/models/group-orders/group-status.model';

@Component({
  selector: 'app-group-order-page',
  standalone: true,
  imports: [ParticipantCardComponent, CustomButtonComponent, ModalComponent],
  styleUrl: './group-order-page.component.scss',
  template: `
    <main class="group-order-page">
      @if (loading()) {
        <p>Loading group pre-order...</p>
      } @else if (error()) {
        <div class="error-state">
          <p>{{ error() }}</p>

          <button type="button" (click)="loadGroupOrder()">Try again</button>
        </div>
      } @else {
        <!-- HEADER -->
        <header class="group-order-header">
          <div class="header-top">
            <div class="header-title">
              <h1>Group Pre-Order</h1>

              <span class="status-badge" [class.status-badge--submitted]="groupStatus() !== 'Open'">
                {{ groupStatus() === 'Open' ? 'Collecting pre-orders' : 'Sent to Restaurant' }}
              </span>
            </div>
          </div>

          <div class="group-order-refresh">
            <div class="sync-status">
              <span class="sync-indicator"></span>

              <div class="sync-details">
                <span class="sync-title">
                  {{ groupStatus() === 'Open' ? 'Auto-sync active' : 'Order finalized' }}
                </span>

                <span class="sync-time" aria-live="polite">
                  Updated at {{ lastUpdatedLabel() }}
                </span>
              </div>
            </div>

            <button
              type="button"
              class="refresh-button"
              (click)="refreshNow()"
              [disabled]="isRefreshing() || isSubmitting() || groupStatus() !== 'Open'"
            >
              <span class="refresh-icon" [class.spinning]="isRefreshing()">↻</span>
              {{ isRefreshing() ? 'Refreshing...' : 'Refresh' }}
            </button>
          </div>

          <div class="reservation-meta">
            <span class="meta-item">
              <span class="meta-icon" aria-hidden="true">⌖</span>
              {{ locationAddress() }}
            </span>

            <span class="meta-item">
              <span class="meta-icon" aria-hidden="true">▦</span>
              {{ formattedDate() }}
            </span>

            <span class="meta-item">
              <span class="meta-icon" aria-hidden="true">◷</span>
              {{ formattedTime() }}
            </span>

            <span class="meta-item">
              <span class="meta-icon" aria-hidden="true">♙</span>
              {{ participants().length }} of {{ maxGuestCount() }} guests
            </span>
          </div>
        </header>

        <!-- WARNING -->
        @if (unsubmittedCount() > 0) {
          <div class="group-order-notice" role="note">
            <span class="notice-icon" aria-hidden="true">ⓘ</span>

            <p>
              @if (unsubmittedCount() === 1) {
                1 participant hasn't submitted their cart yet — their dishes won't be included in
                the order
              } @else {
                {{ unsubmittedCount() }} participants haven't submitted their cart yet — their
                dishes won't be included in the order
              }
            </p>
          </div>
        }

        <!-- PARTICIPANTS -->
        <section class="participants">
          <h2>Participants</h2>

          @if (participants().length === 0 || !hasAnyDishes()) {
            <p>Participants haven't added any dishes yet</p>
          } @else {
            <ul>
              @for (participant of participants(); track participant.id) {
                <li>
                  <app-participant-card [participant]="participant" />
                </li>
              }
            </ul>
          }
        </section>

        <!-- ORDER SUMMARY -->
        <section class="order-summary">
          <h2>Order Summary</h2>

          <!-- CONSOLIDATED PRE-ORDER -->
          <div class="consolidated-order">
            <h3>Consolidated Pre-Order</h3>

            @if (consolidatedOrder().items.length === 0) {
              <p>Participants haven't added any dishes yet</p>
            } @else {
              <ul class="consolidated-order-list">
                @for (item of consolidatedOrder().items; track item.dish.id) {
                  <li class="consolidated-order-item">
                    <span>{{ item.dish.name }}</span>

                    <span> × {{ item.quantity }} </span>

                    <span>
                      {{ '$' + (item.dish.price * item.quantity).toFixed(2) }}
                    </span>
                  </li>
                }
              </ul>
            }
          </div>

          <!-- GRAND TOTAL -->
          <div class="grand-total">
            <h3>Grand Total</h3>

            <p>
              {{ '$' + grandTotal().toFixed(2) }}
            </p>
          </div>

          <!-- SUBMIT BUTTON -->
          @if (groupStatus() === 'Open') {
            <app-custom-button
              variant="primary"
              size="extra-large"
              [fullWidth]="true"
              [disabled]="grandTotal() === 0 || !hasSubmittedGuestSession() || isSubmitting()"
              (click)="openSubmitModal()"
            >
              Submit Pre-Order
            </app-custom-button>
          }
        </section>
      }

      <!-- CONFIRMATION MODAL -->
      @if (isSubmitModalOpen()) {
        <app-modal
          title="Submit Pre-Order"
          (closed)="closeSubmitModal()"
          [closeOnBackdrop]="!isSubmitting()"
        >
          <p>Are you sure you want to submit the group pre-order to the restaurant?</p>

          <div modal-actions class="submit-modal-actions">
            <app-custom-button
              variant="secondary"
              size="large"
              [disabled]="isSubmitting()"
              (click)="closeSubmitModal()"
            >
              Cancel
            </app-custom-button>

            <app-custom-button
              variant="primary"
              size="large"
              [disabled]="isSubmitting()"
              (click)="submitPreOrder()"
            >
              {{ isSubmitting() ? 'Submitting...' : 'Submit' }}
            </app-custom-button>
          </div>
        </app-modal>
      }
    </main>
  `,
})
export class GroupOrderPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly groupOrdersService = inject(GroupOrdersService);
  private readonly toastService = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly manualRefresh$ = new Subject<void>();
  readonly isRefreshing = signal(false);
  readonly lastUpdated = signal<Date | null>(null);
  readonly lastUpdatedLabel = computed(
    () =>
      this.lastUpdated()?.toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }) ?? 'Not yet'
  );

  // UI STATES
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly isSubmitModalOpen = signal(false);
  readonly isSubmitting = signal(false);

  // RESERVATION DATA
  readonly groupReservationId = signal<string | null>(null);
  readonly ownerSessionId = signal<string | null>(null);

  readonly participants = signal<Participant[]>([]);
  readonly groupStatus = signal<GroupReservationStatus>('Open');

  readonly locationAddress = signal('');
  readonly startTime = signal('');
  readonly endTime = signal('');
  readonly maxGuestCount = signal(0);

  // COMPUTED VALUES
  readonly consolidatedOrder = computed(() => consolidatePreOrder(this.participants()));

  readonly grandTotal = computed(() => this.consolidatedOrder().total);

  // Backend requires at least one submitted GuestSession for group submission.
  readonly hasSubmittedGuestSession = computed(() =>
    this.participants().some(
      (participant) =>
        participant.id !== this.ownerSessionId() &&
        participant.isSubmitted &&
        participant.items.length > 0
    )
  );

  readonly unsubmittedCount = computed(
    () => this.participants().filter((participant) => !participant.isSubmitted).length
  );

  readonly hasAnyDishes = computed(() =>
    this.participants().some((participant) => participant.items.length > 0)
  );

  readonly formattedDate = computed(() => {
    const value = this.startTime();

    if (!value) {
      return '';
    }

    return new Date(value).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    });
  });

  readonly formattedTime = computed(() => {
    if (!this.startTime() || !this.endTime()) {
      return '';
    }

    return this.formatTime(this.startTime()) + ' - ' + this.formatTime(this.endTime());
  });

  ngOnInit(): void {
    // exhaustMap prevents overlapping requests; Angular stops subscriptions on navigation.
    merge(timer(15000, 15000), this.manualRefresh$)
      .pipe(
        filter(() => !this.loading() && this.groupStatus() === 'Open' && !this.isSubmitting()),
        exhaustMap(() => {
          const groupId = this.groupReservationId();
          const reservationId = this.route.snapshot.paramMap.get('reservationId');
          if (!groupId || !reservationId) return EMPTY;

          this.isRefreshing.set(true);
          return this.fetchGroupData(groupId, reservationId).pipe(
            catchError(() => {
              // Keep the existing view and allow the next update to retry.
              this.isRefreshing.set(false);
              return EMPTY;
            })
          );
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(({ sessions, owner, status, ownerOrder }) => {
        this.applyGroupData(sessions, owner, status, ownerOrder);
        this.isRefreshing.set(false);
      });

    this.loadGroupOrder();
  }

  refreshNow(): void {
    if (
      !this.isRefreshing() &&
      !this.loading() &&
      !this.isSubmitting() &&
      this.groupStatus() === 'Open'
    ) {
      this.manualRefresh$.next();
    }
  }

  private fetchGroupData(groupId: string, reservationId: string) {
    return forkJoin({
      sessions: this.groupOrdersService.getSessions$(groupId),
      owner: this.groupOrdersService.getOwnerSessionId$(reservationId),
      status: this.groupOrdersService.getStatus$(groupId),
      ownerOrder: this.groupOrdersService
        .getOwnerOrder$(reservationId)
        .pipe(
          catchError((error: HttpErrorResponse) =>
            error.status === 404 ? of(null) : throwError(() => error)
          )
        ),
    });
  }

  private applyGroupData(
    sessions: GroupSessionsResponse,
    owner: string,
    status: GroupStatusResponse,
    ownerOrder: Order | null
  ): void {
    this.ownerSessionId.set(owner);
    const participants = sessions.participants.map((participant): Participant => {
      const isOwner = participant.id === owner;
      if (isOwner && ownerOrder && ownerOrder.status !== 2) {
        return {
          ...participant,
          type: 'Owner',
          isSubmitted: ownerOrder.status === 3,
          items: ownerOrder.orderItems.map((item) => ({
            dish: { id: item.dish.id, name: item.dish.name, price: item.dish.price },
            quantity: item.quantity,
          })),
          total: ownerOrder.orderItems.reduce(
            (sum, item) => sum + item.dish.price * item.quantity,
            0
          ),
        };
      }
      return { ...participant, type: isOwner ? 'Owner' : 'Guest' };
    });
    this.participants.set(participants);
    this.groupStatus.set(status.status);
    this.lastUpdated.set(new Date());
  }

  // LOAD GROUP ORDER
  loadGroupOrder(): void {
    const reservationId = this.route.snapshot.paramMap.get('reservationId');

    if (!reservationId) {
      this.error.set('Group reservation not found');
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    this.groupOrdersService
      .getGroupInvite$(reservationId)
      .pipe(
        switchMap((invite) => {
          this.groupReservationId.set(invite.GroupReservationId);

          this.locationAddress.set(invite.LocationAddress);

          this.startTime.set(invite.StartTime);

          this.endTime.set(invite.EndTime);

          this.maxGuestCount.set(invite.MaxGuestCount);

          return this.fetchGroupData(invite.GroupReservationId, reservationId);
        })
      )
      .subscribe({
        next: ({ sessions, owner, status, ownerOrder }) => {
          this.applyGroupData(sessions, owner, status, ownerOrder);
          this.loading.set(false);
        },

        error: (err: unknown) => {
          if (err instanceof HttpErrorResponse && err.status === 404) {
            this.error.set('Group reservation not found');
          } else {
            this.error.set('Failed to load group pre-order');
          }

          this.loading.set(false);
        },
      });
  }

  // OPEN CONFIRMATION MODAL
  openSubmitModal(): void {
    if (
      this.isSubmitting() ||
      this.groupStatus() !== 'Open' ||
      this.grandTotal() === 0 ||
      !this.hasSubmittedGuestSession()
    ) {
      return;
    }

    this.isSubmitModalOpen.set(true);
  }

  // CLOSE CONFIRMATION MODAL
  closeSubmitModal(): void {
    if (this.isSubmitting()) {
      return;
    }

    this.isSubmitModalOpen.set(false);
  }

  // SUBMIT GROUP PRE-ORDER
  submitPreOrder(): void {
    const groupReservationId = this.groupReservationId();

    const reservationId = this.route.snapshot.paramMap.get('reservationId');

    if (
      this.isSubmitting() ||
      this.groupStatus() !== 'Open' ||
      this.grandTotal() === 0 ||
      !this.hasSubmittedGuestSession() ||
      !groupReservationId ||
      !reservationId
    ) {
      return;
    }

    this.isSubmitting.set(true);

    this.groupOrdersService.submit$(groupReservationId, reservationId).subscribe({
      next: () => {
        this.groupStatus.set('Submitted');
        this.isSubmitModalOpen.set(false);
        this.isSubmitting.set(false);

        this.toastService.success('Pre-order sent to the restaurant', 'Success');
      },

      error: () => {
        this.isSubmitting.set(false);
      },
    });
  }

  // FORMAT TIME
  private formatTime(value: string): string {
    return new Date(value).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
    });
  }
}

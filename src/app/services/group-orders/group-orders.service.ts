import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, map, switchMap } from 'rxjs';

import { API_BASE_URL } from '@app/shared/config/api-base-url.token';

import { GuestInvite } from '@app/models/reservations/guest-invite.model';
import { GroupSessionsResponse } from '@app/models/group-orders/group-sessions-response.model';
import { GroupStatusResponse } from '@app/models/group-orders/group-status.model';
import { SubmitGroupPreOrderRequest } from '@app/models/group-orders/submit-group-pre-order.model';
import { Order } from '@app/models/orders/order.model';

@Injectable({
  providedIn: 'root',
})
export class GroupOrdersService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  getGroupInvite$(reservationId: string): Observable<GuestInvite> {
    return this.http
      .get<{ token: string }>(
        `${this.baseUrl}/reservations/${encodeURIComponent(reservationId)}/invite-token`
      )
      .pipe(
        switchMap(({ token }) =>
          this.http.get<GuestInvite>(
            `${this.baseUrl}/guest/invites/${encodeURIComponent(token)}`
          )
        )
      );
  }

  getSessions$(groupReservationId: string): Observable<GroupSessionsResponse> {
    return this.http.get<GroupSessionsResponse>(
      `${this.baseUrl}/guest/groups/${encodeURIComponent(groupReservationId)}/sessions`
    );
  }

  getOwnerSessionId$(reservationId: string): Observable<string> {
    return this.http
      .get<{ guestSessionId: string }>(
        `${this.baseUrl}/reservations/${encodeURIComponent(reservationId)}/guest-session-id`
      )
      .pipe(map(({ guestSessionId }) => guestSessionId));
  }

  getStatus$(groupReservationId: string): Observable<GroupStatusResponse> {
    return this.http.get<GroupStatusResponse>(
      `${this.baseUrl}/guest/groups/${encodeURIComponent(groupReservationId)}/status`
    );
  }
    getOwnerOrder$(reservationId: string): Observable<Order> {
    return this.http.get<Order>(
      `${this.baseUrl}/orders/${encodeURIComponent(reservationId)}`
    );
  }

  submit$(groupReservationId: string, reservationId: string): Observable<unknown> {
    const body: SubmitGroupPreOrderRequest = { reservationId };

    return this.http.post<unknown>(
      `${this.baseUrl}/group-reservations/${encodeURIComponent(groupReservationId)}/submit`,
      body
    );
  }
}

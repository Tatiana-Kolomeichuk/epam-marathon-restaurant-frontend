import { Component, Input } from '@angular/core';
import { Participant } from '@app/models/group-orders/participant.model';

@Component({
  selector: 'app-participant-card',
  standalone: true,
  styleUrl: './participant-card.component.scss',
  template: `
    <article class="participant-card">
      <div class="participant-header">
        <div class="participant-info">
          <h3>
          {{ participant.type === 'Owner' ? 'My Pre-Order' : 'Guest: ' + participant.name }}
          </h3>

          <span class="participant-role">
            {{ participant.type === 'Owner' ? 'Owner' : 'Guest' }}
          </span>
        </div>

        <span
          class="participant-status"
          [class.pending]="!participant.isSubmitted"
        >
          {{ participant.isSubmitted ? 'Submitted' : 'Still choosing' }}
        </span>
      </div>

      <ul class="dish-list">
        @for (item of participant.items; track item.dish.id) {
          <li class="dish-item">
            @if (item.dish.imageUrl) {
              <img
                class="dish-image"
                [src]="item.dish.imageUrl"
                [alt]="item.dish.name"
                loading="lazy"
              />
            }

            <div class="dish-details">
              <h4>{{ item.dish.name }}</h4>

              @if (item.dish.weight) {
                <span class="dish-weight">
                  {{ item.dish.weight }}
                </span>
              }
            </div>

            <span class="dish-quantity">
              × {{ item.quantity }}
            </span>

            <span class="dish-price">
              {{ '$' + (item.dish.price * item.quantity).toFixed(2) }}
            </span>
          </li>
        }
      </ul>

      @if (participant.items.length === 0) {
        <p class="empty-order">
          No dishes selected yet
        </p>
      }

      <div class="participant-subtotal">
        <span>Subtotal</span>
        <strong>
          {{ '$' + participant.total.toFixed(2) }}
        </strong>
      </div>
    </article>
  `,
})
export class ParticipantCardComponent {
  @Input({ required: true }) participant!: Participant;
}

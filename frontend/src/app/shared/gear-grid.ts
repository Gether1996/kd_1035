import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { ArmoryIndex, GEAR_SLOTS, Gear, GearSlot, roman } from '../core/armory';
import { I18n } from '../core/i18n/i18n';

/**
 * The eight equipment slots of a march as square tiles in two rows of four – the frame in the item's rarity colour, a
 * red corner for a crit, the iconic level in the corner. Read-only on the card; in the editor (`pickable`) every tile is
 * a button choosing the slot to fill.
 */
@Component({
  selector: 'app-gear-grid',
  template: `
    @let b = t();
    <ul class="gear" [attr.aria-label]="b.gear">
      @for (tile of tiles(); track tile.slot) {
        <li class="gear__cell">
          @if (pickable()) {
            <button
              type="button"
              class="gear__tile gear__tile--{{ tile.item?.rarity ?? 'none' }}"
              [class.is-selected]="selected() === tile.slot"
              [attr.aria-pressed]="selected() === tile.slot"
              [attr.aria-label]="tile.label"
              [title]="tile.label"
              (click)="pick.emit(tile.slot)"
            >
              <ng-container *ngTemplateOutlet="inside; context: { $implicit: tile }" />
            </button>
          } @else {
            <span class="gear__tile gear__tile--{{ tile.item?.rarity ?? 'none' }}" role="img" [attr.aria-label]="tile.label" [title]="tile.label">
              <ng-container *ngTemplateOutlet="inside; context: { $implicit: tile }" />
            </span>
          }
        </li>
      }
    </ul>
    <ng-template #inside let-tile>
      @if (tile.item) {
        <img class="gear__icon" [src]="tile.item.icon" alt="" width="96" height="96" />
        @if (tile.crit) {
          <span class="gear__crit" aria-hidden="true"></span>
        }
        @if (tile.iconic) {
          <span class="gear__iconic" aria-hidden="true">{{ tile.iconic }}</span>
        }
      } @else {
        <span class="gear__slot" aria-hidden="true">{{ tile.slotName }}</span>
      }
    </ng-template>
  `,
  styleUrl: './gear-grid.scss',
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GearGrid {
  readonly gear = input.required<Gear>();
  readonly index = input.required<ArmoryIndex>();
  readonly pickable = input(false);
  readonly selected = input<GearSlot | null>(null);
  readonly pick = output<GearSlot>();

  private readonly i18n = inject(I18n);
  protected readonly t = computed(() => this.i18n.t().marches.build);

  protected readonly tiles = computed(() => {
    const b = this.t();
    return GEAR_SLOTS.map((slot) => {
      const piece = this.gear()[slot];
      const item = piece ? this.index().items.get(piece.item) : undefined;
      const iconic = item && piece?.iconic ? roman(piece.iconic) : '';
      const label = item
        ? [b.slots[slot] + ': ' + item.name, piece?.crit ? b.crit : '', iconic ? `${b.iconic} ${iconic}` : '']
            .filter(Boolean)
            .join(', ')
        : `${b.slots[slot]}: ${b.emptySlot}`;
      return { slot, slotName: b.slots[slot], item, crit: !!(item && piece?.crit), iconic, label };
    });
  });
}

import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { ArmoryIndex, GEAR_SLOTS, Gear, GearSlot, ItemTroop, roman } from '../core/armory';
import { I18n } from '../core/i18n/i18n';

/**
 * The eight equipment slots of a march laid out like the equipment screen of the game (Gether 12. 10. 2026: "rozmiestnenie
 * ako v hre"): diamonds in a column – helmet, chest, weapon and gloves either side, legs, the two accessories either side,
 * boots. The frame takes the item's rarity colour, a crit is the small tag of the march's troops on the item's lower
 * right, the iconic level a numeral in a small gold diamond on the bottom tip – like in the game. Read-only on the
 * card; `pickable` makes every diamond a button choosing the slot (the editor, the own march's card).
 */
@Component({
  selector: 'app-gear-grid',
  template: `
    @let b = t();
    <ul class="gear" [attr.aria-label]="b.gear">
      @for (tile of tiles(); track tile.slot) {
        <li class="gear__cell gear__cell--{{ tile.slot }}">
          @if (pickable()) {
            <button
              type="button"
              class="gear__tile gear__tile--{{ tile.item?.rarity ?? 'none' }}"
              [class.is-selected]="selected() === tile.slot"
              [attr.aria-pressed]="selected() === null ? null : selected() === tile.slot"
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
          <!-- like in the game: the iconic level in a small gold diamond on the bottom tip, outside the clipped diamond -->
          @if (tile.iconic) {
            <span class="gear__iconic" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path class="gear__badge" d="M12 1.5 22.5 12 12 22.5 1.5 12z" /></svg>
              <span class="gear__iconic-level">{{ tile.iconic }}</span>
            </span>
          }
        </li>
      }
    </ul>
    <ng-template #inside let-tile>
      @if (tile.item) {
        <img class="gear__icon" [src]="tile.item.icon" alt="" width="96" height="96" />
        <!-- like in the game: a crit is the small tag of the item's troop type on its lower right -->
        @if (tile.crit) {
          <img class="gear__crit" [src]="tile.troopIcon" alt="" width="96" height="96" />
        }
      } @else {
        @if (slotNames()) {
        <span class="gear__slot" aria-hidden="true">{{ tile.slotName }}</span>
      }
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
  /** the crit badge of every item: the march's troops (marchTroop; Gether 12. 10. 2026) */
  readonly critTroop = input<ItemTroop>('leadership');
  /** the names of the empty slots (the editor); the card stays without text */
  readonly slotNames = input(false);
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
      const troopIcon = `/static/guides/specialties/${this.critTroop()}.webp`;
      return { slot, slotName: b.slots[slot], item, crit: !!(item && piece?.crit), troopIcon, iconic, label };
    });
  });
}

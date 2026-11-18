import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Icon } from '../../shared/icon';

/**
 * "Strike 2 z 3" as marks like a tally: one box per strike of the rules, the player's ones crossed – red from the last
 * strike on, gold before (Gether 18. 11. 2026: "1, 2 a tretí strike" instead of yellow cards). The label says it in
 * words for screen readers and as a tooltip.
 */
@Component({
  selector: 'app-strike-marks',
  imports: [Icon],
  template: `
    <!-- without a label it is decoration next to the strike's name: hidden from screen readers -->
    <span
      class="marks"
      [class.is-top]="top()"
      [attr.role]="label() ? 'img' : null"
      [attr.aria-label]="label() || null"
      [attr.aria-hidden]="label() ? null : 'true'"
      [attr.title]="label() || null"
    >
      @for (on of boxes(); track $index) {
        <span class="mark" [class.is-on]="on">
          @if (on) {
            <svg appIcon="x"></svg>
          }
        </span>
      }
    </span>
  `,
  styles: `
    :host {
      display: inline-flex;
    }

    .marks {
      display: inline-flex;
      gap: 4px;
    }

    .mark {
      display: grid;
      place-items: center;
      width: var(--mark, 20px);
      height: var(--mark, 20px);
      border: 1px solid var(--line-strong);
      border-radius: 4px;

      &.is-on {
        border-color: var(--gold-400);
        background: var(--gold-400);
        color: var(--bg);
      }

      .icon {
        width: 70%;
        height: 70%;
        stroke-width: 3;
      }
    }

    .is-top .mark.is-on {
      border-color: var(--red-500);
      background: var(--red-500);
      color: var(--text);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StrikeMarks {
  /** the player's strike, 0 = clean */
  readonly level = input.required<number>();
  /** how many strikes the rules have */
  readonly of = input.required<number>();
  readonly label = input('');

  protected readonly boxes = computed(() => {
    const of = Math.max(this.of(), 1);
    return Array.from({ length: of }, (_, i) => i < Math.min(this.level(), of));
  });
  protected readonly top = computed(() => this.of() > 1 && this.level() >= this.of());
}

import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { reachedSets } from '../core/armory';
import { I18n } from '../core/i18n/i18n';

/**
 * The set bonuses the equipment reaches (Gether 12. 10. 2026: "setové bonusy, pokiaľ sa dosiahnu, tiež písať"): the
 * set's name with the pieces worn and the game's text of every bonus reached. Under the equipment on the card and in
 * the editor; nothing when no set bonus is reached.
 */
@Component({
  selector: 'app-set-bonuses',
  template: `
    @if (sets().length) {
      <ul class="sets" [attr.aria-label]="t().sets">
        @for (s of sets(); track s.id) {
          <li class="set">
            <span class="set__name">{{ s.name }} <span class="set__count">{{ s.count }}/{{ s.total }}</span></span>
            @for (bonus of s.bonuses; track $index) {
              <span class="set__bonus">{{ bonus }}</span>
            }
          </li>
        }
      </ul>
    }
  `,
  styles: `
    .sets {
      display: grid;
      gap: 8px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .set {
      display: grid;
      gap: 2px;
      padding-left: 10px;
      border-left: 2px solid var(--gold-600);
      font-size: 0.8125rem;
      line-height: 1.35;
    }

    .set__name {
      color: var(--gold-100);
      font-weight: 600;
    }

    .set__count {
      margin-left: 4px;
      color: var(--text-mute);
      font-weight: 500;
      font-variant-numeric: tabular-nums;
    }

    .set__bonus {
      color: var(--text-dim);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SetBonuses {
  readonly worn = input.required<Parameters<typeof reachedSets>[0]>();

  private readonly i18n = inject(I18n);
  protected readonly t = computed(() => this.i18n.t().marches.build);
  protected readonly sets = computed(() => reachedSets(this.worn()));
}

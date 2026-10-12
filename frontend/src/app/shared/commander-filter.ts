import { ChangeDetectionStrategy, Component, computed, inject, input, model } from '@angular/core';
import { I18n } from '../core/i18n/i18n';

/** The commanders of these marches, alphabetically – a filter never offers one that would show nothing. */
export function marchCommanders(marches: readonly { primary: string; secondary: string }[]): string[] {
  const names = new Set(marches.flatMap((m) => [m.primary, m.secondary]).filter(Boolean));
  return [...names].sort((a, b) => a.localeCompare(b));
}

/**
 * "Všetci commanderi" / one commander – the filter of /marche and the KvK sign-ups (12. 10. 2026: "who has Attila for
 * rally?"). A native select of the commanders in the loaded data: the keyboard, the phone picker and screen readers
 * come with it.
 */
@Component({
  selector: 'app-commander-filter',
  template: `
    <label class="sr-only" [for]="selectId()">{{ t().commander }}</label>
    <select #pick class="select" [id]="selectId()" (change)="value.set(pick.value)">
      <option value="" [selected]="!value()">{{ t().any }}</option>
      @for (name of names(); track name) {
        <option [value]="name" [selected]="value() === name">{{ name }}</option>
      }
    </select>
  `,
  host: { class: 'field' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommanderFilter {
  /** the commanders to offer – those in the loaded data (marchCommanders) */
  readonly options = input.required<string[]>();
  /** the chosen commander, '' = all */
  readonly value = model('');
  /** the id of the select (unique on the page) */
  readonly selectId = input('commander-filter');

  private readonly i18n = inject(I18n);
  protected readonly t = computed(() => this.i18n.t().marchFilters);
  /** a commander from a shared link that nobody has any more still shows as chosen */
  protected readonly names = computed(() => {
    const value = this.value();
    return value && !this.options().includes(value) ? [value, ...this.options()] : this.options();
  });
}

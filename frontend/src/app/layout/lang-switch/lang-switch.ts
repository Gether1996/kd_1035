import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18n, Lang } from '../../core/i18n/i18n';

/** SK / CZ toggle. Real links to the same page in the other language (crawlable, keeps the section). */
@Component({
  selector: 'app-lang-switch',
  imports: [RouterLink],
  template: `
    <div class="lang" role="group" [attr.aria-label]="i18n.t().nav.language" [class.is-cs]="i18n.lang() === 'cs'">
      <span class="lang__thumb" aria-hidden="true"></span>
      @for (option of options; track option.lang) {
        <a
          [routerLink]="i18n.path(i18n.page(), option.lang)"
          [preserveFragment]="true"
          [attr.hreflang]="option.lang"
          [attr.lang]="option.lang"
          [attr.aria-current]="i18n.lang() === option.lang ? 'true' : null"
          (click)="i18n.remember(option.lang)"
          >{{ option.label }}</a
        >
      }
    </div>
  `,
  styleUrl: './lang-switch.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LangSwitch {
  protected readonly i18n = inject(I18n);
  protected readonly options: { lang: Lang; label: string }[] = [
    { lang: 'sk', label: 'SK' },
    { lang: 'cs', label: 'CZ' },
  ];
}

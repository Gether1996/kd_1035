import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Auth } from '../../core/auth';
import { I18n, Lang } from '../../core/i18n/i18n';

/** SK / CZ toggle. Real links to the same page in the other language (crawlable, keeps the section and the query). */
@Component({
  selector: 'app-lang-switch',
  imports: [RouterLink],
  template: `
    <div class="lang" role="group" [attr.aria-label]="i18n.t().nav.language" [class.is-cs]="i18n.lang() === 'cs'">
      <span class="lang__thumb" aria-hidden="true"></span>
      @for (option of options; track option.lang) {
        <a
          [routerLink]="i18n.switchPath(option.lang)"
          [preserveFragment]="true"
          queryParamsHandling="preserve"
          [attr.hreflang]="option.lang"
          [attr.lang]="option.lang"
          [attr.aria-current]="i18n.lang() === option.lang ? 'true' : null"
          (click)="pick(option.lang)"
        >
          <!-- the national flag next to the language (Gether 27. 10. 2026) -->
          <svg class="lang__flag" viewBox="0 0 30 20" aria-hidden="true">
            @if (option.lang === 'sk') {
              <rect width="30" height="6.67" fill="#fff" />
              <rect y="6.67" width="30" height="6.67" fill="#0b4ea2" />
              <rect y="13.33" width="30" height="6.67" fill="#ee1c25" />
              <path d="M7.4 4.6H15v5.1c0 3.4-3.8 5.4-3.8 5.4s-3.8-2-3.8-5.4z" fill="#ee1c25" stroke="#fff" stroke-width=".9" />
              <path d="M8 12.2q1.2-1.6 2.3-.2.9-1.4 1.8 0 1.1-1.4 2.3.2c-.9 1.7-3.2 2.9-3.2 2.9S8.9 13.9 8 12.2z" fill="#0b4ea2" />
              <path d="M11.2 6.2v5.4M9.8 7.7h2.8M9.2 9.5h4" stroke="#fff" stroke-width=".95" stroke-linecap="round" />
            } @else {
              <rect width="30" height="10" fill="#fff" />
              <rect y="10" width="30" height="10" fill="#d7141a" />
              <path d="M0 0l15 10L0 20z" fill="#11457e" />
            }
          </svg>
          <span class="lang__label">{{ option.label }}</span>
        </a>
      }
    </div>
  `,
  styleUrl: './lang-switch.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LangSwitch {
  protected readonly i18n = inject(I18n);
  private readonly auth = inject(Auth);
  protected readonly options: { lang: Lang; label: string }[] = [
    { lang: 'sk', label: 'SK' },
    { lang: 'cs', label: 'CZ' },
  ];

  /** The browser remembers the language; a signed-in player's profile follows it (the bot writes in it too). */
  protected pick(lang: Lang): void {
    this.i18n.remember(lang);
    this.auth.followLang(lang);
  }
}

import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { KingdomApi } from '../../core/api';
import { I18n } from '../../core/i18n/i18n';
import { Icon } from '../../shared/icon';
import { Logo } from '../../shared/logo';

@Component({
  selector: 'app-footer',
  imports: [RouterLink, Logo, Icon],
  template: `
    <div class="container footer__top">
      <a class="brand" [routerLink]="i18n.path('home')" fragment="top" aria-label="Kingdom 1035">
        <svg appLogo class="brand__logo"></svg>
        <span class="brand__name">Kingdom <strong>1035</strong></span>
      </a>
      <div class="social">
        @if (api.links().discord; as url) {
          <a [href]="url" target="_blank" rel="noopener noreferrer" aria-label="Discord"><svg appIcon="discord"></svg></a>
        }
        @if (api.links().facebook; as url) {
          <a [href]="url" target="_blank" rel="noopener noreferrer" aria-label="Facebook"><svg appIcon="facebook"></svg></a>
        }
      </div>
    </div>
    <div class="container footer__bottom">
      <div class="footer__legal">
        <p class="footer__note">{{ i18n.t().footer.fanSite }}</p>
        <ul class="footer__links">
          <li><a [routerLink]="i18n.path('terms')">{{ i18n.t().nav.terms }}</a></li>
        </ul>
      </div>
      @if (updated(); as updated) {
        <p class="footer__updated">
          {{ i18n.t().footer.updated }} <time [attr.datetime]="updated.iso">{{ updated.text }}</time>
        </p>
      }
      <p class="watermark">{{ i18n.t().footer.madeBy }} <span>Gether</span> · 2026</p>
    </div>
  `,
  styleUrl: './footer.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Footer {
  protected readonly i18n = inject(I18n);
  protected readonly api = inject(KingdomApi);

  protected readonly updated = computed(() => {
    const iso = this.api.updated();
    if (!iso) return null;
    // noon keeps the calendar day in every time zone
    const text = new Intl.DateTimeFormat(this.i18n.locale(), { day: 'numeric', month: 'long', year: 'numeric' }).format(
      new Date(`${iso}T12:00:00`),
    );
    return { iso, text };
  });
}

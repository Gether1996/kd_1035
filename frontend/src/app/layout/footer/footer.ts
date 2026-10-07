import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
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
      <p class="footer__note">{{ i18n.t().footer.fanSite }}</p>
      <p class="watermark">{{ i18n.t().footer.madeBy }} <span>Gether</span> · 2026</p>
    </div>
  `,
  styleUrl: './footer.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Footer {
  protected readonly i18n = inject(I18n);
  protected readonly api = inject(KingdomApi);
}

import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18n } from '../core/i18n/i18n';
import { Dict } from '../core/i18n/sk';
import { PageMeta } from '../core/seo';
import { Icon } from './icon';

/** Meta of a missing page or guide: its own title, kept out of search results. */
export const notFoundMeta = (t: Dict): PageMeta => ({
  title: `${t.notFound.title} | KD 1035`,
  description: t.notFound.text,
  noindex: true,
});

/** Ways forward from a dead link: home and the guides. */
@Component({
  selector: 'app-not-found-links',
  imports: [RouterLink, Icon],
  template: `
    <a class="btn btn--gold" [routerLink]="i18n.path('home')">
      {{ i18n.t().notFound.home }} <svg appIcon="arrow-right"></svg>
    </a>
    <a class="btn btn--ghost" [routerLink]="i18n.path('guideHub')">{{ i18n.t().notFound.guides }}</a>
  `,
  styles: `
    :host {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 12px 16px;
      margin-top: 28px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFoundLinks {
  protected readonly i18n = inject(I18n);
}

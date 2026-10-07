import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18n } from '../core/i18n/i18n';
import { Crumb } from '../core/seo';
import { Icon } from './icon';

/** "Domov › Výbava › Article" – the last crumb is the current page. */
@Component({
  selector: 'app-breadcrumbs',
  imports: [RouterLink, Icon],
  template: `
    <nav [attr.aria-label]="i18n.t().nav.breadcrumb">
      <ol>
        @for (crumb of crumbs(); track crumb.link; let last = $last) {
          <li>
            @if (last) {
              <span aria-current="page">{{ crumb.label }}</span>
            } @else {
              <a [routerLink]="crumb.link">{{ crumb.label }}</a>
              <svg appIcon="chevron-right"></svg>
            }
          </li>
        }
      </ol>
    </nav>
  `,
  styles: `
    :host {
      display: block;
    }

    ol {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      margin: 0;
      padding: 0;
      list-style: none;
      font: 500 0.875rem/1.3 var(--font-body);
    }

    li {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
    }

    a {
      color: var(--text-dim);
      transition: color 0.2s;

      &:hover {
        color: var(--gold-300);
      }
    }

    span {
      color: var(--gold-100);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: min(60vw, 420px);
    }

    .icon {
      width: 14px;
      height: 14px;
      color: var(--text-mute);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Breadcrumbs {
  protected readonly i18n = inject(I18n);
  readonly crumbs = input.required<Crumb[]>();
}

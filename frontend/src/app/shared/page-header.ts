import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Crumb } from '../core/seo';
import { Breadcrumbs } from './breadcrumbs';
import { ScrollFx } from './scroll-fx';

/** Top of a sub-page: dusk sky with parallax ridges, breadcrumbs, title and an optional intro. */
@Component({
  selector: 'app-page-header',
  imports: [Breadcrumbs, ScrollFx],
  template: `
    <header class="masthead" appScrollFx="exit">
      <div class="masthead__art" aria-hidden="true">
        <img src="img/hero/sky.svg" alt="" style="--speed: 0.5" />
        <img src="img/hero/far.svg" alt="" style="--speed: 0.32" />
        <img src="img/hero/mid.svg" alt="" style="--speed: 0.16" />
      </div>
      <div class="container masthead__content">
        <app-breadcrumbs class="masthead__crumbs" [crumbs]="crumbs()" />
        @if (eyebrow()) {
          <p class="eyebrow">{{ eyebrow() }}</p>
        }
        <h1 class="masthead__title">{{ title() }}</h1>
        @if (intro()) {
          <p class="masthead__intro">{{ intro() }}</p>
        }
        <ng-content />
      </div>
    </header>
  `,
  styleUrl: './page-header.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PageHeader {
  readonly title = input.required<string>();
  readonly crumbs = input.required<Crumb[]>();
  readonly eyebrow = input('');
  readonly intro = input('');
}

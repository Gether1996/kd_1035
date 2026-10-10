import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GuidesApi } from '../../../core/guides-api';
import { GUIDE_CATEGORIES, GuideCategory, I18n } from '../../../core/i18n/i18n';
import { Icon, IconName } from '../../../shared/icon';
import { Reveal } from '../../../shared/reveal';

@Component({
  selector: 'app-guides',
  imports: [RouterLink, Icon, Reveal],
  template: `
    <section class="section" id="guides">
      <div class="container">
        <header class="section-head" appReveal>
          <p class="eyebrow">{{ t().guides.eyebrow }}</p>
          <h2 class="title">{{ t().guides.title }}</h2>
        </header>

        <div class="grid">
          @for (key of categories; track key; let i = $index) {
            @let info = t().guides.categories[key];
            @let count = guides.byCategory(key).length;
            <a class="guide" [routerLink]="i18n.guidePath(key)" [appReveal]="i * 120">
              <svg class="guide__watermark" [appIcon]="icons[key]"></svg>
              <div class="guide__top">
                <span class="guide__index">0{{ i + 1 }}</span>
                @if (count) {
                  <span class="tag">{{ guides.count(count) }}</span>
                } @else if (guides.ready()) {
                  <span class="tag tag--muted">{{ t().guides.soon }}</span>
                }
              </div>
              <span class="guide__icon"><svg [appIcon]="icons[key]"></svg></span>
              <h3>{{ info.title }}</h3>
              <p>{{ info.text }}</p>
              <svg class="guide__arrow" appIcon="arrow-right"></svg>
            </a>
          }
        </div>
      </div>
    </section>
  `,
  styleUrl: './guides.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Guides {
  protected readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;
  protected readonly guides = inject(GuidesApi);
  protected readonly categories = GUIDE_CATEGORIES;
  protected readonly icons: Record<GuideCategory, IconName> = {
    commanderi: 'swords',
    vybava: 'shield',
    eventy: 'calendar-days',
    tipy: 'lightbulb',
  };
}

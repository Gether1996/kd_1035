import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { I18n } from '../../../core/i18n/i18n';
import { Icon, IconName } from '../../../shared/icon';
import { Reveal } from '../../../shared/reveal';

@Component({
  selector: 'app-guides',
  imports: [Icon, Reveal],
  template: `
    <section class="section" id="guides">
      <div class="container">
        <header class="section-head" appReveal>
          <p class="eyebrow">{{ t().guides.eyebrow }}</p>
          <h2 class="title">{{ t().guides.title }}</h2>
        </header>

        <div class="grid">
          @for (guide of t().guides.items; track $index) {
            <article class="guide" [appReveal]="$index * 120">
              <svg class="guide__watermark" [appIcon]="icons[$index]"></svg>
              <div class="guide__top">
                <span class="guide__index">0{{ $index + 1 }}</span>
                <span class="tag">{{ t().guides.soon }}</span>
              </div>
              <span class="guide__icon"><svg [appIcon]="icons[$index]"></svg></span>
              <h3>{{ guide.title }}</h3>
              <p>{{ guide.text }}</p>
            </article>
          }
        </div>
      </div>
    </section>
  `,
  styleUrl: './guides.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Guides {
  protected readonly t = inject(I18n).t;
  protected readonly icons: IconName[] = ['swords', 'shield', 'calendar-days'];
}

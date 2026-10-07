import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18n } from '../../../core/i18n/i18n';
import { Icon, IconName } from '../../../shared/icon';
import { Reveal } from '../../../shared/reveal';

@Component({
  selector: 'app-intro',
  imports: [RouterLink, Icon, Reveal],
  template: `
    <section class="section" id="kingdom">
      <div class="container">
        <header class="section-head" appReveal>
          <p class="eyebrow">{{ t().intro.eyebrow }}</p>
          <h2 class="title">{{ t().intro.title }}</h2>
          <p class="lead">{{ t().intro.lead }}</p>
        </header>

        <div class="pillars">
          @for (pillar of t().intro.pillars; track $index) {
            <article class="pillar" [appReveal]="$index * 120">
              <span class="pillar__icon"><svg [appIcon]="icons[$index]"></svg></span>
              <h3>{{ pillar.title }}</h3>
              <p>{{ pillar.text }}</p>
            </article>
          }
        </div>

        <div class="more" appReveal>
          <a class="more__link" [routerLink]="i18n.path('about')">
            {{ t().intro.more }} <svg appIcon="arrow-right"></svg>
          </a>
        </div>
      </div>
    </section>
  `,
  styleUrl: './intro.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Intro {
  protected readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;
  protected readonly icons: IconName[] = ['languages', 'map', 'hand-helping'];
}

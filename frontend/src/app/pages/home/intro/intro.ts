import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18n } from '../../../core/i18n/i18n';
import { Icon, IconName } from '../../../shared/icon';
import { Reveal } from '../../../shared/reveal';

@Component({
  selector: 'app-intro',
  imports: [NgTemplateOutlet, RouterLink, Icon, Reveal],
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
            <ng-template #body>
              <span class="pillar__icon"><svg [appIcon]="icons[$index]"></svg></span>
              <h3>{{ pillar.title }}</h3>
              <p>{{ pillar.text }}</p>
            </ng-template>
            <!-- the last pillar (help with commanders, gear, events) leads to the guides -->
            @if ($last) {
              <a class="pillar pillar--link" [routerLink]="i18n.path('guideHub')" [appReveal]="$index * 120">
                <ng-container [ngTemplateOutlet]="body" />
                <span class="pillar__cta">{{ t().intro.guides }} <svg appIcon="arrow-right"></svg></span>
              </a>
            } @else {
              <article class="pillar" [appReveal]="$index * 120">
                <ng-container [ngTemplateOutlet]="body" />
              </article>
            }
          }
        </div>

        <!-- the kingdom's own joke: a screenshot from the map (Gether 4. 11. 2026), pinned slightly askew -->
        <figure class="wisdom" appReveal>
          <img
            class="wisdom__shot"
            src="/img/fun/brana-8.webp"
            [alt]="t().intro.wisdom.alt"
            width="736"
            height="236"
            loading="lazy"
            decoding="async"
          />
          <figcaption class="wisdom__caption">{{ t().intro.wisdom.title }}</figcaption>
        </figure>

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
  protected readonly icons: IconName[] = ['languages', 'calendar-days', 'hand-helping'];
}

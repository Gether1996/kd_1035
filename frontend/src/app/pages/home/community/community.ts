import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { KingdomApi, Platform } from '../../../core/api';
import { I18n } from '../../../core/i18n/i18n';
import { Icon } from '../../../shared/icon';
import { Reveal } from '../../../shared/reveal';
import { ScrollFx } from '../../../shared/scroll-fx';

@Component({
  selector: 'app-community',
  imports: [Icon, Reveal, RouterLink, ScrollFx],
  template: `
    <section class="section" id="community" appScrollFx>
      <div class="art" aria-hidden="true">
        <img class="art__far" src="img/hero/far.svg" alt="" loading="lazy" decoding="async" />
        <img class="art__mid" src="img/hero/mid.svg" alt="" loading="lazy" decoding="async" />
      </div>

      <div class="container">
        <header class="section-head" appReveal>
          <p class="eyebrow">{{ t().community.eyebrow }}</p>
          <h2 class="title">{{ t().community.title }}</h2>
          <p class="lead">{{ t().community.text }}</p>
          <p class="more">
            <a class="more__link" [routerLink]="i18n.path('about')" fragment="migracia">
              {{ t().community.migration }} <svg appIcon="arrow-right"></svg>
            </a>
          </p>
        </header>

        <div class="links">
          @for (item of platforms; track item.platform; let i = $index) {
            @let url = api.links()[item.platform];
            @if (url) {
              <a class="link link--{{ item.platform }}" [href]="url" target="_blank" rel="noopener noreferrer" [appReveal]="i * 120">
                <span class="link__icon"><svg [appIcon]="item.platform"></svg></span>
                <span class="link__text">
                  <strong>{{ item.name }}</strong>
                  <small>{{ t().community[item.platform] }}</small>
                </span>
                <svg class="link__arrow" appIcon="arrow-right"></svg>
              </a>
            } @else {
              <div class="link link--{{ item.platform }} is-soon" [appReveal]="i * 120">
                <span class="link__icon"><svg [appIcon]="item.platform"></svg></span>
                <span class="link__text">
                  <strong>{{ item.name }}</strong>
                  <small>{{ t().community[item.platform] }}</small>
                </span>
                <span class="tag">{{ t().community.soon }}</span>
              </div>
            }
          }
        </div>
      </div>
    </section>
  `,
  styleUrl: './community.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Community {
  protected readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;
  protected readonly api = inject(KingdomApi);
  protected readonly platforms: { platform: Platform; name: string }[] = [
    { platform: 'discord', name: 'Discord' },
    { platform: 'facebook', name: 'Facebook' },
  ];
}

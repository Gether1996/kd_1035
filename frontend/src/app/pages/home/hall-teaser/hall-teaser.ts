import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Auth } from '../../../core/auth';
import { I18n } from '../../../core/i18n/i18n';
import { Icon } from '../../../shared/icon';
import { Reveal } from '../../../shared/reveal';
import { HONOURS, HallData, HallEntry, portrait } from '../../hall/hall-data';

/**
 * Home: a look into the Hall of Fame further down the page (Gether 28. 10. 2026: "teaser aj na hlavnej stránke, keď sa
 * užívateľ prescrolluje, ale uvidia to len prihlásení a overení ľudia") – the champions' portraits and the way in.
 * Approved players and the superadmin only, asked in the browser; nothing at all for anyone else or an empty hall.
 */
@Component({
  selector: 'app-hall-teaser',
  imports: [RouterLink, Icon, Reveal],
  template: `
    @if (champions().length) {
      @let x = i18n.t().hall;
      <section class="section" aria-labelledby="hall-teaser-title">
        <div class="container">
          <div class="teaser" appReveal>
            <div class="teaser__text">
              <p class="eyebrow">{{ x.teaser.eyebrow }}</p>
              <h2 class="title" id="hall-teaser-title">{{ x.title }}</h2>
              <p class="lead">{{ x.teaser.text }}</p>
              <a class="btn btn--gold" [routerLink]="i18n.path('hall')"><svg appIcon="trophy"></svg> {{ x.teaser.cta }}</a>
            </div>
            <ul class="teaser__heroes">
              @for (e of champions(); track e.id) {
                <li class="hero-mini">
                  <span class="hero-mini__portrait">
                    @if (portrait(e); as src) {
                      <img [src]="src" alt="" loading="lazy" />
                    } @else {
                      <span aria-hidden="true">{{ initial(e) }}</span>
                    }
                  </span>
                  <span class="hero-mini__name">{{ e.name }}</span>
                  <span class="hero-mini__what">{{ x.categories[e.category].title }}</span>
                </li>
              }
            </ul>
          </div>
        </div>
      </section>
    }
  `,
  styleUrl: './hall-teaser.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HallTeaser {
  protected readonly i18n = inject(I18n);
  private readonly auth = inject(Auth);
  private readonly http = inject(HttpClient);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly entries = signal<HallEntry[]>([]);
  protected readonly portrait = portrait;

  /** the champions in the hall's order */
  protected readonly champions = computed(() =>
    HONOURS.map((category) => this.entries().find((e) => e.category === category)).filter((e): e is HallEntry => !!e),
  );

  constructor() {
    effect(() => {
      const allowed = !!this.auth.user()?.approved || !!this.auth.user()?.is_superuser;
      if (!this.isBrowser || !allowed) {
        this.entries.set([]);
        return;
      }
      untracked(() => void this.load());
    });
  }

  private async load(): Promise<void> {
    try {
      this.entries.set((await firstValueFrom(this.http.get<HallData>('/api/hall/'))).entries);
    } catch {
      // the hall is down – no teaser rather than a broken one
    }
  }

  protected initial(entry: HallEntry): string {
    return [...entry.name.trim()][0]?.toUpperCase() ?? '?';
  }
}

import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18n } from '../../../core/i18n/i18n';
import { Icon } from '../../../shared/icon';
import { Logo } from '../../../shared/logo';
import { Reveal } from '../../../shared/reveal';

/** Home: event reminders as a private Discord message – a sample of the bot's message and the way to /pripomienky. */
@Component({
  selector: 'app-notify',
  imports: [RouterLink, Icon, Logo, Reveal],
  template: `
    @let n = t();
    <section class="section" id="reminders" aria-labelledby="notify-title">
      <div class="container notify">
        <div class="notify__text" appReveal>
          <p class="eyebrow">{{ n.eyebrow }}</p>
          <h2 class="title" id="notify-title">{{ n.title }}</h2>
          <p class="lead">{{ n.text }}</p>
          <a class="btn btn--gold" [routerLink]="i18n.path('reminders')">
            <svg appIcon="bell"></svg> {{ n.cta }}
          </a>
        </div>

        <!-- what the bot sends (backend/accounts/reminders.py): a gold embed with the start and a link back -->
        <figure class="dm" [appReveal]="120">
          <figcaption class="sr-only">{{ n.preview.label }}</figcaption>
          <div class="dm__message" aria-hidden="true">
            <span class="dm__avatar"><svg appLogo></svg></span>
            <div class="dm__body">
              <p class="dm__meta">
                <strong>{{ n.preview.bot }}</strong>
                <span class="dm__tag">{{ n.preview.tag }}</span>
                <span class="dm__time">{{ n.preview.time }}</span>
              </p>
              <div class="dm__embed">
                <strong class="dm__title">{{ n.preview.event }}</strong>
                <span class="dm__line">{{ n.preview.start }}</span>
                <span class="dm__link">{{ n.preview.manage }}</span>
                <span class="dm__footer">{{ footer() }}</span>
              </div>
            </div>
          </div>
        </figure>
      </div>
    </section>
  `,
  styleUrl: './notify.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Notify {
  protected readonly i18n = inject(I18n);
  protected readonly t = computed(() => this.i18n.t().notify);
  /** the embed's footer names the page where the reminder was set, like the real message */
  protected readonly footer = computed(() => `KD 1035 · ${this.i18n.t().nav.reminders}`);
}

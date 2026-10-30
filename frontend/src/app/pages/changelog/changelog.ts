import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { I18n } from '../../core/i18n/i18n';
import { PageHeader } from '../../shared/page-header';
import { CHANGES } from './changes';

/** /novinky – what is new on the website, one block per day (Slim 30. 10. 2026: "changelog do footra"); prerendered,
 * linked from the version in the footer */
@Component({
  selector: 'app-changelog',
  imports: [PageHeader],
  template: `
    @let c = t();
    <app-page-header [crumbs]="crumbs()" [eyebrow]="c.eyebrow" [title]="c.title" [intro]="c.intro" />

    <div class="container content">
      <ol class="days">
        @for (day of days(); track day.date) {
          <li class="day">
            <h2 class="day__head">
              <time [attr.datetime]="day.date">{{ day.label }}</time>
              <span class="day__version">v{{ day.version }}</span>
            </h2>
            <ul class="day__list">
              @for (line of day.lines; track $index) {
                <li>{{ line }}</li>
              }
            </ul>
          </li>
        }
      </ol>
    </div>
  `,
  styleUrl: './changelog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Changelog {
  protected readonly i18n = inject(I18n);
  protected readonly t = computed(() => this.i18n.t().changelog);

  protected readonly crumbs = computed(() => [
    { label: this.i18n.t().nav.home, link: this.i18n.path('home') },
    { label: this.t().title, link: this.i18n.path('changelog') },
  ]);

  /** "30. októbra 2026" – the date is fixed, the same on the server and in the browser */
  protected readonly days = computed(() => {
    const cs = this.i18n.lang() === 'cs';
    const format = new Intl.DateTimeFormat(this.i18n.locale(), { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
    return CHANGES.map((change) => ({
      date: change.date,
      version: change.version,
      label: format.format(new Date(`${change.date}T12:00:00Z`)),
      lines: cs ? change.cs : change.sk,
    }));
  });
}

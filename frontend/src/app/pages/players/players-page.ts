import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject } from '@angular/core';
import { Auth } from '../../core/auth';
import { I18n } from '../../core/i18n/i18n';
import { Seo } from '../../core/seo';
import { PageHeader } from '../../shared/page-header';
import { PlayersAdmin } from './players-admin';

/**
 * /hraci – the superadmin's list of players (Gether 20. 10. 2026: a page of its own in the account menu, before a
 * section of /ucet; /ucet#hraci from older Discord messages comes here). A prerendered shell, not indexed, not in the
 * sitemap; the list itself is the superuser's only (the API refuses everyone else).
 */
@Component({
  selector: 'app-players-page',
  imports: [PageHeader, PlayersAdmin],
  template: `
    @let k = t().players;
    <app-page-header [crumbs]="crumbs()" [eyebrow]="k.eyebrow" [title]="k.title" [intro]="k.lead" />

    <div class="container content is-wide">
      @if (!auth.ready()) {
        <div class="placeholder" aria-hidden="true"></div>
      } @else if (!auth.user()?.is_superuser) {
        <p class="state">{{ k.onlySuperuser }}</p>
      } @else {
        <app-players-admin />
      }
    </div>
  `,
  styleUrl: '../reminders/reminders-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlayersPage {
  protected readonly i18n = inject(I18n);
  protected readonly auth = inject(Auth);
  protected readonly t = this.i18n.t;

  protected readonly crumbs = computed(() => [
    { label: this.t().nav.home, link: this.i18n.path('home') },
    { label: this.t().players.title, link: this.i18n.path('players') },
  ]);

  constructor() {
    const seo = inject(Seo);
    effect(() => seo.set({ ...this.t().seo.players, noindex: true }));
    inject(DestroyRef).onDestroy(() => seo.set(null));
  }
}

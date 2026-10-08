import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject } from '@angular/core';
import { I18n } from '../../core/i18n/i18n';
import { Seo } from '../../core/seo';
import { NotFoundLinks, notFoundMeta } from '../../shared/not-found';
import { PageHeader } from '../../shared/page-header';

/**
 * Any unknown address, in the language of its URL (`/xyz` Slovak, `/cz/xyz` Czech). The address stays as typed;
 * nginx answers these with a real 404 status and the app shell, so the page is never prerendered.
 */
@Component({
  selector: 'app-not-found',
  imports: [NotFoundLinks, PageHeader],
  templateUrl: './not-found.html',
  styleUrl: './not-found.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFound {
  protected readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;
  protected readonly crumbs = computed(() => [
    { label: this.t().nav.home, link: this.i18n.path('home') },
    { label: this.t().notFound.eyebrow, link: this.i18n.switchPath(this.i18n.lang()) },
  ]);

  constructor() {
    const seo = inject(Seo);
    effect(() => seo.set(notFoundMeta(this.t())));
    inject(DestroyRef).onDestroy(() => seo.set(null));
  }
}

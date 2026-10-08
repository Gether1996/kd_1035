import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18n } from '../../core/i18n/i18n';
import { Icon } from '../../shared/icon';
import { PageHeader } from '../../shared/page-header';
import { Reveal } from '../../shared/reveal';

/** "Podmienky používania" – unofficial fan site, no link to Lilith Games, trademarks, no warranty on guides. */
@Component({
  selector: 'app-terms',
  imports: [RouterLink, Icon, PageHeader, Reveal],
  templateUrl: './terms.html',
  styleUrl: './terms.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Terms {
  protected readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;
  protected readonly crumbs = computed(() => [
    { label: this.t().nav.home, link: this.i18n.path('home') },
    { label: this.t().nav.terms, link: this.i18n.path('terms') },
  ]);
  // same date format in Slovak and Czech; change both when the terms change
  protected readonly validFrom = { iso: '2026-10-08', text: '8. 10. 2026' };
}

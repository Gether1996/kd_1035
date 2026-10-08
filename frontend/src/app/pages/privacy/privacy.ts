import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18n } from '../../core/i18n/i18n';
import { Icon } from '../../shared/icon';
import { PageHeader } from '../../shared/page-header';
import { Reveal } from '../../shared/reveal';

/**
 * "Ochrana údajov" – what the site stores about visitors and signed-in players, who sees it, third parties,
 * how long it is kept and how to delete it. Must match the code: every new personal-data field, cookie,
 * third party or retention change updates `privacyPage` in both dictionaries and `validFrom`.
 */
@Component({
  selector: 'app-privacy',
  imports: [RouterLink, Icon, PageHeader, Reveal],
  templateUrl: './privacy.html',
  styleUrl: '../../shared/legal-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Privacy {
  protected readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;
  protected readonly crumbs = computed(() => [
    { label: this.t().nav.home, link: this.i18n.path('home') },
    { label: this.t().nav.privacy, link: this.i18n.path('privacy') },
  ]);
  // same date format in Slovak and Czech; change both when the page changes
  protected readonly validFrom = { iso: '2026-10-08', text: '8. 10. 2026' };
}

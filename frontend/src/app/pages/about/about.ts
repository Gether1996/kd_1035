import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18n } from '../../core/i18n/i18n';
import { Icon } from '../../shared/icon';
import { PageHeader } from '../../shared/page-header';
import { Reveal } from '../../shared/reveal';

/** "O nás" – the long-form SEO page about the only CZ/SK kingdom in Rise of Kingdoms. */
@Component({
  selector: 'app-about',
  imports: [RouterLink, Icon, PageHeader, Reveal],
  templateUrl: './about.html',
  styleUrl: './about.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class About {
  protected readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;
  protected readonly crumbs = computed(() => [
    { label: this.t().nav.home, link: this.i18n.path('home') },
    { label: this.t().nav.about, link: this.i18n.path('about') },
  ]);
}

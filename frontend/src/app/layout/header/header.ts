import { ChangeDetectionStrategy, Component, DOCUMENT, computed, effect, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { Auth } from '../../core/auth';
import { I18n } from '../../core/i18n/i18n';
import { Scroll } from '../../core/scroll';
import { Icon } from '../../shared/icon';
import { Logo } from '../../shared/logo';
import { LangSwitch } from '../lang-switch/lang-switch';

interface NavItem {
  label: string;
  link: string;
  fragment?: string;
  /** false = also active on the pages below it (Návody on every category and guide) */
  exact?: boolean;
}

@Component({
  selector: 'app-header',
  imports: [RouterLink, RouterLinkActive, Icon, Logo, LangSwitch],
  templateUrl: './header.html',
  styleUrl: './header.scss',
  host: {
    '[class.is-solid]': 'scroll.scrolled() || menuOpen()',
    '(document:keydown.escape)': 'close()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Header {
  protected readonly i18n = inject(I18n);
  protected readonly scroll = inject(Scroll);
  protected readonly auth = inject(Auth);
  protected readonly menuOpen = signal(false);

  protected readonly items = computed<NavItem[]>(() => {
    const t = this.i18n.t().nav;
    const home = this.i18n.path('home');
    return [
      { label: t.about, link: this.i18n.path('about') },
      { label: t.calendar, link: this.i18n.path('calendar') },
      { label: t.alliance, link: home, fragment: 'alliance' },
      { label: t.guides, link: this.i18n.path('guideHub'), exact: false },
      { label: t.community, link: home, fragment: 'community' },
    ];
  });

  constructor() {
    const doc = inject(DOCUMENT);
    effect(() => {
      doc.body.style.overflow = this.menuOpen() ? 'hidden' : '';
    });
  }

  protected toggle(): void {
    this.menuOpen.update((open) => !open);
  }

  protected close(): void {
    this.menuOpen.set(false);
  }
}

import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  DestroyRef,
  ElementRef,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { Auth } from '../../core/auth';
import { I18n } from '../../core/i18n/i18n';
import { Scroll } from '../../core/scroll';
import { Icon, IconName } from '../../shared/icon';
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
    '(document:keydown.escape)': 'escape()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Header {
  protected readonly i18n = inject(I18n);
  protected readonly scroll = inject(Scroll);
  protected readonly auth = inject(Auth);
  protected readonly menuOpen = signal(false);
  private readonly burger = viewChild<ElementRef<HTMLButtonElement>>('burger');
  /** Escape in the account menu hides it until the pointer or the focus leaves */
  protected readonly menuClosed = signal(false);

  /** the signed-in player's pages: the account menu (desktop) and the mobile menu */
  protected readonly accountItems = computed<{ label: string; link: string; icon: IconName }[]>(() => {
    const t = this.i18n.t().nav;
    return [
      { label: t.account, link: this.i18n.path('account'), icon: 'users' },
      { label: t.marches, link: this.i18n.path('playersMarches'), icon: 'shield' },
      { label: t.reminders, link: this.i18n.path('reminders'), icon: 'bell' },
      { label: t.kvk, link: this.i18n.path('kvk'), icon: 'swords' },
      // the KvK evaluation – the superadmin only (Gether 13. 10. 2026)
      ...(this.auth.user()?.is_superuser
        ? [{ label: t.evaluation, link: this.i18n.path('evaluation'), icon: 'scale' as const }]
        : []),
    ];
  });

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
    const browser = isPlatformBrowser(inject(PLATFORM_ID));
    effect(() => {
      const open = this.menuOpen();
      doc.body.style.overflow = open ? 'hidden' : '';
      // the page under the open mobile menu is out of reach for Tab and screen readers
      if (browser) for (const el of doc.querySelectorAll('main, app-footer')) el.toggleAttribute('inert', open);
    });
    // the mobile menu is hidden from 900 px (header.scss): a tablet turned to landscape or a widened window closes
    // it, or the page under it would stay inert and unscrollable
    if (browser && typeof matchMedia === 'function') {
      const wide = matchMedia('(min-width: 900px)');
      const onChange = () => wide.matches && this.close();
      wide.addEventListener?.('change', onChange);
      inject(DestroyRef).onDestroy(() => wide.removeEventListener?.('change', onChange));
    }
  }

  protected toggle(): void {
    this.menuOpen.update((open) => !open);
  }

  protected close(): void {
    this.menuOpen.set(false);
  }

  /** Escape closes the mobile menu and puts the focus back on its button (it was inside the menu) */
  protected escape(): void {
    if (!this.menuOpen()) return;
    this.close();
    this.burger()?.nativeElement.focus();
  }

  protected closeMenu(event: Event): void {
    this.menuClosed.set(true);
    // back on the pill, so the keyboard user does not lose the place
    ((event.currentTarget as HTMLElement).previousElementSibling as HTMLElement | null)?.focus();
  }
}

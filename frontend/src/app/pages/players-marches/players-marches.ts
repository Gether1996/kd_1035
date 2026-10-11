import { isPlatformBrowser } from '@angular/common';
import { httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { Auth } from '../../core/auth';
import { I18n } from '../../core/i18n/i18n';
import { March, MarchImage, marchIcon } from '../../core/kvk-api';
import { MarchCommander, MarchesApi, PlayerMarches, marchCommandersUrl } from '../../core/marches-api';
import { Seo } from '../../core/seo';
import { Icon } from '../../shared/icon';
import { PageHeader } from '../../shared/page-header';
import { fold } from '../../shared/search';
import { Marches } from '../account/marches';

/**
 * /marche – two tabs (Gether 11. 10. 2026): "Marche hráčov" = the marches of the players who made them public ("aby to
 * mali ako motiváciu"; R4 and the superuser see every player's), "Moje marche" (?tab=moje) = the player's own marches
 * (the Marches component, formerly on /ucet). Signed-in players only; a prerendered shell, not indexed, not in the
 * sitemap.
 */
@Component({
  selector: 'app-players-marches',
  imports: [Icon, PageHeader, Marches],
  templateUrl: './players-marches.html',
  styleUrls: ['../reminders/reminders-page.scss', './players-marches.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlayersMarches {
  /** ?tab=moje – the player's own marches */
  readonly tab = input<string>();

  protected readonly i18n = inject(I18n);
  private readonly router = inject(Router);
  protected readonly mine = computed(() => this.tab() === 'moje');
  protected readonly auth = inject(Auth);
  protected readonly t = this.i18n.t;
  protected readonly icon = marchIcon;

  protected readonly data = inject(MarchesApi).players(() => !!this.auth.user());
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly commanderData = httpResource<MarchCommander[]>(() => (this.isBrowser ? marchCommandersUrl : undefined));
  private readonly portraits = computed(
    () => new Map((this.commanderData.hasValue() ? this.commanderData.value() : []).map((c) => [c.name, c.icon])),
  );

  protected readonly search = signal('');
  protected readonly players = computed(() => (this.data.hasValue() ? this.data.value().players : []));
  protected readonly shown = computed(() => {
    const query = fold(this.search());
    return this.players().filter((p) => !query || fold(`${p.ingame_name} ${p.name}`).includes(query));
  });

  protected readonly crumbs = computed(() => [
    { label: this.t().nav.home, link: this.i18n.path('home') },
    { label: this.t().playersMarches.title, link: this.i18n.path('playersMarches') },
  ]);

  // ---------------------------------------------------------------- screenshot dialog
  protected readonly viewing = signal<{ player: PlayerMarches; march: March; image: MarchImage } | null>(null);
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('viewer');
  private opener: HTMLElement | null = null;

  constructor() {
    const seo = inject(Seo);
    effect(() => seo.set({ ...this.t().seo.playersMarches, noindex: true }));
    inject(DestroyRef).onDestroy(() => seo.set(null));
  }

  protected showMine(mine: boolean): void {
    void this.router.navigate([], { queryParams: { tab: mine ? 'moje' : null }, replaceUrl: true });
  }

  protected name(player: PlayerMarches): string {
    return player.ingame_name || player.name;
  }

  protected portrait(name: string): string | undefined {
    return this.portraits().get(name);
  }

  protected open(player: PlayerMarches, march: March, image: MarchImage, event: Event): void {
    this.opener = event.currentTarget as HTMLElement;
    this.viewing.set({ player, march, image });
    this.dialog()?.nativeElement.showModal();
  }

  protected close(): void {
    this.dialog()?.nativeElement.close();
  }

  protected closed(): void {
    this.viewing.set(null);
    this.opener?.focus();
  }
}

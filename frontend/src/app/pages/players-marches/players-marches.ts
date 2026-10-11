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
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Auth } from '../../core/auth';
import { I18n } from '../../core/i18n/i18n';
import { March, MarchImage, marchIcon } from '../../core/kvk-api';
import { MarchesApi, PlayerMarches } from '../../core/marches-api';
import { Seo } from '../../core/seo';
import { Icon } from '../../shared/icon';
import { PageHeader } from '../../shared/page-header';
import { fold } from '../../shared/search';
import { CommanderRef } from '../guides/commander-finder';

/**
 * /marche – the marches of the players who made them public (Gether 11. 10. 2026: "aby to mali ako motiváciu");
 * R4 and the superuser see every player's. Signed-in players only; a prerendered shell, not indexed, not in the
 * sitemap.
 */
@Component({
  selector: 'app-players-marches',
  imports: [RouterLink, Icon, PageHeader],
  templateUrl: './players-marches.html',
  styleUrls: ['../reminders/reminders-page.scss', './players-marches.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlayersMarches {
  protected readonly i18n = inject(I18n);
  protected readonly auth = inject(Auth);
  protected readonly t = this.i18n.t;
  protected readonly icon = marchIcon;

  protected readonly data = inject(MarchesApi).players(() => !!this.auth.user());
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly commanderData = httpResource<CommanderRef[]>(() => (this.isBrowser ? '/api/commanders/' : undefined));
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

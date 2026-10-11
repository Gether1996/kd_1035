import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { I18n } from '../../core/i18n/i18n';
import { KvkApi, ReviewerRow } from '../../core/kvk-api';
import { fold } from '../../shared/search';

/**
 * "Hráči" on /ucet – superuser only (Gether 11. 10. 2026): every player signed in with Discord and the switch
 * "vidí prihlášky" (R4): such a player sees every KvK sign-up, its screenshots and the players' marches.
 */
@Component({
  selector: 'app-players-admin',
  template: `
    @let k = t();
    <section class="panel" aria-labelledby="players-title">
      <h2 class="panel__title panel__title--small" id="players-title">
        {{ k.title }} <span class="count">{{ players().length }}</span>
      </h2>
      <p class="panel__lead">{{ k.lead }}</p>
      <div class="field reviewers__search">
        <label class="sr-only" for="players-search">{{ k.search }}</label>
        <input
          #q
          id="players-search"
          class="input"
          type="search"
          autocomplete="off"
          [placeholder]="k.search"
          [value]="search()"
          (input)="search.set(q.value)"
        />
      </div>
      @if (data.error()) {
        <p class="panel__lead is-error">{{ k.loadError }}</p>
      }
      <ul class="reviewers">
        @for (p of shown(); track p.id) {
          <li class="reviewer">
            <img class="signup__avatar" [src]="p.avatar_url" alt="" width="36" height="36" />
            <label class="reviewer__name" [for]="'player-r4-' + p.id">
              <strong>{{ p.ingame_name || p.name }}</strong>
              <span>{{ p.ingame_name ? p.name + ' · ' : '' }}{{ p.superuser ? k.superuser : p.reviewer ? k.r4 : k.player }}</span>
            </label>
            @if (!p.superuser) {
              <input
                #box
                class="switch"
                type="checkbox"
                role="switch"
                [id]="'player-r4-' + p.id"
                [attr.aria-label]="k.toggle + ': ' + (p.ingame_name || p.name)"
                [checked]="p.reviewer"
                (change)="setReviewer(p, box)"
              />
            }
          </li>
        } @empty {
          @if (data.hasValue()) {
            <li class="panel__lead">{{ k.empty }}</li>
          }
        }
      </ul>
      <p class="form__state is-error" role="status">{{ failed() ? k.failed : '' }}</p>
    </section>
  `,
  styleUrl: '../kvk/kvk.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlayersAdmin {
  private readonly api = inject(KvkApi);
  protected readonly i18n = inject(I18n);
  protected readonly t = computed(() => this.i18n.t().players);

  protected readonly data = this.api.reviewers(() => true);
  protected readonly players = linkedSignal<ReviewerRow[]>(() => (this.data.hasValue() ? this.data.value().players : []));
  protected readonly search = signal('');
  protected readonly failed = signal(false);
  protected readonly shown = computed(() => {
    const query = fold(this.search());
    return this.players().filter((p) => !query || fold(`${p.ingame_name} ${p.name}`).includes(query));
  });

  protected async setReviewer(player: ReviewerRow, box: HTMLInputElement): Promise<void> {
    const reviewer = box.checked;
    this.failed.set(false);
    try {
      await this.api.setReviewer(player.id, reviewer);
      this.players.update((list) => list.map((p) => (p.id === player.id ? { ...p, reviewer } : p)));
    } catch {
      this.failed.set(true);
      box.checked = !reviewer; // the switch goes back
    }
  }
}

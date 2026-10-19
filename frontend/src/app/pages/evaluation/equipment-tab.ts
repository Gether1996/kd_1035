import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  ArmoryIndex,
  GEAR_SLOTS,
  INSCRIPTION_RARITIES,
  Inscription,
  TROOP_STATS,
  gearTotals,
  roman,
  troopStat,
} from '../../core/armory';
import { I18n } from '../../core/i18n/i18n';
import { ARMAMENT_STATS } from '../../core/kvk-api';
import { FormationIcon } from '../../shared/formation-icon';
import { GearGrid } from '../../shared/gear-grid';
import { Icon } from '../../shared/icon';
import { SetBonuses } from '../../shared/set-bonuses';
import { Army, EQUIPMENT_KINDS, EquipmentData, EquipmentKind, Kit, equipmentRanking } from './equipment';
import { normalizeSettings } from './settings';
import { EvalTexts } from './texts';

/** shown before "Zobraziť všetkých" */
const TOP = 5;

/**
 * "Top 5 equip" of /vyhodnocovanie (Gether 19. 10. 2026, R4 only): the players with the best equipment for infantry,
 * cavalry and archers – the best piece of each slot of all marches and KvK sign-ups of the type put together (a player
 * may wear the best pieces on two commanders of the same type) and the strongest formation, in points: who fits a
 * rally or a garrison best. The top five, all on request; a card opens to the gear put together with its set bonuses,
 * the armaments and where each piece is worn.
 */
@Component({
  selector: 'app-eval-equipment',
  imports: [RouterLink, GearGrid, FormationIcon, SetBonuses, Icon],
  template: `
    @let x = texts().equipment;
    @let d = texts().detail;
    @let ix = armory();
    <div class="segmented eq-kinds" role="group" [attr.aria-label]="x.kind">
      @for (k of kinds; track k) {
        <button type="button" [attr.aria-pressed]="kind() === k" (click)="pick(k)">{{ texts().kinds[k] }}</button>
      }
    </div>
    <p class="eq-hint">{{ x.hint }}</p>
    @if (ix) {
      <ol class="eq-list">
        @for (row of shown(); track row.kit.player.id; let i = $index) {
          @let kit = row.kit;
          @let v = row.view;
          <li class="eq-item" [id]="'ev-player-' + kit.player.id" [class.is-focus]="kit.player.id === focus()">
            <details class="eq-card" [open]="kit.player.id === focus()">
              <summary class="eq-summary">
                <span class="eq-rank" [class.is-top]="i < 3">{{ i + 1 }}</span>
                <img class="eq-avatar" [src]="kit.player.avatar_url" alt="" width="36" height="36" loading="lazy" />
                <span class="eq-player">
                  <span class="eq-name">{{ kit.player.name }}</span>
                  <small class="eq-meta">
                    @if (kit.marches) {
                      {{ x.marches.replace('{n}', '' + kit.marches) }}
                    }
                    @if (kit.marches && kit.signups.length) {
                      ·
                    }
                    @if (kit.signups.length) {
                      {{ x.signups.replace('{roles}', kit.signups.join(', ')) }}
                    }
                  </small>
                </span>
                <span class="eq-gear">
                  <small class="eq-label">{{ x.gear }}</small>
                  @if (kit.equipment.pieces) {
                    <span class="eq-value"><strong class="eq-tier">{{ kit.equipment.tier }}</strong> {{ x.points.replace('{n}', dec(kit.equipment.points)) }}</span>
                    <small class="eq-meta">
                      {{ d.legendary.replace('{n}', '' + kit.equipment.legendary) }} ·
                      {{ d.crit.replace('{n}', '' + kit.equipment.crit) }}
                      @if (kit.equipment.legendary) {
                        · {{ d.iconic.replace('{n}', dec(kit.equipment.iconic)) }}
                      }
                    </small>
                  } @else {
                    <span class="eq-value is-none">{{ d.noGear }}</span>
                  }
                </span>
                <span class="eq-formation">
                  @if (v.formation; as f) {
                    <app-formation-icon class="eq-formation__icon" [formation]="f" />
                  }
                  <span>
                    <small class="eq-label">{{ d.armaments }}</small>
                    @if (kit.armaments.filled) {
                      <span class="eq-value">{{ x.points.replace('{n}', dec(kit.armaments.points)) }}</span>
                    } @else {
                      <span class="eq-value is-none">{{ x.noFormation }}</span>
                    }
                  </span>
                </span>
                <span class="eq-score">
                  <small class="eq-label">{{ x.score }}</small>
                  <strong class="eq-total">{{ dec(kit.total) }}</strong>
                </span>
                <svg class="eq-chevron" appIcon="chevron-down" aria-hidden="true"></svg>
              </summary>
              <div class="eq-detail">
                <section class="eq-part">
                  <h3 class="eq-part__title">
                    {{ x.gear }} <span class="eq-part__points">{{ x.points.replace('{n}', dec(kit.equipment.points)) }}</span>
                  </h3>
                  @if (kit.equipment.pieces) {
                    <app-gear-grid class="eq-grid" [gear]="kit.gear" [index]="ix" [critTroop]="kind()" />
                    @if (v.gearStats.length) {
                      <ul class="eq-stats" [attr.aria-label]="v.gearTitle" [title]="v.gearTitle">
                        @for (s of v.gearStats; track s.label) {
                          <li><span class="eq-stats__label">{{ s.label }}</span> {{ dec(s.value) }}%</li>
                        }
                      </ul>
                    }
                    <app-set-bonuses class="eq-sets" [worn]="v.sets" />
                  } @else {
                    <p class="eq-meta">{{ d.noGear }}</p>
                  }
                </section>
                <section class="eq-part">
                  <h3 class="eq-part__title">
                    {{ d.armaments }} <span class="eq-part__points">{{ x.points.replace('{n}', dec(kit.armaments.points)) }}</span>
                  </h3>
                  @if (kit.armamentsFrom; as from) {
                    @if (v.formation; as f) {
                      <p class="eq-arm">
                        <app-formation-icon class="eq-arm__icon" [formation]="f" />
                        <span class="eq-arm__name">{{ f.name }}</span>
                      </p>
                    }
                    @if (v.inscriptions.length) {
                      <ul class="eq-inscs">
                        @for (s of v.inscriptions; track s.id) {
                          <li class="insc insc--{{ s.rarity }}">{{ s.name }}</li>
                        }
                      </ul>
                    }
                    @if (v.armamentStats.length) {
                      <ul class="eq-stats">
                        @for (s of v.armamentStats; track s.label) {
                          <li><span class="eq-stats__label">{{ s.label }}</span> {{ dec(s.value) }}%</li>
                        }
                      </ul>
                    }
                    @if (kit.armaments.filled) {
                      <p class="eq-meta">{{ d.stats.replace('{a}', dec(kit.armaments.stats)).replace('{b}', dec(kit.armaments.inscriptions)) }}</p>
                    }
                    <p class="eq-meta">{{ origin(from) }}</p>
                  } @else {
                    <p class="eq-meta">{{ x.noFormation }}</p>
                  }
                </section>
                <section class="eq-part eq-sources">
                  <h3 class="eq-part__title">{{ x.detail }}</h3>
                  <ul class="eq-sources__list">
                    @for (s of v.sources; track s.slot) {
                      <li>
                        <span class="eq-sources__item">{{ x.from.replace('{slot}', s.slotName).replace('{item}', s.item) }}</span>
                        <small class="eq-meta">{{ s.origin }}</small>
                      </li>
                    } @empty {
                      <li class="eq-meta">{{ d.noGear }}</li>
                    }
                  </ul>
                  <p class="eq-formula">
                    {{
                      x.formula
                        .replace('{e}', dec(kit.equipment.points))
                        .replace('{we}', dec(settings().marches.equipment, 2))
                        .replace('{a}', dec(kit.armaments.points))
                        .replace('{wa}', dec(settings().marches.armaments, 2))
                        .replace('{t}', dec(kit.total))
                    }}
                  </p>
                  <a class="pill-btn pill-btn--quiet eq-link" [routerLink]="i18n.path('playersMarches')" [queryParams]="{ hrac: kit.player.id }">
                    {{ d.marchesLink }}
                  </a>
                </section>
              </div>
            </details>
          </li>
        } @empty {
          <li class="eq-empty">{{ x.empty }}</li>
        }
      </ol>
      @if (ranking().length > top) {
        <button type="button" class="pill-btn pill-btn--quiet eq-more" (click)="all.set(!all())">
          {{ all() ? x.showTop : x.showAll.replace('{n}', '' + ranking().length) }}
        </button>
      }
      <p class="eq-legend">{{ x.legend }}</p>
    } @else if (armoryFailed()) {
      <p class="notice notice--error">{{ texts().armoryError }}</p>
    } @else {
      <div class="placeholder" aria-hidden="true"></div>
    }
  `,
  styleUrl: './equipment-tab.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EvalEquipmentTab {
  readonly data = input.required<EquipmentData>();
  readonly armory = input.required<ArmoryIndex | null>();
  readonly armoryFailed = input(false);
  readonly texts = input.required<EvalTexts>();
  /** ?hrac= of the page – that player's card is highlighted and open */
  readonly focus = input<number | null>(null);

  protected readonly i18n = inject(I18n);
  protected readonly kinds = EQUIPMENT_KINDS;
  protected readonly top = TOP;
  protected readonly kind = signal<EquipmentKind>('infantry');
  protected readonly all = signal(false);

  protected readonly settings = computed(() => normalizeSettings(this.data().settings));
  protected readonly ranking = computed(() => {
    const index = this.armory();
    return index ? equipmentRanking(this.settings(), index, this.kind(), this.data().players) : [];
  });
  /** the top five – or everyone, also when ?hrac= points below them – with what their cards show */
  protected readonly shown = computed(() => {
    const ranking = this.ranking();
    const focus = this.focus();
    const below = focus !== null && ranking.findIndex((k) => k.player.id === focus) >= TOP;
    return (this.all() || below ? ranking : ranking.slice(0, TOP)).map((kit) => ({ kit, view: this.view(kit) }));
  });

  protected pick(kind: EquipmentKind): void {
    this.kind.set(kind);
    this.all.set(false);
  }

  /** "z marchu Attila / Achilles", "z prihlášky na rally (Attila / Achilles)" */
  protected origin(army: Army): string {
    const x = this.texts().equipment;
    const pair = [army.primary, army.secondary].filter(Boolean).join(' / ') || '–';
    return army.role ? x.fromSignup.replace('{role}', army.role).replace('{pair}', pair) : x.fromMarch.replace('{pair}', pair);
  }

  protected dec(n: number, digits = 1): string {
    return new Intl.NumberFormat(this.i18n.locale(), { maximumFractionDigits: digits }).format(n);
  }

  /** the card's detail: the bonuses of the gear put together and its sets, the armaments, where each piece is worn */
  private view(kit: Kit) {
    const index = this.armory()!;
    const t = this.i18n.t().marches;
    const totals = gearTotals(index, kit.gear);
    const troop = this.kind();
    const gearStats = TROOP_STATS.map((stat) => ({ label: t.build.stats[stat], value: troopStat(totals.stats, troop, stat) })).filter(
      (s) => s.value > 0,
    );
    const from = kit.armamentsFrom;
    const inscriptions = (from?.inscriptions ?? [])
      .map((id) => index.inscriptions.get(id))
      .filter((i): i is Inscription => !!i)
      .sort((a, b) => INSCRIPTION_RARITIES.indexOf(a.rarity) - INSCRIPTION_RARITIES.indexOf(b.rarity));
    const armamentStats = from
      ? ARMAMENT_STATS.filter((key) => from[key] != null).map((key) => ({ label: t.stats[key], value: from[key]! }))
      : [];
    const sources = GEAR_SLOTS.flatMap((slot) => {
      const piece = kit.gear[slot];
      const item = piece && index.items.get(piece.item);
      const army = kit.sources[slot];
      if (!piece || !item || !army) return [];
      const extra = [piece.crit ? t.build.crit : '', item.iconic && piece.iconic ? `${t.build.iconic} ${roman(piece.iconic)}` : ''];
      const shown = extra.filter(Boolean);
      const name = shown.length ? `${item.name} (${shown.join(', ')})` : item.name;
      return [{ slot, slotName: this.texts().slots[slot], item: name, origin: this.origin(army) }];
    });
    return {
      gearTitle: t.build.gearStats.replace('{troop}', t.build.troops[troop]),
      gearStats,
      sets: totals.sets,
      formation: kit.formation ? (index.formations.get(kit.formation) ?? null) : null,
      inscriptions,
      armamentStats,
      sources,
    };
  }
}

import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { I18n } from '../../core/i18n/i18n';

/**
 * Passport Pages needed to migrate, by account power: [upper limit in millions (inclusive), pages]. Same in
 * riseofkingdomsguides.com (2. 1. 2026), codexhelper.com and infocat-rok.com (both checked 11. 10. 2026). Exactly at a
 * limit (e.g. 40 000 000) the calculators disagree by one row; we follow codexhelper (the lower row).
 */
export const PASSPORTS: [number, number][] = [
  [10, 1],
  [15, 2],
  [20, 3],
  [25, 4],
  [30, 6],
  [35, 9],
  [40, 12],
  [45, 15],
  [50, 20],
  [55, 25],
  [60, 30],
  [65, 35],
  [70, 40],
  [75, 45],
  [80, 50],
  [85, 55],
  [90, 60],
  [95, 65],
  [100, 70],
  [Infinity, 75],
];
/** alliance credits per Passport Page in the alliance shop (same three sources) */
export const PAGE_PRICE = 600_000;
/** power of one troop the player still sends to the hospital – wounded troops do not count (the power shown in the
 * game already leaves out the ones there now) */
const HOSPITAL_POWER = { t4: 4, t5: 10 };

/** Power as typed: "42.5" or "42,5" = millions, a big number ("42 500 000", "42,500,000", "42.500.000") = the power
 * itself. */
export function parsePower(text: string): number | null {
  const plain = text.replace(/[\s ]/g, '');
  // thousands separators as the game shows them – two or more groups of three digits
  const grouped = /^\d{1,3}([.,])\d{3}(\1\d{3})+$/.test(plain);
  const clean = grouped ? plain.replace(/[.,]/g, '') : plain.replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(clean)) return null;
  const value = Number(clean);
  if (!value) return null;
  return value >= 10_000 ? value : value * 1_000_000;
}

export interface PassportResult {
  /** power that counts, after the troops the player still sends to the hospital */
  power: number;
  pages: number;
  credits: number;
  /** index of the row in PASSPORTS */
  row: number;
}

export function passportsFor(power: number, hospital = { t4: 0, t5: 0 }): PassportResult {
  const counted = Math.max(0, power - hospital.t4 * HOSPITAL_POWER.t4 - hospital.t5 * HOSPITAL_POWER.t5);
  const row = PASSPORTS.findIndex(([limit]) => counted <= limit * 1_000_000);
  const pages = PASSPORTS[row][1];
  return { power: counted, pages, credits: pages * PAGE_PRICE, row };
}

/**
 * "Koľko pasov potrebuješ" in the migration block of /o-nas: power → Passport Pages and alliance credits, the whole
 * table (prerendered for search engines) and the game's migration conditions, with dated sources.
 */
@Component({
  selector: 'app-passports',
  templateUrl: './passports.html',
  styleUrl: './passports.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Passports {
  protected readonly i18n = inject(I18n);
  protected readonly t = computed(() => this.i18n.t().aboutPage.passports);
  protected readonly rows = PASSPORTS.map(([limit, pages], i) => ({
    from: i ? PASSPORTS[i - 1][0] : 0,
    to: limit,
    pages,
  }));

  protected readonly text = signal('');
  protected readonly t4 = signal(0);
  protected readonly t5 = signal(0);
  protected readonly power = computed(() => parsePower(this.text()));
  protected readonly result = computed(() => {
    const power = this.power();
    return power ? passportsFor(power, { t4: this.t4(), t5: this.t5() }) : null;
  });
  /** the row below: how many pages a little less power would cost */
  protected readonly lower = computed(() => {
    const result = this.result();
    if (!result || !result.row) return null;
    const [limit, pages] = PASSPORTS[result.row - 1];
    return this.t().lower.replace('{power}', this.millions(limit)).replace('{pages}', this.pages(pages));
  });

  protected count(value: string): number {
    // whole troops: "1 000 000", "1,000,000" and "1.000.000" are the same
    const n = Number(value.replace(/[\s .,]/g, ''));
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  protected number(n: number): string {
    return new Intl.NumberFormat(this.i18n.locale()).format(n);
  }

  /** 40 → "40 mil." */
  protected millions(n: number): string {
    return this.t().millions.replace('{n}', this.number(n));
  }

  protected range(row: { from: number; to: number }): string {
    if (row.to === Infinity) return this.t().over.replace('{n}', this.number(row.from));
    return `${this.number(row.from)} – ${this.millions(row.to)}`;
  }

  protected pages(n: number): string {
    const [one, few, many] = this.t().pages;
    return (n === 1 ? one : n >= 2 && n <= 4 ? few : many).replace('{n}', String(n));
  }
}

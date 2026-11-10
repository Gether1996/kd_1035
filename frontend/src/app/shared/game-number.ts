/**
 * The big numbers of the game – kill points, deads (Gether 10. 11. 2026, the account overview) – typed as the game shows
 * them ("8.8B", "24M", "350K") or whole ("8 800 000 000", "8,800,000,000", "8.800.000.000").
 * '' = not written down (null); undefined = not such a number.
 */
export function parseGameNumber(text: string): number | null | undefined {
  const plain = text.trim().replace(/[\s ]/g, '').toLowerCase();
  if (!plain) return null;
  const suffix = /^(\d+(?:[.,]\d+)?)(k|tis\.?|m|mil\.?|b|mld\.?)$/.exec(plain);
  if (suffix) {
    const value = Number(suffix[1].replace(',', '.'));
    const unit = suffix[2][0] === 'k' || suffix[2].startsWith('t') ? 1e3 : suffix[2][0] === 'b' || suffix[2].startsWith('mld') ? 1e9 : 1e6;
    return Math.round(value * unit);
  }
  // thousands separators – groups of three digits; a lone "8.8" without a unit is not taken
  if (/^\d{1,3}([.,])\d{3}(\1\d{3})*$/.test(plain)) return Number(plain.replace(/[.,]/g, ''));
  return /^\d+$/.test(plain) ? Number(plain) : undefined;
}

/** "8.8B", "24M", "350K", "999" – short like the game */
export function shortGameNumber(n: number): string {
  const [value, unit] = n >= 1e9 ? [n / 1e9, 'B'] : n >= 1e6 ? [n / 1e6, 'M'] : n >= 1e4 ? [n / 1e3, 'K'] : [n, ''];
  return unit ? value.toFixed(value >= 100 ? 0 : 1).replace(/\.0$/, '') + unit : String(value);
}

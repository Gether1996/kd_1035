/** Power as typed: "42.5" or "42,5" = millions, a big number ("42 500 000", "42,500,000", "42.500.000") = the power
 * itself. The migration calculator on /o-nas and the player's power on /ucet. */
export function parsePower(text: string): number | null {
  // "101,5 M" or "101.5 mil." like in the bulk paste of the evaluation
  const plain = text.replace(/[\s ]/g, '').replace(/(m|mil\.?)$/i, '');
  // thousands separators as the game shows them – two or more groups of three digits
  const grouped = /^\d{1,3}([.,])\d{3}(\1\d{3})+$/.test(plain);
  const clean = grouped ? plain.replace(/[.,]/g, '') : plain.replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(clean)) return null;
  const value = Number(clean);
  if (!value) return null;
  return value >= 10_000 ? value : value * 1_000_000;
}

/** The power in millions with one decimal, as the KvK evaluation keeps it (/ucet); '' = not written down (null),
 * undefined = not a power, under 0.1 M or over the 9999.9 M the server takes. */
export function powerMillions(text: string): number | null | undefined {
  if (!text.trim()) return null;
  const power = parsePower(text);
  if (power === null) return undefined;
  const millions = Math.round(power / 100_000) / 10;
  return millions > 0 && millions <= 9999.9 ? millions : undefined;
}

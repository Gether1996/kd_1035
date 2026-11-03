/**
 * Commanders left out of "Nájdi pár pre commandera" and "Čo môžem postaviť" (/navody) – Gether 11. 10. 2026: only
 * the meta – no gatherers, no KvK1 / KvK2 commanders, no epic (purple) or elite ones and none from the golden keys. Their guides still show them.
 * - gatherers and KvK1 / KvK2: our guides "Páry commanderov na zber surovín" and the line-ups of "Páry pre F2P a
 *   začiatok" (backend/guides/meta/commanders.py)
 * - rarity and golden keys: app.rokstats.online (data from the game client, 26. 9. 2026), cross-checked with the
 *   Fandom wiki and riseofkingdomsguides.com – docs/commanderi-vyskum.md
 */
export const HIDDEN_COMMANDERS: ReadonlySet<string> = new Set([
  // gathering
  'Constance',
  'Matilda of Flanders',
  'Pepin III',
  'Seondeok',
  'Casimir III',
  'Yahya ibn Khalid',
  // KvK1 and KvK2
  'Sun Tzu',
  'Yi Seong-Gye',
  'Richard',
  'Charles Martel',
  'Alexander the Great',
  'Saladin',
  // epic (purple) – the versions in our guides; the Primes stay
  'Baibars',
  'Belisarius',
  'Bjorn Ironside',
  'Boudica',
  'Imhotep',
  'Joan of Arc',
  'Lohar',
  'Pelagius',
  // legendary from the golden keys
  'Cao Cao',
  'El Cid',
]);

export const shownCommander = (name: string) => !HIDDEN_COMMANDERS.has(name);

/**
 * Commanders left out of "Čo môžem postaviť" (/navody) and of the commander choice of the marches (/ucet) – Gether
 * 11. 10. 2026: no gatherers and none of the KvK1 / KvK2 commanders, only the meta. The names come from our guides:
 * "Páry commanderov na zber surovín" and the KvK1 / KvK2 line-ups of "Páry pre F2P a začiatok"
 * (backend/guides/meta/commanders.py). Their guides still show them.
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
]);

export const shownCommander = (name: string) => !HIDDEN_COMMANDERS.has(name);

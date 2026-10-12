import { ArmoryData } from './armory';

/** a tiny catalog for the tests: two items of a set, a weapon, a formation with its inscriptions and a common one */
export const ARMORY: ArmoryData = {
  verified: '2026-10',
  sources: [],
  items: [
    {
      id: 'sacred-dominion',
      name: 'Sacred Dominion',
      slot: 'weapon',
      rarity: 'legendary',
      stats: { cavalry_attack: 25, archer_defense: 5 },
      crit: { cavalry_attack: 32.5, archer_defense: 6.5 },
      iconic: true,
      icon: '/static/guides/gear/sacred-dominion.webp',
    },
    {
      id: 'heavy-armor',
      name: 'Heavy Armor',
      slot: 'chest',
      rarity: 'legendary',
      stats: { cavalry_defense: 20 },
      crit: { cavalry_defense: 26 },
      set: 'wasteland',
      icon: '/static/guides/gear/heavy-armor.webp',
    },
    {
      id: 'wasteland-boots',
      name: 'Wasteland Boots',
      slot: 'boots',
      rarity: 'epic',
      stats: { troop_health: 3 },
      crit: { troop_health: 4 },
      set: 'wasteland',
      icon: '/static/guides/gear/wasteland-boots.webp',
    },
    {
      id: 'ring-of-doom',
      name: 'Ring of Doom',
      slot: 'accessory',
      rarity: 'legendary',
      stats: {},
      crit: {},
      icon: '/static/guides/gear/ring-of-doom.webp',
    },
  ],
  sets: [
    {
      id: 'wasteland',
      name: 'Hellish Wasteland',
      pieces: ['heavy-armor', 'wasteland-boots'],
      bonuses: [{ count: 2, text: 'Cavalry Attack +5%', stats: { cavalry_attack: 5 } }],
    },
  ],
  formations: [
    {
      id: 'delta',
      name: 'Delta',
      icon: '/static/guides/formations/delta.webp',
      inscriptions: [
        { id: 'delta-scroll-thrasher', name: 'Thrasher', rarity: 'special', piece: 'scroll' },
        { id: 'delta-emblem-relentless', name: 'Relentless', rarity: 'rare', piece: 'emblem' },
      ],
    },
    {
      id: 'pincer',
      name: 'Pincer',
      icon: '/static/guides/formations/pincer.webp',
      inscriptions: [{ id: 'pincer-scroll-toppler', name: 'Toppler', rarity: 'special', piece: 'scroll' }],
    },
  ],
  common: [
    { id: 'u-emblem-enduring', name: 'Enduring', rarity: 'common', piece: 'emblem' },
    { id: 'u-emblem-watchmen', name: 'Watchmen', rarity: 'common', piece: 'emblem' },
    { id: 'u-instrument-patronage', name: 'Patronage', rarity: 'common', piece: 'instrument' },
  ],
};

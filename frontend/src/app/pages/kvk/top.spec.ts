import { ArmoryData, GEAR_SLOTS, Gear, armoryIndex, itemSlot } from '../../core/armory';
import { KvkSignup } from '../../core/kvk-api';
import { normalizeSettings } from '../evaluation/settings';
import { topSignups } from './top';

const CATALOG: ArmoryData = {
  verified: '2026-10',
  sources: [],
  sets: [],
  formations: [],
  common: [],
  items: GEAR_SLOTS.filter((s) => s !== 'accessory2').flatMap((slot) => [
    { id: `gold-${itemSlot(slot)}`, name: `Gold ${slot}`, slot: itemSlot(slot), rarity: 'legendary' as const, stats: { cavalry_attack: 5 }, crit: { cavalry_attack: 6 }, iconic: true, icon: '' },
    { id: `epic-${itemSlot(slot)}`, name: `Epic ${slot}`, slot: itemSlot(slot), rarity: 'epic' as const, stats: { cavalry_attack: 2 }, crit: { cavalry_attack: 3 }, icon: '' },
  ]),
};
const INDEX = armoryIndex(CATALOG);
const S = normalizeSettings(null);
const all = (rarity: 'gold' | 'epic'): Gear =>
  Object.fromEntries(GEAR_SLOTS.map((slot) => [slot, { item: `${rarity}-${itemSlot(slot)}`, crit: false, iconic: 0 }]));

let id = 0;
const signup = (player: number, change: Partial<KvkSignup> = {}): KvkSignup => ({
  id: ++id,
  role: 'rally',
  slot: 1,
  kind: 'cavalry',
  primary: 'Attila',
  secondary: 'Takeda Shingen',
  note: '',
  budget: 'to50',
  online: ['evenings'],
  updated_at: '2026-10-20T10:00:00Z',
  player: { id: player, name: `p${player}`, ingame_name: `Player ${player}`, avatar_url: '', discord_id: null },
  ...change,
});

describe('Top 3 of the sign-ups (Gether 23. 10. 2026)', () => {
  it('ranks one troop type by the equipment, each player once with the best sign-up, at most three', () => {
    const signups = [
      signup(1, { gear: all('epic') }),
      // the same player's second rally is better – it counts, the first does not
      signup(1, { slot: 2, gear: all('gold') }),
      signup(2, { role: 'garrison', gear: all('epic') }),
      signup(3, { gear: { weapon: { item: 'epic-weapon', crit: false, iconic: 0 } } }),
      signup(4, { gear: all('gold') }),
      // another troop type, and nothing clicked together: left out
      signup(5, { kind: 'infantry', gear: all('gold') }),
      signup(6),
    ];
    const top = topSignups(signups, S, INDEX, 'cavalry');
    expect(top.map((t) => [t.signup.player?.id, t.signup.slot])).toEqual([
      [1, 2],
      [4, 1],
      [2, 1],
    ]);
    expect(top[0].total).toBeGreaterThan(top[2].total);
    expect(topSignups(signups, S, INDEX, 'archer')).toEqual([]);
    expect(topSignups(signups, S, INDEX, 'infantry').map((t) => t.signup.player?.id)).toEqual([5]);
  });
});

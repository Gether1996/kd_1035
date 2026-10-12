import { ARMORY } from './armory-testing';
import { armoryIndex, gearTotals, hasBuild, reachedSets, troopOf, troopStat } from './armory';

describe('armory', () => {
  const index = armoryIndex(ARMORY);

  it('sums the items with their crits and the set bonuses reached', () => {
    const { stats, sets } = gearTotals(index, {
      weapon: { item: 'sacred-dominion', crit: true, iconic: 2 },
      chest: { item: 'heavy-armor', crit: false, iconic: 0 },
      boots: { item: 'wasteland-boots', crit: false, iconic: 0 },
    });
    // 32.5 crit + 5 set bonus
    expect(troopStat(stats, 'cavalry', 'attack')).toBe(37.5);
    expect(troopStat(stats, 'cavalry', 'defense')).toBe(20);
    // troop_health counts for every troop type
    expect(troopStat(stats, 'archer', 'health')).toBe(3);
    expect(sets.map((s) => [s.set.id, s.count, s.bonuses.length])).toEqual([['wasteland', 2, 1]]);
    // one piece of a set: listed, no bonus
    expect(gearTotals(index, { chest: { item: 'heavy-armor', crit: false, iconic: 0 } }).sets[0].bonuses).toEqual([]);
    // written on the card only when a bonus is reached
    expect(reachedSets(sets)).toEqual([{ id: 'wasteland', name: 'Hellish Wasteland', count: 2, total: 2, bonuses: ['Cavalry Attack +5%'] }]);
    expect(reachedSets(gearTotals(index, { chest: { item: 'heavy-armor', crit: false, iconic: 0 } }).sets)).toEqual([]);
  });

  it('shows the march type troops; a rally or garrison the strongest, siege for siege', () => {
    const stats = { archer_attack: 10, cavalry_attack: 30, troop_defense: 5 };
    expect(troopOf('infantry', stats)).toBe('infantry');
    expect(troopOf('engineering', stats)).toBe('siege');
    expect(troopOf('conquering', stats)).toBe('cavalry');
    expect(troopOf('', {})).toBe('infantry');
  });

  it('knows a march with a build', () => {
    expect(hasBuild({})).toBe(false);
    expect(hasBuild({ gear: {}, formation: '', inscriptions: [] })).toBe(false);
    expect(hasBuild({ formation: 'delta' })).toBe(true);
  });
});

import { MarchCommander } from '../core/marches-api';
import { pickerGroups } from './march-fields';

const c = (name: string, troop: string, meta: MarchCommander['meta'] = {}): MarchCommander => ({
  name,
  icon: `/static/guides/commanders/${name}.webp`,
  pick: true,
  troop,
  meta,
});

// alphabetical, like the API sends them
const COMMANDERS = [
  c('Achilles', 'cavalry', { cavalry: 1 }),
  c('Alexander Nevsky', 'cavalry'),
  c('Bai Qi', 'infantry', { infantry: 2 }),
  c('Charlemagne', 'leadership'),
  c('Hector', 'leadership', { cavalry: 7, infantry: 4 }),
  c('Ivan IV', 'cavalry', { cavalry: 0 }),
  c('Qin Shi Huang', 'archer', { archer: 0 }),
  c('Saladin', 'cavalry'),
];

const names = (kind: Parameters<typeof pickerGroups>[1]) =>
  pickerGroups(COMMANDERS, kind).map((g) => [g.key, g.commanders.map((x) => x.name)]);

describe('pickerGroups', () => {
  it('puts the meta of the type first, then leadership, then the rest with that type first', () => {
    expect(names('cavalry')).toEqual([
      ['meta', ['Ivan IV', 'Achilles']],
      // the leadership commanders of the cavalry guide first
      ['leadership', ['Hector', 'Charlemagne']],
      ['rest', ['Alexander Nevsky', 'Saladin', 'Bai Qi', 'Qin Shi Huang']],
    ]);
  });

  it('leaves out empty groups', () => {
    expect(names('archer').map(([key]) => key)).toEqual(['meta', 'leadership', 'rest']);
    expect(pickerGroups([c('Saladin', 'cavalry')], 'cavalry').map((g) => g.key)).toEqual(['rest']);
  });

  it('keeps one alphabetical list for the other types and no type', () => {
    for (const kind of ['', 'garrison', 'conquering', 'leadership'] as const) {
      expect(names(kind)).toEqual([['all', COMMANDERS.map((x) => x.name)]]);
    }
  });
});

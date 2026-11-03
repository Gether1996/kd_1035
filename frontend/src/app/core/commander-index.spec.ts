import { CommanderEntry, IndexedCommander, commanderKey, pairGuideLink } from './commander-index';

const pic = (name: string) => ({ name, icon: `/static/guides/commanders/${commanderKey(name)}.webp` });
const entry = (slug: string, role: CommanderEntry['role'], partners: string[]): CommanderEntry => ({
  slug,
  category: 'commanderi',
  title_sk: `Návod ${slug}`,
  title_cs: `Návod CZ ${slug}`,
  role,
  partners: partners.map(pic),
  context_sk: '',
  context_cs: '',
});

const COMMANDER_INDEX: IndexedCommander[] = [
  { ...pic('Achilles'), entries: [entry('pary-pre-jazdu', 'secondary', ['Attila'])] },
  {
    ...pic('Attila'),
    entries: [
      entry('pary-pre-jazdu', 'primary', ['Achilles']),
      entry('pary-pre-rally', 'primary', ['Achilles', 'William Marshal']),
      // a KvK1 partner in a F2P line-up: hidden, no pair link for it
      entry('pary-pre-f2p-a-zaciatok', 'primary', ['Sun Tzu']),
    ],
  },
  { ...pic('Sun Tzu Prime'), entries: [entry('pary-pre-pechotu', 'primary', [])] },
  { ...pic('Sun Tzu'), entries: [entry('pary-pre-f2p-a-zaciatok', 'solo', [])] },
];

describe('pairGuideLink', () => {
  const link = (primary: string, secondary = '') => pairGuideLink(COMMANDER_INDEX, primary, secondary);

  it('links a pair of a guide to its first guide', () => {
    expect(link('Attila', 'Achilles')).toEqual({
      kind: 'pair',
      slug: 'pary-pre-jazdu',
      category: 'commanderi',
      title_sk: 'Návod pary-pre-jazdu',
      title_cs: 'Návod CZ pary-pre-jazdu',
    });
    expect(link('Attila', 'William Marshal')).toMatchObject({ kind: 'pair', slug: 'pary-pre-rally' });
  });

  it('counts the guides\' "anyone" partner when the exact pair is not there', () => {
    expect(link('Sun Tzu Prime', 'Lu Bu')).toMatchObject({ kind: 'pair', slug: 'pary-pre-pechotu' });
    expect(link('Sun Tzu Prime')).toMatchObject({ kind: 'pair', slug: 'pary-pre-pechotu' });
  });

  it('links a known primary in another pair to the finder with it chosen', () => {
    expect(link('Attila', 'Subutai')).toEqual({ kind: 'commander', name: 'Attila', key: 'attila' });
    expect(link('Attila')).toEqual({ kind: 'commander', name: 'Attila', key: 'attila' });
    // a commander the guides name only as secondary: the finder shows those pairs too
    expect(link('Achilles', 'Attila')).toEqual({ kind: 'commander', name: 'Achilles', key: 'achilles' });
    // the pair is in a guide, but with a hidden commander: only the finder
    expect(link('Attila', 'Sun Tzu')).toEqual({ kind: 'commander', name: 'Attila', key: 'attila' });
  });

  it('gives a hidden or unknown primary no link', () => {
    expect(link('Sun Tzu', 'Attila')).toBeNull();
    expect(link('Constance')).toBeNull();
    expect(link('Nobody', 'Attila')).toBeNull();
    expect(link('')).toBeNull();
  });
});

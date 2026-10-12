import { KvkSignup } from '../../core/kvk-api';
import { sk } from '../../core/i18n/sk';
import { ROSTER_CHUNK, discordPlain, rosterText } from './roster-text';

const player = (id: number, ingame_name: string) => ({
  id,
  name: `discord_${id}`,
  ingame_name,
  avatar_url: '',
  discord_id: String(1000 + id),
  approved: true,
});
const signup = (over: Partial<KvkSignup>): KvkSignup => ({
  id: 1,
  role: 'rally',
  kind: 'cavalry',
  primary: 'Attila',
  secondary: 'Takeda Shingen',
  note: '',
  updated_at: '2026-10-12T08:00:00Z',
  ...over,
});
const labels = {
  heading: '',
  kinds: sk.marches.kinds,
  noKind: sk.kvk.roster.noKind,
  formation: (id: string) => ({ wedge: 'Wedge' })[id] ?? '',
};

describe('rosterText', () => {
  it('groups by role, then troops in the order of the filters, with the heading on top', () => {
    const text = rosterText(
      [
        signup({ id: 1, player: player(1, 'Nelly'), formation: 'wedge' }),
        signup({ id: 2, kind: 'infantry', primary: 'Gorgo', secondary: '', player: player(2, 'Bob') }),
        signup({ id: 3, role: 'garrison', kind: 'archer', primary: 'Yi Seong-Gye', secondary: 'Hermann', player: player(3, 'Cara') }),
      ],
      { ...labels, heading: '20.11. najbližšie KvK' },
    );
    expect(text).toEqual([
      [
        '**20.11. najbližšie KvK**',
        '',
        '**Rally (2)**',
        '__Pechota__',
        '• Bob – Gorgo',
        '__Jazda__',
        '• Nelly – Attila / Takeda Shingen · Wedge',
        '',
        '**Garrison (1)**',
        '__Lukostrelci__',
        '• Cara – Yi Seong\\-Gye / Hermann',
      ].join('\n'),
    ]);
  });

  it('the Discord name stands in for a missing in-game name; an unknown formation is left out', () => {
    const [text] = rosterText([signup({ player: { ...player(1, ''), name: 'nelly' }, formation: 'unknown' })], labels);
    expect(text).toBe('**Rally (1)**\n__Jazda__\n• nelly – Attila / Takeda Shingen');
  });

  it('never contains notes, Discord IDs, bonuses or equipment', () => {
    const [text] = rosterText(
      [
        signup({
          player: player(7, 'Nelly'),
          note: 'secret note',
          attack: 12.5,
          defense: 9,
          health: 8,
          gear: { weapon: { item: 'sacred-dominion', crit: true, iconic: 3 } },
          inscriptions: ['call-to-arms'],
        }),
      ],
      labels,
    );
    expect(text).not.toContain('secret');
    expect(text).not.toContain('1007');
    expect(text).not.toContain('discord_7');
    expect(text).not.toContain('12');
    expect(text).not.toContain('sacred');
    expect(text).not.toContain('call-to-arms');
  });

  it('escapes Discord markdown in names', () => {
    const [text] = rosterText([signup({ player: player(1, '*Star_Lord* ~x~ |y| `z` > q') })], labels);
    expect(text).toContain('• \\*Star\\_Lord\\* \\~x\\~ \\|y\\| \\`z\\` \\> q – Attila');
  });

  it('never pings: @everyone, @here and <@id> get a zero-width space after the @', () => {
    expect(discordPlain('@everyone')).toBe('@\u200beveryone');
    expect(discordPlain('@here')).toBe('@\u200bhere');
    expect(discordPlain('<@123>')).toBe('\\<@\u200b123\\>');
    const [text] = rosterText([signup({ player: player(1, '@everyone') })], { ...labels, heading: '<@123> KvK' });
    expect(text).not.toMatch(/@(everyone|here|\d)/);
  });

  it('keeps a name with a newline on one line', () => {
    expect(discordPlain(' a\n**b** ')).toBe('a \\*\\*b\\*\\*');
  });

  it('splits 80 sign-ups into messages of whole lines, never ending one with a heading', () => {
    const kinds = ['infantry', 'cavalry', 'archer'] as const;
    const signups = Array.from({ length: 80 }, (_, i) =>
      signup({
        id: i + 1,
        role: i < 40 ? 'rally' : 'garrison',
        kind: kinds[i % 3],
        primary: 'Constantine I',
        secondary: 'Yi Seong-Gye',
        formation: 'wedge',
        player: player(i + 1, `Player_with_a_long_name_${String(i).padStart(2, '0')}`),
      }),
    );
    const chunks = rosterText(signups, { ...labels, heading: 'KvK 20. 11.' });
    expect(chunks.length).toBeGreaterThan(1);
    const lines = chunks.flatMap((c) => c.split('\n'));
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(ROSTER_CHUNK);
      const last = chunk.split('\n').at(-1)!;
      expect(last.startsWith('• ')).toBe(true);
      expect(chunk.startsWith('\n')).toBe(false);
    }
    // every sign-up exactly once, whole
    expect(lines.filter((l) => l.startsWith('• ')).length).toBe(80);
    for (let i = 0; i < 80; i++) {
      expect(lines).toContain(`• Player\\_with\\_a\\_long\\_name\\_${String(i).padStart(2, '0')} – Constantine I / Yi Seong\\-Gye · Wedge`);
    }
    // nothing lost or added at the boundaries
    const whole = rosterText(signups, { ...labels, heading: 'KvK 20. 11.' }).join('\n');
    expect(whole.split('\n').filter((l) => l.startsWith('**')).length).toBe(3);
  });

  it('is empty without sign-ups', () => {
    expect(rosterText([], { ...labels, heading: 'KvK' })).toEqual([]);
  });
});

import { KVK_KINDS, KVK_ROLES, KvkSignup, MarchKind } from '../../core/kvk-api';

/** a Discord message holds 2000 characters – some room for what the R4 adds before sending */
export const ROSTER_CHUNK = 1900;

export interface RosterLabels {
  /** the troop names of the site (marches.kinds) */
  kinds: Record<MarchKind, string>;
  /** a sign-up saved before the troops were required */
  noKind: string;
  /** the formation's name from the catalog, '' = unknown or not loaded */
  formation: (id: string) => string;
}

/**
 * Text written by players or the superuser, shown as written in Discord: markdown characters escaped (as the
 * backend's accounts/newcomers.py does) and every `@` followed by a zero-width space, so `@everyone`, `@here` and
 * `<@id>` never ping anyone. One line – whitespace (a newline too) becomes one space.
 */
export function discordPlain(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/([\\*_~`|>#[\]()<:-])/g, '\\$1')
    .replace(/@/g, '@​');
}

/**
 * "Kopírovať pre Discord" on the reviewers' list: the sign-ups the filters show as a compact roster – role, troops,
 * player and commander pair (formation when set). Notes, Discord names and IDs, bonuses and equipment stay out. Split
 * into messages of at most ROSTER_CHUNK characters at line boundaries; a role or troops heading never ends a message.
 */
export function rosterText(signups: readonly KvkSignup[], labels: RosterLabels): string[] {
  if (!signups.length) return [];
  // each block starts with its heading lines and the first player, so they never part
  const blocks: string[][] = [];
  for (const role of KVK_ROLES) {
    const ofRole = signups.filter((s) => s.role === role);
    if (!ofRole.length) continue;
    // an empty line before each role (dropped at the top of a message)
    let head = ['', `**${role === 'rally' ? 'Rally' : 'Garrison'} (${ofRole.length})**`];
    // the troops in the order of the filters, then any other (an older sign-up without troops)
    const kinds = [...new Set<MarchKind | ''>([...KVK_KINDS, ...ofRole.map((s) => s.kind)])];
    for (const kind of kinds) {
      const lines = ofRole.filter((s) => s.kind === kind).map((s) => line(s, labels));
      if (!lines.length) continue;
      blocks.push([...head, `__${kind ? labels.kinds[kind] : labels.noKind}__`, lines[0]], ...lines.slice(1).map((l) => [l]));
      head = [];
    }
  }
  return pack(blocks);
}

function line(signup: KvkSignup, labels: RosterLabels): string {
  const name = discordPlain(signup.player?.ingame_name || signup.player?.name || '?');
  const pair = [signup.primary, signup.secondary].filter(Boolean).map(discordPlain).join(' / ');
  const formation = signup.formation ? labels.formation(signup.formation) : '';
  return `• ${name} – ${pair || '?'}${formation ? ` · ${discordPlain(formation)}` : ''}`;
}

/** blocks into messages of whole lines; an empty line opening a message is dropped */
function pack(blocks: string[][]): string[] {
  const chunks: string[] = [];
  let message = '';
  for (const block of blocks) {
    const text = block.join('\n');
    if (message && message.length + 1 + text.length <= ROSTER_CHUNK) {
      message += '\n' + text;
    } else {
      if (message) chunks.push(message);
      message = (block[0] === '' ? block.slice(1) : block).join('\n');
    }
  }
  if (message) chunks.push(message);
  return chunks;
}

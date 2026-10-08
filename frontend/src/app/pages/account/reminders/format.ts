import { Dict } from '../../../core/i18n/sk';

type Texts = Dict['reminders'];

/** Slovak and Czech plural: 1 → one, 2–4 → few, 5+ → many ("{n}" is replaced by the number). */
export function plural(n: number, [one, few, many]: string[]): string {
  return (n === 1 ? one : n >= 2 && n <= 4 ? few : many).replace('{n}', String(n));
}

/** 0 → "pri začiatku", 10 → "10 min vopred", 90 → "1 h 30 min vopred", 2880 → "2 dni vopred". */
export function reminderLabel(minutes: number, t: Texts): string {
  if (!minutes) return t.atStart;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const time =
    minutes % 1440 === 0
      ? plural(minutes / 1440, t.days)
      : hours
        ? `${hours} h${rest ? ` ${rest} min` : ''}`
        : `${minutes} min`;
  return t.before.replace('{time}', time);
}

/** 0 → "jednorazovo", 1 → "denne", 7 → "každý týždeň", 14 → "každých 14 dní". */
export function repeatLabel(days: number, t: Texts): string {
  if (!days) return t.repeat.once;
  if (days === 1) return t.repeat.daily;
  if (days === 7) return t.repeat.weekly;
  return plural(days, t.repeat.every);
}

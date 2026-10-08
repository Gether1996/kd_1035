import { Dict } from '../../../core/i18n/sk';

type Texts = Dict['reminders'];

/** Slovak and Czech plural: 1 → one, 2–4 → few, 5+ → many ("{n}" is replaced by the number). */
export function plural(n: number, [one, few, many]: string[]): string {
  return (n === 1 ? one : n >= 2 && n <= 4 ? few : many).replace('{n}', String(n));
}

/** Days, hours and minutes without the zero parts: 90 → "1 h 30 min", 1800 → "1 deň 6 h", 2880 → "2 dni".
 * The backend writes the same in its messages (accounts/reminders.py duration()). */
export function duration(minutes: number, t: Texts): string {
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  const parts = [days ? plural(days, t.days) : '', hours ? `${hours} h` : '', rest ? `${rest} min` : ''];
  return parts.filter(Boolean).join(' ') || '0 min';
}

/** 0 → "pri začiatku", 10 → "10 min vopred", 1500 → "1 deň 1 h vopred", 2880 → "2 dni vopred". */
export function reminderLabel(minutes: number, t: Texts): string {
  return minutes ? t.before.replace('{time}', duration(minutes, t)) : t.atStart;
}

/** 0 → "jednorazovo", 1 → "denne", 7 → "každý týždeň", 14 → "každé 2 týždne", 10 → "každých 10 dní". */
export function repeatLabel(days: number, t: Texts): string {
  if (!days) return t.repeat.once;
  if (days === 1) return t.repeat.daily;
  if (days === 7) return t.repeat.weekly;
  if (days % 7 === 0) return plural(days / 7, t.repeat.weeks);
  return plural(days, t.repeat.every);
}

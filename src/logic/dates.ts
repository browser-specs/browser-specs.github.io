// The Updated column's dates: the date a spec prints in its header, as webref's crawl records it, and how long ago that
// was, as text and as one of three freshness levels.
export const DAY = 86_400_000;

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

const ymd = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

// Reads '19 October 2026' or 'October 19, 2026', the two forms specs print, as YYYY-MM-DD. Anything else, and any date
// that doesn't exist (31 February, e.g.), is none.
export function parseSpecDate(text: unknown): string | undefined {
  if (typeof text !== 'string') return undefined;
  const t = text.trim();
  const dmy = /^([0-9]{1,2}) ([A-Za-z]+) ([0-9]{4})$/.exec(t);
  const mdy = /^([A-Za-z]+) ([0-9]{1,2}), ([0-9]{4})$/.exec(t);
  const parts = dmy ? [dmy[1], dmy[2], dmy[3]] : mdy ? [mdy[2], mdy[1], mdy[3]] : undefined;
  if (!parts) return undefined;
  const [d, m, y] = [Number(parts[0]), MONTHS.indexOf(parts[1].toLowerCase()) + 1, Number(parts[2])];
  if (m === 0 || new Date(Date.UTC(y, m - 1, d)).getUTCDate() !== d) return undefined;
  return ymd(y, m, d);
}

// Whole days from the start of that date, in UTC, to now; never below 0, for a date already begun east of UTC.
export function daysSince(date: string, now: number): number {
  return Math.max(0, Math.floor((now - Date.parse(`${date}T00:00:00Z`)) / DAY));
}

// How long ago, the way drafts.csswg.org's index says it: in days for a week, then in weeks, months, and years.
export function ago(days: number): string {
  if (days < 1) return 'today';
  if (days < 2) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  const [n, unit] = days < 30 ? [Math.floor(days / 7), 'week'] : days < 365 ? [Math.floor(days / 30), 'month'] : [Math.floor(days / 365), 'year'];
  return n === 1 ? `last ${unit}` : `${n} ${unit}s ago`;
}

export type Freshness = 'recent' | 'moderate' | 'stale';

// Green within 30 days, amber within six months, and gray for anything older, as on drafts.csswg.org's index.
export function freshness(days: number): Freshness {
  return days < 30 ? 'recent' : days < 180 ? 'moderate' : 'stale';
}

// From Web Specs Companion's src/ui/format.ts: '19 October 2026', the way the panels write their dates.
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
}

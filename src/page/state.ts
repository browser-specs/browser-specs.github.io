// The list's state, which the page keeps in the URL's query: the Filter box's text, the engine-count chips that are on,
// the order, and the view. And the rules that turn the rows and that state into what the page shows.
import { BUCKETS, type Bucket, type Row } from '../logic/rows.ts';

export type Order = 'name' | 'recent' | 'grouped';
export type View = 'table' | 'cards';

export interface State {
  q: string;
  buckets: Bucket[];
  order: Order;
  view: View;
}

const ORDERS: readonly Order[] = ['name', 'recent', 'grouped'];
const VIEWS: readonly View[] = ['table', 'cards'];

// By default, the page shows only the specs known to have at least two implementations.
export const DEFAULT_STATE: State = { q: '', buckets: ['3', '2'], order: 'name', view: 'table' };

const inOrder = (buckets: Iterable<string>): Bucket[] => {
  const on = new Set(buckets);
  return BUCKETS.filter((b) => on.has(b));
};

// Each part of the query that doesn't fit falls back to its default, and the rest of the query still applies.
export function parseState(search: string): State {
  const params = new URLSearchParams(search);
  const order = params.get('order') as Order;
  const view = params.get('view') as View;
  return {
    q: params.get('q') ?? '',
    buckets: params.has('engines') ? inOrder((params.get('engines') ?? '').split(',')) : [...DEFAULT_STATE.buckets],
    order: ORDERS.includes(order) ? order : DEFAULT_STATE.order,
    view: VIEWS.includes(view) ? view : DEFAULT_STATE.view,
  };
}

// Leaves out each part at its default, so the default page's URL has no query at all.
export function stateQuery(state: State): string {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  const buckets = inOrder(state.buckets);
  if (buckets.join(',') !== inOrder(DEFAULT_STATE.buckets).join(',')) params.set('engines', buckets.join(','));
  if (state.order !== DEFAULT_STATE.order) params.set('order', state.order);
  if (state.view !== DEFAULT_STATE.view) params.set('view', state.view);
  const query = params.toString();
  return query ? `?${query}` : '';
}

const NBSP = String.fromCharCode(0xa0);
// Signs a title carries that a reader never types: the registered, trademark, and copyright signs.
const SIGNS = new Set([0xae, 0x2122, 0xa9].map((c) => String.fromCharCode(c)));
const isSpace = (c: string) => /\s/.test(c);

// The text as the filter compares it, and for each of its characters, the index of the one it came from: lower case,
// with a no-break space as a space, each run of white space as one space, trimmed, and without the signs in SIGNS. Each
// character maps to one, so a match maps back onto the original text exactly.
function normalized(text: string): { text: string; from: number[] } {
  let out = '';
  const from: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (SIGNS.has(text[i])) continue;
    const c = text[i] === NBSP ? ' ' : text[i];
    if (isSpace(c)) {
      if (out === '' || out.endsWith(' ')) continue;
      out += ' ';
    } else {
      const lower = c.toLowerCase();
      out += lower.length === 1 ? lower : c;
    }
    from.push(i);
  }
  if (out.endsWith(' ')) {
    out = out.slice(0, -1);
    from.pop();
  }
  return { text: out, from };
}

export function normalize(text: string): string {
  return normalized(text).text;
}

// The Filter box's words: each one that starts with "-" and has more after it excludes the rest of it, a lone "-" is
// nothing (it's how an exclusion starts while someone types it), and the other words, in order, are one phrase.
export function parseFilter(q: string): { phrase: string; exclude: string[] } {
  const words = normalize(q).split(' ').filter((w) => w && w !== '-');
  const exclude = words.filter((w) => w.startsWith('-')).map((w) => w.slice(1));
  return { phrase: words.filter((w) => !w.startsWith('-')).join(' '), exclude };
}

// Plain substring tests, so a filter's metacharacters ("C++", "(", ".") match only themselves: The phrase must be in
// one of the fields, and no excluded word in any of them. The fields include each group's original name, so
// "Incubator" still finds the WICG's specs.
export function matches(row: Row, q: string): boolean {
  const { phrase, exclude } = parseFilter(q);
  if (!phrase && exclude.length === 0) return true;
  const fields = [row.title, row.fullTitle, row.shortname, row.org, ...row.groups, ...(row.originalGroups ?? [])].map(normalize);
  return (!phrase || fields.some((f) => f.includes(phrase))) && !exclude.some((w) => fields.some((f) => f.includes(w)));
}

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

// By title, with numbers in numeric order (CSS Color 9 before CSS Color 10), then by shortname.
export function compareName(a: Row, b: Row): number {
  return collator.compare(a.title, b.title) || (a.shortname < b.shortname ? -1 : a.shortname > b.shortname ? 1 : 0);
}

// Most recently updated first, specs without a date last, and specs updated the same day by name.
export function compareRecent(a: Row, b: Row): number {
  if (a.updated !== b.updated) {
    if (!a.updated) return 1;
    if (!b.updated) return -1;
    return a.updated < b.updated ? 1 : -1;
  }
  return compareName(a, b);
}

export function visibleRows(rows: Row[], state: State): Row[] {
  const on = new Set(state.buckets);
  const shown = rows.filter((r) => on.has(r.bucket) && matches(r, state.q));
  return shown.sort(state.order === 'recent' ? compareRecent : compareName);
}

// A group per category, alphabetically with Other last, each with its specs by name, and none for an empty category.
export function groupRows(rows: Row[]): { category: string; rows: Row[] }[] {
  const groups = new Map<string, Row[]>();
  for (const r of rows) groups.set(r.category, [...(groups.get(r.category) ?? []), r]);
  const rank = (c: string) => (c === 'Other' ? 1 : 0);
  return [...groups.keys()]
    .sort((a, b) => rank(a) - rank(b) || collator.compare(a, b))
    .map((category) => ({ category, rows: groups.get(category)!.sort(compareName) }));
}

// Each chip's count: the rows in its bucket that match the filter, whatever chips are on.
export function bucketCounts(rows: Row[], q: string): Record<Bucket, number> {
  const counts = Object.fromEntries(BUCKETS.map((b) => [b, 0])) as Record<Bucket, number>;
  for (const r of rows) if (matches(r, q)) counts[r.bucket]++;
  return counts;
}

// Splits the text around the first match of the filter's phrase, for the page to mark it.
export function highlight(text: string, q: string): { text: string; mark: boolean }[] {
  const needle = parseFilter(q).phrase;
  const n = normalized(text);
  const at = needle ? n.text.indexOf(needle) : -1;
  if (at < 0) return [{ text, mark: false }];
  const start = n.from[at];
  const end = n.from[at + needle.length - 1] + 1;
  return [
    { text: text.slice(0, start), mark: false },
    { text: text.slice(start, end), mark: true },
    { text: text.slice(end), mark: false },
  ].filter((part) => part.text !== '');
}

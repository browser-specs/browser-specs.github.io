// The list's state, which the page keeps in the URL's query: the Filter box's text, the engine-count chips that are on,
// if the list is grouped, its sort, and the view. And the rules that turn the rows and that state into what the page
// shows.
import { BUCKETS, type Bucket, type Row } from '../logic/rows.ts';

export type Order = 'name' | 'recent' | 'grouped';
export type View = 'table' | 'cards';
export type SortKey = 'spec' | 'updated' | 'engines' | 'tests' | 'docs' | 'caniuse' | 'footprint' | 'category';
export const SORT_KEYS: readonly SortKey[] = ['spec', 'updated', 'engines', 'tests', 'docs', 'caniuse', 'footprint', 'category'];

// A column to sort by, in its first-click direction or reversed.
export interface Sort {
  key: SortKey;
  reversed: boolean;
}

export interface State {
  q: string;
  buckets: Bucket[];
  grouped: boolean;
  sort: Sort;
  view: View;
}

const VIEWS: readonly View[] = ['table', 'cards'];

const NAME_SORT: Sort = { key: 'spec', reversed: false };
const RECENT_SORT: Sort = { key: 'updated', reversed: false };

// By default, the page shows only the specs known to have at least two implementations, the most recently updated first.
export const DEFAULT_STATE: State = { q: '', buckets: ['3', '2'], grouped: false, sort: RECENT_SORT, view: 'table' };

const isSort = (sort: Sort, to: Sort) => sort.key === to.key && sort.reversed === to.reversed;
const sortParam = (sort: Sort) => `${sort.reversed ? '-' : ''}${sort.key}`;

// Grouped shows no Category column for a Category sort to belong to, so there it's the default sort.
const withoutCategory = (grouped: boolean, sort: Sort): Sort => (grouped && sort.key === 'category' ? DEFAULT_STATE.sort : sort);

function parseSort(param: string | null): Sort | undefined {
  const reversed = !!param?.startsWith('-');
  const key = (reversed ? param!.slice(1) : param) as SortKey;
  return SORT_KEYS.includes(key) ? { key, reversed } : undefined;
}

const inOrder = (buckets: Iterable<string>): Bucket[] => {
  const on = new Set(buckets);
  return BUCKETS.filter((b) => on.has(b));
};

// Each part of the query that doesn't fit falls back to its default, and the rest of the query still applies. The
// order key is order=name for the Name sort or order=grouped for Grouped, and a sort key names any other sort, winning
// over the one order=name implies. Grouped has no Category column, so it reads a Category sort as the default sort.
export function parseState(search: string): State {
  const params = new URLSearchParams(search);
  const order = params.get('order');
  const view = params.get('view') as View;
  return {
    q: params.get('q') ?? '',
    buckets: params.has('engines') ? inOrder((params.get('engines') ?? '').split(',')) : [...DEFAULT_STATE.buckets],
    grouped: order === 'grouped',
    sort: withoutCategory(order === 'grouped', parseSort(params.get('sort')) ?? (order === 'name' ? NAME_SORT : RECENT_SORT)),
    view: VIEWS.includes(view) ? view : DEFAULT_STATE.view,
  };
}

// Leaves out each part at its default, so the default page's URL has no query at all.
export function stateQuery(state: State): string {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  const buckets = inOrder(state.buckets);
  if (buckets.join(',') !== inOrder(DEFAULT_STATE.buckets).join(',')) params.set('engines', buckets.join(','));
  if (state.grouped) params.set('order', 'grouped');
  else if (isSort(state.sort, NAME_SORT)) params.set('order', 'name');
  // The sort the order key already says, which needs no sort key of its own.
  const implied = !state.grouped && isSort(state.sort, NAME_SORT) ? NAME_SORT : RECENT_SORT;
  if (!isSort(state.sort, implied)) params.set('sort', sortParam(state.sort));
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

// The Order buttons are presets of the sort: Name is Spec, A to Z, and Recent is Updated, newest first. Grouped groups
// the list and keeps whatever sort it has, within each category.
export function orderOf(state: State): Order | undefined {
  if (state.grouped) return 'grouped';
  if (isSort(state.sort, NAME_SORT)) return 'name';
  return isSort(state.sort, RECENT_SORT) ? 'recent' : undefined;
}

export function withOrder(state: State, order: Order): State {
  if (order === 'grouped') return { ...state, grouped: true, sort: withoutCategory(true, state.sort) };
  return { ...state, grouped: false, sort: order === 'recent' ? RECENT_SORT : NAME_SORT };
}

// A header's click: its column again reverses the sort, and another column starts in its first-click direction.
export function withSort(state: State, key: SortKey): State {
  return { ...state, sort: { key, reversed: state.sort.key === key ? !state.sort.reversed : false } };
}

// Names and categories sort A to Z on the first click; dates, engines, scores, and counts sort highest first.
const FIRST: Record<SortKey, 'ascending' | 'descending'> = {
  spec: 'ascending', category: 'ascending', updated: 'descending', engines: 'descending', tests: 'descending',
  docs: 'descending', caniuse: 'descending', footprint: 'descending',
};

export function direction(sort: Sort): 'ascending' | 'descending' {
  const first = FIRST[sort.key];
  return sort.reversed ? (first === 'ascending' ? 'descending' : 'ascending') : first;
}

// Each column's value, or undefined for a missing one: no date, no BCD record, no WPT data, no footprint data, and the
// Other category, which a guess falls back to.
const VALUES: Record<Exclude<SortKey, 'spec'>, (r: Row) => string | number | undefined> = {
  updated: (r) => r.updated,
  engines: (r) => (r.bucket === 'nodata' ? undefined : (r.engines?.length ?? 0)),
  tests: (r) => r.interop,
  docs: (r) => r.mdn,
  caniuse: (r) => r.caniuse,
  footprint: (r) => r.footprint,
  category: (r) => (r.category === 'Other' ? undefined : r.category),
};

// Sorts by the column in the sort's direction, with missing values last either way, and ties by name, A to Z.
export function compareBy(sort: Sort): (a: Row, b: Row) => number {
  if (sort.key === 'spec') return sort.reversed ? (a, b) => compareName(b, a) : compareName;
  const value = VALUES[sort.key];
  const sign = direction(sort) === 'ascending' ? 1 : -1;
  return (a, b) => {
    const [x, y] = [value(a), value(b)];
    if (x !== y) {
      if (x === undefined) return 1;
      if (y === undefined) return -1;
      const order = typeof x === 'number' && typeof y === 'number' ? x - y : collator.compare(String(x), String(y));
      if (order) return sign * order;
    }
    return compareName(a, b);
  };
}

const PHRASES: Record<SortKey, [string, string]> = {
  spec: ['by name, A to Z', 'by name, Z to A'],
  updated: ['by date, newest first', 'by date, oldest first'],
  engines: ['by engines, most first', 'by engines, fewest first'],
  tests: ['by Interop score, best first', 'by Interop score, worst first'],
  docs: ['by MDN articles, most first', 'by MDN articles, fewest first'],
  caniuse: ['by Can I Use features, most first', 'by Can I Use features, fewest first'],
  footprint: ['by footprint, largest first', 'by footprint, smallest first'],
  category: ['by category, A to Z', 'by category, Z to A'],
};

export function sortPhrase(sort: Sort): string {
  return PHRASES[sort.key][sort.reversed ? 1 : 0];
}

export function visibleRows(rows: Row[], state: State): Row[] {
  const on = new Set(state.buckets);
  return rows.filter((r) => on.has(r.bucket) && matches(r, state.q)).sort(compareBy(state.sort));
}

// A group per category, alphabetically with Other last, each with its specs in the order it gets them, and none for an
// empty category.
export function groupRows(rows: Row[]): { category: string; rows: Row[] }[] {
  const groups = new Map<string, Row[]>();
  for (const r of rows) groups.set(r.category, [...(groups.get(r.category) ?? []), r]);
  const rank = (c: string) => (c === 'Other' ? 1 : 0);
  return [...groups.keys()]
    .sort((a, b) => rank(a) - rank(b) || collator.compare(a, b))
    .map((category) => ({ category, rows: groups.get(category)! }));
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

import { describe, it, expect } from 'vitest';
import type { Row } from '../src/logic/rows.ts';
import {
  bucketCounts, compareBy, compareName, DEFAULT_STATE, defaultView, groupRows, highlight, matches, orderOf, parseFilter, parseState, sortPhrase, stateQuery,
  visibleRows, withOrder, withSort, type SortKey, type State,
} from '../src/page/state.ts';

const row = (over: Partial<Row> = {}): Row => ({
  shortname: 'a',
  title: 'A',
  fullTitle: 'A',
  url: 'https://example.test/a/',
  org: 'W3C',
  groups: ['Some Working Group'],
  bucket: '3',
  mdn: 0,
  caniuse: 0,
  category: 'Core',
  ...over,
});
const names = (rows: Row[]) => rows.map((r) => r.title);

describe('parseState and stateQuery', () => {
  it('reads an empty query as the defaults, and writes the defaults as nothing', () => {
    expect(parseState('')).toEqual(DEFAULT_STATE);
    expect(stateQuery(DEFAULT_STATE)).toBe('');
  });

  it('reads every key', () => {
    expect(parseState('?q=css%20color&engines=1,3&order=recent&view=cards')).toEqual({
      q: 'css color', buckets: ['3', '1'], grouped: false, sort: { key: 'updated', reversed: false }, view: 'cards',
    });
  });

  it('falls back to the default for each bad part, and keeps the good ones', () => {
    expect(parseState('?order=foo&view=grid&engines=7,x,2')).toEqual({ ...DEFAULT_STATE, buckets: ['2'] });
  });

  it('writes a view the reader picked, even the one their screen shows by default', () => {
    expect(DEFAULT_STATE.view).toBeNull();
    expect(parseState('?view=table').view).toBe('table');
    expect(stateQuery({ ...DEFAULT_STATE, view: 'table' })).toBe('?view=table');
    expect(stateQuery({ ...DEFAULT_STATE, view: 'cards' })).toBe('?view=cards');
  });

  it('shows the cards by default on a phone, and the table on anything wider', () => {
    expect(defaultView(true)).toBe('cards');
    expect(defaultView(false)).toBe('table');
  });

  it('reads an empty engines as every chip off', () => {
    expect(parseState('?engines=').buckets).toEqual([]);
  });

  it('writes only what differs from the defaults, engines in their own order', () => {
    expect(stateQuery({ ...DEFAULT_STATE, q: 'css color', buckets: ['1', '3', '2'] })).toBe('?q=css+color&engines=3%2C2%2C1');
    expect(stateQuery({ ...DEFAULT_STATE, buckets: ['2', '3'] })).toBe('');
    const state: State = { q: 'a b', buckets: [], grouped: true, sort: { key: 'spec', reversed: false }, view: 'cards' };
    expect(parseState(stateQuery({ ...state, buckets: [] }))).toEqual({ ...state, buckets: [] });
  });
});

describe('matches', () => {
  it('matches the title, full title, shortname, org, and groups, ignoring case', () => {
    const r = row({ title: 'WebXR Device API', fullTitle: 'WebXR Device API', shortname: 'webxr', org: 'W3C', groups: ['Immersive Web Working Group'] });
    expect(['webxr device', 'WEBXR', 'w3c', 'immersive web', ''].map((q) => matches(r, q))).toEqual([true, true, true, true, true]);
    expect(matches(r, 'webgpu')).toBe(false);
  });

  it('treats a no-break space in a title as a space, and runs of spaces in the filter as one', () => {
    const r = row({ fullTitle: `ECMAScript${String.fromCharCode(0xae)} 2027 Language${String.fromCharCode(0xa0)}Specification` });
    expect(matches(r, 'language specification')).toBe(true);
    expect(matches(r, '  language   specification ')).toBe(true);
  });

  it('ignores a registered or trademark sign, so plain words find the title', () => {
    const ecma = row({ fullTitle: `ECMAScript${String.fromCharCode(0xae)} 2027 Language${String.fromCharCode(0xa0)}Specification` });
    expect(matches(ecma, 'ecmascript 2027')).toBe(true);
    expect(matches(row({ fullTitle: `OpenGL ES${String.fromCharCode(0xae)} Shading Language` }), 'opengl es shading')).toBe(true);
    expect(matches(row({ title: `Media Source Extensions${String.fromCharCode(0x2122)} 2` }), 'extensions 2')).toBe(true);
  });

  it('matches metacharacters literally', () => {
    expect(matches(row({ title: 'C++ Bindings' }), 'c++')).toBe(true);
    expect(matches(row({ title: 'A' }), '(')).toBe(false);
    expect(matches(row({ title: 'A.B' }), '.')).toBe(true);
    expect(matches(row({ title: 'AB' }), '.')).toBe(false);
  });
});

describe('orders', () => {
  it('orders by name, with numbers in numeric order and case ignored', () => {
    const rows = ['CSS Color 10', 'css Color 9', 'Ad'].map((title, i) => row({ title, shortname: `s${i}` }));
    expect(names([...rows].sort(compareName))).toEqual(['Ad', 'css Color 9', 'CSS Color 10']);
  });

  it('orders by recent, newest first, undated last, and ties by name', () => {
    const rows = [
      row({ title: 'Old', updated: '2022-03-31' }),
      row({ title: 'None' }),
      row({ title: 'B', updated: '2026-10-19' }),
      row({ title: 'A', updated: '2026-10-19' }),
      row({ title: 'Mid', updated: '2026-06-03' }),
    ];
    expect(names([...rows].sort(compareBy({ key: 'updated', reversed: false })))).toEqual(['A', 'B', 'Mid', 'Old', 'None']);
  });

  it('groups by category, alphabetically with Other last, keeping the order it gets, and no empty groups', () => {
    const rows = [
      row({ title: 'Z', category: 'CSS' }),
      row({ title: 'Q', category: 'Other' }),
      row({ title: 'A', category: 'CSS' }),
      row({ title: 'M', category: 'Accessibility' }),
    ];
    expect(groupRows(rows).map((g) => [g.category, names(g.rows)])).toEqual([
      ['Accessibility', ['M']],
      ['CSS', ['Z', 'A']],
      ['Other', ['Q']],
    ]);
    expect(groupRows([])).toEqual([]);
  });
});

describe('visibleRows and bucketCounts', () => {
  const rows = [
    row({ title: 'Three', bucket: '3' }),
    row({ title: 'Two', bucket: '2' }),
    row({ title: 'One', bucket: '1' }),
    row({ title: 'None', bucket: 'none' }),
    row({ title: 'Nothing known', bucket: 'nodata' }),
  ];

  it('shows only the specs in a chip that is on, and that match the filter', () => {
    expect(names(visibleRows(rows, DEFAULT_STATE))).toEqual(['Three', 'Two']);
    expect(names(visibleRows(rows, { ...DEFAULT_STATE, buckets: ['1', 'nodata'] }))).toEqual(['Nothing known', 'One']);
    expect(names(visibleRows(rows, { ...DEFAULT_STATE, q: 'tw' }))).toEqual(['Two']);
    expect(visibleRows(rows, { ...DEFAULT_STATE, buckets: [] })).toEqual([]);
  });

  it('counts each bucket among the rows that match the filter', () => {
    expect(bucketCounts(rows, '')).toEqual({ 3: 1, 2: 1, 1: 1, none: 1, nodata: 1 });
    expect(bucketCounts(rows, 'no')).toEqual({ 3: 0, 2: 0, 1: 0, none: 1, nodata: 1 });
  });
});

describe('highlight', () => {
  it('marks the first match in the text', () => {
    expect(highlight('CSS Color 5', 'color')).toEqual([{ text: 'CSS ', mark: false }, { text: 'Color', mark: true }, { text: ' 5', mark: false }]);
  });

  it('marks across a no-break space', () => {
    const text = `Language${String.fromCharCode(0xa0)}Specification`;
    expect(highlight(text, 'language specification')).toEqual([{ text, mark: true }]);
  });

  it('marks across a registered sign, taking the sign in', () => {
    const text = `ECMAScript${String.fromCharCode(0xae)} 2027`;
    expect(highlight(text, 'ecmascript 2027')).toEqual([{ text, mark: true }]);
  });

  it('marks nothing without a filter, or without a match', () => {
    expect(highlight('DOM', '')).toEqual([{ text: 'DOM', mark: false }]);
    expect(highlight('DOM', 'fetch')).toEqual([{ text: 'DOM', mark: false }]);
  });
});

describe('parseFilter', () => {
  it('splits off the words that start with "-"', () => {
    expect(parseFilter('web -audio')).toEqual({ phrase: 'web', exclude: ['audio'] });
    expect(parseFilter('-css -svg')).toEqual({ phrase: '', exclude: ['css', 'svg'] });
    expect(parseFilter('  Web   -AUDIO ')).toEqual({ phrase: 'web', exclude: ['audio'] });
  });
  it('treats a hyphen inside a word as a hyphen, and ignores a lone "-"', () => {
    expect(parseFilter('css-color')).toEqual({ phrase: 'css-color', exclude: [] });
    expect(parseFilter('css -')).toEqual({ phrase: 'css', exclude: [] });
    expect(parseFilter('-')).toEqual({ phrase: '', exclude: [] });
  });
});

describe('matches, with exclusions', () => {
  const css = row({ shortname: 'css-color-5', title: 'CSS Color 5', fullTitle: 'CSS Color 5', groups: ['CSS Working Group'], bucket: '3' });
  const audio = row({ shortname: 'webaudio', title: 'Web Audio API', fullTitle: 'Web Audio API', bucket: '3' });
  const bt = row({ shortname: 'web-bluetooth', title: 'Web Bluetooth', fullTitle: 'Web Bluetooth' });
  const wicg = row({ shortname: 'w', title: 'W', fullTitle: 'W', groups: ['WICG'], originalGroups: ['Web Platform Incubator Community Group'] });

  it('hides a spec that has an excluded word anywhere the filter looks', () => {
    expect([css, audio].filter((r) => matches(r, '-css'))).toEqual([audio]);
    expect([audio, bt].filter((r) => matches(r, 'web -audio'))).toEqual([bt]);
  });
  it("matches and excludes an org's original name", () => {
    const ecma = row({ shortname: 'e', title: 'E', fullTitle: 'E', org: 'Ecma', originalOrg: 'Ecma International' });
    expect(matches(ecma, 'ecma international')).toBe(true);
    expect(matches(ecma, '-international')).toBe(false);
  });
  it("matches and excludes a group's original name", () => {
    expect(matches(wicg, 'incubator')).toBe(true);
    expect(matches(wicg, '-incubator')).toBe(false);
  });
  it('shows everything for a lone "-", and every other spec for exclusions alone', () => {
    expect([css, audio, bt].filter((r) => matches(r, '-'))).toHaveLength(3);
    expect([css, audio, bt].filter((r) => matches(r, '-css -bluetooth'))).toEqual([audio]);
  });
  it('counts the chips with the exclusions applied', () => expect(bucketCounts([css, audio], '-css')['3']).toBe(1));
});

describe('highlight, with exclusions', () => {
  it('marks the phrase only', () => {
    expect(highlight('Web Audio API', 'audio -web')).toEqual([{ text: 'Web ', mark: false }, { text: 'Audio', mark: true }, { text: ' API', mark: false }]);
    expect(highlight('Web Audio API', '-css')).toEqual([{ text: 'Web Audio API', mark: false }]);
  });
});

describe('the sort in the URL', () => {
  it('reads and writes the defaults as no query', () => expect(stateQuery(parseState(''))).toBe(''));
  it('sorts by date, newest first, by default', () => expect(DEFAULT_STATE.sort).toEqual({ key: 'updated', reversed: false }));
  it('reads the order key, and writes it for Name and for Grouped', () => {
    expect(parseState('?order=recent')).toMatchObject({ grouped: false, sort: { key: 'updated', reversed: false } });
    expect(parseState('?order=name')).toMatchObject({ grouped: false, sort: { key: 'spec', reversed: false } });
    expect(parseState('?order=grouped')).toMatchObject({ grouped: true, sort: { key: 'updated', reversed: false } });
    expect(stateQuery({ ...DEFAULT_STATE, sort: { key: 'spec', reversed: false } })).toBe('?order=name');
    expect(stateQuery({ ...DEFAULT_STATE, grouped: true })).toBe('?order=grouped');
    expect(stateQuery({ ...DEFAULT_STATE, grouped: true, sort: { key: 'spec', reversed: false } })).toBe('?order=grouped&sort=spec');
  });
  it('reads and writes any other sort', () => {
    expect(parseState('?sort=footprint').sort).toEqual({ key: 'footprint', reversed: false });
    expect(parseState('?sort=-spec').sort).toEqual({ key: 'spec', reversed: true });
    expect(stateQuery({ ...DEFAULT_STATE, sort: { key: 'footprint', reversed: false } })).toBe('?sort=footprint');
    const s: State = { ...DEFAULT_STATE, grouped: true, sort: { key: 'docs', reversed: true } };
    expect(stateQuery(s)).toBe('?order=grouped&sort=-docs');
    expect(parseState(stateQuery(s))).toEqual(s);
  });
  it("falls back from a bad sort to the order's, and lets a good one win over it", () => {
    expect(parseState('?sort=foo').sort).toEqual(DEFAULT_STATE.sort);
    expect(parseState('?sort=-').sort).toEqual(DEFAULT_STATE.sort);
    expect(parseState('?order=name&sort=foo').sort).toEqual({ key: 'spec', reversed: false });
    expect(parseState('?order=name&sort=docs').sort).toEqual({ key: 'docs', reversed: false });
  });
});

describe('withSort, withOrder, and orderOf', () => {
  const footprint: State = { ...DEFAULT_STATE, grouped: true, sort: { key: 'footprint', reversed: false } };
  it('reverses the sorted key, starts another unreversed, and keeps Grouped', () => {
    expect(withSort(footprint, 'footprint')).toEqual({ ...footprint, sort: { key: 'footprint', reversed: true } });
    expect(withSort({ ...footprint, sort: { key: 'footprint', reversed: true } }, 'docs')).toEqual({ ...footprint, sort: { key: 'docs', reversed: false } });
  });
  it('makes Name and Recent the Spec and Updated sorts, ungrouped, and keeps the sort for Grouped', () => {
    expect(withOrder(footprint, 'name')).toEqual({ ...footprint, grouped: false, sort: { key: 'spec', reversed: false } });
    expect(withOrder(footprint, 'recent')).toEqual({ ...footprint, grouped: false, sort: { key: 'updated', reversed: false } });
    expect(withOrder({ ...footprint, grouped: false }, 'grouped')).toEqual(footprint);
  });
  it('drops a Category sort for Grouped, which has no Category column, and sorts by date instead', () => {
    const byCategory: State = { ...DEFAULT_STATE, sort: { key: 'category', reversed: true } };
    expect(withOrder(byCategory, 'grouped')).toEqual({ ...byCategory, grouped: true, sort: { key: 'updated', reversed: false } });
    expect(parseState('?order=grouped&sort=category')).toMatchObject({ grouped: true, sort: { key: 'updated', reversed: false } });
    expect(parseState('?sort=-category').sort).toEqual({ key: 'category', reversed: true });
  });

  it('names the order only for those sorts', () => {
    expect(orderOf(DEFAULT_STATE)).toBe('recent');
    expect(orderOf({ ...DEFAULT_STATE, sort: { key: 'spec', reversed: false } })).toBe('name');
    expect(orderOf(footprint)).toBe('grouped');
    expect(orderOf({ ...DEFAULT_STATE, sort: { key: 'footprint', reversed: false } })).toBeUndefined();
    expect(orderOf({ ...DEFAULT_STATE, sort: { key: 'spec', reversed: true } })).toBeUndefined();
  });
});

describe('compareBy', () => {
  const sorted = (rows: Row[], key: SortKey, reversed = false) => names([...rows].sort(compareBy({ key, reversed })));
  const rows = [
    row({ title: 'B', shortname: 'b', bucket: '2', engines: ['webkit', 'blink'], interop: 50, mdn: 3, caniuse: 0, footprint: 4, category: 'Media', updated: '2026-01-01' }),
    row({ title: 'A', shortname: 'a', bucket: '3', engines: ['gecko', 'webkit', 'blink'], interop: 90, mdn: 1, caniuse: 2, footprint: 40, category: 'CSS', updated: '2026-06-01' }),
    row({ title: 'D', shortname: 'd', bucket: 'nodata', category: 'Other' }),
    row({ title: 'C', shortname: 'c', bucket: 'none', engines: [], interop: 10, mdn: 0, caniuse: 1, footprint: 0, category: 'Core', updated: '2025-01-01' }),
  ];
  it('sorts each column in its first-click direction', () => {
    expect(sorted(rows, 'spec')).toEqual(['A', 'B', 'C', 'D']);
    expect(sorted(rows, 'category')).toEqual(['C', 'A', 'B', 'D']);
    expect(sorted(rows, 'updated')).toEqual(['A', 'B', 'C', 'D']);
    expect(sorted(rows, 'engines')).toEqual(['A', 'B', 'C', 'D']);
    expect(sorted(rows, 'tests')).toEqual(['A', 'B', 'C', 'D']);
    expect(sorted(rows, 'docs')).toEqual(['B', 'A', 'C', 'D']);
    expect(sorted(rows, 'caniuse')).toEqual(['A', 'C', 'B', 'D']);
    expect(sorted(rows, 'footprint')).toEqual(['A', 'B', 'C', 'D']);
  });
  it('keeps missing values last in both directions', () => {
    for (const key of ['updated', 'engines', 'tests', 'footprint', 'category'] as SortKey[]) expect(sorted(rows, key, true).at(-1)).toBe('D');
    expect(sorted(rows, 'footprint', true)).toEqual(['C', 'B', 'A', 'D']);
  });
  it('breaks ties by name, A to Z, in both directions', () => {
    const tie = [row({ title: 'Y', shortname: 'y', mdn: 2 }), row({ title: 'X', shortname: 'x', mdn: 2 }), row({ title: 'W', shortname: 'w', mdn: 9 })];
    expect(sorted(tie, 'docs')).toEqual(['W', 'X', 'Y']);
    expect(sorted(tie, 'docs', true)).toEqual(['X', 'Y', 'W']);
  });
  it('counts zero as a value', () => {
    // D has 0 MDN articles, which ties with C's 0 rather than sorting last.
    expect(sorted(rows, 'docs', true)).toEqual(['C', 'D', 'A', 'B']);
    expect(sorted(rows, 'engines', true)).toEqual(['C', 'B', 'A', 'D']);
  });
});

describe('visibleRows, with a sort', () => {
  it('sorts by the state sort', () => {
    const rows = [row({ title: 'Small', shortname: 's', footprint: 1 }), row({ title: 'Big', shortname: 'b', footprint: 9 })];
    expect(names(visibleRows(rows, { ...DEFAULT_STATE, sort: { key: 'footprint', reversed: false } }))).toEqual(['Big', 'Small']);
  });
});

describe('sortPhrase', () => {
  it('phrases each sort', () => {
    expect(sortPhrase({ key: 'footprint', reversed: false })).toBe('by footprint, largest first');
    expect(sortPhrase({ key: 'spec', reversed: true })).toBe('by name, Z to A');
    expect(sortPhrase({ key: 'updated', reversed: false })).toBe('by date, newest first');
    expect(sortPhrase({ key: 'tests', reversed: true })).toBe('by Interop score, worst first');
  });
});


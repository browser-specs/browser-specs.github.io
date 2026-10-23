import { describe, it, expect } from 'vitest';
import type { Row } from '../src/logic/rows.ts';
import {
  bucketCounts, compareName, compareRecent, DEFAULT_STATE, groupRows, highlight, matches, parseFilter, parseState, stateQuery, visibleRows,
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
    expect(parseState('?q=css%20color&engines=1,3&order=recent&view=cards')).toEqual({ q: 'css color', buckets: ['3', '1'], order: 'recent', view: 'cards' });
  });

  it('falls back to the default for each bad part, and keeps the good ones', () => {
    expect(parseState('?order=foo&view=grid&engines=7,x,2')).toEqual({ ...DEFAULT_STATE, buckets: ['2'] });
  });

  it('reads an empty engines as every chip off', () => {
    expect(parseState('?engines=').buckets).toEqual([]);
  });

  it('writes only what differs from the defaults, engines in their own order', () => {
    expect(stateQuery({ ...DEFAULT_STATE, q: 'css color', buckets: ['1', '3', '2'] })).toBe('?q=css+color&engines=3%2C2%2C1');
    expect(stateQuery({ ...DEFAULT_STATE, buckets: ['2', '3'] })).toBe('');
    const state = { q: 'a b', buckets: [], order: 'grouped', view: 'cards' } as const;
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
    expect(names([...rows].sort(compareRecent))).toEqual(['A', 'B', 'Mid', 'Old', 'None']);
  });

  it('groups by category, alphabetically with Other last, specs by name, and no empty groups', () => {
    const rows = [
      row({ title: 'Z', category: 'CSS' }),
      row({ title: 'Q', category: 'Other' }),
      row({ title: 'A', category: 'CSS' }),
      row({ title: 'M', category: 'Accessibility' }),
    ];
    expect(groupRows(rows).map((g) => [g.category, names(g.rows)])).toEqual([
      ['Accessibility', ['M']],
      ['CSS', ['A', 'Z']],
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

import { describe, it, expect } from 'vitest';
import { buildCaniuse, buildRuns, caniuseFeatures, featureView, filterByTitle, isCiuFeature, noteParts, type CiuFeature, type CiuFile, type CiuRun, type CiuVersion, type Support } from '../src/logic/caniuse.ts';
import type { SlimSpec } from '../src/shared/types.ts';

const spec = (shortname: string, url: string, over: Partial<SlimSpec> = {}): SlimSpec => ({
  shortname,
  title: shortname,
  url,
  organization: 'W3C',
  standing: 'good',
  groups: [],
  series: { shortname, currentSpecification: shortname },
  ...over,
});

const at = (date: string) => Date.parse(`${date}T00:00:00Z`) / 1000;
const versions = (list: [string, string | null, number][]): CiuVersion[] =>
  list.map(([version, date, era]) => ({ version, release_date: date ? at(date) : null, era }));

describe('buildRuns', () => {
  it('merges versions with the same code, ends past runs at the current release, and keeps betas apart', () => {
    const v = versions([['1', '2015-01-10', -3], ['2', '2015-03-01', -2], ['3', '2015-06-01', -1], ['4', '2015-09-01', 0], ['5', null, 1], ['6', null, 2]]);
    expect(buildRuns(v, { 1: 'n', 2: 'n', 3: 'y', 4: 'y', 5: 'y', 6: 'y' })).toEqual([
      { from: '1', to: '2', support: 'n', month: '2015-01' },
      { from: '3', to: '4', support: 'y', month: '2015-06', current: true },
      { from: '5', to: '6', support: 'y', beta: true },
    ]);
  });

  it('reads flags, prefixes, and notes, counts a polyfill as no, and splits runs whose notes differ', () => {
    const v = versions([['1', '2010-01-01', -5], ['2', '2011-01-01', -4], ['3', '2012-01-01', -3], ['4', '2013-01-01', -2], ['5', '2014-01-01', -1], ['6', '2015-01-01', 0]]);
    expect(buildRuns(v, { 1: 'p', 2: 'n d #1', 3: 'a x #2 #3', 4: 'a x #2', 5: 'u', 6: 'y' })).toEqual([
      { from: '1', to: '1', support: 'n', month: '2010-01' },
      { from: '2', to: '2', support: 'n', flag: true, notes: [1], month: '2011-01' },
      { from: '3', to: '3', support: 'a', prefix: true, notes: [2, 3], month: '2012-01' },
      { from: '4', to: '4', support: 'a', prefix: true, notes: [2], month: '2013-01' },
      { from: '5', to: '5', support: 'u', month: '2014-01' },
      { from: '6', to: '6', support: 'y', month: '2015-01', current: true },
    ]);
  });

  it('counts a version with no code as unknown', () => {
    expect(buildRuns(versions([['1', '2020-01-01', 0]]), {})).toEqual([{ from: '1', to: '1', support: 'u', month: '2020-01', current: true }]);
  });
});

const FETCH = 'https://fetch.spec.whatwg.org/';
const grid = { shortname: 'css-grid', currentSpecification: 'css-grid-2', nightlyUrl: 'https://drafts.csswg.org/css-grid/' };
const specs = [
  spec('fetch', FETCH),
  spec('html', 'https://html.spec.whatwg.org/multipage/'),
  spec('css-grid-1', 'https://www.w3.org/TR/css-grid-1/', { series: grid }),
  spec('css-grid-2', 'https://www.w3.org/TR/css-grid-2/', { series: grid }),
];
const agents = {
  firefox: { version_list: versions([['39', '2015-07-01', -1], ['40', '2015-08-01', 0]]) },
  safari: { version_list: versions([['10', '2016-09-01', -1], ['10.1', '2017-03-01', 0]]) },
  chrome: { version_list: versions([['41', '2015-03-01', -1], ['42', '2015-04-01', 0]]) },
  edge: { version_list: versions([['12', '2015-07-01', 0]]) },
};
const feature = (title: string, specUrl: string) => ({
  title,
  spec: specUrl,
  usage_perc_y: 90.12,
  usage_perc_a: 2.04,
  stats: { firefox: { 39: 'a #1', 40: 'y #2' }, safari: { 10: 'n', '10.1': 'y' }, chrome: { 41: 'n d #3', 42: 'y' }, edge: { 12: 'n #4' } },
  notes_by_num: { 1: 'One.', 2: 'Two.', 3: 'Three.', 4: 'Four.' },
});
const caniuse = (data: Record<string, unknown>) => ({ agents, data, updated: at('2026-10-13') });

describe('buildCaniuse', () => {
  it('matches a feature through its own spec URL, through web-features, or through a series URL', () => {
    const data = {
      fetch: feature('Fetch', `${FETCH}#fetch-method`),
      dialog: feature('Dialog element', 'https://www.w3.org/TR/2012/WD-html5-20121025/'),
      'css-subgrid': feature('CSS Subgrid', 'https://drafts.csswg.org/css-grid/#subgrids'),
      gone: feature('Gone', 'https://example.test/gone/'),
      moved: feature('Moved', 'https://example.test/moved/'),
    };
    const webFeatures = {
      features: {
        dialog: { kind: 'feature', caniuse: ['dialog'], spec: ['https://html.spec.whatwg.org/multipage/interactive-elements.html#the-dialog-element'] },
        moved: { kind: 'moved', caniuse: ['moved'], spec: [FETCH] },
        nothing: { kind: 'feature', spec: [FETCH] },
      },
    };
    const file = buildCaniuse(caniuse(data), webFeatures, specs, '1.0.30001816');
    expect(file.caniuse).toEqual({ version: '1.0.30001816', updated: '2026-10-13' });
    expect(Object.keys(file.features)).toEqual(['css-subgrid', 'dialog', 'fetch']);
    expect(file.specs).toEqual({ 'css-grid-2': ['css-subgrid'], fetch: ['fetch'], html: ['dialog'] });
  });

  it('keeps desktop Firefox, Safari, and Chrome, the notes a partial or flagged run cites, and the global support', () => {
    const f = buildCaniuse(caniuse({ fetch: feature('Fetch', FETCH) }), {}, specs, 'v').features.fetch;
    expect(Object.keys(f.runs)).toEqual(['firefox', 'safari', 'chrome']);
    expect(f.runs.chrome).toEqual([
      { from: '41', to: '41', support: 'n', flag: true, notes: [3], month: '2015-03' },
      { from: '42', to: '42', support: 'y', month: '2015-04', current: true },
    ]);
    expect(f.notes).toEqual({ 1: 'One.', 3: 'Three.' });
    expect(f.usage).toBe(92.2);
    expect(f.title).toBe('Fetch');
  });

  it('lists a feature under each spec it matches, and gives the same file for the same input in any order', () => {
    const webFeatures = { features: { f: { kind: 'feature', caniuse: 'fetch', spec: 'https://html.spec.whatwg.org/multipage/x.html' } } };
    const a = { fetch: feature('Fetch', FETCH), cors: feature('CORS', `${FETCH}#http-cors-protocol`) };
    const one = buildCaniuse(caniuse(a), webFeatures, specs, 'v');
    expect(one.specs).toEqual({ fetch: ['cors', 'fetch'], html: ['fetch'] });
    const b = { fetch: a.fetch, cors: a.cors };
    expect(JSON.stringify(buildCaniuse(caniuse(b), webFeatures, specs, 'v'))).toBe(JSON.stringify(one));
  });
});

const NOW = Date.UTC(2026, 9, 19);
const run = (from: string, to: string, support: Support, month?: string, more: Partial<CiuRun> = {}): CiuRun => ({
  from,
  to,
  support,
  ...(month ? { month } : {}),
  ...more,
});
const fetchLike: CiuFeature = {
  title: 'Fetch',
  usage: 97.3,
  runs: {
    firefox: [
      run('2', '33', 'n', '2006-10'),
      run('34', '38', 'n', '2014-12', { flag: true, notes: [1, 4] }),
      run('39', '39', 'y', '2015-07', { notes: [4] }),
      run('40', '157', 'y', '2015-08', { current: true }),
      run('158', '160', 'y', undefined, { beta: true }),
    ],
    safari: [run('3.1', '10', 'n', '2008-03'), run('10.1', '27', 'y', '2017-03', { current: true }), run('27.1', 'TP', 'y', undefined, { beta: true })],
    chrome: [
      run('4', '39', 'n', '2010-01'),
      run('40', '41', 'a', '2015-01', { notes: [2, 3] }),
      run('42', '154', 'y', '2015-04', { current: true }),
      run('155', '157', 'y', undefined, { beta: true }),
    ],
  },
  notes: { 1: 'One.', 2: 'Two.', 3: 'Three.', 4: 'Four.' },
};
const alike = (runs: CiuRun[]): CiuFeature => ({ title: 'X', usage: 1, runs: { firefox: runs, safari: runs, chrome: runs }, notes: {} });
const still: CiuFeature = {
  title: 'X',
  usage: 0,
  runs: {
    firefox: [run('2', '157', 'n', '2006-10', { current: true })],
    safari: [run('3.1', '18.5-18.7', 'n', '2008-03', { current: true })],
    chrome: [run('4', '154', 'n', '2010-01', { current: true })],
  },
  notes: {},
};

describe('featureView', () => {
  it('labels each bar by when its unbroken support began, and words its whole history', () => {
    const v = featureView('fetch', fetchLike, NOW);
    expect(v.url).toBe('https://caniuse.com/fetch');
    expect(v.bars.map((b) => [b.name, b.label, b.chip, b.support])).toEqual([
      ['Firefox', '39+ \u00b7 Jul 2015', '39+', 'y'],
      ['Safari', '10.1+ \u00b7 Mar 2017', '10.1+', 'y'],
      ['Chrome', '42+ \u00b7 Apr 2015', '42+', 'y'],
    ]);
    expect(v.bars[2].text).toBe('Chrome: no in 4\u201339; partial in 40\u201341 (notes 2, 3); yes in 42\u2013154; yes in 155\u2013157 (beta)');
    expect(v.bars[2].segments.map((s) => s.tip)).toEqual([
      'Chrome 4\u201339: no, from Jan 2010',
      'Chrome 40\u201341: partial (notes 2, 3), from Jan 2015',
      'Chrome 42\u2013154: yes, from Apr 2015',
      'Chrome 155\u2013157 (beta): yes',
    ]);
  });

  it('says when support needs a prefix, lands in a beta, is partial, was removed, or is behind a flag', () => {
    const label = (runs: CiuRun[]) => {
      const b = featureView('x', alike(runs), NOW).bars[0];
      return [b.label, b.chip];
    };
    expect(label([run('4', '20', 'a', '2010-01', { prefix: true }), run('21', '154', 'y', '2012-06', { prefix: true, current: true })]))
      .toEqual(['21+ \u00b7 Jun 2012 (prefixed)', '21+']);
    expect(label([run('2', '157', 'n', '2006-10', { current: true }), run('158', '160', 'y', undefined, { beta: true })])).toEqual(['Lands in 158 (beta)', '158 beta']);
    expect(label([run('3.1', '27', 'n', '2008-03', { current: true }), run('27.1', '27.2', 'n', undefined, { beta: true }), run('TP', 'TP', 'y', undefined, { beta: true })]))
      .toEqual(['In Technology Preview', 'TP']);
    expect(label([
      run('2', '140', 'n', '2006-10'),
      run('141', '144', 'a', '2025-07', { flag: true, notes: [6] }),
      run('145', '157', 'a', '2025-11', { flag: true, notes: [8], current: true }),
    ])).toEqual(['Partial \u00b7 since 141', 'Partial']);
    expect(label([run('2', '42', 'a', '2006-10'), run('43', '51', 'y', '2015-12'), run('52', '157', 'n', '2017-03', { current: true })]))
      .toEqual(['No \u00b7 removed in 52', 'No']);
    expect(label([run('4', '36', 'n', '2010-01'), run('37', '154', 'n', '2014-08', { flag: true, current: true })])).toEqual(['Behind a flag', 'Flag']);
    expect(label([run('3.1', '27', 'n', '2008-03', { current: true })])).toEqual(['No', 'No']);
    expect(label([run('3.1', '27', 'u', '2008-03', { current: true })])).toEqual(['Unknown', '?']);
  });

  it('starts the axis a year before the first change, ends the current run at today, and puts the betas after it', () => {
    const v = featureView('fetch', fetchLike, NOW);
    expect(v.ticks.map((t) => t.label)).toEqual(['2014', '2020', 'now']);
    expect(v.ticks[0].at).toBeGreaterThan(0);
    expect(v.ticks[2].at).toBe(v.today);
    const chrome = v.bars[2].segments;
    expect(chrome[0].start).toBe(0);
    expect(chrome[2].start + chrome[2].width).toBeCloseTo(v.today, 1);
    expect(chrome[3]).toMatchObject({ support: 'y', beta: true });
    expect(chrome[3].start).toBeCloseTo(v.today, 1);
    expect(chrome[3].start + chrome[3].width).toBeCloseTo(100, 1);
    expect(v.bars[0].segments[1]).toMatchObject({ support: 'n', flag: true });
    const safari = v.bars[1].segments;
    expect(safari.slice(1).map((s) => s.beta)).toEqual([undefined, true]);
  });

  it('handles a feature that never changed, a run with no month, a clock behind the data, and a browser with no runs', () => {
    const v = featureView('x', still, NOW);
    expect(v.ticks.map((t) => t.label)).toEqual(['2022', 'now']);
    expect(v.bars[0].segments).toEqual([{ start: 0, width: v.today, support: 'n', tip: 'Firefox 2\u2013157: no, from Oct 2006' }]);
    expect(v.bars[1].text).toBe('Safari: no in 3.1\u201318.5\u201318.7');
    const gap = { ...still, runs: { ...still.runs, chrome: [run('4', '40', 'n', '2010-01'), run('41', '41', 'a', '2016-02'), run('42', '42', 'n'), run('43', '154', 'y', '2017-04', { current: true })] } };
    const segs = featureView('x', gap, NOW).bars[2].segments;
    expect(segs[2].start).toBe(segs[1].start);
    expect(segs[1].width).toBe(0);
    const ahead = { ...still, runs: { ...still.runs, chrome: [run('4', '154', 'n', '2010-01'), run('155', '155', 'y', '2027-01', { current: true })] } };
    expect(featureView('x', ahead, NOW).bars[2].segments.every((s) => s.width >= 0)).toBe(true);
    const empty = featureView('x', { ...still, runs: { ...still.runs, firefox: [] } }, NOW).bars[0];
    expect([empty.label, empty.chip, empty.text, empty.segments]).toEqual(['Unknown', '?', 'Firefox: no data', []]);
  });

  it('credits each note a partial or flagged run cites to the browsers and versions that cite it, merging adjacent runs', () => {
    const f: CiuFeature = {
      title: 'X',
      usage: 1,
      notes: { 1: 'One.', 4: 'Four.' },
      runs: {
        firefox: [
          run('2', '33', 'n', '2006-10'),
          run('34', '38', 'n', '2014-12', { flag: true, notes: [1] }),
          run('39', '40', 'a', '2015-07', { notes: [1] }),
          run('41', '157', 'y', '2015-09', { notes: [4], current: true }),
        ],
        safari: [run('3.1', '27', 'y', '2008-03', { current: true })],
        chrome: [run('4', '39', 'a', '2010-01', { notes: [1] }), run('40', '50', 'n', '2015-01'), run('51', '154', 'a', '2016-04', { notes: [1], current: true })],
      },
    };
    expect(featureView('x', f, NOW).notes).toEqual([{ n: 1, cited: 'Firefox 34\u201340, Chrome 4\u201339, 51\u2013154', text: 'One.' }]);
  });
});

describe('noteParts', () => {
  it('splits a note into text, code, Markdown links, and bare URLs', () => {
    expect(noteParts('Use `x` or see [bug 1](https://b.test/1). Also https://c.test/2.')).toEqual([
      { text: 'Use ' },
      { text: 'x', code: true },
      { text: ' or see ' },
      { text: 'bug 1', href: 'https://b.test/1' },
      { text: '. Also ' },
      { text: 'https://c.test/2', href: 'https://c.test/2' },
      { text: '.' },
    ]);
    expect(noteParts('Plain.')).toEqual([{ text: 'Plain.' }]);
  });
});

describe('filterByTitle', () => {
  it('keeps the items whose titles contain the query, case-insensitively, and all of them for a blank one', () => {
    const items = [{ title: 'Dialog element' }, { title: 'Fetch' }];
    expect(filterByTitle(items, 'DIALOG')).toEqual([{ title: 'Dialog element' }]);
    expect(filterByTitle(items, '  ')).toBe(items);
  });
});

describe('caniuseFeatures', () => {
  it("gives a spec's features sorted by title, and drops any whose shape doesn't fit", () => {
    const file: CiuFile = {
      caniuse: { version: 'v', updated: '2026-10-13' },
      features: { fetch: fetchLike, cors: { ...fetchLike, title: 'Cross-Origin Resource Sharing' }, bad: { ...fetchLike, runs: { firefox: [], safari: [] } } as unknown as CiuFeature },
      specs: { fetch: ['fetch', 'cors', 'bad', 'missing'] },
    };
    expect(caniuseFeatures(file, 'fetch').map((f) => f.id)).toEqual(['cors', 'fetch']);
    expect(caniuseFeatures(file, 'constructor')).toEqual([]);
    expect(caniuseFeatures(file, 'nope')).toEqual([]);
    expect(caniuseFeatures(null as unknown as CiuFile, 'fetch')).toEqual([]);
    expect(isCiuFeature(fetchLike)).toBe(true);
    expect(isCiuFeature({ ...fetchLike, runs: { ...fetchLike.runs, chrome: [{ from: '1', to: '2', support: 'maybe' }] } })).toBe(false);
    expect(isCiuFeature({ ...fetchLike, usage: '97' })).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import {
  allUrl, buildWpt, countTest, dirUrl, formatPct, isWptSpec, onlyUrl, passRate, percent, roundPct, runsSentence, subtests, tint, wptMeta, wptSpec,
  type WptBrowser, type WptFile, type WptResult, type WptRuns, type WptSpec, type WptStats, type WptSummary,
} from '../src/logic/wpt.ts';
import type { SlimSpec } from '../src/shared/types.ts';

const WPT = 'https://github.com/web-platform-tests/wpt';
const spec = (shortname: string, testPaths?: string[], excludePaths?: string[]): SlimSpec => ({
  shortname,
  title: shortname,
  url: `https://example.org/${shortname}/`,
  organization: 'W3C',
  standing: 'good',
  groups: [],
  series: { shortname, currentSpecification: shortname },
  ...(testPaths ? { tests: { repository: WPT, testPaths, ...(excludePaths ? { excludePaths } : {}) } } : {}),
});
const meta: WptRuns = {
  runs: { firefox: { id: 2, version: '158.0', os: 'linux' }, safari: { id: 3, version: '27.0 (22625.1.29.11.27)', os: 'mac' }, chrome: { id: 1, version: '155.0.8059.84', os: 'linux' } },
  revision: '23b0b89b1a',
  date: '2026-10-18',
};
const r = (s: string, p: number, n: number): WptResult => ({ s, c: [p, n] });
const summaries: Record<WptBrowser, WptSummary> = {
  firefox: { '/fetch/a.any.html': r('O', 3, 4), '/fetch/b.html': r('P', 0, 0), '/fetch/metadata/x.html': r('O', 0, 2), '/cors/c.htm': r('O', 2, 2), '/fetch-later/d.html': r('O', 1, 1) },
  safari: { '/fetch/a.any.html': r('O', 4, 4), '/fetch/b.html': r('F', 0, 0), '/fetch/metadata/x.html': r('O', 2, 2), '/cors/c.htm': r('O', 1, 2), '/fetch-later/d.html': r('O', 1, 1) },
  chrome: { '/fetch/a.any.html': r('O', 4, 4), '/fetch/metadata/x.html': r('O', 2, 2), '/cors/c.htm': r('O', 2, 2), '/fetch-later/d.html': r('O', 0, 1) },
};
const only: Record<WptBrowser, string[]> = { firefox: ['/fetch/a.any.html', '/dom/x.html'], safari: ['/cors/c.htm', '/fetch/metadata/x.html'], chrome: [] };
const specs = [
  spec('fetch', ['fetch', 'cors'], ['fetch/metadata', 'fetch/metadata/']),
  spec('fetch-later', ['fetch-later']),
  spec('fetch-2', ['/fetch/', 'fetch']),
  spec('html', ['fetch', 'fetch/metadata']),
  spec('webgpu'),
  spec('nothing', ['nothing']),
  { ...spec('cts'), tests: { repository: 'https://github.com/gpuweb/cts', testPaths: ['fetch'] } },
];

describe('buildWpt', () => {
  it('counts a test by its subtests, by its status when it has none, and as failed when a run lacks it', () => {
    expect(countTest(r('O', 3, 4))).toEqual([3, 4]);
    expect(countTest(r('P', 0, 0))).toEqual([1, 1]);
    expect(countTest(r('O', 0, 0))).toEqual([1, 1]);
    expect(countTest(r('T', 0, 0))).toEqual([0, 1]);
    expect(countTest(undefined)).toEqual([0, 1]);
  });

  it('gives 100 and 0 only for a full pass and for none at all', () => {
    expect(percent(5, 5)).toBe(100);
    expect(percent(0, 5)).toBe(0);
    expect(percent(0, 0)).toBe(0);
    expect(percent(9999, 10000)).toBe(99.9);
    expect(percent(1, 10000)).toBe(0.1);
    expect(percent(10221, 11321)).toBe(90.3);
    expect(percent(1.25, 3)).toBe(41.7);
  });

  it("works out a spec's numbers for all of its tests and for each directory, in testPaths order", () => {
    const file = buildWpt(meta, summaries, only, specs);
    expect(file.runs).toEqual(meta.runs);
    expect([file.revision, file.date]).toEqual(['23b0b89b1a', '2026-10-18']);
    expect(file.specs.fetch).toEqual({
      paths: ['fetch', 'cors'],
      exclude: ['fetch/metadata'],
      all: { tests: 3, pass: { firefox: [6, 7], safari: [5, 7], chrome: [6, 7] }, interop: 41.7, only: { firefox: 1, safari: 1, chrome: 0 } },
      dirs: [
        ['fetch', { tests: 2, pass: { firefox: [4, 5], safari: [4, 5], chrome: [4, 5] }, interop: 37.5, only: { firefox: 1, safari: 0, chrome: 0 } }],
        ['cors', { tests: 1, pass: { firefox: [2, 2], safari: [1, 2], chrome: [2, 2] }, interop: 50, only: { firefox: 0, safari: 1, chrome: 0 } }],
      ],
    });
    expect(file.specs['fetch-later']).toEqual({
      paths: ['fetch-later'],
      all: { tests: 1, pass: { firefox: [1, 1], safari: [1, 1], chrome: [0, 1] }, interop: 0, only: { firefox: 0, safari: 0, chrome: 0 } },
    });
  });

  it('normalizes and deduplicates paths, and counts a test under two of them once', () => {
    const file = buildWpt(meta, summaries, only, specs);
    expect(file.specs['fetch-2'].paths).toEqual(['fetch']);
    expect(file.specs['fetch-2'].all.tests).toBe(3);
    expect(file.specs['fetch-2'].dirs).toBeUndefined();
    expect(file.specs.html.all.tests).toBe(3);
    expect(file.specs.html.dirs!.map(([dir, s]) => [dir, s.tests])).toEqual([['fetch', 3], ['fetch/metadata', 1]]);
  });

  it('leaves out specs with no tests in the runs, or whose tests live outside WPT', () => {
    expect(Object.keys(buildWpt(meta, summaries, only, specs).specs)).toEqual(['fetch', 'fetch-2', 'fetch-later', 'html']);
  });

  it('gives the same bytes for the same inputs, whatever order the specs come in', () => {
    expect(JSON.stringify(buildWpt(meta, summaries, only, [...specs].reverse()))).toBe(JSON.stringify(buildWpt(meta, summaries, only, specs)));
  });
});

const stats: WptStats = { tests: 1, pass: { firefox: [1, 1], safari: [0, 1], chrome: [1, 1] }, interop: 0, only: { firefox: 0, safari: 1, chrome: 0 } };
const R = 'run_id=1&run_id=2&run_id=3';
const fetchSpec: WptSpec = { paths: ['cors', 'fetch'], exclude: ['fetch/local-network-access', 'fetch/metadata'], all: stats, dirs: [['cors', stats], ['fetch', stats]] };
const htmlSpec: WptSpec = { paths: ['html', 'workers'], exclude: ['html/cross-origin-embedder-policy/credentialless'], all: stats, dirs: [['html', stats], ['workers', stats]] };
const grid: WptSpec = { paths: ['css/css-grid'], all: stats };

describe('the card view', () => {
  it("formats percentages, and rounds the button's number by the same rule", () => {
    expect([100, 0, 91, 41.7, 99.9, 0.1].map(formatPct)).toEqual(['100', '0', '91.0', '41.7', '99.9', '0.1']);
    expect([100, 0, 99.9, 99.4, 0.1, 1.8, 75.1].map(roundPct)).toEqual([100, 0, 99, 99, 1, 2, 75]);
    expect(passRate([10221, 11321])).toBe(90.3);
  });

  it('tints 95 and up, 80 and up, and the rest', () => {
    expect([100, 95, 94.9, 80, 79.9, 0].map(tint)).toEqual(['hi', 'hi', 'mid', 'mid', 'lo', 'lo']);
  });

  it('counts subtests with thousands separators', () => {
    expect(subtests([10221, 11321])).toBe('10,221 of 11,321 subtests');
    expect(subtests([1, 1])).toBe('1 of 1 subtest');
  });

  it("pins every link to the three runs, and carries the spec's exclusions", () => {
    expect(dirUrl(fetchSpec, 'cors', meta.runs)).toBe(`https://wpt.fyi/results/cors?${R}`);
    expect(dirUrl(fetchSpec, 'fetch', meta.runs)).toBe(`https://wpt.fyi/results/fetch?${R}&q=${encodeURIComponent('!path:/fetch/local-network-access/ !path:/fetch/metadata/')}`);
    expect(dirUrl(htmlSpec, 'html', meta.runs)).toBe(`https://wpt.fyi/results/html?${R}&q=!path%3A%2Fhtml%2Fcross-origin-embedder-policy%2Fcredentialless%2F`);
    expect(dirUrl(htmlSpec, 'workers', meta.runs)).toBe(`https://wpt.fyi/results/workers?${R}`);
    const all = '(path:/cors/ or path:/fetch/) !path:/fetch/local-network-access/ !path:/fetch/metadata/';
    expect(allUrl(fetchSpec, meta.runs)).toBe(`https://wpt.fyi/results/?${R}&q=${encodeURIComponent(all)}`);
    expect(onlyUrl(fetchSpec, 'safari', meta.runs)).toBe(`https://wpt.fyi/results/?${R}&q=${encodeURIComponent(`${all} safari:!pass chrome:pass firefox:pass`)}`);
  });

  it('links a spec with one directory to that directory, keeping its slash unencoded', () => {
    expect(allUrl(grid, meta.runs)).toBe(`https://wpt.fyi/results/css/css-grid?${R}`);
    expect(onlyUrl(grid, 'firefox', meta.runs)).toBe(`https://wpt.fyi/results/css/css-grid?${R}&q=firefox%3A!pass%20chrome%3Apass%20safari%3Apass`);
    expect(onlyUrl(grid, 'chrome', meta.runs)).toBe(`https://wpt.fyi/results/css/css-grid?${R}&q=chrome%3A!pass%20firefox%3Apass%20safari%3Apass`);
  });

  it('names the runs by browser, major version, and operating system', () => {
    expect(runsSentence(meta.runs)).toBe('stable Firefox 158 and Chrome 155 on Linux, Safari 27 on macOS');
    const same = { ...meta.runs, safari: { ...meta.runs.safari, os: 'linux' } };
    expect(runsSentence(same)).toBe('stable Firefox 158, Safari 27, and Chrome 155 on Linux');
    const spread = { firefox: { ...meta.runs.firefox, os: 'win' }, safari: meta.runs.safari, chrome: { ...meta.runs.chrome, os: 'android' } };
    expect(runsSentence(spread)).toBe('stable Firefox 158 on Windows, Safari 27 on macOS, Chrome 155 on android');
  });

  it("checks the runs' shape", () => {
    expect(wptMeta({ ...meta, specs: {} })).toEqual(meta);
    expect(wptMeta({ ...meta, runs: { firefox: meta.runs.firefox, chrome: meta.runs.chrome } })).toBeUndefined();
    expect(wptMeta({ ...meta, runs: { ...meta.runs, chrome: { ...meta.runs.chrome, id: '1' } } })).toBeUndefined();
    expect(wptMeta({ runs: meta.runs, revision: meta.revision })).toBeUndefined();
    expect(wptMeta(null)).toBeUndefined();
  });

  it("finds a spec's own entry only when its shape fits", () => {
    const bad = (all: unknown) => ({ ...fetchSpec, all });
    const file = { ...meta, specs: { fetch: fetchSpec, more: bad({ ...stats, pass: { ...stats.pass, firefox: [2, 1] } }), lost: bad({ ...stats, pass: { firefox: [1, 1], safari: [1, 1] } }), none: { paths: [], all: stats } } } as unknown as WptFile;
    expect(wptSpec(file, 'fetch')).toBe(fetchSpec);
    for (const name of ['more', 'lost', 'none', 'constructor', '__proto__', 'css-grid-3']) expect(wptSpec(file, name)).toBeUndefined();
    expect(isWptSpec({ ...fetchSpec, dirs: [['fetch', { ...stats, only: { firefox: -1, safari: 0, chrome: 0 } }]] })).toBe(false);
    expect(isWptSpec({ ...fetchSpec, exclude: ['x', 1] })).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildData, validate, writeSite } from '../scripts/build.ts';
import type { Sources } from '../scripts/sources.ts';
import type { Row, RowsFile } from '../src/logic/rows.ts';

const spec = (shortname: string, categories = ['browser']) => ({
  shortname,
  title: shortname.toUpperCase(),
  url: `https://example.test/${shortname}/`,
  organization: 'W3C',
  groups: [{ name: 'Some Working Group', url: 'https://example.test/wg' }],
  standing: 'good',
  categories,
  series: { shortname, currentSpecification: shortname },
});

const record = { engines: ['gecko', 'webkit', 'blink'], basis: 'shared', core: 1, ships: { gecko: 1, webkit: 1, blink: 1 }, lacks: {} };
const stats = { tests: 1, pass: { firefox: [1, 1], safari: [1, 1], chrome: [1, 1] }, interop: 100, only: { firefox: 0, safari: 0, chrome: 0 } };

const sources = (): Sources => ({
  specs: [spec('a'), spec('b'), spec('sparql', [])],
  webref: { date: '2026-10-20T18:50:41.592Z', results: [{ shortname: 'a', date: '19 October 2026' }] },
  implementations: { bcd: { version: '8.1.6', timestamp: '2026-10-15T13:35:41.362Z' }, specs: { a: record, sparql: record } },
  mdn: { content: { commit: 'f'.repeat(40), date: '2026-10-22' }, types: ['guide'], pages: [['Web/A', 'A', 0], ['Web/S', 'S', 0]], specs: { a: [0], sparql: [1] } },
  caniuse: { caniuse: { version: '1.0.30001819', updated: '2026-10-22' }, features: {}, specs: {} },
  wpt: {
    runs: { firefox: { id: 1, version: '158.0', os: 'linux' }, safari: { id: 2, version: '27.0', os: 'mac' }, chrome: { id: 3, version: '155.0', os: 'linux' } },
    revision: 'abc1234567',
    date: '2026-10-18',
    specs: { b: { paths: ['b'], all: stats } },
  },
  webFeatures: { version: '3.4.0', data: { features: {}, groups: {} } },
});

const NOW = new Date('2026-10-22T13:00:00Z');

describe('buildData', () => {
  it('builds the rows and the panels from the sources, leaving out the specs that are not for browsers', () => {
    const { rowsFile, panels } = buildData(sources(), NOW);
    expect(rowsFile.rows.map((r) => r.shortname)).toEqual(['a', 'b']);
    expect(rowsFile.rows[0]).toMatchObject({ updated: '2026-10-19', bucket: '3', mdn: 1 });
    expect(rowsFile.rows[1]).toMatchObject({ bucket: 'nodata', wpt: { firefox: 100, safari: 100, chrome: 100 } });
    expect(Object.keys(panels.missing.specs)).toEqual(['a']);
    expect(panels.mdn.pages).toEqual([['Web/A', 'A', 0]]);
    expect(Object.keys(panels.wpt.specs)).toEqual(['b']);
    expect(rowsFile.sources.built).toBe('2026-10-22T13:00:00.000Z');
  });

  it('fails on a source file of the wrong shape', () => {
    expect(() => buildData({ ...sources(), mdn: { pages: 7 } }, NOW)).toThrow(/^mdn: expected/);
  });
});

describe('validate', () => {
  const row = (over: Partial<Row>): Row => ({
    shortname: 'x', title: 'X', fullTitle: 'X', url: 'https://example.test/', org: 'W3C', groups: [], bucket: 'nodata', mdn: 0, caniuse: 0, category: 'Other', ...over,
  });
  const file = (rows: Row[]): RowsFile => ({ sources: buildData(sources(), NOW).rowsFile.sources, rows });
  const full = file([row({ engines: ['blink'], updated: '2026-10-19' }), row({ engines: ['blink'], updated: '2026-10-19' })]);

  it('passes a file at its floors', () => {
    expect(() => validate(full, { rows: 2, engines: 2, dated: 2 })).not.toThrow();
  });

  it.each([
    [{ rows: 3, engines: 0, dated: 0 }, 'only 2 specs, fewer than 3'],
    [{ rows: 0, engines: 3, dated: 0 }, 'only 2 specs with engine data, fewer than 3'],
    [{ rows: 0, engines: 0, dated: 3 }, 'only 2 specs with an updated date, fewer than 3'],
  ])('refuses a file under a floor (%o)', (floors, message) => {
    expect(() => validate(full, floors)).toThrow(message);
  });
});

async function list(dir: string, prefix = ''): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const names = await Promise.all(entries.map((e) => (e.isDirectory() ? list(join(dir, e.name), `${prefix}${e.name}/`) : [`${prefix}${e.name}`])));
  return names.flat().sort();
}

describe('writeSite', () => {
  it('writes every file the site serves, with the page script bundled', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'html-now-site-'));
    try {
      await writeSite(dir, buildData(sources(), NOW));
      expect(await list(dir)).toEqual([
        'app.js', 'data/panels/caniuse.json', 'data/panels/mdn.json', 'data/panels/missing.json', 'data/panels/wpt.json', 'data/specs.json',
        'favicon.ico', 'icons/browsers/LICENSE.txt', 'icons/browsers/chrome.svg', 'icons/browsers/firefox.svg', 'icons/browsers/safari.svg',
        'index.html', 'style.css',
      ]);
      const app = await readFile(join(dir, 'app.js'), 'utf8');
      expect(app).not.toMatch(/^import /m);
      expect(app.length).toBeGreaterThan(10_000);
      expect(JSON.parse(await readFile(join(dir, 'data/specs.json'), 'utf8')).rows).toHaveLength(2);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 30_000);
});

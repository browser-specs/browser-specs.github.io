import { describe, it, expect } from 'vitest';
import type { ImplFile } from '../src/logic/implementations.ts';
import { mdnView, type MdnFile } from '../src/logic/mdn.ts';
import { caniuseFeatures, type CiuFeature, type CiuFile } from '../src/logic/caniuse.ts';
import type { WptFile, WptSpec } from '../src/logic/wpt.ts';
import { caniuseAnswer, missingView, slimPanels, wptAnswer, type Panels } from '../src/logic/panels.ts';

const impl: ImplFile = {
  bcd: { version: '8.1.6', timestamp: '2026-10-15T13:35:41.362Z' },
  specs: {
    a: { engines: ['gecko', 'webkit', 'blink'], basis: 'shared', core: 2, ships: { gecko: 2, webkit: 2, blink: 2 }, lacks: {} },
    c: { engines: ['blink'], basis: 'any', core: 1, ships: { gecko: 0, webkit: 0, blink: 1 }, lacks: { gecko: { features: [{ key: 'api.C' }], more: 0 } } },
  },
};

const mdn: MdnFile = {
  content: { commit: 'f'.repeat(40), date: '2026-10-22' },
  types: ['guide', 'web-api-interface', 'web-api-overview'],
  pages: [
    ['Web/API/A_API', 'A API', 2],
    ['Web/API/C', 'C', 1],
    ['Web/API/A', 'A', 1],
    ['Web/API/C/thing', 'C: thing', 1],
    ['Web/Guide/C', 'Using C', 0],
  ],
  specs: { a: [0, 2], c: [1, 3, 4] },
};

const feature = (title: string): CiuFeature => ({
  title,
  usage: 90,
  runs: {
    firefox: [{ from: '2', to: '158', support: 'y', month: '2006-10', current: true }],
    safari: [{ from: '3.1', to: '27', support: 'y', month: '2008-03', current: true }],
    chrome: [{ from: '4', to: '155', support: 'y', month: '2010-01', current: true }],
  },
  notes: {},
});

const ciu: CiuFile = {
  caniuse: { version: '1.0.30001819', updated: '2026-10-22' },
  features: { x: feature('X'), y: feature('Y'), z: feature('Z') },
  specs: { a: ['x', 'y'], c: ['z'] },
};

const stats = { tests: 10, pass: { firefox: [9, 10], safari: [8, 10], chrome: [10, 10] }, interop: 80, only: { firefox: 0, safari: 1, chrome: 0 } } as WptSpec['all'];

const wpt: WptFile = {
  runs: { firefox: { id: 1, version: '158.0', os: 'linux' }, safari: { id: 2, version: '27.0', os: 'mac' }, chrome: { id: 3, version: '155.0', os: 'linux' } },
  revision: 'abc1234567',
  date: '2026-10-18',
  specs: { a: { paths: ['a'], all: stats }, c: { paths: ['c'], all: stats } },
};

const footprint = { crawled: '2026-10-22', specs: {}, footprints: {} };
const files: Panels = { missing: impl, mdn, caniuse: ciu, wpt, footprint };
const kept = new Set(['a', 'b']);

describe('slimPanels', () => {
  const slim = slimPanels(files, kept);

  it('passes the footprint file through, since it already covers only the listed specs', () => expect(slim.footprint).toBe(footprint));

  it('keeps only the given specs in every file', () => {
    expect(Object.keys(slim.missing.specs)).toEqual(['a']);
    expect(Object.keys(slim.mdn.specs)).toEqual(['a']);
    expect(Object.keys(slim.caniuse.specs)).toEqual(['a']);
    expect(Object.keys(slim.wpt.specs)).toEqual(['a']);
    expect(slim.missing.bcd).toEqual(impl.bcd);
    expect([slim.wpt.runs, slim.wpt.revision, slim.wpt.date]).toEqual([wpt.runs, wpt.revision, wpt.date]);
  });

  it('drops the MDN pages no kept spec lists, and keeps every view the same', () => {
    expect(slim.mdn.pages).toEqual([['Web/API/A_API', 'A API', 2], ['Web/API/A', 'A', 1]]);
    expect(slim.mdn.specs.a).toEqual([0, 1]);
    expect(mdnView(slim.mdn, 'a')).toEqual(mdnView(mdn, 'a'));
    expect(slim.mdn.content).toEqual(mdn.content);
  });

  it('drops the caniuse features no kept spec lists', () => {
    expect(Object.keys(slim.caniuse.features)).toEqual(['x', 'y']);
    expect(caniuseFeatures(slim.caniuse, 'a')).toEqual(caniuseFeatures(ciu, 'a'));
  });
});

describe('the views', () => {
  it('answers a view only for a spec with data of its own', () => {
    expect(missingView(impl, 'a')).toEqual({ ...impl.specs.a, bcd: impl.bcd });
    expect([missingView(impl, 'zzz'), caniuseAnswer(ciu, 'zzz'), wptAnswer(wpt, 'zzz')]).toEqual([undefined, undefined, undefined]);
    expect(caniuseAnswer(ciu, 'a')).toEqual({ features: caniuseFeatures(ciu, 'a'), source: ciu.caniuse });
    expect(wptAnswer(wpt, 'a')).toEqual({ spec: wpt.specs.a, runs: wpt.runs, revision: wpt.revision, date: wpt.date });
  });

  it("answers nothing for a record whose shape doesn't fit", () => {
    const bad = { ...impl, specs: { a: { engines: 'all' } } } as unknown as ImplFile;
    expect(missingView(bad, 'a')).toBeUndefined();
    expect(missingView(impl, 'constructor')).toBeUndefined();
  });
});

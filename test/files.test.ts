import { describe, it, expect } from 'vitest';
import { slimCaniuse, slimImplementations, slimMdn, slimWpt } from '../src/logic/files.ts';

describe('slimImplementations', () => {
  const good = { bcd: { version: '8.1.6', timestamp: '2026-10-15T10:11:12.000Z' }, specs: {} };


  it('rejects a file without a BCD version, a timestamp, or specs', () => {
    expect(slimImplementations(good)).toEqual(good);
    expect(() => slimImplementations({ ...good, bcd: { timestamp: good.bcd.timestamp } })).toThrow(/implementations/);
    expect(() => slimImplementations({ ...good, bcd: { version: '8.1.6' } })).toThrow(/implementations/);
    expect(() => slimImplementations({ bcd: good.bcd })).toThrow(/implementations/);
    expect(() => slimImplementations({ ...good, specs: [] })).toThrow(/implementations/);
    expect(() => slimImplementations(null)).toThrow(/implementations/);
  });

});

describe('slimMdn', () => {
  const good = { content: { commit: 'a'.repeat(40), date: '2026-10-18' }, types: [], pages: [], specs: {} };


  it('rejects a file without its commit and date, or its types, pages, or specs', () => {
    expect(slimMdn(good)).toEqual(good);
    for (const bad of [
      { ...good, content: { date: '2026-10-18' } },
      { ...good, content: { commit: 'a' } },
      { ...good, types: {} },
      { ...good, pages: {} },
      { ...good, specs: [] },
      null,
    ]) {
      expect(() => slimMdn(bad)).toThrow(/mdn/);
    }
  });

  it('drops each malformed page and index, and each spec left with no pages', () => {
    const file = slimMdn({
      ...good,
      types: ['guide', 7],
      pages: [['a', 'A', 0], ['b', 'B', 1], ['c', 3, 0], 'd', ['e', 'E', 0]],
      specs: { x: [0, 1, 2, 3, 4, 9, '0'], y: [1], z: 'nope' },
    });
    expect(file.pages).toEqual([['a', 'A', 0], ['e', 'E', 0]]);
    expect(file.specs).toEqual({ x: [0, 1] });
  });
});

describe('slimCaniuse', () => {
  const good = { caniuse: { version: '1.0.30001816', updated: '2026-10-13' }, features: {}, specs: {} };
  const feature = { title: 'Fetch', usage: 97.3, runs: { firefox: [], safari: [], chrome: [{ from: '42', to: '154', support: 'y', month: '2015-04', current: true }] }, notes: {} };


  it("rejects a file without caniuse-db's version and date, or its features or specs", () => {
    expect(slimCaniuse(good)).toEqual(good);
    for (const bad of [
      { ...good, caniuse: { updated: '2026-10-13' } },
      { ...good, caniuse: { version: 'v' } },
      { ...good, features: [] },
      { ...good, specs: [] },
      null,
    ]) {
      expect(() => slimCaniuse(bad)).toThrow(/caniuse/);
    }
  });

  it("drops each feature whose shape doesn't fit, and each spec left with none", () => {
    const file = slimCaniuse({
      ...good,
      features: { fetch: feature, bad: { ...feature, runs: { firefox: [] } } },
      specs: { fetch: ['fetch', 'bad', 'gone', 7], html: ['bad'], dom: 'nope' },
    });
    expect(Object.keys(file.features)).toEqual(['fetch']);
    expect(file.specs).toEqual({ fetch: ['fetch'] });
  });
});

describe('slimWpt', () => {
  const runs = { firefox: { id: 2, version: '158.0', os: 'linux' }, safari: { id: 3, version: '27.0', os: 'mac' }, chrome: { id: 1, version: '155.0', os: 'linux' } };
  const good = { runs, revision: '23b0b89b1a', date: '2026-10-18', specs: {} };
  const stats = { tests: 1, pass: { firefox: [1, 1], safari: [0, 1], chrome: [1, 1] }, interop: 0, only: { firefox: 0, safari: 1, chrome: 0 } };


  it('rejects a file without the three runs, the revision, the date, or the specs', () => {
    for (const bad of [null, { ...good, runs: { firefox: runs.firefox, chrome: runs.chrome } }, { ...good, revision: 7 }, { ...good, date: undefined }, { ...good, specs: [] }]) {
      expect(() => slimWpt(bad)).toThrow(/wpt/);
    }
  });

  it("drops each spec entry whose shape doesn't fit", () => {
    const file = slimWpt({ ...good, extra: 1, specs: { fetch: { paths: ['fetch'], all: stats }, bad: { paths: ['x'] } } });
    expect(file).toEqual({ runs, revision: '23b0b89b1a', date: '2026-10-18', specs: { fetch: { paths: ['fetch'], all: stats } } });
  });
});

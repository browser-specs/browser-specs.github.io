import { describe, it, expect } from 'vitest';
import type { Engine, ImplFile, ImplRecord } from '../src/logic/implementations.ts';
import type { MdnFile } from '../src/logic/mdn.ts';
import type { CiuFeature, CiuFile } from '../src/logic/caniuse.ts';
import { allUrl, type WptFile, type WptSpec } from '../src/logic/wpt.ts';
import { buildRows, type Inputs, type SpecLike } from '../src/logic/rows.ts';

const NOW = new Date('2026-10-22T13:00:00Z');

// A raw browser-specs entry, the way index.json has it.
const spec = (over: Record<string, unknown> = {}) => ({
  shortname: 'a',
  title: 'A Spec',
  url: 'https://example.test/a/',
  organization: 'W3C',
  groups: [{ name: 'Some Working Group', url: 'https://example.test/wg' }],
  standing: 'good',
  categories: ['browser'],
  series: { shortname: over.shortname ?? 'a', currentSpecification: over.shortname ?? 'a' },
  ...over,
});

const record = (engines: Engine[]): ImplRecord => ({
  engines,
  basis: 'shared',
  core: 1,
  ships: { gecko: engines.includes('gecko') ? 1 : 0, webkit: engines.includes('webkit') ? 1 : 0, blink: engines.includes('blink') ? 1 : 0 },
  lacks: {},
});

const impl = (specs: Record<string, ImplRecord> = {}): ImplFile => ({ bcd: { version: '8.1.6', timestamp: '2026-10-15T13:35:41.362Z' }, specs });

const mdn = (specs: Record<string, number[]> = {}): MdnFile => ({
  content: { commit: 'f'.repeat(40), date: '2026-10-22' },
  types: ['web-api-interface'],
  pages: [['Web/API/A', 'A', 0], ['Web/API/B', 'B', 0]],
  specs,
});

const feature: CiuFeature = {
  title: 'A feature',
  usage: 97.2,
  runs: {
    firefox: [{ from: '2', to: '158', support: 'y', month: '2006-10', current: true }],
    safari: [{ from: '3.1', to: '27', support: 'y', month: '2008-03', current: true }],
    chrome: [{ from: '4', to: '155', support: 'y', month: '2010-01', current: true }],
  },
  notes: {},
};

const caniuse = (specs: Record<string, string[]> = {}): CiuFile => ({
  caniuse: { version: '1.0.30001819', updated: '2026-10-22' },
  features: { x: feature },
  specs,
});

const wptSpec: WptSpec = {
  paths: ['dom'],
  all: {
    tests: 1204,
    pass: { firefox: [80300, 81665], safari: [80161, 81621], chrome: [80506, 81021] },
    interop: 72.3,
    only: { firefox: 49, safari: 126, chrome: 12 },
  },
};

const wpt = (specs: Record<string, WptSpec> = {}): WptFile => ({
  runs: {
    firefox: { id: 1, version: '158.0', os: 'linux' },
    safari: { id: 2, version: '27.0', os: 'mac' },
    chrome: { id: 3, version: '155.0', os: 'linux' },
  },
  revision: 'abc1234567',
  date: '2026-10-18',
  specs,
});

function build(over: Partial<Inputs> = {}, categorize: (s: SpecLike) => string = () => 'CSS') {
  const inputs: Inputs = {
    specs: [spec()],
    webref: { date: '2026-10-20T18:50:41.592Z', results: [] },
    impl: impl(),
    mdn: mdn(),
    caniuse: caniuse(),
    wpt: wpt(),
    webFeatures: { version: '3.4.0', data: {} },
    ...over,
  };
  return buildRows(inputs, categorize, NOW);
}

describe('buildRows', () => {
  it('keeps only the good specs browser-specs marks as browser specs', () => {
    const specs = [
      spec({ shortname: 'a' }),
      spec({ shortname: 'b', standing: 'discontinued' }),
      spec({ shortname: 'c', standing: 'pending' }),
      spec({ shortname: 'd', categories: [] }),
      spec({ shortname: 'e', standing: undefined }),
      { title: 'no shortname', url: 'https://example.test/x/', categories: ['browser'] },
    ];
    expect(build({ specs }).rows.map((r) => r.shortname)).toEqual(['a', 'e']);
  });

  it('makes a row for each level of a series', () => {
    const specs = ['css-color-4', 'css-color-5'].map((s) => spec({ shortname: s, series: { shortname: 'css-color', currentSpecification: 'css-color-4' } }));
    expect(build({ specs }).rows.map((r) => r.shortname)).toEqual(['css-color-4', 'css-color-5']);
  });

  it('shows the short title, links the nightly URL, and names the org, groups, and repo', () => {
    const [row] = build({
      specs: [spec({
        title: 'CSS Color Module Level 5',
        shortTitle: 'CSS Color 5',
        nightly: { url: 'https://drafts.csswg.org/css-color-5/', repository: 'https://github.com/w3c/csswg-drafts' },
      })],
    }).rows;
    expect(row).toMatchObject({
      title: 'CSS Color 5',
      fullTitle: 'CSS Color Module Level 5',
      url: 'https://drafts.csswg.org/css-color-5/',
      org: 'W3C',
      groups: ['Some Working Group'],
      repo: 'https://github.com/w3c/csswg-drafts',
    });
    const [plain] = build({ specs: [spec({ organization: undefined, groups: undefined })] }).rows;
    expect(plain).toMatchObject({ title: 'A Spec', fullTitle: 'A Spec', url: 'https://example.test/a/', org: '', groups: [] });
    expect(plain.repo).toBeUndefined();
  });

  it('takes the updated date from webref, in either of its forms, and none from anything else', () => {
    const webref = {
      date: '2026-10-20T18:50:41.592Z',
      results: [
        { shortname: 'a', date: '19 October 2026' },
        { shortname: 'b', date: 'October 19, 2026' },
        { shortname: 'c', date: 'Table of Contents' },
      ],
    };
    const rows = build({ specs: ['a', 'b', 'c', 'd'].map((s) => spec({ shortname: s })), webref }).rows;
    expect(rows.map((r) => r.updated)).toEqual(['2026-10-19', '2026-10-19', undefined, undefined]);
  });

  it("leaves out webref's date for an IETF spec, since it's only the date webref crawled it", () => {
    const webref = { date: '2026-10-20T18:50:41.592Z', results: [{ shortname: 'rfc2397', date: '20 October 2026' }, { shortname: 'a', date: '20 October 2026' }] };
    const rows = build({ specs: [spec({ shortname: 'rfc2397', organization: 'IETF' }), spec({ shortname: 'a' })], webref }).rows;
    expect(rows.map((r) => r.updated)).toEqual([undefined, '2026-10-20']);
  });

  it("files each spec by its own BCD record alone, never its series' current level's", () => {
    const specs = [
      spec({ shortname: 'three' }),
      spec({ shortname: 'two' }),
      spec({ shortname: 'one' }),
      spec({ shortname: 'zero' }),
      spec({ shortname: 'old', series: { shortname: 'cur', currentSpecification: 'cur' } }),
      spec({ shortname: 'cur', series: { shortname: 'cur', currentSpecification: 'cur' } }),
    ];
    const file = impl({
      three: record(['gecko', 'webkit', 'blink']),
      two: record(['webkit', 'blink']),
      one: record(['blink']),
      zero: record([]),
      cur: record(['gecko', 'webkit', 'blink']),
    });
    expect(build({ specs, impl: file }).rows.map((r) => [r.shortname, r.bucket, r.engines])).toEqual([
      ['three', '3', ['gecko', 'webkit', 'blink']],
      ['two', '2', ['webkit', 'blink']],
      ['one', '1', ['blink']],
      ['zero', 'none', []],
      ['old', 'nodata', undefined],
      ['cur', '3', ['gecko', 'webkit', 'blink']],
    ]);
  });

  it('takes the WPT pass rates and the tests link from wpt.json', () => {
    const file = wpt({ a: wptSpec });
    const [row, other] = build({ specs: [spec({ shortname: 'a' }), spec({ shortname: 'b' })], wpt: file }).rows;
    expect(row.wpt).toEqual({ firefox: 98.3, safari: 98.2, chrome: 99.4 });
    expect(row.tests).toBe(allUrl(wptSpec, file.runs));
    expect([other.wpt, other.tests]).toEqual([undefined, undefined]);
  });

  it("counts the spec's MDN articles and caniuse features", () => {
    const [row, other] = build({ specs: [spec({ shortname: 'a' }), spec({ shortname: 'b' })], mdn: mdn({ a: [0, 1] }), caniuse: caniuse({ a: ['x'] }) }).rows;
    expect([row.mdn, row.caniuse]).toEqual([2, 1]);
    expect([other.mdn, other.caniuse]).toEqual([0, 0]);
  });

  it("asks the categorizer for each row's category", () => {
    const seen: string[] = [];
    const [row] = build({ specs: [spec({ shortname: 'a' })] }, (s) => {
      seen.push(s.shortname);
      return 'Media';
    }).rows;
    expect(seen).toEqual(['a']);
    expect(row.category).toBe('Media');
  });

  it("records the sources' versions and the build's time", () => {
    expect(build().sources).toEqual({
      built: '2026-10-22T13:00:00.000Z',
      webref: '2026-10-20',
      bcd: '8.1.6',
      mdnContent: '2026-10-22',
      caniuse: '1.0.30001819',
      wpt: { revision: 'abc1234567', date: '2026-10-18' },
      webFeatures: '3.4.0',
    });
  });
});

describe('names', () => {
  const groups = (...names: string[]) => names.map((name) => ({ name, url: 'https://example.test/g' }));

  it('shows the four shorter group names, and keeps the originals for the filter', () => {
    const [css, wicg, rtc, ietf] = build({
      specs: [
        spec({ shortname: 'a', groups: groups('Cascading Style Sheets (CSS) Working Group') }),
        spec({ shortname: 'b', groups: groups('Web Platform Incubator Community Group') }),
        spec({ shortname: 'c', groups: groups('Web Real-Time Communications Working Group', 'Accessible Rich Internet Applications Working Group') }),
        spec({ shortname: 'd', groups: groups('Applications and Real-Time Area') }),
      ],
    }).rows;
    expect(css.groups).toEqual(['CSS Working Group']);
    expect(css.originalGroups).toEqual(['Cascading Style Sheets (CSS) Working Group']);
    expect(wicg.groups).toEqual(['WICG']);
    expect(rtc.groups).toEqual(['Web Real-Time Communications (RTC) Working Group', 'ARIA Working Group']);
    expect(ietf.groups).toEqual(['Applications and Real-Time Area']);
    expect(ietf.originalGroups).toBeUndefined();
  });

  it("renames groups only, never a spec's title", () => {
    const [row] = build({ specs: [spec({ title: 'Accessible Rich Internet Applications (WAI-ARIA) 1.3' })] }).rows;
    expect(row.title).toBe('Accessible Rich Internet Applications (WAI-ARIA) 1.3');
  });

  it('gives the categorizer the original group names', () => {
    const seen: string[][] = [];
    build({ specs: [spec({ groups: groups('Web Platform Incubator Community Group') })] }, (s) => {
      seen.push(s.groups);
      return 'Other';
    });
    expect(seen).toEqual([['Web Platform Incubator Community Group']]);
  });

  it('retitles XMLHttpRequest', () => {
    const [row] = build({ specs: [spec({ shortname: 'xhr', title: 'XMLHttpRequest' })] }).rows;
    expect([row.title, row.fullTitle]).toEqual(['XMLHttpRequest (XHR)', 'XMLHttpRequest (XHR)']);
  });

  it('never lists the W3C Process Document', () =>
    expect(build({ specs: [spec({ shortname: 'w3c-process' }), spec({ shortname: 'a' })] }).rows.map((r) => r.shortname)).toEqual(['a']));
});

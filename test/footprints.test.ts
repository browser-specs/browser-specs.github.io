import { describe, it, expect } from 'vitest';
import type { Backref } from '../src/data/webref.ts';
import {
  buildFootprints, footprintCount, footprintSize, footprintView, indexSpecs, readFootprints, type FootprintExtracts,
} from '../src/logic/footprints.ts';

// browser-specs entries, as index.json has them.
const fetchSpec = {
  shortname: 'fetch', title: 'Fetch Standard', url: 'https://fetch.spec.whatwg.org/', organization: 'WHATWG', standing: 'good',
  series: { shortname: 'fetch', currentSpecification: 'fetch' },
  nightly: { url: 'https://fetch.spec.whatwg.org/', alternateUrls: [] },
  groups: [{ name: 'Fetch Workstream', url: 'https://fetch.spec.whatwg.org/' }],
};
const htmlSpec = {
  shortname: 'html', title: 'HTML Standard', url: 'https://html.spec.whatwg.org/multipage/', organization: 'WHATWG', standing: 'good',
  series: { shortname: 'html', currentSpecification: 'html' },
  nightly: { url: 'https://html.spec.whatwg.org/multipage/', alternateUrls: [], pages: ['https://html.spec.whatwg.org/multipage/parsing.html'] },
  groups: [{ name: 'HTML Workstream', url: 'https://html.spec.whatwg.org/' }],
};
const metadataSpec = {
  shortname: 'fetch-metadata', title: 'Fetch Metadata Request Headers', url: 'https://www.w3.org/TR/fetch-metadata/', organization: 'W3C', standing: 'good',
  series: { shortname: 'fetch-metadata', currentSpecification: 'fetch-metadata' },
  nightly: { url: 'https://w3c.github.io/webappsec-fetch-metadata/', alternateUrls: [] },
  groups: [{ name: 'Web Application Security Working Group', url: 'https://www.w3.org/groups/wg/webappsec/' }],
};

const ref = (shortname: string, title: string, url: string) => ({ shortname, title, url });
const html = ref('html', 'HTML Standard', 'https://html.spec.whatwg.org/multipage/');
const metadata = ref('fetch-metadata', 'Fetch Metadata Request Headers', 'https://www.w3.org/TR/fetch-metadata/');
const self = ref('fetch', 'Fetch Standard', 'https://fetch.spec.whatwg.org/');
const backrefs: Backref[] = [
  { id: 'concept-fetch', href: 'https://fetch.spec.whatwg.org/#concept-fetch', linkingText: ['fetch'], type: 'dfn', for: [], access: 'public', referencedBy: [html, metadata, self] },
  { id: 'concept-request-destination', href: 'https://fetch.spec.whatwg.org/#concept-request-destination', linkingText: ['destination'], type: 'dfn', for: ['request'], access: 'public', referencedBy: [metadata] },
];

const catalog = indexSpecs([fetchSpec, htmlSpec, metadataSpec]);
const extracts = new Map<string, FootprintExtracts>([
  ['fetch', {
    backrefs,
    links: { rawlinks: {}, autolinks: { 'https://html.spec.whatwg.org/multipage/parsing.html': { anchors: ['x'] } } },
    refs: {
      normative: [{ name: 'HTML', url: 'https://html.spec.whatwg.org/multipage/' }, { name: 'NOURL' } as never, { name: 'X', url: 'https://unknown.example/' }],
      informative: [],
    },
    idlparsed: { idlNames: { Request: {} }, idlExtendedNames: { Request: {}, Window: {} } },
  }],
  ['bare', {}],
]);
const file = buildFootprints(extracts, catalog, '2026-10-22T18:48:27.351Z');

describe('indexSpecs', () => {
  it('keeps only the entries with a shortname, title, url, and series', () => {
    const index = indexSpecs([fetchSpec, { shortname: 'x' }, null, 'y']);
    expect(index.specs.map((s) => s.shortname)).toEqual(['fetch']);
    expect(indexSpecs('nope').specs).toEqual([]);
  });
});

describe('buildFootprints', () => {
  it("keeps the crawl's day", () => expect(file.crawled).toBe('2026-10-22'));
  it('keeps no day when the index has none', () => expect(buildFootprints(extracts, catalog, undefined).crawled).toBe(''));
  it('names specs by shortname, with one table of titles and URLs', () => {
    expect(file.footprints.fetch.referencedBy).toEqual(['fetch-metadata', 'html']);
    expect(file.footprints.fetch.usesTermsFrom).toEqual(['html']);
    expect(file.specs.html).toEqual(['HTML Standard', 'https://html.spec.whatwg.org/multipage/']);
    expect(file.specs['fetch-metadata']).toEqual(['Fetch Metadata Request Headers', 'https://www.w3.org/TR/fetch-metadata/']);
  });
  it('keeps a normative reference as its name and a shortname, a URL, or nothing', () =>
    expect(file.footprints.fetch.normativeRefs).toEqual([['HTML', 'html'], ['NOURL'], ['X', 'https://unknown.example/']]));
  it('keeps the interfaces it adds to, and its most-used definitions', () => {
    expect(file.footprints.fetch.extendsInterfaces).toEqual(['Window']);
    expect(file.footprints.fetch.mostUsed).toEqual([
      ['fetch', 'https://fetch.spec.whatwg.org/#concept-fetch', 2],
      ['destination', 'https://fetch.spec.whatwg.org/#concept-request-destination', 1],
    ]);
  });
  it('keeps at most five most-used definitions', () => {
    const many: Backref[] = Array.from({ length: 7 }, (_, i) => ({ ...backrefs[0], id: `d${i}`, linkingText: [`d${i}`] }));
    const big = buildFootprints(new Map([['fetch', { backrefs: many }]]), catalog, undefined);
    expect(big.footprints.fetch.mostUsed).toHaveLength(5);
  });
  it('gives a spec without extracts an empty footprint', () => expect(footprintCount(file, 'bare')).toBe(0));
  it('writes a file its own reader accepts when webref leaves out a title, a URL, or a name', () => {
    const odd = buildFootprints(new Map([['fetch', {
      backrefs: [{ ...backrefs[0], referencedBy: [{ shortname: 'untitled' } as never] }],
      refs: { normative: [{ url: 'https://unknown.example/' } as never], informative: [] },
    }]]), catalog, undefined);
    expect(odd.specs.untitled).toEqual(['untitled', '']);
    expect(odd.footprints.fetch.normativeRefs).toEqual([]);
    expect(() => readFootprints(JSON.parse(JSON.stringify(odd)))).not.toThrow();
  });
});

describe('footprintCount, footprintSize, and footprintView', () => {
  it('counts the other specs that reference it, and nothing for a spec it has no footprint for', () => {
    expect(footprintCount(file, 'fetch')).toBe(2);
    expect(footprintCount(file, 'nope')).toBeUndefined();
    expect(footprintCount(file, 'constructor')).toBeUndefined();
  });
  it('sizes 20 and up large, 3 to 19 medium, and below 3 small', () =>
    expect([20, 19, 3, 2, 0].map(footprintSize)).toEqual(['large', 'medium', 'medium', 'small', 'small']));
  it('expands the slim file back into what the panel shows', () => {
    const view = footprintView(file, 'fetch')!;
    expect(view.referencedBy).toEqual([metadata, html]);
    expect(view.usesTermsFrom).toEqual([html]);
    expect(view.normativeRefs).toEqual([
      { name: 'HTML', url: 'https://html.spec.whatwg.org/multipage/' },
      { name: 'NOURL' },
      { name: 'X', url: 'https://unknown.example/' },
    ]);
    expect(view.mostUsed[0]).toEqual({ term: 'fetch', href: 'https://fetch.spec.whatwg.org/#concept-fetch', count: 2 });
    expect([view.crawlDate, view.specdex]).toEqual(['2026-10-22', 'https://dontcallmedom.github.io/specdex/fetch.html']);
    expect(footprintView(file, 'nope')).toBeUndefined();
  });
});

describe('readFootprints', () => {
  it('reads back what buildFootprints wrote', () => expect(readFootprints(JSON.parse(JSON.stringify(file)))).toEqual(file));
  it('throws on the wrong shape', () => {
    expect(() => readFootprints({ crawled: 1, specs: {}, footprints: {} })).toThrow();
    expect(() => readFootprints({ crawled: '', specs: { a: ['A'] }, footprints: {} })).toThrow();
    expect(() => readFootprints({ crawled: '', specs: {}, footprints: { a: { referencedBy: 'x' } } })).toThrow();
    expect(() => readFootprints(null)).toThrow();
  });
});

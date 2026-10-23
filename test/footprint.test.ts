// From Web Specs Companion's test/footprint.test.ts, with the three specs it uses from its test catalog written out.
import { describe, it, expect } from 'vitest';
import { buildUsedByMap, computeFootprint, specdexUrl, webdexUrl } from '../src/logic/footprint.ts';
import { SpecIndex } from '../src/data/specs.ts';
import type { Backref } from '../src/data/webref.ts';
import type { SlimSpec } from '../src/shared/types.ts';

// The three specs of the extension's test catalog (test/fixtures/catalog.ts) that these tests use.
const base = { organization: 'W3C', standing: 'good', groups: [] as SlimSpec['groups'] };
const specs: SlimSpec[] = [
  {
    ...base,
    shortname: 'fetch-metadata',
    title: 'Fetch Metadata Request Headers',
    url: 'https://www.w3.org/TR/fetch-metadata/',
    series: { shortname: 'fetch-metadata', currentSpecification: 'fetch-metadata', releaseUrl: 'https://www.w3.org/TR/fetch-metadata/', nightlyUrl: 'https://w3c.github.io/webappsec-fetch-metadata/' },
    nightly: { url: 'https://w3c.github.io/webappsec-fetch-metadata/', status: "Editor's Draft", repository: 'https://github.com/w3c/webappsec-fetch-metadata', alternateUrls: [] },
    release: { url: 'https://www.w3.org/TR/fetch-metadata/', status: 'Working Draft' },
    groups: [{ name: 'Web Application Security Working Group', url: 'https://www.w3.org/groups/wg/webappsec/' }],
  },
  {
    ...base,
    organization: 'WHATWG',
    shortname: 'html',
    title: 'HTML Standard',
    url: 'https://html.spec.whatwg.org/multipage/',
    series: { shortname: 'html', currentSpecification: 'html', nightlyUrl: 'https://html.spec.whatwg.org/multipage/' },
    nightly: {
      url: 'https://html.spec.whatwg.org/multipage/',
      status: 'Living Standard',
      repository: 'https://github.com/whatwg/html',
      alternateUrls: [],
      pages: ['https://html.spec.whatwg.org/multipage/parsing.html'],
    },
    groups: [{ name: 'HTML Workstream', url: 'https://html.spec.whatwg.org/' }],
  },
  {
    ...base,
    organization: 'WHATWG',
    shortname: 'fetch',
    title: 'Fetch Standard',
    url: 'https://fetch.spec.whatwg.org/',
    series: { shortname: 'fetch', currentSpecification: 'fetch', nightlyUrl: 'https://fetch.spec.whatwg.org/' },
    nightly: { url: 'https://fetch.spec.whatwg.org/', status: 'Living Standard', repository: 'https://github.com/whatwg/fetch', alternateUrls: [] },
    groups: [{ name: 'Fetch Workstream', url: 'https://fetch.spec.whatwg.org/' }],
    formerNames: ['fetch-old'],
  },
];

const si = new SpecIndex(specs);
const ref = (shortname: string, title: string, url: string) => ({ shortname, title, url });

const backrefs: Backref[] = [
  { id: 'concept-fetch', href: 'https://fetch.spec.whatwg.org/#concept-fetch', linkingText: ['fetch'], type: 'dfn', for: [], access: 'public',
    referencedBy: [ref('html', 'HTML Standard', 'https://html.spec.whatwg.org/multipage/'), ref('fetch-metadata', 'Fetch Metadata Request Headers', 'https://www.w3.org/TR/fetch-metadata/'), ref('fetch', 'Fetch Standard', 'https://fetch.spec.whatwg.org/')] },
  { id: 'concept-request-destination', href: 'https://fetch.spec.whatwg.org/#concept-request-destination', linkingText: ['destination'], type: 'dfn', for: ['request'], access: 'public',
    referencedBy: [ref('fetch-metadata', 'Fetch Metadata Request Headers', 'https://www.w3.org/TR/fetch-metadata/')] },
  { id: 'private-thing', href: 'https://fetch.spec.whatwg.org/#private-thing', linkingText: ['private thing'], type: 'dfn', for: [], access: 'private',
    referencedBy: [ref('html', 'HTML Standard', 'https://html.spec.whatwg.org/multipage/')] },
  { id: 'self-only', href: 'https://fetch.spec.whatwg.org/#self-only', linkingText: ['self only'], type: 'dfn', for: [], access: 'public',
    referencedBy: [ref('fetch', 'Fetch Standard', 'https://fetch.spec.whatwg.org/')] },
];

describe('computeFootprint', () => {
  it("summarizes who references the spec, whose terms it uses, its references, and what it extends", () => {
    const f = computeFootprint({
      backrefs,
      links: {
        rawlinks: { 'https://example.org/': {} },
        autolinks: {
          'https://html.spec.whatwg.org/multipage/parsing.html': { anchors: ['x'] },
          'https://w3c.github.io/webappsec-fetch-metadata/': { anchors: ['y'] },
          'https://fetch.spec.whatwg.org/': { anchors: ['self'] },
          'https://unknown.example/': { anchors: ['z'] },
        },
      },
      refs: { normative: [{ name: 'HTML', url: 'https://html.spec.whatwg.org/multipage/' }], informative: [] },
      idlparsed: { idlNames: { Request: {}, Headers: {} }, idlExtendedNames: { Request: {}, Window: {}, WindowOrWorkerGlobalScope: {} } },
    }, 'fetch', si, { shortname: 'fetch', date: '31 March 2022', revision: 'abc' }, '2026-10-22T18:48:27.351Z');
    expect(f.referencedBy.map((s) => s.shortname)).toEqual(['fetch-metadata', 'html']);
    expect(f.usesTermsFrom.map((s) => s.shortname)).toEqual(['fetch-metadata', 'html']);
    expect(f.normativeRefs).toEqual([{ name: 'HTML', url: 'https://html.spec.whatwg.org/multipage/' }]);
    expect(f.extendsInterfaces).toEqual(['Window', 'WindowOrWorkerGlobalScope']);
    expect(f).toMatchObject({ crawlDate: '2026-10-22', revision: 'abc', specdex: 'https://dontcallmedom.github.io/specdex/fetch.html' });
  });

  it("never takes the crawl date from the date the spec prints", () => {
    expect(computeFootprint({}, 'fetch', si, { shortname: 'fetch', date: '31 March 2022' }).crawlDate).toBeUndefined();
  });

  it('copes with missing extracts', () => {
    expect(computeFootprint({}, 'fetch', si)).toMatchObject({ referencedBy: [], usesTermsFrom: [], normativeRefs: [], extendsInterfaces: [] });
  });
});

describe('buildUsedByMap', () => {
  it('keeps definitions other specs use, with counts and access', () => {
    const m = buildUsedByMap(backrefs, 'fetch', 'fetch');
    expect(Object.keys(m).sort()).toEqual(['concept-fetch', 'concept-request-destination', 'private-thing']);
    expect(m['concept-fetch']).toMatchObject({ count: 2, access: 'public', term: 'fetch', type: 'dfn' });
    expect(m['private-thing']).toMatchObject({ count: 1, access: 'private', webdex: undefined });
  });
});

describe('webdexUrl', () => {
  it('reproduces webdex anchors', () => {
    expect(webdexUrl({ linkingText: ['request'], type: 'dfn', for: [], access: 'public' }, 'fetch'))
      .toBe('https://dontcallmedom.github.io/webdex/r.html#request%40%40fetch%25%25dfn');
    expect(webdexUrl({ linkingText: ['display'], type: 'property', for: [], access: 'public' }, 'css-display'))
      .toBe('https://dontcallmedom.github.io/webdex/d.html#display%40%40%40%40property');
    expect(webdexUrl({ linkingText: ['destination'], type: 'dfn', for: ['request'], access: 'public' }, 'fetch'))
      .toBe('https://dontcallmedom.github.io/webdex/d.html#destination%40%40request%40dfn');
  });
  it('has no anchor for private definitions, which webdex omits', () => {
    expect(webdexUrl({ linkingText: ['x'], type: 'dfn', for: [], access: 'private' }, 'fetch')).toBeUndefined();
  });
  it('builds specdex URLs', () => {
    expect(specdexUrl('CSS2')).toBe('https://dontcallmedom.github.io/specdex/CSS2.html');
  });
});

import { mostUsed, webrefBehind } from '../src/logic/footprint.ts';

describe('mostUsed', () => {
  it('lists the definitions other specs use most, with their anchors', () => {
    const top = mostUsed(buildUsedByMap(backrefs, 'fetch', 'fetch'), 2);
    expect(top.map((d) => [d.term, d.count, d.href])).toEqual([
      ['fetch', 2, 'https://fetch.spec.whatwg.org/#concept-fetch'],
      ['destination', 1, 'https://fetch.spec.whatwg.org/#concept-request-destination'],
    ]);
  });
});

describe('webrefBehind', () => {
  it('is true only when both revisions are known and differ', () => {
    expect(webrefBehind('abc', 'abc')).toBe(false);
    expect(webrefBehind('abc', 'def')).toBe(true);
    expect(webrefBehind(undefined, 'def')).toBe(false);
  });
});

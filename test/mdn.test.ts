import { describe, it, expect } from 'vitest';
import { buildMdn, filterItems, mdnView, type FrontMatter, type MdnFile, type MdnItem } from '../src/logic/mdn.ts';
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

const FETCH = 'https://fetch.spec.whatwg.org/';
const specs = [spec('fetch', FETCH), spec('html', 'https://html.spec.whatwg.org/multipage/')];
const content = { commit: 'a'.repeat(40), date: '2026-10-18' };

const page = (slug: string, title: string, pageType?: string, over: Partial<FrontMatter> = {}): FrontMatter => ({
  title,
  slug,
  ...(pageType ? { pageType } : {}),
  specUrls: [],
  browserCompat: [],
  ...over,
});

describe('buildMdn', () => {
  it("matches a page through its spec-urls, its browser-compat keys, or a feature's mdn_url", () => {
    const bcd = {
      api: {
        Request: {
          __compat: { spec_url: `${FETCH}#request-class`, mdn_url: 'https://developer.mozilla.org/docs/Web/API/Request' },
          body: { __compat: { mdn_url: 'https://developer.mozilla.org/docs/Web/API/Request/body' } },
        },
        Headers: { __compat: { spec_url: `${FETCH}#headers-class`, mdn_url: 'https://developer.mozilla.org/docs/Web/API/Headers' } },
        Gone: { __compat: { spec_url: `${FETCH}#gone`, mdn_url: 'https://developer.mozilla.org/docs/Web/API/Gone' } },
      },
    };
    const file = buildMdn([
      page('Web/API/Fetch_API', 'Fetch API', 'web-api-overview', { specUrls: [FETCH] }),
      page('Web/API/Request', 'Request', 'web-api-interface', { browserCompat: ['api.Request'] }),
      page('Web/API/Headers', 'Headers', 'web-api-interface'),
      page('Web/API/Request/body', 'Request: body property', 'web-api-instance-property', { browserCompat: ['api.Request.body'] }),
      page('Web/API/Unrelated', 'Unrelated', 'web-api-interface', { specUrls: ['https://example.test/'] }),
    ], bcd, specs, content);
    expect(file.content).toEqual(content);
    expect(file.pages.map((p) => p[0])).toEqual(['Web/API/Fetch_API', 'Web/API/Headers', 'Web/API/Request']);
    expect(file.specs).toEqual({ fetch: [0, 1, 2] });
  });

  it("leaves out MDN's pages about itself and its learning area", () => {
    const file = buildMdn([
      page('MDN/Writing_guidelines/Howto', 'How to', 'mdn-writing-guide', { specUrls: [FETCH] }),
      page('Learn_web_development/Fetching', 'Fetching data', 'learn-module-chapter', { specUrls: [FETCH] }),
      page('MDN/Kitchensink', 'The MDN Content Kitchensink', 'web-api-interface', { specUrls: [FETCH] }),
      page('Web/API/Request', 'Request', 'web-api-interface', { specUrls: [FETCH] }),
    ], {}, specs, content);
    expect(file.pages.map((p) => p[0])).toEqual(['Web/API/Request']);
  });

  it("files a page that cites a series URL under the series' current level", () => {
    const grid = (current: string) => ({ shortname: 'css-grid', currentSpecification: current, nightlyUrl: 'https://drafts.csswg.org/css-grid/' });
    const levels = [
      spec('css-grid-1', 'https://www.w3.org/TR/css-grid-1/', { series: grid('css-grid-2') }),
      spec('css-grid-2', 'https://www.w3.org/TR/css-grid-2/', { series: grid('css-grid-2') }),
    ];
    const file = buildMdn([page('Web/CSS/Guides/Grid_layout', 'CSS grid layout', 'css-module', { specUrls: ['https://drafts.csswg.org/css-grid/'] })], {}, levels, content);
    expect(file.specs).toEqual({ 'css-grid-2': [0] });
  });

  it('lists a page once, under each spec it documents, with its page type', () => {
    const file = buildMdn([
      page('Web/HTML/Reference/Elements/a', '<a>: The Anchor element', 'html-element', {
        specUrls: ['https://html.spec.whatwg.org/multipage/text-level-semantics.html#the-a-element', `${FETCH}#x`],
      }),
      page('Web/API/Thing', 'Thing', undefined, { specUrls: [FETCH] }),
    ], {}, specs, content);
    expect(file.types).toEqual(['', 'html-element']);
    expect(file.pages).toEqual([['Web/API/Thing', 'Thing', 0], ['Web/HTML/Reference/Elements/a', '<a>: The Anchor element', 1]]);
    expect(file.specs).toEqual({ fetch: [0, 1], html: [1] });
  });

  it('gives the same file for the same pages in any order', () => {
    const pages = [page('Web/API/B', 'B', 'web-api-interface', { specUrls: [FETCH] }), page('Web/API/A', 'A', 'guide', { specUrls: [FETCH] })];
    const once = JSON.stringify(buildMdn(pages, {}, specs, content));
    expect(JSON.stringify(buildMdn([...pages].reverse(), {}, specs, content))).toBe(once);
  });
});

const DOCS = 'https://developer.mozilla.org/docs/';

const fetchFile = () => buildMdn([
  page('Web/API/Fetch_API', 'Fetch API', 'web-api-overview', { specUrls: [FETCH] }),
  page('Web/API/Fetch_API/Using_Fetch', 'Using the Fetch API', 'guide', { specUrls: [FETCH] }),
  page('Web/API/Request', 'Request', 'web-api-interface', { specUrls: [FETCH] }),
  page('Web/API/Request/Request', 'Request: Request() constructor', 'web-api-constructor', { specUrls: [FETCH] }),
  page('Web/API/Request/body', 'Request: body property', 'web-api-instance-property', { specUrls: [FETCH] }),
  page('Web/API/Headers', 'Headers', 'web-api-interface', { specUrls: [FETCH] }),
  page('Web/API/Headers/entries/Iterator', 'Headers entries iterator', 'web-api-instance-method', { specUrls: [FETCH] }),
  page('Web/API/Window/fetch', 'Window: fetch() method', 'web-api-instance-method', { specUrls: [FETCH] }),
  page('Web/HTTP/Reference/Headers/Accept', 'Accept header', 'http-header', { specUrls: [FETCH] }),
  page('Glossary', 'Glossary', 'some-new-type', { specUrls: [FETCH] }),
], {}, specs, content);

describe('mdnView', () => {
  it('puts the overviews first, then a section for each kind of page, with members nested and their titles shortened', () => {
    const view = mdnView(fetchFile(), 'fetch')!;
    expect(view.count).toBe(10);
    expect(view.content).toEqual(content);
    expect(view.overviews).toEqual([{ title: 'Fetch API', url: `${DOCS}Web/API/Fetch_API` }]);
    expect(view.sections.map((s) => [s.name, s.items.map((i) => i.title)])).toEqual([
      ['Guides', ['Using the Fetch API']],
      ['Interfaces', ['Headers', 'Request']],
      ['Methods', ['Window: fetch() method']],
      ['HTTP headers', ['Accept header']],
      ['Other', ['Glossary']],
    ]);
    const [headers, request] = view.sections[1].items;
    expect(request).toEqual({
      title: 'Request',
      url: `${DOCS}Web/API/Request`,
      count: 2,
      children: [
        { title: 'body property', url: `${DOCS}Web/API/Request/body`, children: [], count: 0 },
        { title: 'Request() constructor', url: `${DOCS}Web/API/Request/Request`, children: [], count: 0 },
      ],
    });
    expect(headers.children.map((c) => c.title)).toEqual(['Headers entries iterator']);
  });

  it('sorts by title, case-insensitively and with backticks ignored', () => {
    const css = (slug: string, title: string) => page(`Web/CSS/Reference/Properties/${slug}`, title, 'css-property', { specUrls: [FETCH] });
    const file = buildMdn([css('grid', '`grid` CSS property'), css('column-gap', '`column-gap` CSS property'), css('Align', 'align-content CSS property')], {}, specs, content);
    expect(mdnView(file, 'fetch')!.sections[0].items.map((i) => i.title)).toEqual([
      'align-content CSS property',
      '`column-gap` CSS property',
      '`grid` CSS property',
    ]);
  });

  it('shows a spec whose only pages are overviews with no sections', () => {
    const file = buildMdn([page('Web/CSS/Guides/Display', 'CSS display', 'css-module', { specUrls: [FETCH] })], {}, specs, content);
    expect(mdnView(file, 'fetch')).toEqual({ count: 1, overviews: [{ title: 'CSS display', url: `${DOCS}Web/CSS/Guides/Display` }], sections: [], content });
  });

  it("checks a stored copy's indexes and shape, and answers undefined when nothing fits", () => {
    const file = fetchFile();
    const stored = { ...file, specs: { fetch: [2, 99, -1, 0.5], broken: [99] } } as MdnFile;
    expect(mdnView(stored, 'fetch')!.count).toBe(1);
    expect(mdnView(stored, 'broken')).toBeUndefined();
    expect(mdnView({ ...file, pages: [['x', 'X', 99]] } as unknown as MdnFile, 'fetch')).toBeUndefined();
    expect(mdnView({ ...file, content: undefined } as unknown as MdnFile, 'fetch')).toBeUndefined();
    expect(mdnView({ ...file, content: { commit: 1, date: '2026-10-18' } } as unknown as MdnFile, 'fetch')).toBeUndefined();
    expect(mdnView(file, 'constructor')).toBeUndefined();
    expect(mdnView(file, 'nope')).toBeUndefined();
    expect(mdnView(null as unknown as MdnFile, 'fetch')).toBeUndefined();
  });
});

describe('filterItems', () => {
  it('keeps the matches and their ancestors, case-insensitively and with backticks ignored, and recounts them', () => {
    const items = mdnView(fetchFile(), 'fetch')!.sections[1].items;
    expect(filterItems(items, 'BODY')).toEqual([{ ...items[1], count: 1, children: [items[1].children[0]] }]);
    expect(filterItems(items, 'headers').map((i) => i.title)).toEqual(['Headers']);
    expect(filterItems(items, 'zzz')).toEqual([]);
    const code: MdnItem[] = [{ title: '`grid` CSS property', url: 'u', children: [], count: 0 }];
    expect(filterItems(code, 'grid css')).toEqual(code);
  });

  it('leaves the items as they are for an empty or blank query', () => {
    const items = mdnView(fetchFile(), 'fetch')!.sections[1].items;
    expect(filterItems(items, '')).toBe(items);
    expect(filterItems(items, '   ')).toBe(items);
  });
});

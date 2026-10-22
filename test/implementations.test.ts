import { describe, it, expect } from 'vitest';
import { buildImplementations, forEachFeature, LACKS_CAP, matchSpecUrl, normalizeUrl, ships, specUrlIndex, type ImplRecord } from '../src/logic/implementations.ts';
import type { SlimSpec } from '../src/shared/types.ts';

const spec = (shortname: string, over: Partial<SlimSpec> = {}): SlimSpec => ({
  shortname,
  title: shortname,
  url: `https://example.test/${shortname}/`,
  organization: 'W3C',
  standing: 'good',
  groups: [],
  series: { shortname, currentSpecification: shortname },
  ...over,
});

describe('normalizeUrl', () => {
  it('drops the scheme, www., the query and fragment, index and Overview pages, and trailing slashes', () => {
    expect(normalizeUrl('https://www.w3.org/TR/css-grid-2/Overview.html#grid')).toBe('w3.org/TR/css-grid-2');
    expect(normalizeUrl('http://drafts.csswg.org/css-grid-3/index.html')).toBe('drafts.csswg.org/css-grid-3');
    expect(normalizeUrl('https://example.test/a/index.htm')).toBe('example.test/a');
    expect(normalizeUrl('https://fetch.spec.whatwg.org/?a=1#b')).toBe('fetch.spec.whatwg.org');
  });
});

describe('matchSpecUrl', () => {
  const grid = (currentSpecification: string) => ({ shortname: 'css-grid', currentSpecification, nightlyUrl: 'https://drafts.csswg.org/css-grid/' });
  const index = specUrlIndex([
    spec('a'),
    spec('a-b', { url: 'https://example.test/a/b/' }),
    spec('html', {
      url: 'https://html.spec.whatwg.org/multipage/',
      nightly: { url: 'https://html.spec.whatwg.org/multipage/', alternateUrls: ['https://html.spec.whatwg.org/'], pages: ['https://html.spec.whatwg.org/multipage/semantics.html'] },
    }),
    spec('grid-1', { url: 'https://www.w3.org/TR/css-grid-1/', series: grid('grid-2') }),
    spec('grid-2', { url: 'https://www.w3.org/TR/css-grid-2/', series: grid('grid-2') }),
    spec('series-claims-own', { series: { shortname: 's', currentSpecification: 'series-claims-own', nightlyUrl: 'https://example.test/own/' } }),
    spec('own'),
    spec('first', { nightly: { url: 'https://example.test/shared/', alternateUrls: [] } }),
    spec('second', { nightly: { url: 'https://example.test/shared/', alternateUrls: [] } }),
  ]);

  it('matches the longest URL a spec URL starts with, at a path boundary', () => {
    expect(matchSpecUrl(index, 'https://example.test/a/b/c.html#x')).toBe('a-b');
    expect(matchSpecUrl(index, 'https://example.test/a/c.html#x')).toBe('a');
    expect(matchSpecUrl(index, 'https://example.test/ab/')).toBeUndefined();
  });

  it('matches multipage pages and alternate URLs', () => {
    expect(matchSpecUrl(index, 'https://html.spec.whatwg.org/multipage/semantics.html#the-a-element')).toBe('html');
    expect(matchSpecUrl(index, 'https://html.spec.whatwg.org/#the-a-element')).toBe('html');
  });

  it("sends a series URL to the series' current level", () => {
    expect(matchSpecUrl(index, 'https://drafts.csswg.org/css-grid/#grid-template')).toBe('grid-2');
  });

  it("prefers a spec's own URL to a series URL, and otherwise the first spec to claim a URL", () => {
    expect(matchSpecUrl(index, 'https://example.test/own/#x')).toBe('own');
    expect(matchSpecUrl(index, 'https://example.test/shared/#x')).toBe('first');
  });

  it('matches nothing on a host no spec lives on', () => {
    expect(matchSpecUrl(index, 'https://unknown.test/a/')).toBeUndefined();
  });
});

describe('ships', () => {
  const v = (version_added: unknown, extra: object = {}) => ({ version_added, ...extra });
  const flag = { flags: [{ type: 'preference', name: 'x' }] };

  it('counts a release on desktop or mobile', () => {
    expect(ships({ firefox: v('120') }, 'gecko')).toBe(true);
    expect(ships({ firefox: v(false), firefox_android: v('79') }, 'gecko')).toBe(true);
    expect(ships({ safari_ios: v(true) }, 'webkit')).toBe(true);
    expect(ships({ chrome: v('1') }, 'gecko')).toBe(false);
  });

  it("doesn't count a preview, a flag, a removal, or an unknown version", () => {
    expect(ships({ chrome: v('preview') }, 'blink')).toBe(false);
    expect(ships({ chrome: v('100', flag) }, 'blink')).toBe(false);
    expect(ships({ chrome: v('51', { version_removed: '92' }) }, 'blink')).toBe(false);
    expect(ships({ chrome: v(null) }, 'blink')).toBe(false);
    expect(ships({ chrome: v(false) }, 'blink')).toBe(false);
    expect(ships({ chrome: v('') }, 'blink')).toBe(false);
    expect(ships(undefined, 'blink')).toBe(false);
  });

  it('counts an empty list of flags as no flag', () => {
    expect(ships({ chrome: v('100', { flags: [] }) }, 'blink')).toBe(true);
  });

  it('counts prefixed, alternative-name, and partial support', () => {
    expect(ships({ safari: v('3', { prefix: '-webkit-' }) }, 'webkit')).toBe(true);
    expect(ships({ firefox: v('20', { alternative_name: 'mozFoo' }) }, 'gecko')).toBe(true);
    expect(ships({ chrome: v('80', { partial_implementation: true }) }, 'blink')).toBe(true);
  });

  it('counts a list of statements when any one of them is a release', () => {
    expect(ships({ firefox: [v('100', flag), v('110')] }, 'gecko')).toBe(true);
    expect(ships({ firefox: [v('90', { prefix: '-moz-', version_removed: '95' }), v('80', flag)] }, 'gecko')).toBe(false);
  });
});

describe('buildImplementations', () => {
  const meta = { version: '8.1.6', timestamp: '2026-10-15T10:11:12.000Z' };
  const released = (...browsers: string[]) => Object.fromEntries(browsers.map((b) => [b, { version_added: '1' }]));
  const all = released('firefox', 'safari', 'chrome');
  const feature = (specUrl: string | string[], support: Record<string, unknown>, extra: object = {}) => ({ __compat: { spec_url: specUrl, support, ...extra } });
  const A = 'https://example.test/a/#x';
  const B = 'https://example.test/b/#y';
  const build = (tree: Record<string, unknown>) => buildImplementations({ __meta: meta, ...tree }, [spec('a'), spec('b'), spec('c')]);

  it("keeps BCD's version and timestamp, and has a record, in shortname order, for each spec with features", () => {
    const file = build({ api: { Z: feature(B, all), Y: feature(A, all) } });
    expect(file.bcd).toEqual(meta);
    expect(Object.keys(file.specs)).toEqual(['a', 'b']);
  });

  it('throws on data without a version and a timestamp', () => {
    expect(() => buildImplementations({ api: {} }, [])).toThrow(/__meta/);
  });

  it('makes the core the features at least two engines ship, and lists what a gray engine lacks of it', () => {
    const file = build({
      api: {
        W: feature(A, all),
        X: feature(A, released('safari', 'chrome'), { mdn_url: 'https://developer.mozilla.org/docs/Web/API/X' }),
        Y: feature(A, released('safari_ios', 'chrome_android')),
        Z: feature(A, released('chrome')),
      },
    });
    const expected: ImplRecord = {
      engines: ['webkit', 'blink'],
      basis: 'shared',
      core: 3,
      ships: { gecko: 1, webkit: 3, blink: 3 },
      lacks: { gecko: { features: [{ key: 'api.X', mdn: 'https://developer.mozilla.org/docs/Web/API/X' }, { key: 'api.Y' }], more: 0 } },
    };
    expect(file.specs.a).toEqual(expected);
  });

  it('counts an engine that ships exactly half the core as implementing the spec', () => {
    const file = build({ api: { X: feature(A, all), Y: feature(A, released('safari', 'chrome')) } });
    expect(file.specs.a.engines).toEqual(['gecko', 'webkit', 'blink']);
    expect(file.specs.a.lacks).toEqual({});
  });

  it('falls back to the features any engine ships when no two engines ship the same one', () => {
    const file = build({ api: { X: feature(A, released('chrome')), Y: feature(A, released('chrome')), Z: feature(A, released('safari')) } });
    expect(file.specs.a).toMatchObject({ engines: ['blink'], basis: 'any', core: 3, ships: { gecko: 0, webkit: 1, blink: 2 } });
  });

  it('grays out every engine when no engine ships any of the features', () => {
    const file = build({ api: { X: feature(A, { firefox: { version_added: false } }), Y: feature(A, { chrome: { version_added: 'preview' } }) } });
    const lacking = { features: [{ key: 'api.X' }, { key: 'api.Y' }], more: 0 };
    const expected: ImplRecord = { engines: [], basis: 'none', core: 2, ships: { gecko: 0, webkit: 0, blink: 0 }, lacks: { gecko: lacking, webkit: lacking, blink: lacking } };
    expect(file.specs.a).toEqual(expected);
  });

  it('folds a feature into any ancestor that counts for the same spec, and keeps it when its ancestors count only for other specs', () => {
    const file = build({
      api: {
        Foo: {
          ...feature(A, all),
          bar: { ...feature(B, all), baz: feature(A, released('safari', 'chrome')) },
          qux: feature(A, released('safari', 'chrome')),
        },
      },
    });
    expect(file.specs.a).toMatchObject({ engines: ['gecko', 'webkit', 'blink'], core: 1 });
    expect(file.specs.b).toMatchObject({ engines: ['gecko', 'webkit', 'blink'], core: 1 });
  });

  it("skips deprecated features, BCD's browsers tree, and spec URLs that match no spec", () => {
    const file = build({
      api: {
        Old: feature(A, released('safari', 'chrome'), { status: { deprecated: true } }),
        New: feature(A, all),
        Elsewhere: feature('https://unknown.test/', all),
      },
      browsers: { firefox: feature(B, all) },
    });
    expect(Object.keys(file.specs)).toEqual(['a']);
    expect(file.specs.a.core).toBe(1);
  });

  it('counts a feature once for each spec its spec URLs match', () => {
    const file = build({ api: { X: feature([A, B, 'https://example.test/a/#z'], all) } });
    expect(file.specs.a.core).toBe(1);
    expect(file.specs.b.core).toBe(1);
  });

  it('lists at most 40 lacking features, and counts the rest', () => {
    const many = Object.fromEntries(Array.from({ length: LACKS_CAP + 5 }, (_, i) => [`F${String(i).padStart(2, '0')}`, feature(A, released('safari', 'chrome'))]));
    const lacks = build({ api: many }).specs.a.lacks.gecko!;
    expect(lacks.features).toHaveLength(40);
    expect(lacks.features[0]).toEqual({ key: 'api.F00' });
    expect(lacks.more).toBe(5);
  });

  it('grays out Firefox on Referrer Policy, whose policy values BCD records Firefox as having removed', () => {
    const rp = 'https://w3c.github.io/webappsec-referrer-policy/';
    const html = 'https://html.spec.whatwg.org/multipage/';
    const values = ['no-referrer-when-downgrade', 'origin-when-cross-origin', 'unsafe-url'];
    const removedInFirefox = { chrome: { version_added: '51' }, safari: { version_added: '11.1' }, firefox: { version_added: '50', version_removed: '92' } };
    const interfaces = ['HTMLAnchorElement', 'HTMLAreaElement', 'HTMLIFrameElement', 'HTMLImageElement', 'HTMLLinkElement', 'HTMLScriptElement'];
    const api = Object.fromEntries(interfaces.map((i) => [i, {
      referrerPolicy: {
        ...feature(`${html}urls-and-fetching.html#referrer-policy-attributes`, all),
        ...Object.fromEntries(values.map((v) => [v, feature(`${rp}#referrer-policy-${v}`, removedInFirefox)])),
      },
    }]));
    const elements = Object.fromEntries(['a', 'img'].map((e) => [e, {
      referrerpolicy: { ...feature(`${html}links.html#attr-hyperlink-referrerpolicy`, all), 'unsafe-url': feature(`${rp}#referrer-policy-unsafe-url`, released('chrome')) },
    }]));
    const file = buildImplementations({
      __meta: meta,
      api,
      html: { elements: { ...elements, meta: { name: feature(`${rp}#referrer-policy-delivery-meta`, all) } } },
      http: {
        headers: {
          'Referrer-Policy': {
            ...feature(`${rp}#referrer-policy-header`, all),
            ...Object.fromEntries(values.map((v) => [v, feature(`${rp}#referrer-policy-${v}`, released('chrome'))])),
          },
          Referer: { length_limit_4096B: feature(`${rp}#referrer-policy-delivery`, all) },
        },
      },
    }, [spec('html', { url: html }), spec('referrer-policy', { url: 'https://www.w3.org/TR/referrer-policy/', nightly: { url: rp, alternateUrls: [] } })]);
    expect(file.specs['referrer-policy']).toMatchObject({ engines: ['webkit', 'blink'], basis: 'shared', core: 21, ships: { gecko: 3, webkit: 21, blink: 21 } });
    expect(file.specs['referrer-policy'].lacks.gecko?.features).toHaveLength(18);
    expect(file.specs.html.engines).toEqual(['gecko', 'webkit', 'blink']);
  });

  it('counts Firefox as shipping Web Share, which it ships only on Android', () => {
    const ws = 'https://w3c.github.io/web-share/';
    const support = {
      chrome: { version_added: '89' },
      safari: { version_added: '12.1' },
      firefox: { version_added: '71', flags: [{ type: 'preference', name: 'dom.webshare.enabled' }] },
      firefox_android: { version_added: '79' },
    };
    const file = buildImplementations(
      { __meta: meta, api: { Navigator: { share: feature(`${ws}#share-method`, support), canShare: feature(`${ws}#canshare-method`, support) } } },
      [spec('web-share', { url: ws })],
    );
    expect(file.specs['web-share'].engines).toEqual(['gecko', 'webkit', 'blink']);
  });
});

describe('forEachFeature', () => {
  it("visits each feature in the file's order, outside BCD's list of browsers and its __meta", () => {
    const seen: string[] = [];
    const bcd = { __meta: { version: '1' }, browsers: { chrome: { __compat: {} } }, api: { A: { __compat: {}, b: { __compat: {} } }, C: { __compat: {} } } };
    forEachFeature(bcd, (key) => seen.push(key));
    expect(seen).toEqual(['api.A', 'api.A.b', 'api.C']);
  });
});

import { describe, it, expect } from 'vitest';
import type { Fetch } from '../scripts/fetch.ts';
import { fetchSpecPages, readPageCache, SPECREF, specrefEditors, withSpecref, type PageCache } from '../scripts/specpages.ts';

// Answers each URL with its handler's response, a 404 for any other, and records what was asked, with its headers.
function fake(handlers: Record<string, (headers: Headers) => Response | Promise<Response>>) {
  const asked: { url: string; headers: Headers }[] = [];
  const fetchUrl: Fetch = async (url, init) => {
    const headers = new Headers(init?.headers);
    asked.push({ url, headers });
    const handler = handlers[url];
    return handler ? handler(headers) : new Response('', { status: 404 });
  };
  return { asked, fetchUrl };
}

// A parser that reports the page's length as its abstract, so a test can see how much of the page it got.
const parse = (html: string) => ({ abstract: [`${html.length}:${html.slice(0, 5)}`] });

const A = 'https://example.test/a/';

describe('fetchSpecPages', () => {
  it('reads only the start of each page, and keeps its validators', async () => {
    const f = fake({ [A]: () => new Response('x'.repeat(100), { headers: { ETag: '"v1"', 'Last-Modified': 'Sat, 24 Oct 2026 10:00:00 GMT' } }) });
    const cache = await fetchSpecPages(f.fetchUrl, [{ shortname: 'a', url: A }], {}, parse, { bytes: 40 });
    expect(cache).toEqual({
      a: { url: A, etag: '"v1"', lastModified: 'Sat, 24 Oct 2026 10:00:00 GMT', facts: { abstract: ['40:xxxxx'] } },
    });
  });

  it("asks only for a change since the last build's copy, and keeps that copy on a 304", async () => {
    const before: PageCache = { a: { url: A, etag: '"v1"', lastModified: 'Sat, 24 Oct 2026 10:00:00 GMT', facts: { abstract: ['old'] } } };
    const f = fake({ [A]: () => new Response(null, { status: 304 }) });
    const cache = await fetchSpecPages(f.fetchUrl, [{ shortname: 'a', url: A }], before, parse);
    expect(cache).toEqual(before);
    expect(f.asked[0].headers.get('If-None-Match')).toBe('"v1"');
    expect(f.asked[0].headers.get('If-Modified-Since')).toBe('Sat, 24 Oct 2026 10:00:00 GMT');
  });

  it('asks for the whole page again once its URL has changed', async () => {
    const before: PageCache = { a: { url: 'https://old.test/a/', etag: '"v1"', facts: {} } };
    const f = fake({ [A]: () => new Response('<p>new</p>') });
    const cache = await fetchSpecPages(f.fetchUrl, [{ shortname: 'a', url: A }], before, parse);
    expect(f.asked[0].headers.has('If-None-Match')).toBe(false);
    expect(cache.a).toEqual({ url: A, facts: { abstract: ['10:<p>ne'] } });
  });

  it("keeps the last build's copy of a page that fails to load, and has nothing for one it never had", async () => {
    const before: PageCache = { a: { url: A, facts: { abstract: ['old'] } } };
    const f = fake({
      [A]: () => new Response('', { status: 503 }),
      'https://example.test/b/': () => Promise.reject(new TypeError('fetch failed')),
    });
    const pages = [{ shortname: 'a', url: A }, { shortname: 'b', url: 'https://example.test/b/' }];
    const cache = await fetchSpecPages(f.fetchUrl, pages, before, parse);
    expect(cache).toEqual({ a: before.a, b: { url: 'https://example.test/b/', facts: {} } });
  });

  it('never has more than limit fetches in flight', async () => {
    let now = 0;
    let most = 0;
    const fetchUrl: Fetch = async () => {
      most = Math.max(most, ++now);
      await new Promise((r) => setTimeout(r, 1));
      now--;
      return new Response('page');
    };
    const pages = Array.from({ length: 30 }, (_, i) => ({ shortname: `s${i}`, url: `https://example.test/${i}/` }));
    const cache = await fetchSpecPages(fetchUrl, pages, {}, parse, { limit: 4 });
    expect(most).toBe(4);
    expect(Object.keys(cache)).toHaveLength(30);
  });
});

describe('readPageCache', () => {
  it('keeps the entries of the right shape, and treats anything else as no cache at all', () => {
    const good = { url: A, etag: '"v1"', facts: { abstract: ['A.'], editors: [{ name: 'Anne' }] } };
    expect(readPageCache({ a: good, b: { url: 7 }, c: { url: A, facts: { editors: 'x' } } })).toEqual({ a: good });
    expect(readPageCache([1])).toEqual({});
    expect(readPageCache(undefined)).toEqual({});
  });
});

describe('specrefEditors', () => {
  const url = (refs: string[]) => SPECREF + refs.join(',');

  it("gives Specref's authors for each spec, following an alias to the entry it names", async () => {
    const f = fake({
      [url(['dom', 'rfc6455', 'nope'])]: () => Response.json({ dom: { aliasOf: 'DOM' }, rfc6455: { authors: ['I. Fette', 'A. Melnikov'] } }),
      [url(['DOM'])]: () => Response.json({ DOM: { authors: ['Anne van Kesteren'] } }),
    });
    const editors = await specrefEditors(f.fetchUrl, ['dom', 'rfc6455', 'nope']);
    expect([...editors]).toEqual([
      ['dom', [{ name: 'Anne van Kesteren' }]],
      ['rfc6455', [{ name: 'I. Fette' }, { name: 'A. Melnikov' }]],
    ]);
  });

  it('gives nothing when Specref fails, rather than failing the build', async () => {
    const f = fake({ [url(['dom'])]: () => new Response('', { status: 500 }) });
    expect((await specrefEditors(f.fetchUrl, ['dom'])).size).toBe(0);
  });

  it('asks for nothing when no spec needs it', async () => {
    const f = fake({});
    expect((await specrefEditors(f.fetchUrl, [])).size).toBe(0);
    expect(f.asked).toEqual([]);
  });
});

describe('withSpecref', () => {
  it("fills in Specref's editors only for a page that names none", () => {
    const cache: PageCache = { a: { url: A, facts: { editors: [{ name: 'Page' }] } }, b: { url: A, facts: { abstract: ['B.'] } } };
    const specref = new Map([['a', [{ name: 'Specref' }]], ['b', [{ name: 'Specref' }]]]);
    expect([...withSpecref(cache, specref)]).toEqual([
      ['a', { editors: [{ name: 'Page' }] }],
      ['b', { abstract: ['B.'], editors: [{ name: 'Specref' }] }],
    ]);
  });
});

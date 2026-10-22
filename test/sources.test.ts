import { describe, it, expect } from 'vitest';
import { BROWSER_SPECS, fetchSources, WEB_FEATURES_LATEST, WEBREF_ED, webFeaturesUrl, WSC_DATA } from '../scripts/sources.ts';

type Answers = Record<string, { status?: number; body: unknown }>;

const answers = (): Answers => ({
  [BROWSER_SPECS]: { body: [] },
  [WEBREF_ED]: { body: { date: '2026-10-20T18:50:41.592Z', results: [] } },
  [WSC_DATA + 'implementations.json']: { body: { i: 1 } },
  [WSC_DATA + 'mdn.json']: { body: { m: 1 } },
  [WSC_DATA + 'caniuse.json']: { body: { c: 1 } },
  [WSC_DATA + 'wpt.json']: { body: { w: 1 } },
  [WEB_FEATURES_LATEST]: { body: { name: 'web-features', version: '3.4.0' } },
  [webFeaturesUrl('3.4.0')]: { body: { features: {}, groups: {} } },
});

function fake(a: Answers) {
  const asked: string[] = [];
  const fetchUrl = async (url: string) => {
    asked.push(url);
    const x = a[url];
    return x ? new Response(JSON.stringify(x.body), { status: x.status ?? 200 }) : new Response('', { status: 404 });
  };
  return { asked, fetchUrl };
}

describe('fetchSources', () => {
  it('fetches every source, and web-features at the version npm names as its latest', async () => {
    const a = answers();
    const f = fake(a);
    const s = await fetchSources(f.fetchUrl);
    expect([...f.asked].sort()).toEqual(Object.keys(a).sort());
    expect(s.webFeatures).toEqual({ version: '3.4.0', data: { features: {}, groups: {} } });
    expect(s.mdn).toEqual({ m: 1 });
    expect(s.webref).toEqual({ date: '2026-10-20T18:50:41.592Z', results: [] });
  });

  it('throws on an HTTP error', async () => {
    const a = answers();
    a[WEBREF_ED] = { status: 503, body: {} };
    await expect(fetchSources(fake(a).fetchUrl)).rejects.toThrow('HTTP 503 for https://w3c.github.io/webref/ed/index.json');
  });

  it('throws when npm names no web-features version', async () => {
    const a = answers();
    a[WEB_FEATURES_LATEST] = { body: { name: 'web-features' } };
    await expect(fetchSources(fake(a).fetchUrl)).rejects.toThrow('no version in https://registry.npmjs.org/web-features/latest');
  });
});

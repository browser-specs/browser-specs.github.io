// Fetches everything the site is built from: browser-specs, for the list of specs; webref's crawl of the editors'
// drafts, for the date each spec prints; the four data files Web Specs Companion builds every hour from BCD,
// mdn/content, caniuse-db, and wpt.fyi, for the engines, MDN articles, Can I Use features, and test results; and
// web-features, at the exact version the npm registry names as its latest, for the category guesses.
import { getJson, type Fetch } from './fetch.ts';

export const BROWSER_SPECS = 'https://w3c.github.io/browser-specs/index.json';
export const WEBREF_ED = 'https://w3c.github.io/webref/ed/index.json';
export const WSC_DATA = 'https://sideshowbarker.net/web-specs-companion/data/';
export const WEB_FEATURES_LATEST = 'https://registry.npmjs.org/web-features/latest';
export const webFeaturesUrl = (version: string) => `https://cdn.jsdelivr.net/npm/web-features@${version}/data.json`;

export interface Sources {
  specs: unknown;
  webref: unknown;
  implementations: unknown;
  mdn: unknown;
  caniuse: unknown;
  wpt: unknown;
  webFeatures: { version: string; data: unknown };
}

async function webFeatures(fetchUrl: Fetch): Promise<Sources['webFeatures']> {
  const { version } = (await getJson(fetchUrl, WEB_FEATURES_LATEST)) as { version?: unknown };
  if (typeof version !== 'string') throw new Error(`no version in ${WEB_FEATURES_LATEST}`);
  return { version, data: await getJson(fetchUrl, webFeaturesUrl(version)) };
}

export async function fetchSources(fetchUrl: Fetch): Promise<Sources> {
  const get = (url: string) => getJson(fetchUrl, url);
  const [specs, webref, implementations, mdn, caniuse, wpt, features] = await Promise.all([
    get(BROWSER_SPECS),
    get(WEBREF_ED),
    get(WSC_DATA + 'implementations.json'),
    get(WSC_DATA + 'mdn.json'),
    get(WSC_DATA + 'caniuse.json'),
    get(WSC_DATA + 'wpt.json'),
    webFeatures(fetchUrl),
  ]);
  return { specs, webref, implementations, mdn, caniuse, wpt, webFeatures: features };
}

// Fetches the start of each listed spec's page, for the abstract and editors its spec panel shows, and for each spec
// whose page names no editors, its WHATWG workstream's editors or else Specref's authors. The abstract and the
// editors' names come before any page's table of contents, well inside its first PAGE_BYTES, so the rest of the page
// isn't read at all. And the build asks each server only for a change since the copy the last build deployed, in
// data/spec-pages.json. A page that fails to load keeps that copy, and never fails the build, since some spec's server
// is always down somewhere.
import { Window } from 'happy-dom';
import { readSpecPage, readWebglExtension, type Editor, type PageFacts } from '../src/logic/specpage.ts';
import type { Fetch } from './fetch.ts';

export const PAGE_CACHE = 'https://browser-specs.github.io/data/spec-pages.json';
export const WEBGL_SOURCE = 'https://raw.githubusercontent.com/KhronosGroup/WebGL/main/';
export const SPECREF = 'https://api.specref.org/bibrefs?refs=';
export const WHATWG_DB = 'https://raw.githubusercontent.com/whatwg/sg/main/db.json';
export const PAGE_BYTES = 256 * 1024;
export const PAGE_LIMIT = 16;
export const PAGE_TIMEOUT = 30_000;
const USER_AGENT = 'browser-specs.github.io (+https://github.com/browser-specs/browser-specs.github.io)';

// The version of what reads a page, which goes up whenever the reading changes what it finds, so the next build reads
// every page in full again rather than keep the copies an older reading made.
export const READER = 3;

export interface CachedPage {
  url: string;
  reader?: number;
  etag?: string;
  lastModified?: string;
  facts: PageFacts;
}

export type PageCache = Record<string, CachedPage>;

export type SourceKind = 'html' | 'webgl-extension';

// Where the build reads a page from. The Cloudflare in front of registry.khronos.org answers GitHub's runners with a
// 403, so a WebGL extension comes from the extension.xml its page is made from, and a WebGL spec from its source, both
// in the WebGL repo.
export function pageSource(url: string): { url: string; kind: SourceKind } {
  const extension = /^https:\/\/registry\.khronos\.org\/webgl\/extensions\/(\w+)\/$/.exec(url);
  if (extension) return { url: `${WEBGL_SOURCE}extensions/${extension[1]}/extension.xml`, kind: 'webgl-extension' };
  const spec = /^https:\/\/registry\.khronos\.org\/webgl\/(specs\/latest\/[\d.]+)\/$/.exec(url);
  if (spec) return { url: `${WEBGL_SOURCE}${spec[1]}/index.html`, kind: 'html' };
  return { url, kind: 'html' };
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isStrings = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === 'string');
const isEditors = (v: unknown) =>
  Array.isArray(v) && v.every((e) => isObject(e) && typeof e.name === 'string' && (e.org === undefined || typeof e.org === 'string'));

function isCachedPage(v: unknown): v is CachedPage {
  if (!isObject(v) || typeof v.url !== 'string' || !isObject(v.facts)) return false;
  if ([v.etag, v.lastModified].some((h) => h !== undefined && typeof h !== 'string')) return false;
  if (v.reader !== undefined && typeof v.reader !== 'number') return false;
  return (v.facts.abstract === undefined || isStrings(v.facts.abstract)) && (v.facts.editors === undefined || isEditors(v.facts.editors));
}

// The last build's copies, without any entry of the wrong shape; and for a file of the wrong shape, none.
export function readPageCache(raw: unknown): PageCache {
  if (!isObject(raw)) return {};
  return Object.fromEntries(Object.entries(raw).filter((e): e is [string, CachedPage] => isCachedPage(e[1])));
}

// The deployed site's copies, or none at all when it has none or doesn't answer.
export async function fetchPageCache(fetchUrl: Fetch): Promise<PageCache> {
  try {
    const res = await fetchUrl(PAGE_CACHE);
    if (res.ok) return readPageCache(await res.json());
    await res.body?.cancel();
    console.log(`HTTP ${res.status} for ${PAGE_CACHE}; reading every spec's page in full`);
  } catch (e) {
    console.log(`${String(e)} for ${PAGE_CACHE}; reading every spec's page in full`);
  }
  return {};
}

// The first bytes of a response's body, as text. A character the cut splits decodes as a replacement character.
async function readStart(res: Response, bytes: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  for (let n = 0; n < bytes; ) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    n += value.length;
  }
  await reader.cancel();
  return new TextDecoder().decode(Buffer.concat(chunks).subarray(0, bytes));
}

// Reads a page with a window of its own, which loads none of the page's scripts or stylesheets, and closes it after,
// since a window that stays open keeps every page parsed with it.
export async function parsePage(text: string, kind: SourceKind): Promise<PageFacts> {
  const window = new Window({ settings: { disableJavaScriptFileLoading: true, disableCSSFileLoading: true, disableComputedStyleRendering: true } });
  try {
    const parser = new window.DOMParser();
    if (kind === 'webgl-extension') return readWebglExtension(parser.parseFromString(text, 'application/xml') as unknown as Document);
    return readSpecPage(parser.parseFromString(text, 'text/html') as unknown as Document);
  } finally {
    await window.happyDOM.close();
  }
}

type Parse = (text: string, kind: SourceKind) => PageFacts | Promise<PageFacts>;

async function fetchPage(
  fetchUrl: Fetch,
  url: string,
  before: CachedPage | undefined,
  parse: Parse,
  bytes: number,
): Promise<CachedPage> {
  const source = pageSource(url);
  // The last copy of this page, which a failed fetch keeps; and that copy, when this reader made it, which only a
  // change to the page replaces.
  const same = before?.url === url ? before : undefined;
  const current = same?.reader === READER ? same : undefined;
  const headers: Record<string, string> = { 'User-Agent': USER_AGENT };
  if (current?.etag) headers['If-None-Match'] = current.etag;
  if (current?.lastModified) headers['If-Modified-Since'] = current.lastModified;
  try {
    const res = await fetchUrl(source.url, { headers, signal: AbortSignal.timeout(PAGE_TIMEOUT) });
    if (res.status === 304 && current) return current;
    if (!res.ok) {
      await res.body?.cancel();
      console.log(`HTTP ${res.status} for ${source.url}`);
      return same ?? { url, reader: READER, facts: {} };
    }
    const page: CachedPage = { url, reader: READER, facts: await parse(await readStart(res, bytes), source.kind) };
    const etag = res.headers.get('ETag');
    const lastModified = res.headers.get('Last-Modified');
    if (etag) page.etag = etag;
    if (lastModified) page.lastModified = lastModified;
    return page;
  } catch (e) {
    console.log(`${String(e)} for ${source.url}`);
    return same ?? { url, reader: READER, facts: {} };
  }
}

export async function fetchSpecPages(
  fetchUrl: Fetch,
  pages: readonly { shortname: string; url: string }[],
  before: PageCache,
  parse: Parse = parsePage,
  { bytes = PAGE_BYTES, limit = PAGE_LIMIT } = {},
): Promise<PageCache> {
  const out: PageCache = {};
  const queue = [...pages];
  // Each worker takes the next queued page when its last one settles.
  const worker = async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      const cached = Object.hasOwn(before, job.shortname) ? before[job.shortname] : undefined;
      out[job.shortname] = await fetchPage(fetchUrl, job.url, cached, parse, bytes);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, worker));
  // In the order of the list, rather than the order the pages loaded in.
  return Object.fromEntries(pages.map((p) => [p.shortname, out[p.shortname]]));
}

async function specref(fetchUrl: Fetch, refs: readonly string[]): Promise<Record<string, unknown>> {
  const res = await fetchUrl(SPECREF + refs.map(encodeURIComponent).join(','));
  if (!res.ok) throw new Error(`HTTP ${res.status} for Specref`);
  const body: unknown = await res.json();
  return isObject(body) ? body : {};
}

// Specref's authors for each spec it has, through the entry an alias names: Specref files a WHATWG standard under its
// name in capitals ("DOM"), with an alias from browser-specs' shortname. Specref failing leaves the specs with none.
export async function specrefEditors(fetchUrl: Fetch, shortnames: readonly string[]): Promise<Map<string, Editor[]>> {
  const out = new Map<string, Editor[]>();
  if (shortnames.length === 0) return out;
  try {
    const entries = await specref(fetchUrl, shortnames);
    const aliases = [...new Set(Object.values(entries).flatMap((e) => (isObject(e) && typeof e.aliasOf === 'string' ? [e.aliasOf] : [])))];
    const targets = aliases.length > 0 ? await specref(fetchUrl, aliases) : {};
    for (const shortname of shortnames) {
      let entry = entries[shortname];
      if (isObject(entry) && typeof entry.aliasOf === 'string') entry = targets[entry.aliasOf];
      const authors = isObject(entry) && isStrings(entry.authors) ? (entry.authors as string[]) : [];
      if (authors.length > 0) out.set(shortname, authors.map((name) => ({ name })));
    }
  } catch (e) {
    console.log(`${String(e)}; no editors from Specref`);
  }
  return out;
}

// Each WHATWG standard's editors, by its URL: its workstream's editors, which are the current ones. (A standard's own
// list of authors, which Specref gives, names everyone who has ever edited it.) The file failing to load leaves the
// standards to Specref.
export async function whatwgEditors(fetchUrl: Fetch): Promise<Map<string, Editor[]>> {
  const out = new Map<string, Editor[]>();
  try {
    const res = await fetchUrl(WHATWG_DB);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${WHATWG_DB}`);
    const db: unknown = await res.json();
    const workstreams = isObject(db) && Array.isArray(db.workstreams) ? db.workstreams : [];
    for (const w of workstreams) {
      if (!isObject(w) || !Array.isArray(w.editors) || !Array.isArray(w.standards)) continue;
      const editors = w.editors.flatMap((e): Editor[] => (isObject(e) && typeof e.name === 'string' ? [{ name: e.name }] : []));
      if (editors.length === 0) continue;
      for (const s of w.standards) if (isObject(s) && typeof s.href === 'string') out.set(s.href, editors);
    }
  } catch (e) {
    console.log(`${String(e)}; no editors from the WHATWG`);
  }
  return out;
}

// Each spec's facts, with editors for each page that names none: its WHATWG workstream's, by the page's URL, or else
// Specref's, by its shortname.
export function fillEditors(
  cache: PageCache,
  byUrl: ReadonlyMap<string, Editor[]>,
  byShortname: ReadonlyMap<string, Editor[]>,
): Map<string, PageFacts> {
  return new Map(
    Object.entries(cache).map(([shortname, page]) => {
      const editors = page.facts.editors ?? byUrl.get(page.url) ?? byShortname.get(shortname);
      return [shortname, editors ? { ...page.facts, editors } : page.facts];
    }),
  );
}

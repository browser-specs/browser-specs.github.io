// From Web Specs Companion's src/logic/mdn.ts, copied whole so that copying it again re-syncs it.
// Lists, for each spec in browser-specs, the MDN pages that document it, from the front matter of MDN's pages in
// mdn/content and from MDN's browser-compat-data (BCD).
import type { SlimSpec } from '../shared/types.ts';
import { compatSpecs, forEachFeature, matchSpecUrl, specUrlIndex } from './implementations.ts';

// The fields the build reads from a page's front matter.
export interface FrontMatter {
  title: string;
  slug: string; // e.g. 'Web/API/Request'
  pageType?: string; // e.g. 'web-api-interface'
  specUrls: string[];
  browserCompat: string[]; // BCD keys, e.g. 'api.Request'
}

// [slug, title, index into MdnFile.types]
export type MdnPage = [string, string, number];

export interface MdnFile {
  content: { commit: string; date: string }; // mdn/content's commit, and its committer date as YYYY-MM-DD
  types: string[]; // the page types the pages use, sorted, with '' for a page that has none
  pages: MdnPage[]; // every page some spec lists, sorted by slug
  specs: Record<string, number[]>; // by browser-specs shortname: Indexes into pages, ascending
}

// MDN serves a page at this prefix and its slug, in the reader's language.
export const MDN_DOCS = 'https://developer.mozilla.org/docs/';

// MDN's pages about itself and its learning area, which document no spec.
function leftOut(page: FrontMatter): boolean {
  return /^(mdn|learn)-/.test(page.pageType ?? '') || page.slug.startsWith('MDN/');
}

function addAll(map: Map<string, Set<string>>, key: string, values: Iterable<string>) {
  const set = map.get(key) ?? new Set<string>();
  for (const v of values) set.add(v);
  map.set(key, set);
}

// Builds the MDN file. A page belongs to a spec when one of its spec-urls matches the spec, when one of its
// browser-compat keys is a BCD feature whose own spec_url matches it, or when the mdn_url of such a feature names the
// page. A feature with no spec_url of its own matches nothing, and an mdn_url that names no page lists nothing.
export function buildMdn(pages: FrontMatter[], bcd: unknown, specs: SlimSpec[], content: MdnFile['content']): MdnFile {
  const index = specUrlIndex(specs);
  const keySpecs = new Map<string, Set<string>>();
  const slugSpecs = new Map<string, Set<string>>();
  forEachFeature(bcd, (key, compat) => {
    const matched = compatSpecs(compat, index);
    if (matched.size === 0) return;
    keySpecs.set(key, matched);
    if (typeof compat.mdn_url === 'string' && compat.mdn_url.startsWith(MDN_DOCS)) {
      addAll(slugSpecs, compat.mdn_url.slice(MDN_DOCS.length), matched);
    }
  });
  const listed = new Map<string, FrontMatter>();
  const bySpec = new Map<string, Set<string>>();
  for (const page of pages) {
    if (leftOut(page) || listed.has(page.slug)) continue;
    const matched = new Set<string>(slugSpecs.get(page.slug));
    for (const url of page.specUrls) {
      const shortname = matchSpecUrl(index, url);
      if (shortname) matched.add(shortname);
    }
    for (const key of page.browserCompat) for (const shortname of keySpecs.get(key) ?? []) matched.add(shortname);
    if (matched.size === 0) continue;
    listed.set(page.slug, page);
    for (const shortname of matched) addAll(bySpec, shortname, [page.slug]);
  }
  const slugs = [...listed.keys()].sort();
  const types = [...new Set(slugs.map((slug) => listed.get(slug)!.pageType ?? ''))].sort();
  const at = new Map(slugs.map((slug, i) => [slug, i]));
  const out: Record<string, number[]> = {};
  for (const shortname of [...bySpec.keys()].sort()) {
    out[shortname] = [...bySpec.get(shortname)!].map((slug) => at.get(slug)!).sort((a, b) => a - b);
  }
  const entry = (slug: string): MdnPage => [slug, listed.get(slug)!.title, types.indexOf(listed.get(slug)!.pageType ?? '')];
  return { content, types, pages: slugs.map(entry), specs: out };
}

export interface MdnLink {
  title: string; // as shown: A nested page's without its parent's title, with backticks for the card to render as code
  url: string; // MDN_DOCS and the slug, with no locale, so MDN serves the reader's language
}

export interface MdnItem extends MdnLink {
  children: MdnItem[]; // the pages nested under it, sorted
  count: number; // the number of pages nested under it, at any depth
}

export interface MdnSection {
  name: string;
  items: MdnItem[];
}

// What the card gets for a spec: its overviews and sections, or its series' current level's (fromSeries).
export interface MdnView {
  count: number; // every listed page, overviews included
  overviews: MdnLink[]; // sorted by title
  sections: MdnSection[]; // in SECTIONS order, then Other, and only those with pages
  content: MdnFile['content'];
  fromSeries?: { shortname: string; title: string };
}

const OVERVIEWS = new Set(['web-api-overview', 'css-module']);

// The card's sections, in order, with the page types each one holds. A page of any other type, or none, goes in Other.
export const SECTIONS: readonly (readonly [string, readonly string[]])[] = [
  ['Guides', ['guide', 'listing-page', 'landing-page']],
  ['Interfaces', ['web-api-interface', 'webassembly-interface']],
  ['Constructors', ['web-api-constructor', 'javascript-constructor', 'webassembly-constructor']],
  ['Methods', [
    'web-api-instance-method', 'web-api-static-method', 'javascript-instance-method', 'javascript-static-method',
    'webassembly-instance-method', 'webassembly-static-method', 'webgl-extension-method',
  ]],
  ['Properties', [
    'web-api-instance-property', 'web-api-static-property', 'javascript-instance-accessor-property',
    'javascript-static-accessor-property', 'javascript-instance-data-property', 'javascript-static-data-property',
    'javascript-global-property', 'webassembly-instance-property',
  ]],
  ['Events', ['web-api-event', 'webdriver-event']],
  ['JavaScript', [
    'javascript-class', 'javascript-namespace', 'javascript-function', 'javascript-operator', 'javascript-statement',
    'javascript-language-feature',
  ]],
  ['HTML elements', ['html-element']],
  ['HTML attributes', ['html-attribute', 'html-attribute-value']],
  ['CSS properties', ['css-property', 'css-shorthand-property']],
  ['CSS at-rules', ['css-at-rule', 'css-at-rule-descriptor']],
  ['CSS functions', ['css-function']],
  ['CSS pseudo-classes', ['css-pseudo-class']],
  ['CSS pseudo-elements', ['css-pseudo-element']],
  ['CSS selectors', ['css-selector', 'css-combinator']],
  ['CSS types', ['css-type', 'css-keyword']],
  ['CSS media features', ['css-media-feature']],
  ['SVG elements', ['svg-element']],
  ['SVG attributes', ['svg-attribute']],
  ['MathML elements', ['mathml-element']],
  ['MathML attributes', ['mathml-attribute']],
  ['ARIA roles', ['aria-role']],
  ['ARIA attributes', ['aria-attribute']],
  ['HTTP headers', ['http-header']],
  ['HTTP status codes', ['http-status-code']],
  ['HTTP methods', ['http-method']],
  ['CSP directives', ['http-csp-directive']],
  ['Permissions-Policy directives', ['http-permissions-policy-directive']],
  ['Manifest members', ['web-manifest-member']],
  ['WebAssembly', ['webassembly-instruction', 'webassembly-function']],
  ['WebDriver commands', ['webdriver-command']],
  ['WebGL extensions', ['webgl-extension']],
  ['URIs', ['uri-scheme', 'uri-component']],
];
const OTHER = 'Other';
const SECTION_OF = new Map(SECTIONS.flatMap(([name, types]) => types.map((type) => [type, name] as const)));

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

// Checks a page's shape against the file's types, so a copy stored by another version of the extension can't hand the
// card a page it can't show.
export function isMdnPage(page: unknown, types: unknown[]): page is MdnPage {
  return Array.isArray(page) && page.length === 3 && typeof page[0] === 'string' && typeof page[1] === 'string'
    && Number.isInteger(page[2]) && typeof types[page[2]] === 'string';
}

const plain = (title: string) => title.replace(/`/g, '');
const byTitle = (a: MdnLink, b: MdnLink) => plain(a.title).localeCompare(plain(b.title), 'en', { sensitivity: 'base' });

// Counts and sorts items, and their children, all the way down.
function finish(items: MdnItem[]): MdnItem[] {
  for (const item of items) item.count = finish(item.children).reduce((n, child) => n + 1 + child.count, 0);
  return items.sort(byTitle);
}

// Builds the card's view of a spec's pages: its overviews, then a section for each kind of page, with each page nested
// under its nearest ancestor on the list that isn't an overview. It checks every index it follows, since a copy the
// extension stored isn't slimmed again, and answers undefined when no page fits.
export function mdnView(file: MdnFile, shortname: string): MdnView | undefined {
  if (!isObject(file) || !isObject(file.specs) || !Array.isArray(file.pages) || !Array.isArray(file.types)) return undefined;
  const { content } = file;
  if (!isObject(content) || typeof content.commit !== 'string' || typeof content.date !== 'string') return undefined;
  const ids = Object.hasOwn(file.specs, shortname) ? file.specs[shortname] : undefined;
  if (!Array.isArray(ids)) return undefined;
  const pages = new Map<string, { title: string; type: string }>();
  for (const i of ids) {
    const page = file.pages[i];
    if (isMdnPage(page, file.types)) pages.set(page[0], { title: page[1], type: file.types[page[2]] });
  }
  if (pages.size === 0) return undefined;
  const overviews: MdnLink[] = [];
  const items = new Map<string, MdnItem>();
  for (const [slug, { title, type }] of pages) {
    if (OVERVIEWS.has(type)) overviews.push({ title, url: MDN_DOCS + slug });
    else items.set(slug, { title, url: MDN_DOCS + slug, children: [], count: 0 });
  }
  const parentOf = (slug: string): string | undefined => {
    for (let s = slug; s.includes('/'); ) {
      s = s.slice(0, s.lastIndexOf('/'));
      if (items.has(s)) return s;
    }
    return undefined;
  };
  const top = new Map<string, MdnItem[]>();
  for (const [slug, item] of items) {
    const parent = parentOf(slug);
    if (parent) {
      const prefix = `${pages.get(parent)!.title}: `;
      if (item.title.startsWith(prefix)) item.title = item.title.slice(prefix.length);
      items.get(parent)!.children.push(item);
    } else {
      const name = SECTION_OF.get(pages.get(slug)!.type) ?? OTHER;
      const list = top.get(name);
      if (list) list.push(item);
      else top.set(name, [item]);
    }
  }
  const sections = [...SECTIONS.map(([name]) => name), OTHER]
    .filter((name) => top.has(name))
    .map((name) => ({ name, items: finish(top.get(name)!) }));
  return { count: pages.size, overviews: overviews.sort(byTitle), sections, content: { commit: content.commit, date: content.date } };
}

// Narrows items to the ones whose titles contain the query, case-insensitively and with backticks ignored, along with
// each match's ancestors, and recounts them. A blank query leaves the items as they are.
export function filterItems(items: MdnItem[], query: string): MdnItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.flatMap((item) => {
    const children = filterItems(item.children, q);
    if (children.length === 0 && !plain(item.title).toLowerCase().includes(q)) return [];
    return [{ ...item, children, count: children.reduce((n, child) => n + 1 + child.count, 0) }];
  });
}

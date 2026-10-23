// The site's rows: one for each browser spec in browser-specs that's in good standing, one per level, joined with the
// date it prints (from webref's crawl) and its engines, WPT pass rates, and MDN and Can I Use counts (from Web Specs
// Companion's files). Each row uses its own data only, never its series' current level's, since a filter by engine
// count needs each level's own facts.
import type { Engine, ImplFile } from './implementations.ts';
import { mdnView, type MdnFile } from './mdn.ts';
import { caniuseFeatures, type CiuFile } from './caniuse.ts';
import { allUrl, passRate, WPT_BROWSERS, wptSpec, type WptBrowser, type WptFile } from './wpt.ts';
import { parseSpecDate } from './dates.ts';
import { footprintCount, type FootprintFile } from './footprints.ts';

export type Bucket = '3' | '2' | '1' | 'none' | 'nodata';
export const BUCKETS: readonly Bucket[] = ['3', '2', '1', 'none', 'nodata'];

// What the build reads from a browser-specs entry that's a row.
export interface SpecLike {
  shortname: string;
  title: string;
  shortTitle?: string;
  url: string;
  nightlyUrl?: string;
  organization: string;
  groups: string[];
  repository?: string;
}

export interface Row {
  shortname: string;
  title: string; // the short title, else the title
  fullTitle: string;
  url: string; // the editors' draft, else the spec's url
  org: string;
  groups: string[]; // as the page shows them, through GROUP_NAMES
  originalGroups?: string[]; // browser-specs' names, only when some name in groups differs from them
  repo?: string;
  updated?: string; // YYYY-MM-DD
  engines?: Engine[]; // the spec's own BCD record's; absent when BCD has none
  bucket: Bucket;
  wpt?: Record<WptBrowser, number>; // the share of all its subtests each browser passes, in percent
  tests?: string; // wpt.fyi's results for all its tests
  interop?: number; // wpt.fyi's Interop score: each test's lowest pass rate of the three browsers, averaged
  mdn: number;
  caniuse: number;
  footprint?: number; // how many other specs reference it; absent when webref has nothing for it
  category: string;
}

export interface SourceVersions {
  built: string; // the build's time, ISO
  webref: string; // the crawl's date, YYYY-MM-DD
  bcd: string;
  mdnContent: string; // mdn/content's commit date, YYYY-MM-DD
  caniuse: string;
  wpt: { revision: string; date: string };
  webFeatures: string;
}

export interface RowsFile {
  sources: SourceVersions;
  rows: Row[];
}

export interface Inputs {
  specs: unknown;
  webref: unknown;
  impl: ImplFile;
  mdn: MdnFile;
  caniuse: CiuFile;
  wpt: WptFile;
  webFeatures: { version: string; data: unknown };
  footprints: FootprintFile;
}

// Upstream records are untyped JSON; each reader reads only the fields it keeps.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = any;

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

// Display names the user chose: shorter forms of four group names, a title, and a spec browser-specs marks as a browser
// spec though no browser implements it. Each GROUP_NAMES pair replaces part of a group's name, in order, for display
// only: The category guesses read the original names, and the filter matches them too.
export const GROUP_NAMES: readonly (readonly [from: string, to: string])[] = [
  ['Cascading Style Sheets (CSS)', 'CSS'],
  ['Accessible Rich Internet Applications', 'ARIA'],
  ['Web Platform Incubator Community Group', 'WICG'],
  ['Real-Time Communications', 'Real-Time Communications (RTC)'],
];
export const TITLES: Readonly<Record<string, string>> = { xhr: 'XMLHttpRequest (XHR)' };
export const EXCLUDED: ReadonlySet<string> = new Set(['w3c-process']);

export function displayGroup(name: string): string {
  return GROUP_NAMES.reduce((out, [from, to]) => out.replace(from, to), name);
}

// webref's date for every IETF spec is the date it crawled the spec, not one the spec prints: An RFC's info page has
// none, and a draft's changes with each crawl. So those specs get no Updated date at all.
const UNDATED_ORGS = new Set(['IETF']);

// A browser-specs entry that's a row: in good standing (an entry without a standing is), and in the "browser" category.
export function specLike(raw: unknown): SpecLike | undefined {
  const r = raw as Raw;
  if (!r || typeof r !== 'object') return undefined;
  const [shortname, title, url] = [str(r.shortname), str(r.title), str(r.url)];
  if (!shortname || !title || !url || EXCLUDED.has(shortname)) return undefined;
  if ((r.standing ?? 'good') !== 'good' || !Array.isArray(r.categories) || !r.categories.includes('browser')) return undefined;
  const groups: string[] = Array.isArray(r.groups) ? r.groups.flatMap((g: Raw) => (str(g?.name) ? [g.name] : [])) : [];
  const spec: SpecLike = { shortname, title, url, organization: str(r.organization) ?? '', groups };
  if (str(r.shortTitle)) spec.shortTitle = r.shortTitle;
  if (str(r.nightly?.url)) spec.nightlyUrl = r.nightly.url;
  if (str(r.nightly?.repository)) spec.repository = r.nightly.repository;
  return spec;
}

// "none" is a spec BCD has a record for that no engine ships; "nodata" is one BCD has no record for at all.
export function bucketOf(engines: Engine[] | undefined): Bucket {
  if (!engines) return 'nodata';
  return engines.length === 0 ? 'none' : (String(Math.min(engines.length, 3)) as Bucket);
}

export function webrefDates(webref: unknown): Map<string, string> {
  const results = (webref as Raw)?.results;
  const dates = new Map<string, string>();
  if (!Array.isArray(results)) return dates;
  for (const r of results) {
    const date = parseSpecDate(r?.date);
    if (str(r?.shortname) && date) dates.set(r.shortname, date);
  }
  return dates;
}

export function rowShortnames(specs: unknown): string[] {
  const list: unknown[] = Array.isArray(specs) ? specs : [];
  return list.flatMap((raw) => specLike(raw)?.shortname ?? []);
}

export function buildRows(inputs: Inputs, categorize: (spec: SpecLike) => string, now: Date): RowsFile {
  const dates = webrefDates(inputs.webref);
  const list: unknown[] = Array.isArray(inputs.specs) ? inputs.specs : [];
  const rows = list.flatMap((raw): Row[] => {
    const spec = specLike(raw);
    if (!spec) return [];
    const { shortname } = spec;
    const record = Object.hasOwn(inputs.impl.specs, shortname) ? inputs.impl.specs[shortname] : undefined;
    const tests = wptSpec(inputs.wpt, shortname);
    const groups = spec.groups.map(displayGroup);
    const retitled = Object.hasOwn(TITLES, shortname) ? TITLES[shortname] : undefined;
    const row: Row = {
      shortname,
      title: retitled ?? spec.shortTitle ?? spec.title,
      fullTitle: retitled ?? spec.title,
      url: spec.nightlyUrl ?? spec.url,
      org: spec.organization,
      groups,
      bucket: bucketOf(record?.engines),
      mdn: mdnView(inputs.mdn, shortname)?.count ?? 0,
      caniuse: caniuseFeatures(inputs.caniuse, shortname).length,
      category: categorize(spec),
    };
    if (groups.some((g, i) => g !== spec.groups[i])) row.originalGroups = spec.groups;
    if (spec.repository) row.repo = spec.repository;
    if (dates.has(shortname) && !UNDATED_ORGS.has(spec.organization)) row.updated = dates.get(shortname);
    if (record) row.engines = [...record.engines];
    const footprint = footprintCount(inputs.footprints, shortname);
    if (footprint !== undefined) row.footprint = footprint;
    if (tests) {
      row.wpt = Object.fromEntries(WPT_BROWSERS.map((b) => [b, passRate(tests.all.pass[b])])) as Record<WptBrowser, number>;
      row.tests = allUrl(tests, inputs.wpt.runs);
      row.interop = tests.all.interop;
    }
    return [row];
  });
  const sources: SourceVersions = {
    built: now.toISOString(),
    webref: str((inputs.webref as Raw)?.date)?.slice(0, 10) ?? '',
    bcd: inputs.impl.bcd.version,
    mdnContent: inputs.mdn.content.date,
    caniuse: inputs.caniuse.caniuse.version,
    wpt: { revision: inputs.wpt.revision, date: inputs.wpt.date },
    webFeatures: inputs.webFeatures.version,
  };
  return { sources, rows };
}

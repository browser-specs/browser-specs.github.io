// From Web Specs Companion's src/logic/implementations.ts, copied whole so that copying it again re-syncs it.
// Works out, from MDN's browser-compat-data (BCD), which of the three browser engines implement each spec in
// browser-specs. BCD describes features one at a time, each with the URLs of the spec sections that define it, so a
// spec's verdict comes from the features whose spec URLs fall within it.
import type { SlimSpec } from '../shared/types.ts';

export type Engine = 'gecko' | 'webkit' | 'blink';
export const ENGINES: readonly Engine[] = ['gecko', 'webkit', 'blink'];

// Every other BCD browser is ignored: The Chromium-based ones are Blink, which Chrome already counts.
const BROWSERS: Record<Engine, readonly string[]> = {
  gecko: ['firefox', 'firefox_android'],
  webkit: ['safari', 'safari_ios'],
  blink: ['chrome', 'chrome_android'],
};

// Drops the scheme and any leading www., the query and fragment, an index or Overview page, and trailing slashes.
export function normalizeUrl(url: string): string {
  return url
    .split('#')[0]
    .split('?')[0]
    .replace(/^https?:[/][/](www[.])?/, '')
    .replace(/(index[.]html?|Overview[.]html)$/, '')
    .replace(/[/]+$/, '');
}

// Maps each normalized URL a spec can be cited by to the spec's shortname: its own URLs and multipage pages, and then
// its series' URLs, which stand for the series' current level. A URL keeps its first claimant, so a spec's own URLs
// win over series URLs, and among specs, the first in browser-specs' order wins.
export function specUrlIndex(specs: SlimSpec[]): Map<string, string> {
  const index = new Map<string, string>();
  const claim = (url: string | undefined, shortname: string) => {
    const key = url ? normalizeUrl(url) : '';
    if (key && !index.has(key)) index.set(key, shortname);
  };
  for (const s of specs) {
    for (const url of [s.url, s.nightly?.url, ...(s.nightly?.alternateUrls ?? []), ...(s.nightly?.pages ?? []), s.release?.url]) {
      claim(url, s.shortname);
    }
  }
  for (const s of specs) {
    claim(s.series.nightlyUrl, s.series.currentSpecification);
    claim(s.series.releaseUrl, s.series.currentSpecification);
  }
  return index;
}

// Matches a spec URL to the longest indexed URL that it equals, or that it starts with followed by a slash.
export function matchSpecUrl(index: Map<string, string>, url: string): string | undefined {
  for (let key = normalizeUrl(url); key; key = key.slice(0, Math.max(key.lastIndexOf('/'), 0))) {
    const shortname = index.get(key);
    if (shortname) return shortname;
  }
  return undefined;
}

interface Statement {
  version_added?: unknown;
  version_removed?: unknown;
  flags?: unknown;
}

// An engine ships a feature when a support statement for one of its browsers records a release (not a preview), with
// no removal and no flag. Prefixed, alternative-name, and partial support count, since BCD treats them as shipped.
export function ships(support: Record<string, unknown> | undefined, engine: Engine): boolean {
  return BROWSERS[engine].some((browser) =>
    ([] as unknown[]).concat(support?.[browser] ?? []).some((s) => {
      if (!s || typeof s !== 'object') return false;
      const { version_added: added, version_removed: removed, flags } = s as Statement;
      const released = added === true || (typeof added === 'string' && added !== '' && added !== 'preview');
      const flagged = Array.isArray(flags) ? flags.length > 0 : Boolean(flags);
      return released && !removed && !flagged;
    }),
  );
}

// How many lacking features a record lists for each engine that doesn't implement the spec.
export const LACKS_CAP = 40;

export interface ImplFeature {
  key: string; // BCD's dotted path, e.g. 'api.HTMLAnchorElement.referrerPolicy.unsafe-url'
  mdn?: string; // the feature's mdn_url, when it has one
}

export interface ImplRecord {
  engines: Engine[]; // the engines that implement the spec, in gecko, webkit, blink order
  basis: 'shared' | 'any' | 'none'; // which features make up the core
  core: number; // the number of features in the core
  ships: Record<Engine, number>; // the number of core features each engine ships
  // For each engine not in engines: the first LACKS_CAP core features it lacks, in BCD's order, and how many more.
  lacks: Partial<Record<Engine, { features: ImplFeature[]; more: number }>>;
}

export interface ImplFile {
  bcd: { version: string; timestamp: string }; // from BCD's __meta
  specs: Record<string, ImplRecord>; // by browser-specs shortname
}

// What the card gets for a spec: its own record, or its series' current level's (fromSeries), with BCD's version.
export interface ImplView extends ImplRecord {
  bcd: ImplFile['bcd'];
  fromSeries?: { shortname: string; title: string };
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

// Checks a record's shape, down to each lacking feature's key, so a file from another build of this generator, or a
// copy stored by another version of the extension, can't hand the card a record it can't render.
export function isImplRecord(value: unknown): value is ImplRecord {
  if (!isObject(value)) return false;
  const { engines, basis, core, ships, lacks } = value;
  return Array.isArray(engines) && engines.every((e) => ENGINES.includes(e))
    && (basis === 'shared' || basis === 'any' || basis === 'none')
    && typeof core === 'number'
    && isObject(ships) && ENGINES.every((e) => typeof ships[e] === 'number')
    && isObject(lacks) && Object.values(lacks).every((l) => isObject(l) && typeof l.more === 'number' && Array.isArray(l.features)
      && l.features.every((f) => isObject(f) && typeof f.key === 'string' && (f.mdn === undefined || typeof f.mdn === 'string')));
}

interface Feature {
  key: string;
  mdn?: string;
  engines: Engine[];
}

export interface BcdCompat {
  spec_url?: unknown;
  mdn_url?: unknown;
  support?: Record<string, unknown>;
  status?: { deprecated?: unknown };
}

// Calls visit with the dotted key and the __compat of each feature in BCD's data.json, in the file's order, in every
// tree but BCD's list of browsers.
export function forEachFeature(bcd: unknown, visit: (key: string, compat: BcdCompat) => void): void {
  const walk = (node: Record<string, unknown>, path: string[]) => {
    for (const [name, child] of Object.entries(node)) {
      if (!child || typeof child !== 'object') continue;
      if (name === '__compat') visit(path.join('.'), child as BcdCompat);
      else if (!name.startsWith('__')) walk(child as Record<string, unknown>, [...path, name]);
    }
  };
  for (const [tree, node] of Object.entries((bcd ?? {}) as Record<string, unknown>)) {
    if (tree !== 'browsers' && !tree.startsWith('__') && node && typeof node === 'object') walk(node as Record<string, unknown>, [tree]);
  }
}

// The specs a feature's own spec URLs match.
export function compatSpecs(compat: BcdCompat, index: Map<string, string>): Set<string> {
  const urls = ([] as unknown[]).concat(compat.spec_url ?? []).filter((u): u is string => typeof u === 'string');
  return new Set(urls.map((u) => matchSpecUrl(index, u)).filter((s): s is string => s !== undefined));
}

// Collects, for each spec, the BCD features whose spec URLs match it. A feature with spec URLs in several specs counts
// once for each of them, and deprecated features don't count.
function featuresBySpec(bcd: Record<string, unknown>, index: Map<string, string>): Map<string, Feature[]> {
  const bySpec = new Map<string, Feature[]>();
  forEachFeature(bcd, (key, compat) => {
    if (compat.status?.deprecated) return;
    const shortnames = compatSpecs(compat, index);
    if (shortnames.size === 0) return;
    const feature: Feature = { key, engines: ENGINES.filter((e) => ships(compat.support, e)) };
    if (typeof compat.mdn_url === 'string') feature.mdn = compat.mdn_url;
    for (const s of shortnames) {
      const list = bySpec.get(s);
      if (list) list.push(feature);
      else bySpec.set(s, [feature]);
    }
  });
  return bySpec;
}

// Drops each feature that has an ancestor among the same spec's features, so a spec counts its interfaces, properties,
// and elements, rather than all their members and values.
function topLevel(features: Feature[]): Feature[] {
  const keys = new Set(features.map((f) => f.key));
  return features.filter((f) => {
    const parts = f.key.split('.');
    for (let i = 1; i < parts.length; i++) if (keys.has(parts.slice(0, i).join('.'))) return false;
    return true;
  });
}

// The core is the features at least two engines ship, or failing that, the features any engine ships, or failing that,
// all of them. An engine implements the spec if it ships at least half the core, so no engine is marked down for
// features just one other engine ships.
function verdict(features: Feature[]): ImplRecord {
  const shared = features.filter((f) => f.engines.length >= 2);
  const any = features.filter((f) => f.engines.length >= 1);
  const [basis, core]: [ImplRecord['basis'], Feature[]] =
    shared.length > 0 ? ['shared', shared] : any.length > 0 ? ['any', any] : ['none', features];
  const count = (e: Engine) => core.filter((f) => f.engines.includes(e)).length;
  const shipped: Record<Engine, number> = { gecko: count('gecko'), webkit: count('webkit'), blink: count('blink') };
  const engines = basis === 'none' ? [] : ENGINES.filter((e) => shipped[e] >= core.length / 2);
  const lacks: ImplRecord['lacks'] = {};
  for (const e of ENGINES) {
    if (engines.includes(e)) continue;
    const missing = core.filter((f) => !f.engines.includes(e));
    lacks[e] = {
      features: missing.slice(0, LACKS_CAP).map(({ key, mdn }) => (mdn ? { key, mdn } : { key })),
      more: Math.max(0, missing.length - LACKS_CAP),
    };
  }
  return { engines, basis, core: core.length, ships: shipped, lacks };
}

// Builds the browser-support file from BCD's data.json and browser-specs. Its specs keys are sorted, so the same data
// always gives the same bytes.
export function buildImplementations(bcd: unknown, specs: SlimSpec[]): ImplFile {
  const root = (bcd ?? {}) as Record<string, unknown> & { __meta?: { version?: unknown; timestamp?: unknown } };
  const { version, timestamp } = root.__meta ?? {};
  if (typeof version !== 'string' || typeof timestamp !== 'string') {
    throw new Error('BCD: expected __meta.version and __meta.timestamp');
  }
  const bySpec = featuresBySpec(root, specUrlIndex(specs));
  const records: Record<string, ImplRecord> = {};
  for (const shortname of [...bySpec.keys()].sort()) records[shortname] = verdict(topLevel(bySpec.get(shortname)!));
  return { bcd: { version, timestamp }, specs: records };
}

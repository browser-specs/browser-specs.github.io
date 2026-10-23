// From Web Specs Companion's src/logic/footprint.ts, copied whole so that copying it again re-syncs it.
import { type SpecIndex, specRef } from '../data/specs.ts';
import type { Backref, Dfn, Extracts, WebrefEntry } from '../data/webref.ts';
import type { SpecRef } from '../shared/types.ts';

export interface Footprint {
  referencedBy: SpecRef[];
  usesTermsFrom: SpecRef[];
  normativeRefs: { name: string; url: string }[];
  extendsInterfaces: string[];
  crawlDate?: string; // the day webref crawled, YYYY-MM-DD
  revision?: string;
  specdex: string;
}

export interface UsedByEntry {
  count: number;
  href: string;
  access: string;
  term: string;
  type: string;
  specs: SpecRef[];
  webdex?: string;
}

export function specdexUrl(shortname: string): string {
  return `https://dontcallmedom.github.io/specdex/${encodeURIComponent(shortname)}.html`;
}

const byTitle = (a: SpecRef, b: SpecRef) => a.title.localeCompare(b.title);

export function computeFootprint(
  input: {
    backrefs?: Backref[];
    links?: Extracts['links']['links'];
    refs?: Extracts['refs']['refs'];
    idlparsed?: Extracts['idlparsed']['idlparsed'];
  },
  self: string,
  specs: SpecIndex,
  entry?: WebrefEntry,
  crawled?: string,
): Footprint {
  const referencing = new Map<string, SpecRef>();
  for (const b of input.backrefs ?? []) {
    for (const r of b.referencedBy) if (r.shortname !== self) referencing.set(r.shortname, r);
  }
  const used = new Map<string, SpecRef>();
  for (const url of Object.keys(input.links?.autolinks ?? {})) {
    const m = specs.lookup(url);
    if (m && m.spec.shortname !== self) used.set(m.spec.shortname, specRef(m.spec));
  }
  const idl = input.idlparsed;
  return {
    referencedBy: [...referencing.values()].sort(byTitle),
    usesTermsFrom: [...used.values()].sort(byTitle),
    normativeRefs: input.refs?.normative ?? [],
    extendsInterfaces: idl ? Object.keys(idl.idlExtendedNames).filter((n) => !(n in idl.idlNames)).sort() : [],
    // The date of webref's whole crawl, from its index. The entry's own date is the one the spec prints.
    crawlDate: /^\d{4}-\d{2}-\d{2}/.exec(crawled ?? '')?.[0],
    revision: entry?.revision,
    specdex: specdexUrl(self),
  };
}

// The anchor format webdex uses for a definition, so links land on its entry.
const CASE_INSENSITIVE = new Set(['value', 'at-rule', 'descriptor', 'selector', 'type', 'property', 'function', 'http-header', 'element-attr', 'element', 'element-state']);
const EXCLUSIVE = new Set(['at-rule', 'descriptor', 'selector', 'type', 'property', 'interface', 'namespace', 'dictionary', 'enum', 'http-header', 'typedef', 'callback', 'constructor', 'extended-attribute', 'permission']);
const CLEANUPS: [RegExp, string][] = [
  [/^"/, ''], [/"$/, ''], [/^\[\[([^\]]+)\]\]/, '$1'], [/^<([^>]+)>$/, '$1'], [/^::?/, ''], [/^@@?/, ''], [/^'/, ''], [/'$/, ''], [/^%/, ''],
];

export function webdexUrl(d: Pick<Dfn, 'linkingText' | 'type' | 'for' | 'access'>, series: string): string | undefined {
  if (d.access !== 'public' || !d.linkingText.length) return undefined;
  let term = CASE_INSENSITIVE.has(d.type) ? d.linkingText[0].toLowerCase() : d.linkingText[0];
  for (const [re, rep] of CLEANUPS) term = term.replace(re, rep);
  const scope = d.for.length === 0 ? (EXCLUSIVE.has(d.type) ? `@@${d.type}` : `${series}%%${d.type}`) : `${[...d.for].sort()[0]}@${d.type}`;
  const initial = term.toLowerCase().slice(0, 1);
  const page = /[a-z]/.test(initial) ? initial : 'other';
  const display = d.linkingText[0].replace(/^"/, '').replace(/"$/, '');
  return `https://dontcallmedom.github.io/webdex/${page}.html#${encodeURIComponent(`${display}@@${scope}`)}`;
}

export function buildUsedByMap(backrefs: Backref[], self: string, series: string): Record<string, UsedByEntry> {
  const out: Record<string, UsedByEntry> = {};
  for (const b of backrefs) {
    const others = b.referencedBy.filter((r) => r.shortname !== self).sort(byTitle);
    if (!others.length) continue;
    out[b.id] = { count: others.length, href: b.href, access: b.access, term: b.linkingText[0] ?? b.id, type: b.type, specs: others, webdex: webdexUrl(b, series) };
  }
  return out;
}

export function mostUsed(map: Record<string, UsedByEntry>, n = 5): (UsedByEntry & { id: string })[] {
  return Object.entries(map)
    .map(([id, e]) => ({ ...e, id }))
    .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term))
    .slice(0, n);
}

/** True when the page's source revision is known and isn't the one webref crawled. */
export function webrefBehind(pageRevision: string | undefined, webrefRevision: string | undefined): boolean {
  return !!pageRevision && !!webrefRevision && pageRevision !== webrefRevision;
}

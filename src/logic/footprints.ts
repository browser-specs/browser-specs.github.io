// Each listed spec's platform footprint, as Web Specs Companion's card shows it, kept in one file for the footprint
// panel: the specs that reference the spec's definitions, the specs whose terms it uses, its normative references, the
// interfaces defined elsewhere that it adds to, and the definitions other specs use most. The file names each spec by
// shortname, with one shared table of titles and URLs, so no spec's title or URL is written out twice.
import { SpecIndex, specRef } from '../data/specs.ts';
import type { Backref, Extracts } from '../data/webref.ts';
import type { SlimSpec, SpecRef } from '../shared/types.ts';
import { buildUsedByMap, computeFootprint, mostUsed, specdexUrl } from './footprint.ts';

export type FootprintSize = 'large' | 'medium' | 'small';

export interface FootprintExtracts {
  backrefs?: Backref[];
  links?: Extracts['links']['links'];
  refs?: Extracts['refs']['refs'];
  idlparsed?: Extracts['idlparsed']['idlparsed'];
}

export interface SlimFootprint {
  referencedBy: string[]; // shortnames, in computeFootprint()'s order (by title)
  usesTermsFrom: string[];
  normativeRefs: [name: string, target?: string][]; // target: a shortname in specs, else a URL; absent when the ref has none
  extendsInterfaces: string[];
  mostUsed: [term: string, href: string, count: number][];
}

export interface FootprintFile {
  crawled: string; // YYYY-MM-DD, the day webref crawled; '' when its index has no date
  specs: Record<string, [title: string, url: string]>; // every spec a footprint names
  footprints: Record<string, SlimFootprint>;
}

export interface FootprintView {
  referencedBy: SpecRef[];
  usesTermsFrom: SpecRef[];
  normativeRefs: { name: string; url?: string }[];
  extendsInterfaces: string[];
  mostUsed: { term: string; href: string; count: number }[];
  crawlDate: string;
  specdex: string;
}

// A footprint is large when at least LARGE other specs reference the spec, and medium from MEDIUM.
const LARGE = 20;
const MEDIUM = 3;
const MOST_USED = 5;

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === 'string';
const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every(isString);

// Every browser-specs entry the spec index can use: one with a shortname, a title, a url, and a series.
export function indexSpecs(raw: unknown): SpecIndex {
  const list: unknown[] = Array.isArray(raw) ? raw : [];
  return new SpecIndex(list.filter((s): s is SlimSpec => isObject(s) && isString(s.shortname) && isString(s.title) && isString(s.url) && isObject(s.series)));
}

export function buildFootprints(extracts: ReadonlyMap<string, FootprintExtracts>, specs: SpecIndex, crawled: string | undefined): FootprintFile {
  const table: FootprintFile['specs'] = {};
  // Webref's records are untyped JSON, so a missing title or URL gets a stand-in, never a null the reader would reject.
  const keep = (r: SpecRef) => {
    table[r.shortname] = [isString(r.title) ? r.title : r.shortname, isString(r.url) ? r.url : ''];
    return r.shortname;
  };
  const target = ({ url }: { url?: string }): string | undefined => {
    if (!isString(url)) return undefined;
    const match = specs.lookup(url);
    return match ? keep(specRef(match.spec)) : url;
  };
  const footprints: FootprintFile['footprints'] = {};
  for (const [shortname, input] of extracts) {
    const f = computeFootprint(input, shortname, specs, undefined, crawled);
    footprints[shortname] = {
      referencedBy: f.referencedBy.map(keep),
      usesTermsFrom: f.usesTermsFrom.map(keep),
      normativeRefs: f.normativeRefs.filter((r) => isString(r?.name)).map((r) => {
        const t = target(r);
        return t === undefined ? [r.name] : [r.name, t];
      }),
      extendsInterfaces: f.extendsInterfaces,
      mostUsed: mostUsed(buildUsedByMap(input.backrefs ?? [], shortname, shortname), MOST_USED).map((d) => [d.term, d.href, d.count]),
    };
  }
  // The day computeFootprint() keeps as a footprint's crawlDate.
  return { crawled: /^\d{4}-\d{2}-\d{2}/.exec(crawled ?? '')?.[0] ?? '', specs: table, footprints };
}

export function footprintCount(file: FootprintFile, shortname: string): number | undefined {
  return Object.hasOwn(file.footprints, shortname) ? file.footprints[shortname].referencedBy.length : undefined;
}

export function footprintSize(count: number): FootprintSize {
  return count >= LARGE ? 'large' : count >= MEDIUM ? 'medium' : 'small';
}

export function footprintView(file: FootprintFile, shortname: string): FootprintView | undefined {
  if (!Object.hasOwn(file.footprints, shortname)) return undefined;
  const f = file.footprints[shortname];
  const named = (s: string) => Object.hasOwn(file.specs, s);
  const spec = (s: string): SpecRef => {
    const [title, url] = named(s) ? file.specs[s] : [s, ''];
    return { shortname: s, title, url };
  };
  return {
    referencedBy: f.referencedBy.map(spec),
    usesTermsFrom: f.usesTermsFrom.map(spec),
    normativeRefs: f.normativeRefs.map(([name, t]) => (t === undefined ? { name } : { name, url: named(t) ? file.specs[t][1] : t })),
    extendsInterfaces: f.extendsInterfaces,
    mostUsed: f.mostUsed.map(([term, href, count]) => ({ term, href, count })),
    crawlDate: file.crawled,
    specdex: specdexUrl(shortname),
  };
}

function isSlimFootprint(v: unknown): v is SlimFootprint {
  return isObject(v) && isStrings(v.referencedBy) && isStrings(v.usesTermsFrom) && isStrings(v.extendsInterfaces)
    && Array.isArray(v.normativeRefs) && v.normativeRefs.every((r) => isStrings(r) && (r.length === 1 || r.length === 2))
    && Array.isArray(v.mostUsed) && v.mostUsed.every((d) => Array.isArray(d) && d.length === 3 && isString(d[0]) && isString(d[1]) && typeof d[2] === 'number');
}

// Reads the footprint panel's file, as the page loads it, and throws on anything that isn't the shape above.
export function readFootprints(raw: unknown): FootprintFile {
  if (!isObject(raw) || !isString(raw.crawled) || !isObject(raw.specs) || !isObject(raw.footprints)) {
    throw new Error('footprint: expected crawled, specs, and footprints');
  }
  for (const [shortname, s] of Object.entries(raw.specs)) {
    if (!isStrings(s) || s.length !== 2) throw new Error(`footprint: bad title and URL for ${shortname}`);
  }
  for (const [shortname, f] of Object.entries(raw.footprints)) {
    if (!isSlimFootprint(f)) throw new Error(`footprint: bad footprint for ${shortname}`);
  }
  return raw as unknown as FootprintFile;
}

// From Web Specs Companion's src/logic/search.ts.
export function webidlpediaUrl(name: string): string {
  return `https://dontcallmedom.github.io/webidlpedia/names/${encodeURIComponent(name)}.html`;
}

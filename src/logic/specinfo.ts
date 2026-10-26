// What a spec's own panel shows, which opens from its name: its status, its abstract and editors (from the start of its
// page, which the build reads), its groups, its Editor's Draft and TR version, the other levels of its series, and its
// former names. The page fetches the file only when a spec panel first opens.
import { displayGroup } from './rows.ts';
import type { Editor, PageFacts } from './specpage.ts';

export interface SpecStatus {
  code?: string; // the short form its chip shows: WD, CRD, LS, CG, RFC, and so on
  name: string;
}

export interface SpecLevel {
  shortname: string;
  label: string; // the level's number, else its short title
  url: string;
}

export interface SpecInfo {
  status?: SpecStatus;
  tr?: string; // its name links its Editor's Draft, if any, so the panel has no other link to that
  abstract?: string[];
  editors?: Editor[];
  groups: { name: string; url: string }[];
  levels?: SpecLevel[]; // every level of its series, its own included, when there's more than one
  formerNames?: string[];
}

export interface SpecInfoFile {
  specs: Record<string, SpecInfo>;
}

// Upstream records are untyped JSON; each reader reads only the fields it keeps.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = any;

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

const CODES: Readonly<Record<string, string>> = {
  "editor's draft": 'ED',
  'working draft': 'WD',
  'first public working draft': 'FPWD',
  'candidate recommendation draft': 'CRD',
  'candidate recommendation snapshot': 'CRS',
  'proposed recommendation': 'PR',
  recommendation: 'REC',
  note: 'NOTE',
  'draft note': 'NOTE',
  statement: 'STMT',
  'draft registry': 'REG',
  registry: 'REG',
  'draft community group report': 'CG',
  'final community group report': 'CG',
  'unofficial proposal draft': 'UD',
  'discontinued draft': 'DISC',
  'living standard': 'LS',
  // An RFC's status says what track it's on, so the chip just says it's an RFC.
  'proposed standard': 'RFC',
  'internet standard': 'RFC',
  'best current practice': 'RFC',
  informational: 'RFC',
  experimental: 'RFC',
};

// A TR version's status, else its Editor's Draft's. browser-specs calls an IETF draft an Editor's Draft, which is an
// Internet-Draft by its own name.
export function statusOf(spec: unknown): SpecStatus | undefined {
  const s = spec as Raw;
  const name = str(s?.release?.status) ?? str(s?.nightly?.status);
  if (!name) return undefined;
  if (s.organization === 'IETF' && name === "Editor's Draft") return { code: 'I-D', name: 'Internet-Draft' };
  const code = CODES[name.toLowerCase()];
  const shown = name.replace("'", '’');
  return code ? { code, name: shown } : { name: shown };
}

// Every level of each series, in order, from the whole of browser-specs, so a level that isn't listed still shows.
function seriesLevels(specs: Raw[]): Map<string, SpecLevel[]> {
  const bySeries = new Map<string, { version: number; level: SpecLevel }[]>();
  for (const s of specs) {
    const series = str(s?.series?.shortname);
    const shortname = str(s?.shortname);
    const url = str(s?.nightly?.url) ?? str(s?.url);
    if (!series || !shortname || !url) continue;
    const label = str(s.seriesVersion) ?? str(s.shortTitle) ?? str(s.title) ?? shortname;
    const list = bySeries.get(series) ?? [];
    list.push({ version: Number.parseFloat(s.seriesVersion ?? '') || 0, level: { shortname, label, url } });
    bySeries.set(series, list);
  }
  const out = new Map<string, SpecLevel[]>();
  for (const [series, list] of bySeries) {
    if (list.length > 1) out.set(series, list.sort((a, b) => a.version - b.version).map((l) => l.level));
  }
  return out;
}

export function buildSpecInfo(specs: unknown, shortnames: ReadonlySet<string>, facts: ReadonlyMap<string, PageFacts>): SpecInfoFile {
  const list: Raw[] = Array.isArray(specs) ? specs : [];
  const levels = seriesLevels(list);
  const out: Record<string, SpecInfo> = {};
  for (const s of list) {
    const shortname = str(s?.shortname);
    if (!shortname || !shortnames.has(shortname)) continue;
    const groups: Raw[] = Array.isArray(s.groups) ? s.groups : [];
    const info: SpecInfo = {
      groups: groups.flatMap((g) => (str(g?.name) && str(g?.url) ? [{ name: displayGroup(g.name), url: g.url }] : [])),
    };
    const status = statusOf(s);
    if (status) info.status = status;
    const tr = str(s.release?.url);
    if (tr) info.tr = tr;
    const page = facts.get(shortname);
    if (page?.abstract) info.abstract = page.abstract;
    // Each editor's W3C ID is only for the build to find their GitHub login by.
    if (page?.editors) info.editors = page.editors.map(({ w3cid: _, ...shown }) => shown);
    const series = levels.get(str(s.series?.shortname) ?? '');
    if (series) info.levels = series;
    if (Array.isArray(s.formerNames) && s.formerNames.length > 0) info.formerNames = s.formerNames.filter(str);
    out[shortname] = info;
  }
  return { specs: out };
}

const isStrings = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === 'string');
const isEditor = (v: unknown) =>
  isObject(v) && typeof v.name === 'string' && [v.org, v.github].every((x) => x === undefined || typeof x === 'string');
const isLevel = (v: unknown) => isObject(v) && typeof v.shortname === 'string' && typeof v.label === 'string' && typeof v.url === 'string';
const isGroup = (v: unknown) => isObject(v) && typeof v.name === 'string' && typeof v.url === 'string';

function isSpecInfo(v: unknown): boolean {
  if (!isObject(v) || !Array.isArray(v.groups) || !v.groups.every(isGroup)) return false;
  if (v.status !== undefined && !(isObject(v.status) && typeof v.status.name === 'string')) return false;
  if (v.abstract !== undefined && !isStrings(v.abstract)) return false;
  if (v.formerNames !== undefined && !isStrings(v.formerNames)) return false;
  if (v.editors !== undefined && !(Array.isArray(v.editors) && v.editors.every(isEditor))) return false;
  if (v.levels !== undefined && !(Array.isArray(v.levels) && v.levels.every(isLevel))) return false;
  return v.tr === undefined || typeof v.tr === 'string';
}

export function readSpecInfo(raw: unknown): SpecInfoFile {
  if (!isObject(raw) || !isObject(raw.specs)) throw new Error('spec: expected specs');
  for (const [shortname, info] of Object.entries(raw.specs)) {
    if (!isSpecInfo(info)) throw new Error(`spec: bad entry for ${shortname}`);
  }
  return raw as unknown as SpecInfoFile;
}

export function specInfoView(file: SpecInfoFile, shortname: string): SpecInfo | undefined {
  return Object.hasOwn(file.specs, shortname) ? file.specs[shortname] : undefined;
}

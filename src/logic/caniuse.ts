// From Web Specs Companion's src/logic/caniuse.ts, copied whole so that copying it again re-syncs it.
// Works out, from caniuse's own data (caniuse-db), each caniuse feature's support history in desktop Firefox, Safari,
// and Chrome, as runs of versions with the same support, and which specs in browser-specs each feature belongs to.
import type { SlimSpec } from '../shared/types.ts';
import { matchSpecUrl, specUrlIndex } from './implementations.ts';

export type Support = 'y' | 'a' | 'n' | 'u';
export type CiuBrowser = 'firefox' | 'safari' | 'chrome';
export const CIU_BROWSERS: readonly CiuBrowser[] = ['firefox', 'safari', 'chrome'];

export interface CiuRun {
  from: string; // the run's first version, e.g. '42'; caniuse's own version strings, such as '18.5-18.7' or 'TP'
  to: string; // its last version
  support: Support;
  flag?: true; // caniuse's d: Behind a flag
  prefix?: true; // caniuse's x: Needs a prefix
  notes?: number[]; // the note numbers the run cites
  month?: string; // YYYY-MM its first version was released; betas have none
  current?: true; // the run that holds the current release
  beta?: true;
}

export interface CiuFeature {
  title: string;
  usage: number; // global support, all browsers, in percent
  runs: Record<CiuBrowser, CiuRun[]>; // oldest first
  notes: Record<string, string>; // only those a partial or flagged run cites
}

export interface CiuFile {
  caniuse: { version: string; updated: string }; // caniuse-db's npm version, and its data's update date as YYYY-MM-DD
  features: Record<string, CiuFeature>; // by caniuse ID
  specs: Record<string, string[]>; // by browser-specs shortname: caniuse IDs, sorted
}

// One of a browser's versions, as caniuse-db lists them, in order.
export interface CiuVersion {
  version: string;
  release_date?: number | null; // seconds since the epoch
  era: number; // below 0 for past releases, 0 for the current one, above 0 for betas
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const strings = (v: unknown): string[] => ([] as unknown[]).concat(v ?? []).filter((s): s is string => typeof s === 'string');

// Reads a support code such as 'a x #2 #3'. A polyfill's p counts as n, since the history is about the engine.
function parseCode(code: string): Pick<CiuRun, 'support' | 'flag' | 'prefix' | 'notes'> {
  const parts = code.trim().split(/\s+/);
  const first = parts[0];
  const support: Support = first === 'y' ? 'y' : first === 'a' ? 'a' : first === 'n' || first === 'p' ? 'n' : 'u';
  const notes = parts.filter((p) => /^#\d+$/.test(p)).map((p) => Number(p.slice(1)));
  return {
    support,
    ...(parts.includes('d') ? { flag: true as const } : {}),
    ...(parts.includes('x') ? { prefix: true as const } : {}),
    ...(notes.length > 0 ? { notes } : {}),
  };
}

// Groups a browser's versions into runs of the same support code. The current release ends the past runs (a past run
// with the same code merges into the current one), and betas form runs of their own.
export function buildRuns(versions: CiuVersion[], stats: Record<string, unknown>): CiuRun[] {
  const runs: CiuRun[] = [];
  let last: { code: string; phase: number } | undefined;
  for (const v of versions) {
    const code = typeof stats[v.version] === 'string' ? (stats[v.version] as string) : 'u';
    const phase = Math.sign(v.era);
    const run = runs[runs.length - 1];
    if (run && last && last.code === code && (last.phase === phase || (last.phase === -1 && phase === 0))) {
      run.to = v.version;
      if (phase === 0) run.current = true;
      last.phase = phase;
      continue;
    }
    const next: CiuRun = { from: v.version, to: v.version, ...parseCode(code) };
    if (phase < 1 && typeof v.release_date === 'number') next.month = new Date(v.release_date * 1000).toISOString().slice(0, 7);
    if (phase === 0) next.current = true;
    if (phase === 1) next.beta = true;
    runs.push(next);
    last = { code, phase };
  }
  return runs;
}

// Builds the Can I Use file. A caniuse feature belongs to a spec when its own spec URL matches the spec, or when the
// spec URL of a web-features feature that lists its caniuse ID does. Of a feature's notes, it keeps just the ones that
// a partial or flagged run cites.
export function buildCaniuse(caniuse: unknown, webFeatures: unknown, specs: SlimSpec[], version: string): CiuFile {
  const c = isObject(caniuse) ? caniuse : {};
  const agents = isObject(c.agents) ? c.agents : {};
  const data = isObject(c.data) ? c.data : {};
  const index = specUrlIndex(specs);
  const viaWebFeatures = new Map<string, string[]>();
  const wf = isObject(webFeatures) && isObject(webFeatures.features) ? webFeatures.features : {};
  for (const f of Object.values(wf)) {
    if (!isObject(f) || (f.kind !== undefined && f.kind !== 'feature')) continue;
    for (const id of strings(f.caniuse)) viaWebFeatures.set(id, [...(viaWebFeatures.get(id) ?? []), ...strings(f.spec)]);
  }
  const versionsOf = (b: CiuBrowser): CiuVersion[] => {
    const a = agents[b];
    return isObject(a) && Array.isArray(a.version_list) ? (a.version_list as CiuVersion[]) : [];
  };
  const features: Record<string, CiuFeature> = {};
  const bySpec = new Map<string, string[]>();
  for (const id of Object.keys(data).sort()) {
    const f = data[id];
    if (!isObject(f)) continue;
    const urls = [...strings(f.spec), ...(viaWebFeatures.get(id) ?? [])];
    const shortnames = new Set(urls.map((u) => matchSpecUrl(index, u)).filter((s): s is string => s !== undefined));
    if (shortnames.size === 0) continue;
    const stats = isObject(f.stats) ? f.stats : {};
    const runs = Object.fromEntries(
      CIU_BROWSERS.map((b) => [b, buildRuns(versionsOf(b), isObject(stats[b]) ? stats[b] : {})]),
    ) as Record<CiuBrowser, CiuRun[]>;
    const cited = new Set(CIU_BROWSERS.flatMap((b) => runs[b].filter((r) => r.support !== 'y' || r.flag).flatMap((r) => r.notes ?? [])));
    const all = isObject(f.notes_by_num) ? f.notes_by_num : {};
    const notes: Record<string, string> = {};
    for (const n of [...cited].sort((a, b) => a - b)) if (typeof all[n] === 'string') notes[n] = all[n] as string;
    const usage = Math.round(((Number(f.usage_perc_y) || 0) + (Number(f.usage_perc_a) || 0)) * 10) / 10;
    features[id] = { title: typeof f.title === 'string' ? f.title : id, usage, runs, notes };
    for (const s of shortnames) bySpec.set(s, [...(bySpec.get(s) ?? []), id]);
  }
  const out: Record<string, string[]> = {};
  for (const s of [...bySpec.keys()].sort()) out[s] = bySpec.get(s)!;
  const updated = typeof c.updated === 'number' ? new Date(c.updated * 1000).toISOString().slice(0, 10) : '';
  return { caniuse: { version, updated }, features, specs: out };
}

export interface CiuSegment {
  start: number; // percent of the axis
  width: number; // percent of the axis; the card draws at least 3px
  support: Support;
  flag?: true;
  prefix?: true;
  beta?: true;
  tip: string;
}

export interface CiuBar {
  browser: CiuBrowser;
  name: string; // 'Firefox', 'Safari', or 'Chrome'
  label: string;
  chip: string;
  support: Support; // the current release's
  text: string; // the whole history in words
  segments: CiuSegment[];
}

export interface CiuNote {
  n: number;
  cited: string; // the browsers and versions that cite it, e.g. 'Firefox 34-38, Chrome 40-41'
  text: string;
}

export interface CiuFeatureView {
  id: string;
  title: string;
  url: string;
  usage: number;
  bars: CiuBar[];
  ticks: { at: number; label: string }[]; // at: Percent of the axis
  today: number; // percent of the axis
  notes: CiuNote[];
}

export type CiuEntry = CiuFeature & { id: string };

// What the card gets for a spec: its features, or its series' current level's (fromSeries), and caniuse-db's version.
export interface CiuAnswer {
  features: CiuEntry[]; // sorted by title
  source: CiuFile['caniuse'];
  fromSeries?: { shortname: string; title: string };
}

export type NotePart = { text: string; href?: string; code?: true };

const NAMES: Record<CiuBrowser, string> = { firefox: 'Firefox', safari: 'Safari', chrome: 'Chrome' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// The axis runs this many years past today, which leaves room for the betas.
const AFTER_TODAY = 1;

const years = (month: string) => Number(month.slice(0, 4)) + (Number(month.slice(5, 7)) - 1) / 12;
const monthName = (month: string) => `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
const version = (v: string) => v.replace('-', '\u2013');
const versions = (from: string, to: string) => (from === to ? version(from) : `${version(from)}\u2013${version(to)}`);
const span = (r: CiuRun) => versions(r.from, r.to);

function state(r: CiuRun): string {
  let w = { y: 'yes', a: 'partial', n: 'no', u: 'unknown' }[r.support];
  if (r.flag) w += ', behind a flag';
  if (r.prefix) w += ', with a prefix';
  return w;
}

const noted = (r: CiuRun) => (r.notes?.length ? ` (note${r.notes.length > 1 ? 's' : ''} ${r.notes.join(', ')})` : '');
const words = (r: CiuRun) => state(r) + noted(r);

// The label beside a bar, and the chip's short form, by the first of these that holds: supported now, supported only in
// a beta, partial now, removed, behind a flag now, not supported, and unknown. The support is the current release's.
function labelOf(runs: CiuRun[]): { label: string; chip: string; support: Support } {
  const past = runs.filter((r) => !r.beta);
  const found = past.findIndex((r) => r.current);
  const at = found >= 0 ? found : past.length - 1;
  const cur = past[at];
  if (!cur) return { label: 'Unknown', chip: '?', support: 'u' };
  const backTo = (support: Support) => {
    let j = at;
    while (j > 0 && past[j - 1].support === support) j--;
    return past[j];
  };
  if (cur.support === 'y') {
    const first = backTo('y');
    const since = `${version(first.from)}+`;
    const label = first.month ? `${since} \u00b7 ${monthName(first.month)}` : since;
    return { label: cur.prefix ? `${label} (prefixed)` : label, chip: since, support: 'y' };
  }
  const landing = runs.find((r) => r.beta && r.support === 'y');
  if (landing) {
    const tp = landing.from === 'TP';
    return { label: tp ? 'In Technology Preview' : `Lands in ${version(landing.from)} (beta)`, chip: tp ? 'TP' : `${version(landing.from)} beta`, support: cur.support };
  }
  if (cur.support === 'a') return { label: `Partial \u00b7 since ${version(backTo('a').from)}`, chip: 'Partial', support: 'a' };
  const lastYes = past.slice(0, at).map((r) => r.support).lastIndexOf('y');
  if (lastYes >= 0) return { label: `No \u00b7 removed in ${version(past[lastYes + 1].from)}`, chip: 'No', support: cur.support };
  if (cur.flag) return { label: 'Behind a flag', chip: 'Flag', support: cur.support };
  if (cur.support === 'n') return { label: 'No', chip: 'No', support: 'n' };
  return { label: 'Unknown', chip: '?', support: 'u' };
}

// A year before the feature first changed in any of the three browsers, or five years before today when it never did.
function axisStart(feature: CiuFeature, today: number): number {
  const changes = CIU_BROWSERS.flatMap((b) => feature.runs[b].slice(1).flatMap((r) => (!r.beta && r.month ? [years(r.month)] : [])));
  return changes.length > 0 ? Math.min(...changes) - 1 : today - 5;
}

// A bar's segments. A run starts at its month, or with the run before it when it has none, and ends where the next
// non-beta run starts, or at today for the current run. Betas share the space after today, in order.
function segmentsOf(name: string, runs: CiuRun[], start: number, today: number, pct: (t: number) => number): CiuSegment[] {
  const past = runs.filter((r) => !r.beta);
  const betas = runs.filter((r) => r.beta);
  const starts: number[] = [];
  for (const [i, r] of past.entries()) starts.push(r.month ? years(r.month) : i > 0 ? starts[i - 1] : start);
  const segments: CiuSegment[] = [];
  const add = (r: CiuRun, from: number, to: number, tip: string) => {
    const s = pct(Math.max(from, start));
    const e = pct(Math.max(to, start));
    segments.push({
      start: s,
      width: Math.max(0, Math.round((e - s) * 100) / 100),
      support: r.support,
      ...(r.flag ? { flag: true as const } : {}),
      ...(r.prefix ? { prefix: true as const } : {}),
      ...(r.beta ? { beta: true as const } : {}),
      tip,
    });
  };
  for (const [i, r] of past.entries()) {
    const to = i + 1 < past.length ? starts[i + 1] : today;
    if (to < start) continue;
    add(r, starts[i], to, `${name} ${span(r)}: ${words(r)}${r.month ? `, from ${monthName(r.month)}` : ''}`);
  }
  const step = AFTER_TODAY / Math.max(betas.length, 1);
  for (const [i, r] of betas.entries()) add(r, today + i * step, today + (i + 1) * step, `${name} ${span(r)} (beta): ${words(r)}`);
  return segments;
}

const citing = (r: CiuRun, n: number) => (r.support !== 'y' || !!r.flag) && !!r.notes?.includes(n);

// Each note a partial or flagged run cites, credited to the browsers and versions citing it, with adjacent runs merged.
function notesOf(feature: CiuFeature): CiuNote[] {
  const nums = Object.keys(feature.notes).map(Number).sort((a, b) => a - b);
  return nums.flatMap((n) => {
    const cited = CIU_BROWSERS.flatMap((b) => {
      const runs = feature.runs[b];
      const spans: string[] = [];
      for (let i = 0; i < runs.length; i++) {
        if (!citing(runs[i], n)) continue;
        let j = i;
        while (j + 1 < runs.length && citing(runs[j + 1], n)) j++;
        spans.push(versions(runs[i].from, runs[j].to));
        i = j;
      }
      return spans.length > 0 ? [`${NAMES[b]} ${spans.join(', ')}`] : [];
    });
    return cited.length > 0 ? [{ n, cited: cited.join(', '), text: feature.notes[n] }] : [];
  });
}

// What the card draws for a feature: its link, its global support, a bar per browser, the axis's ticks, and its notes.
// Positions are percents of the axis, which takes now (in milliseconds) for today.
export function featureView(id: string, feature: CiuFeature, now: number): CiuFeatureView {
  const d = new Date(now);
  const today = d.getUTCFullYear() + d.getUTCMonth() / 12 + (d.getUTCDate() - 1) / 365;
  const start = axisStart(feature, today);
  const end = today + AFTER_TODAY;
  const pct = (t: number) => Math.round(((t - start) / (end - start)) * 10000) / 100;
  const bars = CIU_BROWSERS.map((b): CiuBar => {
    const runs = feature.runs[b];
    const name = NAMES[b];
    const history = runs.map((r) => `${state(r)} in ${span(r)}${noted(r)}${r.beta ? ' (beta)' : ''}`).join('; ');
    return { browser: b, name, ...labelOf(runs), text: `${name}: ${history || 'no data'}`, segments: segmentsOf(name, runs, start, today, pct) };
  });
  const first = Math.floor(start) + 1;
  const ticks = [{ at: pct(first), label: String(first) }];
  const thisYear = Math.floor(today);
  if (thisYear - first >= 6) {
    const mid = Math.round((first + thisYear) / 2);
    ticks.push({ at: pct(mid), label: String(mid) });
  }
  ticks.push({ at: pct(today), label: 'now' });
  return { id, title: feature.title, url: `https://caniuse.com/${id}`, usage: feature.usage, bars, ticks, today: pct(today), notes: notesOf(feature) };
}

// Splits a caniuse note's Markdown into text, code (in backticks), and links ([text](url), or a bare URL, without the
// punctuation that ends a sentence after it).
export function noteParts(note: string): NotePart[] {
  const parts: NotePart[] = [];
  const re = /`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|https?:\/\/[^\s<>()]+/g;
  let at = 0;
  for (const m of note.matchAll(re)) {
    if (m.index > at) parts.push({ text: note.slice(at, m.index) });
    if (m[1] !== undefined) parts.push({ text: m[1], code: true });
    else if (m[2] !== undefined) parts.push({ text: m[2], href: m[3] });
    else {
      const url = m[0].replace(/[.,;:]+$/, '');
      parts.push({ text: url, href: url });
      if (url.length < m[0].length) parts.push({ text: m[0].slice(url.length) });
    }
    at = m.index + m[0].length;
  }
  if (at < note.length) parts.push({ text: note.slice(at) });
  return parts;
}

export function filterByTitle<T extends { title: string }>(items: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  return q ? items.filter((i) => i.title.toLowerCase().includes(q)) : items;
}

const SUPPORTS: readonly string[] = ['y', 'a', 'n', 'u'];
const isRun = (r: unknown): r is CiuRun =>
  isObject(r) && typeof r.from === 'string' && typeof r.to === 'string' && SUPPORTS.includes(r.support as string)
  && (r.notes === undefined || (Array.isArray(r.notes) && r.notes.every((n) => Number.isInteger(n))))
  && (r.month === undefined || (typeof r.month === 'string' && /^\d{4}-\d{2}$/.test(r.month)));

// Checks a feature's shape, down to each run, so a file from another build, or a copy stored by another version of the
// extension, can't hand the card a feature it can't draw.
export function isCiuFeature(value: unknown): value is CiuFeature {
  if (!isObject(value) || typeof value.title !== 'string' || typeof value.usage !== 'number') return false;
  const { runs, notes } = value;
  return isObject(runs) && CIU_BROWSERS.every((b) => Array.isArray(runs[b]) && (runs[b] as unknown[]).every(isRun))
    && isObject(notes) && Object.values(notes).every((t) => typeof t === 'string');
}

// A spec's features, sorted by title, each one's shape checked, since a copy the extension stored isn't slimmed again.
export function caniuseFeatures(file: CiuFile, shortname: string): CiuEntry[] {
  if (!isObject(file) || !isObject(file.specs) || !isObject(file.features)) return [];
  const ids = Object.hasOwn(file.specs, shortname) ? file.specs[shortname] : undefined;
  if (!Array.isArray(ids)) return [];
  const features = file.features;
  return ids
    .flatMap((id) => (typeof id === 'string' && Object.hasOwn(features, id) && isCiuFeature(features[id]) ? [{ ...features[id], id }] : []))
    .sort((a, b) => a.title.localeCompare(b.title, 'en', { sensitivity: 'base' }));
}

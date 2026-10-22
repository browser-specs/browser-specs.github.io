// From Web Specs Companion's src/logic/wpt.ts, copied whole so that copying it again re-syncs it.
// The web-platform-tests results of each spec, from wpt.fyi's latest aligned stable runs: which tests are the spec's,
// how each browser does on them, wpt.fyi's interop score, and the tests that fail in only one browser. Then the card's
// formatting of those numbers, and links into wpt.fyi, each pinned to the runs the numbers came from.
import type { SlimSpec } from '../shared/types.ts';

export type WptBrowser = 'firefox' | 'safari' | 'chrome';
export const WPT_BROWSERS: readonly WptBrowser[] = ['firefox', 'safari', 'chrome'];

export interface WptStats {
  tests: number; // test files
  pass: Record<WptBrowser, [number, number]>; // [passing subtests, subtests]
  interop: number; // percent, one decimal
  only: Record<WptBrowser, number>; // tests wpt.fyi's search finds failing in that browser alone
}

export interface WptSpec {
  paths: string[]; // the spec's test directories that have tests, in browser-specs' order
  exclude?: string[]; // the spec's excludePaths; left out when there are none
  all: WptStats;
  dirs?: [string, WptStats][]; // per test directory with tests, in paths order; left out when there's just one
}

export interface WptRun {
  id: number;
  version: string;
  os: string; // as wpt.fyi names it, e.g. 'linux', 'mac'
}

export interface WptFile {
  runs: Record<WptBrowser, WptRun>;
  revision: string; // the WPT commit all three ran
  date: string; // YYYY-MM-DD the earliest of the three runs started
  specs: Record<string, WptSpec>; // by browser-specs shortname
}

export type WptRuns = Pick<WptFile, 'runs' | 'revision' | 'date'>;
export type WptResult = { s: string; c: [number, number] };
export type WptSummary = Record<string, WptResult>;

const WPT_REPO = 'https://github.com/web-platform-tests/wpt';

// A test's [passing, total] subtests in one run. A test with no subtests, such as a reftest, counts as one subtest that
// passes when its status does, and a test the run lacks counts as failed there.
export function countTest(result: WptResult | undefined): [number, number] {
  if (!result) return [0, 1];
  const [passing, total] = result.c;
  if (total > 0) return [passing, total];
  return result.s === 'P' || result.s === 'O' ? [1, 1] : [0, 1];
}

// Only a full pass is 100 and only no passes is 0, so a browser failing one subtest in thousands never reads as 100.
export function percent(part: number, whole: number): number {
  if (whole <= 0 || part <= 0) return 0;
  if (part >= whole) return 100;
  return Math.min(99.9, Math.max(0.1, Math.round((1000 * part) / whole) / 10));
}

// browser-specs writes a directory with or without its slashes, and sometimes lists one twice.
const unique = (paths: string[]) => [...new Set(paths.map((p) => p.split('/').filter(Boolean).join('/')).filter(Boolean))];

export function buildWpt(meta: WptRuns, summaries: Record<WptBrowser, WptSummary>, only: Record<WptBrowser, string[]>, specs: SlimSpec[]): WptFile {
  const names = [...new Set(WPT_BROWSERS.flatMap((b) => Object.keys(summaries[b])))];
  const onlySets = Object.fromEntries(WPT_BROWSERS.map((b) => [b, new Set(only[b])])) as Record<WptBrowser, Set<string>>;

  const stats = (tests: string[]): WptStats => {
    const pass = Object.fromEntries(WPT_BROWSERS.map((b) => [b, [0, 0]])) as Record<WptBrowser, [number, number]>;
    let lowest = 0;
    for (const name of tests) {
      let min = 1;
      for (const b of WPT_BROWSERS) {
        const [passing, total] = countTest(summaries[b][name]);
        pass[b][0] += passing;
        pass[b][1] += total;
        min = Math.min(min, passing / total);
      }
      lowest += min;
    }
    const onlyCounts = Object.fromEntries(WPT_BROWSERS.map((b) => [b, tests.filter((t) => onlySets[b].has(t)).length])) as Record<WptBrowser, number>;
    return { tests: tests.length, pass, interop: percent(lowest, tests.length), only: onlyCounts };
  };

  const entries: [string, WptSpec][] = [];
  const byName = [...specs].sort((a, b) => (a.shortname < b.shortname ? -1 : a.shortname > b.shortname ? 1 : 0));
  for (const { shortname, tests: t } of byName) {
    if (t?.repository !== WPT_REPO || !t.testPaths) continue;
    const exclude = unique(t.excludePaths ?? []);
    const kept = (name: string) => !exclude.some((e) => name.startsWith(`/${e}/`));
    const dirs: [string, string[]][] = [];
    for (const path of unique(t.testPaths)) {
      const tests = names.filter((name) => name.startsWith(`/${path}/`) && kept(name));
      if (tests.length > 0) dirs.push([path, tests]);
    }
    if (dirs.length === 0) continue;
    const all = [...new Set(dirs.flatMap(([, tests]) => tests))];
    entries.push([
      shortname,
      {
        paths: dirs.map(([path]) => path),
        ...(exclude.length > 0 ? { exclude } : {}),
        all: stats(all),
        ...(dirs.length > 1 ? { dirs: dirs.map(([path, tests]): [string, WptStats] => [path, stats(tests)]) } : {}),
      },
    ]);
  }
  return { runs: meta.runs, revision: meta.revision, date: meta.date, specs: Object.fromEntries(entries) };
}

export const BROWSER_NAMES: Record<WptBrowser, string> = { firefox: 'Firefox', safari: 'Safari', chrome: 'Chrome' };

export interface WptAnswer extends WptRuns {
  spec: WptSpec;
  fromSeries?: { shortname: string; title: string };
}

export type Tint = 'hi' | 'mid' | 'lo';

export function formatPct(x: number): string {
  return x === 100 ? '100' : x === 0 ? '0' : x.toFixed(1);
}

// The button's whole number follows the same rule: 100 and 0 only when exact, so 99.6 reads as 99 and 0.3 as 1.
export function roundPct(x: number): number {
  return x === 100 || x === 0 ? x : Math.min(99, Math.max(1, Math.round(x)));
}

export const tint = (x: number): Tint => (x >= 95 ? 'hi' : x >= 80 ? 'mid' : 'lo');

export function subtests([passing, total]: [number, number]): string {
  return `${passing.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} ${total === 1 ? 'subtest' : 'subtests'}`;
}

export const passRate = (pass: [number, number]): number => percent(pass[0], pass[1]);

// wpt.fyi's results page shows the runs it's given in this order, and a search names the other two browsers in it too.
const RUN_ORDER: readonly WptBrowser[] = ['chrome', 'firefox', 'safari'];

function resultsUrl(path: string, terms: string[], runs: WptFile['runs']): string {
  const ids = RUN_ORDER.map((b) => `run_id=${runs[b].id}`).join('&');
  const q = terms.join(' ');
  return `https://wpt.fyi/results/${path}?${ids}${q ? `&q=${encodeURIComponent(q)}` : ''}`;
}

// The spec's excluded subdirectories inside any of the given directories, as search terms that leave them out.
const exclusions = (spec: WptSpec, dirs: string[]) =>
  (spec.exclude ?? []).filter((e) => dirs.some((d) => e === d || e.startsWith(`${d}/`))).map((e) => `!path:/${e}/`);

// All of a spec's tests: its one directory, or the results root narrowed to its directories.
function allView(spec: WptSpec): [string, string[]] {
  if (spec.paths.length === 1) return [spec.paths[0], exclusions(spec, spec.paths)];
  return ['', [`(${spec.paths.map((p) => `path:/${p}/`).join(' or ')})`, ...exclusions(spec, spec.paths)]];
}

export function dirUrl(spec: WptSpec, dir: string, runs: WptFile['runs']): string {
  return resultsUrl(dir, exclusions(spec, [dir]), runs);
}

export function allUrl(spec: WptSpec, runs: WptFile['runs']): string {
  const [path, terms] = allView(spec);
  return resultsUrl(path, terms, runs);
}

export function onlyUrl(spec: WptSpec, browser: WptBrowser, runs: WptFile['runs']): string {
  const [path, terms] = allView(spec);
  const others = RUN_ORDER.filter((b) => b !== browser).map((b) => `${b}:pass`);
  return resultsUrl(path, [...terms, `${browser}:!pass`, ...others], runs);
}

const OS_NAMES: Record<string, string> = { linux: 'Linux', mac: 'macOS', win: 'Windows' };

const list = (items: string[]) =>
  items.length <= 2 ? items.join(' and ') : `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;

export function runsSentence(runs: WptFile['runs']): string {
  const byOs = new Map<string, string[]>();
  for (const b of WPT_BROWSERS) {
    const { version, os } = runs[b];
    byOs.set(os, [...(byOs.get(os) ?? []), `${BROWSER_NAMES[b]} ${version.split(/[. ]/)[0]}`]);
  }
  const groups = [...byOs].map(([os, names]) => `${list(names)} on ${Object.hasOwn(OS_NAMES, os) ? OS_NAMES[os] : os}`);
  return `stable ${groups.join(', ')}`;
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isRun = (v: unknown): v is WptRun => isObject(v) && typeof v.id === 'number' && typeof v.version === 'string' && typeof v.os === 'string';
const isCount = (v: unknown, min: number) => typeof v === 'number' && Number.isInteger(v) && v >= min;
const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

// The runs, revision, and date of a file, or undefined when any of them is missing or malformed.
export function wptMeta(file: unknown): WptRuns | undefined {
  if (!isObject(file) || !isObject(file.runs) || typeof file.revision !== 'string' || typeof file.date !== 'string') return undefined;
  const runs = file.runs;
  if (!WPT_BROWSERS.every((b) => isRun(runs[b]))) return undefined;
  const picked = Object.fromEntries(WPT_BROWSERS.map((b) => {
    const { id, version, os } = runs[b] as WptRun;
    return [b, { id, version, os }];
  })) as Record<WptBrowser, WptRun>;
  return { runs: picked, revision: file.revision, date: file.date };
}

function isStats(v: unknown): v is WptStats {
  if (!isObject(v)) return false;
  const { tests, pass, interop, only } = v;
  return isCount(tests, 1) && typeof interop === 'number' && interop >= 0 && interop <= 100 && isObject(pass) && isObject(only)
    && WPT_BROWSERS.every((b) => {
      const p = pass[b];
      return Array.isArray(p) && p.length === 2 && isCount(p[0], 0) && isCount(p[1], 0) && p[0] <= p[1] && isCount(only[b], 0);
    });
}

export function isWptSpec(value: unknown): value is WptSpec {
  if (!isObject(value)) return false;
  const { paths, exclude, all, dirs } = value;
  return isStrings(paths) && paths.length > 0 && paths.every((p) => p !== '')
    && (exclude === undefined || isStrings(exclude))
    && isStats(all)
    && (dirs === undefined || (Array.isArray(dirs) && dirs.every((d) => Array.isArray(d) && d.length === 2 && typeof d[0] === 'string' && isStats(d[1]))));
}

// A copy stored by another version of the extension isn't slimmed again, so each lookup checks the entry's shape.
export function wptSpec(file: WptFile, shortname: string): WptSpec | undefined {
  if (!isObject(file) || !isObject(file.specs) || !Object.hasOwn(file.specs, shortname)) return undefined;
  const entry: unknown = file.specs[shortname];
  return isWptSpec(entry) ? entry : undefined;
}

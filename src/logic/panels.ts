// What each spec's panels show: Web Specs Companion's four files, cut down to the listed specs, which the page fetches
// only when a panel of that kind first opens, and the view of one spec's data that each panel renders. A view is the
// spec's own data or nothing, never its series' current level's, so a panel always matches its cell in the list.
import { isImplRecord, type ImplFile, type ImplView } from './implementations.ts';
import type { MdnFile } from './mdn.ts';
import { caniuseFeatures, type CiuAnswer, type CiuFile } from './caniuse.ts';
import { wptSpec, type WptAnswer, type WptFile } from './wpt.ts';

export type PanelKind = 'missing' | 'mdn' | 'caniuse' | 'wpt';
export const PANEL_KINDS: readonly PanelKind[] = ['missing', 'mdn', 'caniuse', 'wpt'];

export interface Panels {
  missing: ImplFile;
  mdn: MdnFile;
  caniuse: CiuFile;
  wpt: WptFile;
}

const pick = <T>(specs: Record<string, T>, keep: ReadonlySet<string>): Record<string, T> =>
  Object.fromEntries(Object.entries(specs).filter(([shortname]) => keep.has(shortname)));

// Keeps the MDN pages the kept specs list, in their order, and renumbers each spec's indexes to match.
function slimMdnPages(file: MdnFile, keep: ReadonlySet<string>): MdnFile {
  const specs = pick(file.specs, keep);
  const used = [...new Set(Object.values(specs).flat())].sort((a, b) => a - b);
  const at = new Map(used.map((old, i) => [old, i]));
  return {
    content: file.content,
    types: file.types,
    pages: used.map((i) => file.pages[i]),
    specs: Object.fromEntries(Object.entries(specs).map(([shortname, ids]) => [shortname, ids.map((i) => at.get(i)!)])),
  };
}

export function slimPanels(files: Panels, shortnames: ReadonlySet<string>): Panels {
  const caniuseSpecs = pick(files.caniuse.specs, shortnames);
  const features = new Set(Object.values(caniuseSpecs).flat());
  return {
    missing: { bcd: files.missing.bcd, specs: pick(files.missing.specs, shortnames) },
    mdn: slimMdnPages(files.mdn, shortnames),
    caniuse: { caniuse: files.caniuse.caniuse, features: pick(files.caniuse.features, features), specs: caniuseSpecs },
    wpt: { runs: files.wpt.runs, revision: files.wpt.revision, date: files.wpt.date, specs: pick(files.wpt.specs, shortnames) },
  };
}

export function missingView(file: ImplFile, shortname: string): ImplView | undefined {
  const record: unknown = Object.hasOwn(file.specs, shortname) ? file.specs[shortname] : undefined;
  return isImplRecord(record) ? { ...record, bcd: file.bcd } : undefined;
}

export function caniuseAnswer(file: CiuFile, shortname: string): CiuAnswer | undefined {
  const features = caniuseFeatures(file, shortname);
  return features.length > 0 ? { features, source: file.caniuse } : undefined;
}

export function wptAnswer(file: WptFile, shortname: string): WptAnswer | undefined {
  const spec = wptSpec(file, shortname);
  return spec ? { spec, runs: file.runs, revision: file.revision, date: file.date } : undefined;
}

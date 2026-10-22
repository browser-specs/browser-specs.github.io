// Builds the site into _site/: the page and its bundled script, the list of specs (data/specs.json), and the panels'
// data (data/panels/), from the sources fetchSources() gets. It fails rather than write a site far thinner than usual,
// so a broken source can't replace the deployed site with a thin one.
import { build } from 'esbuild';
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { makeCategorizer } from '../src/logic/categories.ts';
import { slimCaniuse, slimImplementations, slimMdn, slimWpt } from '../src/logic/files.ts';
import { PANEL_KINDS, slimPanels, type Panels } from '../src/logic/panels.ts';
import { BUCKETS, buildRows, specLike, type RowsFile, type SpecLike } from '../src/logic/rows.ts';
import { retrying } from './fetch.ts';
import { fetchSources, type Sources } from './sources.ts';

const root = fileURLToPath(new URL('..', import.meta.url));

// The sources on 22 October 2026 gave 642 specs, 454 of them with engine data and 594 with a date, so far fewer means
// a source has changed shape or lost data.
export interface Floors {
  rows: number;
  engines: number;
  dated: number;
}
export const FLOORS: Floors = { rows: 500, engines: 300, dated: 400 };

export interface SiteData {
  rowsFile: RowsFile;
  panels: Panels;
}

export function buildData(sources: Sources, now: Date): SiteData {
  const files: Panels = {
    missing: slimImplementations(sources.implementations),
    mdn: slimMdn(sources.mdn),
    caniuse: slimCaniuse(sources.caniuse),
    wpt: slimWpt(sources.wpt),
  };
  const raw: unknown[] = Array.isArray(sources.specs) ? sources.specs : [];
  const specs = raw.map(specLike).filter((s): s is SpecLike => !!s);
  const rowsFile = buildRows(
    { specs: raw, webref: sources.webref, impl: files.missing, mdn: files.mdn, caniuse: files.caniuse, wpt: files.wpt, webFeatures: sources.webFeatures },
    makeCategorizer(sources.webFeatures.data, specs),
    now,
  );
  return { rowsFile, panels: slimPanels(files, new Set(rowsFile.rows.map((r) => r.shortname))) };
}

export function validate(file: RowsFile, floors: Floors = FLOORS): void {
  const { rows } = file;
  if (rows.length < floors.rows) throw new Error(`only ${rows.length} specs, fewer than ${floors.rows}`);
  const engines = rows.filter((r) => r.engines).length;
  if (engines < floors.engines) throw new Error(`only ${engines} specs with engine data, fewer than ${floors.engines}`);
  const dated = rows.filter((r) => r.updated).length;
  if (dated < floors.dated) throw new Error(`only ${dated} specs with an updated date, fewer than ${floors.dated}`);
}

export async function writeSite(out: string, data: SiteData): Promise<void> {
  await mkdir(`${out}/data/panels`, { recursive: true });
  await writeFile(`${out}/data/specs.json`, JSON.stringify(data.rowsFile));
  for (const kind of PANEL_KINDS) await writeFile(`${out}/data/panels/${kind}.json`, JSON.stringify(data.panels[kind]));
  await build({
    entryPoints: [root + 'src/page/main.tsx'],
    outfile: `${out}/app.js`,
    bundle: true,
    format: 'iife',
    minify: true,
    target: 'es2022',
    jsx: 'automatic',
    jsxImportSource: 'preact',
    logLevel: 'warning',
  });
  for (const file of ['index.html', 'style.css', 'favicon.ico']) await cp(root + 'site/' + file, `${out}/${file}`);
  await cp(root + 'site/icons', `${out}/icons`, { recursive: true });
}

async function main() {
  const out = root + '_site';
  await rm(out, { recursive: true, force: true });
  const data = buildData(await fetchSources(retrying(fetch)), new Date());
  validate(data.rowsFile);
  await writeSite(out, data);
  const { rows } = data.rowsFile;
  const buckets = BUCKETS.map((b) => `${b}: ${rows.filter((r) => r.bucket === b).length}`).join(', ');
  console.log(`${rows.length} specs; by engine count, ${buckets}`);
  console.log(out);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}

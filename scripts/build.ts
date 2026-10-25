// Builds the site into _site/: the page and its bundled script, the list of specs (data/specs.json), and the panels'
// data (data/panels/), from the sources fetchSources() gets and the start of each spec's page, along with the copies of
// those pages' facts (data/spec-pages.json) that the next build asks each server for a change since, and the editors'
// GitHub accounts (data/editor-accounts.json) that the next builds reuse for a day. It fails rather than write a site
// far thinner than usual, so a broken source can't replace the deployed site with a thin one.
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { makeCategorizer } from '../src/logic/categories.ts';
import { slimCaniuse, slimImplementations, slimMdn, slimWpt } from '../src/logic/files.ts';
import { buildFootprints, indexSpecs, type FootprintExtracts } from '../src/logic/footprints.ts';
import { PANEL_KINDS, slimPanels, type Panels } from '../src/logic/panels.ts';
import { BUCKETS, buildRows, rowShortnames, specLike, type RowsFile, type SpecLike } from '../src/logic/rows.ts';
import { buildSpecInfo, type SpecInfoFile } from '../src/logic/specinfo.ts';
import type { PageFacts } from '../src/logic/specpage.ts';
import { retrying } from './fetch.ts';
import { fetchExtracts } from './footprints.ts';
import { fetchSources, type Sources } from './sources.ts';
import { editorAccounts, linkAccounts, specGroups, type Accounts } from './accounts.ts';
import { fetchPageCache, fetchSpecPages, fillEditors, specrefEditors, whatwgEditors, type PageCache } from './specpages.ts';

const root = fileURLToPath(new URL('..', import.meta.url));

// The sources on 23 October 2026 gave 641 specs: 454 of them with engine data, 593 with a date, and 641 with a
// footprint. So far fewer means a source has changed shape or lost data.
export interface Floors {
  rows: number;
  engines: number;
  dated: number;
  footprints: number;
}
export const FLOORS: Floors = { rows: 500, engines: 300, dated: 400, footprints: 500 };

// The pages on 25 October 2026 gave 606 of the 641 specs an abstract, and 544 editors (466 from the pages themselves,
// and 78 from Specref). So far fewer means the pages' markup, or the reading of it, has changed.
export interface SpecInfoFloors {
  abstracts: number;
  editors: number;
}
export const SPEC_INFO_FLOORS: SpecInfoFloors = { abstracts: 500, editors: 400 };

export interface SiteData {
  rowsFile: RowsFile;
  panels: Panels;
}

// Each row's page: its Editor's Draft, else its URL, as its name links it.
export function rowPages(specs: unknown): { shortname: string; url: string }[] {
  const list: unknown[] = Array.isArray(specs) ? specs : [];
  return list.flatMap((raw) => {
    const spec = specLike(raw);
    return spec ? [{ shortname: spec.shortname, url: spec.nightlyUrl ?? spec.url }] : [];
  });
}

export function buildData(
  sources: Sources,
  extracts: ReadonlyMap<string, FootprintExtracts>,
  now: Date,
  pages: ReadonlyMap<string, PageFacts> = new Map(),
): SiteData {
  const crawled = (sources.webref as { date?: unknown } | null)?.date;
  const footprints = buildFootprints(extracts, indexSpecs(sources.specs), typeof crawled === 'string' ? crawled : undefined);
  const files: Panels = {
    missing: slimImplementations(sources.implementations),
    mdn: slimMdn(sources.mdn),
    caniuse: slimCaniuse(sources.caniuse),
    wpt: slimWpt(sources.wpt),
    footprint: footprints,
    spec: buildSpecInfo(sources.specs, new Set(rowShortnames(sources.specs)), pages),
  };
  const raw: unknown[] = Array.isArray(sources.specs) ? sources.specs : [];
  const specs = raw.map(specLike).filter((s): s is SpecLike => !!s);
  const rowsFile = buildRows(
    { specs: raw, webref: sources.webref, impl: files.missing, mdn: files.mdn, caniuse: files.caniuse, wpt: files.wpt, webFeatures: sources.webFeatures, footprints },
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
  const footprinted = rows.filter((r) => r.footprint !== undefined).length;
  if (footprinted < floors.footprints) throw new Error(`only ${footprinted} specs with footprint data, fewer than ${floors.footprints}`);
}

export function validateSpecInfo(file: SpecInfoFile, floors: SpecInfoFloors = SPEC_INFO_FLOORS): void {
  const infos = Object.values(file.specs);
  const abstracts = infos.filter((i) => i.abstract).length;
  if (abstracts < floors.abstracts) throw new Error(`only ${abstracts} specs with an abstract, fewer than ${floors.abstracts}`);
  const editors = infos.filter((i) => i.editors).length;
  if (editors < floors.editors) throw new Error(`only ${editors} specs with editors, fewer than ${floors.editors}`);
}

// A file's version, for the page's link to it: the start of a hash of its contents.
const contentVersion = (data: Buffer) => createHash('sha256').update(data).digest('hex').slice(0, 10);

// GitHub Pages lets a browser reuse a file it fetched for 10 minutes, so after a deploy, a browser could pair the new
// page with the old script or stylesheet. Linking each at its contents' version gives every deploy that changes one a
// URL no browser has cached. The version is the query by itself, with no "v=", since an unquoted attribute value can't
// hold "=". It fails for a file the page doesn't link, so a renamed link can't ship the file unversioned.
export function versionLinks(html: string, versions: Record<string, string>): string {
  let out = html;
  for (const [file, version] of Object.entries(versions)) {
    // An href or src attribute naming just the file, with its value quoted or not.
    const link = new RegExp(`((?:href|src)=("?))${file.replaceAll('.', '\\.')}(?=\\2[\\s>])`, 'g');
    const versioned = out.replace(link, `$1${file}?${version}`);
    if (versioned === out) throw new Error(`index.html doesn't link ${file}`);
    out = versioned;
  }
  return out;
}

export async function writeSite(
  out: string,
  data: SiteData,
  pageCache: PageCache = {},
  accounts: Accounts = { fetched: new Date(0).toISOString(), w3c: {}, members: {}, lists: {} },
): Promise<void> {
  await mkdir(`${out}/data/panels`, { recursive: true });
  await writeFile(`${out}/data/specs.json`, JSON.stringify(data.rowsFile));
  await writeFile(`${out}/data/spec-pages.json`, JSON.stringify(pageCache));
  await writeFile(`${out}/data/editor-accounts.json`, JSON.stringify(accounts));
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
  for (const file of ['style.css', 'favicon.ico']) await cp(root + 'site/' + file, `${out}/${file}`);
  const versions: Record<string, string> = {};
  for (const file of ['app.js', 'style.css']) versions[file] = contentVersion(await readFile(`${out}/${file}`));
  await writeFile(`${out}/index.html`, versionLinks(await readFile(root + 'site/index.html', 'utf8'), versions));
  await cp(root + 'site/icons', `${out}/icons`, { recursive: true });
}

async function main() {
  const out = root + '_site';
  await rm(out, { recursive: true, force: true });
  const fetchUrl = retrying(fetch);
  const sources = await fetchSources(fetchUrl);
  const shortnames = rowShortnames(sources.specs);
  const extracts = await fetchExtracts(fetchUrl, sources.webref, shortnames);
  const files = [...extracts.values()].reduce((n, e) => n + Object.keys(e).length, 0);
  console.log(`footprints: ${files} webref extracts for ${extracts.size} of ${shortnames.length} specs`);
  // Each page with a plain fetch, which tries once: A page that fails keeps the last build's copy.
  const pageCache = await fetchSpecPages(fetch, rowPages(sources.specs), await fetchPageCache(fetchUrl));
  const unnamed = Object.keys(pageCache).filter((shortname) => !pageCache[shortname].facts.editors);
  const named = fillEditors(pageCache, await whatwgEditors(fetchUrl), await specrefEditors(fetchUrl, unnamed));
  const accounts = await editorAccounts(fetchUrl, sources.specs, new Set(shortnames), new Date());
  const pages = linkAccounts(named, accounts, specGroups(sources.specs));
  const data = buildData(sources, extracts, new Date(), pages);
  validate(data.rowsFile);
  validateSpecInfo(data.panels.spec);
  const infos = Object.values(data.panels.spec.specs);
  const editors = infos.flatMap((i) => i.editors ?? []);
  console.log(
    `spec panels: ${infos.filter((i) => i.abstract).length} abstracts, ${infos.filter((i) => i.editors).length} with editors, ` +
      `${editors.filter((e) => e.github).length} of ${editors.length} editors linked to GitHub`,
  );
  await writeSite(out, data, pageCache, accounts);
  const { rows } = data.rowsFile;
  const buckets = BUCKETS.map((b) => `${b}: ${rows.filter((r) => r.bucket === b).length}`).join(', ');
  console.log(`${rows.length} specs; by engine count, ${buckets}`);
  console.log(out);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}

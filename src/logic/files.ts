// From Web Specs Companion's src/data/slim.ts (sideshowbarker/web-specs-companion): the readers for its four data
// files, each dropping any record whose shape doesn't fit, rather than failing on it.
import { isImplRecord, type ImplFile, type ImplRecord } from './implementations.ts';
import { isMdnPage, type MdnFile, type MdnPage } from './mdn.ts';
import { isCiuFeature, type CiuFile } from './caniuse.ts';
import { isWptSpec, wptMeta, type WptFile } from './wpt.ts';

// Upstream records are untyped JSON; each reader reads only the fields it keeps.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = any;

// Drops each record whose shape doesn't fit, so the card shows no row for that spec, rather than failing to render.
export function slimImplementations(raw: unknown): ImplFile {
  const r = raw as Raw;
  const specs = r?.specs;
  if (typeof r?.bcd?.version !== 'string' || typeof r.bcd.timestamp !== 'string' || !specs || typeof specs !== 'object' || Array.isArray(specs)) {
    throw new Error('implementations: expected bcd.version, bcd.timestamp, and specs');
  }
  const valid = Object.entries(specs as Record<string, unknown>).filter((entry): entry is [string, ImplRecord] => isImplRecord(entry[1]));
  return { bcd: { version: r.bcd.version, timestamp: r.bcd.timestamp }, specs: Object.fromEntries(valid) };
}

// Drops each page whose shape doesn't fit, each index that's out of range or names a dropped page, and each spec left
// with no pages, so the card lists what's left, rather than failing to render.
export function slimMdn(raw: unknown): MdnFile {
  const { content, types, pages, specs } = (raw ?? {}) as Raw;
  if (typeof content?.commit !== 'string' || typeof content.date !== 'string' || !Array.isArray(types) || !Array.isArray(pages)
    || !specs || typeof specs !== 'object' || Array.isArray(specs)) {
    throw new Error('mdn: expected content.commit, content.date, types, pages, and specs');
  }
  const kept: MdnPage[] = [];
  const at = new Map<number, number>();
  pages.forEach((page: unknown, i: number) => {
    if (!isMdnPage(page, types)) return;
    at.set(i, kept.length);
    kept.push([page[0], page[1], page[2]]);
  });
  const bySpec: Record<string, number[]> = {};
  for (const [shortname, ids] of Object.entries(specs as Record<string, unknown>)) {
    const valid = Array.isArray(ids) ? ids.filter((i) => at.has(i)).map((i) => at.get(i)!) : [];
    if (valid.length > 0) bySpec[shortname] = valid;
  }
  return { content: { commit: content.commit, date: content.date }, types, pages: kept, specs: bySpec };
}

// Drops each feature whose shape doesn't fit (whole, since a history missing a run would be wrong), each spec entry
// that names a dropped feature, and each spec left with none.
export function slimCaniuse(raw: unknown): CiuFile {
  const { caniuse, features, specs } = (raw ?? {}) as Raw;
  const isPlain = (v: unknown) => !!v && typeof v === 'object' && !Array.isArray(v);
  if (typeof caniuse?.version !== 'string' || typeof caniuse.updated !== 'string' || !isPlain(features) || !isPlain(specs)) {
    throw new Error('caniuse: expected caniuse.version, caniuse.updated, features, and specs');
  }
  const kept = Object.fromEntries(Object.entries(features as Record<string, unknown>).filter((e) => isCiuFeature(e[1]))) as CiuFile['features'];
  const bySpec = Object.fromEntries(
    Object.entries(specs as Record<string, unknown>).flatMap(([shortname, ids]) => {
      const valid = Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string' && Object.hasOwn(kept, id)) : [];
      return valid.length > 0 ? [[shortname, valid]] : [];
    }),
  );
  return { caniuse: { version: caniuse.version, updated: caniuse.updated }, features: kept, specs: bySpec };
}

// Drops each spec entry whose shape doesn't fit, so its card shows no wpt.fyi button, rather than failing to render.
export function slimWpt(raw: unknown): WptFile {
  const meta = wptMeta(raw);
  const specs = (raw as Raw)?.specs;
  if (!meta || !specs || typeof specs !== 'object' || Array.isArray(specs)) {
    throw new Error('wpt: expected runs for firefox, safari, and chrome, a revision, a date, and specs');
  }
  return { ...meta, specs: Object.fromEntries(Object.entries(specs as Record<string, unknown>).filter((e) => isWptSpec(e[1]))) as WptFile['specs'] };
}

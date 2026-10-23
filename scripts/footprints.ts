// Fetches what each listed spec's platform footprint is worked out from: the backrefs, links, refs, and idlparsed
// extracts its entry in webref's index names. A 404 means the spec lacks that extract, and any other failure fails the
// build. At most FETCH_LIMIT fetches are in flight at once, since there are about 1,800 of them.
import { getJsonIfFound, type Fetch } from './fetch.ts';
import type { FootprintExtracts } from '../src/logic/footprints.ts';

export const WEBREF_ED_BASE = 'https://w3c.github.io/webref/ed/';
export const EXTRACT_KINDS = ['backrefs', 'links', 'refs', 'idlparsed'] as const;
export const FETCH_LIMIT = 16;

type Kind = (typeof EXTRACT_KINDS)[number];

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

// A spec webref has an entry for gets a map entry, even one that names no extracts; a spec it has none for gets none.
export async function fetchExtracts(
  fetchUrl: Fetch,
  webref: unknown,
  shortnames: readonly string[],
  limit = FETCH_LIMIT,
): Promise<Map<string, FootprintExtracts>> {
  const results: unknown[] = isObject(webref) && Array.isArray(webref.results) ? webref.results : [];
  const entries = new Map(results.filter(isObject).map((e) => [e.shortname, e]));
  const out = new Map<string, FootprintExtracts>();
  const queue: { shortname: string; kind: Kind; path: string }[] = [];
  for (const shortname of shortnames) {
    const entry = entries.get(shortname);
    if (!entry) continue;
    out.set(shortname, {});
    for (const kind of EXTRACT_KINDS) if (typeof entry[kind] === 'string') queue.push({ shortname, kind, path: entry[kind] });
  }
  // Each worker takes the next queued fetch when its last one settles.
  const worker = async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      const file = await getJsonIfFound(fetchUrl, WEBREF_ED_BASE + job.path);
      if (isObject(file) && file[job.kind] !== undefined) Object.assign(out.get(job.shortname)!, { [job.kind]: file[job.kind] });
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, worker));
  return out;
}

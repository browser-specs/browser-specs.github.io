// Loads a panel kind's file the first time any panel of that kind opens, and reads it with the reader the extension
// uses. A failed load is forgotten, so the next open tries again.
import { slimCaniuse, slimImplementations, slimMdn, slimWpt } from '../../logic/files.ts';
import type { PanelKind, Panels } from '../../logic/panels.ts';
import { readFootprints } from '../../logic/footprints.ts';
import { readSpecInfo } from '../../logic/specinfo.ts';

const READERS: { [K in PanelKind]: (raw: unknown) => Panels[K] } = {
  missing: slimImplementations,
  mdn: slimMdn,
  caniuse: slimCaniuse,
  wpt: slimWpt,
  footprint: readFootprints,
  spec: readSpecInfo,
};

const loaded = new Map<PanelKind, Promise<unknown>>();

export function loadPanel<K extends PanelKind>(kind: K, fetchUrl: typeof fetch = fetch): Promise<Panels[K]> {
  const cached = loaded.get(kind) as Promise<Panels[K]> | undefined;
  if (cached) return cached;
  const url = `data/panels/${kind}.json`;
  const promise = (async () => {
    const res = await fetchUrl(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return READERS[kind](await res.json());
  })();
  loaded.set(kind, promise);
  promise.catch(() => loaded.delete(kind));
  return promise;
}

export function resetPanels(): void {
  loaded.clear();
}

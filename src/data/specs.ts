// From Web Specs Companion's src/data/specs.ts, copied whole so that copying it again re-syncs it.
import type { PageKind, SlimSpec, SpecRef } from '../shared/types.ts';
import { datedTrShortname, historyShortname, normalizeSpecUrl } from '../shared/url.ts';

interface Entry {
  spec: SlimSpec;
  kind: PageKind;
}

export interface SpecMatch {
  spec: SlimSpec;
  pageKind: PageKind;
  others: SlimSpec[];
}

export function specRef(spec: SlimSpec): SpecRef {
  return { shortname: spec.shortname, title: spec.title, url: spec.url };
}

const repoKey = (repository: string) =>
  repository.replace(/^https:\/\/github\.com\//, '').replace(/\/$/, '').toLowerCase();

export class SpecIndex {
  readonly specs: SlimSpec[];
  private byShortname = new Map<string, SlimSpec>();
  private byUrl = new Map<string, Entry[]>();
  private byRepo = new Map<string, SlimSpec[]>();
  private multipageRoots: { prefix: string; entry: Entry }[] = [];

  constructor(specs: SlimSpec[]) {
    this.specs = specs;
    for (const s of specs) this.byShortname.set(s.shortname, s);
    for (const s of specs) {
      for (const n of s.formerNames ?? []) if (!this.byShortname.has(n)) this.byShortname.set(n, s);
      const add = (url: string | undefined, kind: PageKind) => {
        if (!url) return;
        const key = normalizeSpecUrl(url);
        const list = this.byUrl.get(key) ?? [];
        if (!list.some((e) => e.spec === s)) list.push({ spec: s, kind });
        this.byUrl.set(key, list);
      };
      add(s.nightly?.url, 'ed');
      for (const u of s.nightly?.alternateUrls ?? []) add(u, 'ed');
      for (const u of s.nightly?.pages ?? []) add(u, 'ed');
      add(s.release?.url, 'tr');
      for (const u of s.release?.pages ?? []) add(u, 'tr');
      if (s.series.currentSpecification === s.shortname) {
        add(s.series.releaseUrl, 'tr');
        add(s.series.nightlyUrl, 'ed');
      }
      add(s.url, s.release && normalizeSpecUrl(s.release.url) === normalizeSpecUrl(s.url) ? 'tr' : 'ed');
      // browser-specs lists the pages of a multipage spec but not its one-page version, which HTML and EcmaScript each
      // publish in the folder above them.
      if (s.nightly?.url.endsWith('/multipage/')) add(s.nightly.url.slice(0, -'multipage/'.length), 'ed');
      // For an RFC, browser-specs gives rfc-editor.org's info page, and the RFC itself is beside it, as HTML or text.
      const rfc = /^https:\/\/www\.rfc-editor\.org\/info\/(rfc\d+)\/?$/.exec(s.url)?.[1];
      for (const ext of rfc ? ['', '.html', '.txt'] : []) add(`https://www.rfc-editor.org/rfc/${rfc}${ext}`, 'ed');
      if (s.nightly?.pages?.length) {
        this.multipageRoots.push({ prefix: normalizeSpecUrl(s.nightly.url), entry: { spec: s, kind: 'ed' } });
      }
      if (s.nightly?.repository) {
        const k = repoKey(s.nightly.repository);
        this.byRepo.set(k, [...(this.byRepo.get(k) ?? []), s]);
      }
    }
  }

  get(shortname: string): SlimSpec | undefined {
    return this.byShortname.get(shortname);
  }

  specsInRepo(nwo: string): SlimSpec[] {
    return this.byRepo.get(nwo.toLowerCase()) ?? [];
  }

  lookup(url: string): SpecMatch | undefined {
    const dated = datedTrShortname(url);
    if (dated) {
      const spec = this.get(dated);
      return spec ? { spec, pageKind: 'dated-tr', others: [] } : undefined;
    }
    const hist = historyShortname(url);
    if (hist) {
      const spec = this.get(hist);
      return spec ? { spec, pageKind: 'history', others: [] } : undefined;
    }
    let key: string;
    try {
      key = normalizeSpecUrl(url);
    } catch {
      return undefined;
    }
    let entries = this.byUrl.get(key);
    if (!entries?.length) {
      const root = this.multipageRoots.find((r) => key.startsWith(r.prefix));
      if (root) entries = [root.entry];
    }
    if (!entries?.length) return undefined;
    const names = new Set(entries.map((e) => e.spec.shortname));
    // When two levels share one draft, the draft is the latest level's: Skip any level whose seriesNext is also here.
    const primary = entries.find((e) => !(e.spec.seriesNext && names.has(e.spec.seriesNext))) ?? entries[0];
    return { spec: primary.spec, pageKind: primary.kind, others: entries.filter((e) => e !== primary).map((e) => e.spec) };
  }
}

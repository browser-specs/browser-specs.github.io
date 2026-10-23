// From Web Specs Companion's src/shared/types.ts: the types the copied logic modules import from it.
export interface SlimSpec {
  shortname: string;
  title: string;
  shortTitle?: string;
  url: string;
  organization: string;
  standing: string;
  series: { shortname: string; currentSpecification: string; nightlyUrl?: string; releaseUrl?: string };
  seriesNext?: string;
  seriesPrevious?: string;
  seriesComposition?: string;
  nightly?: {
    url: string;
    status?: string;
    repository?: string;
    sourcePath?: string;
    alternateUrls: string[];
    pages?: string[];
  };
  release?: { url: string; status?: string; pages?: string[] };
  groups: { name: string; url: string }[];
  tests?: { repository: string; testPaths?: string[]; excludePaths?: string[] };
  obsoletedBy?: string[];
  formerNames?: string[];
}

export type PageKind = 'ed' | 'tr' | 'dated-tr' | 'history' | 'unknown';

export interface SpecRef {
  shortname: string;
  title: string;
  url: string;
}

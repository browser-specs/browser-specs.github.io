// The type declarations from Web Specs Companion's src/data/webref.ts, which the copied footprint logic imports.
// The file's fetch functions are left out: The build fetches webref's files itself (scripts/footprints.ts).
import type { SpecRef } from '../shared/types.ts';

export interface WebrefEntry {
  shortname: string;
  date?: string;
  revision?: string;
  backrefs?: string;
  links?: string;
  refs?: string;
  idlparsed?: string;
  ids?: string;
  dfns?: string;
}

export interface Backref {
  id: string;
  href: string;
  linkingText: string[];
  type: string;
  for: string[];
  access: string;
  referencedBy: SpecRef[];
}

export interface Dfn {
  id: string;
  href: string;
  linkingText: string[];
  type: string;
  for: string[];
  access: string;
}

export type LinkGroup = Record<string, { anchors?: string[] }>;

export interface Extracts {
  backrefs: { backrefs: Backref[] };
  links: { links: { rawlinks: LinkGroup; autolinks: LinkGroup } };
  refs: { refs: { normative: { name: string; url: string }[]; informative: { name: string; url: string }[] } };
  idlparsed: { idlparsed: { idlNames: Record<string, unknown>; idlExtendedNames: Record<string, unknown> } };
  ids: { ids: string[] };
  dfns: { dfns: Dfn[] };
}

export interface WebrefIndex {
  date?: string;
  entries: Map<string, WebrefEntry>;
}

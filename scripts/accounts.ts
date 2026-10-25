// Finds each editor's GitHub account, which their spec panel links their name to, by the W3C ID the spec's page gives
// for them: from the W3C API, where each user lists the accounts they've connected to their W3C account. The API has
// no lookup by W3C ID, but each group's list of members gives every member's ID and accounts, a page of 1,000 at a
// time. So the build reads the lists of the listed specs' groups, and the editors of each TR version, for the editors
// who have left their spec's group. That's a few hundred requests, and the accounts rarely change, so the build keeps
// what it found in data/editor-accounts.json, and reads it all again only once a day. An editor whose page gives no W3C
// ID is found by their name instead, among the members of their own spec's groups only, so a namesake elsewhere at the
// W3C can't take their link; and a name that two members of a group share links no one.
import type { PageFacts } from '../src/logic/specpage.ts';
import type { Fetch } from './fetch.ts';

export const W3C_API = 'https://api.w3.org/';
export const ACCOUNTS_CACHE = 'https://browser-specs.github.io/data/editor-accounts.json';
export const ACCOUNTS_MAX_AGE = 24 * 60 * 60 * 1000;
export const ACCOUNTS_LIMIT = 8;

export interface Accounts {
  fetched: string; // when every request last succeeded, ISO
  w3c: Record<string, string>; // each W3C ID with a GitHub account, and its login
  members: Record<string, Record<string, string>>; // each group's members with a GitHub account, by nameKey()
  lists: Record<string, string>; // each group's members list, by the group's URL in browser-specs
}

// Upstream records are untyped JSON; each reader reads only the fields it keeps.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = any;

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const slash = (url: string) => url.replace(/\/?$/, '/');

// A name as the matching compares it: without case, accents, periods, or extra spaces.
export function nameKey(name: string): string {
  return name.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replaceAll('.', '').replace(/\s+/g, ' ').trim();
}

async function getJson(fetchUrl: Fetch, url: string): Promise<Raw> {
  const res = await fetchUrl(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

// Each user's GitHub login, by their W3C ID, and by their name in the group they're listed in, if any.
function addUsers(out: Record<string, string>, users: unknown, names?: Map<string, string | null>): void {
  for (const u of Array.isArray(users) ? (users as Raw[]) : []) {
    const github = (Array.isArray(u?.['connected-accounts']) ? u['connected-accounts'] : []).find((a: Raw) => a?.service === 'github');
    if (typeof u?.id !== 'number' || typeof github?.nickname !== 'string') continue;
    out[u.id] = github.nickname;
    if (!names || typeof u.name !== 'string') continue;
    // A name two members share is null, which links neither of them.
    const key = nameKey(u.name);
    names.set(key, names.has(key) && names.get(key) !== github.nickname ? null : github.nickname);
  }
}

// The members list of each group the listed W3C specs name, by the group's URL in browser-specs, which is either its
// page on w3.org/groups or its homepage.
async function memberLists(fetchUrl: Fetch, specs: Raw[]): Promise<Record<string, string>> {
  const listed = await getJson(fetchUrl, `${W3C_API}groups?items=1000&embed=true`);
  const byUrl = new Map<string, string>();
  for (const g of Array.isArray(listed?._embedded?.groups) ? listed._embedded.groups : []) {
    const users = g?._links?.users?.href;
    const self = /^https:\/\/api\.w3\.org\/groups\/(\w+\/[^/]+)$/.exec(g?._links?.self?.href ?? '');
    if (typeof users !== 'string' || !self) continue;
    byUrl.set(`https://www.w3.org/groups/${self[1]}/`, users);
    if (typeof g._links.homepage?.href === 'string') byUrl.set(slash(g._links.homepage.href), users);
  }
  const lists: Record<string, string> = {};
  for (const s of specs) {
    for (const g of Array.isArray(s.groups) ? s.groups : []) {
      const url = slash(String(g?.url ?? ''));
      if (byUrl.has(url)) lists[url] = byUrl.get(url)!;
    }
  }
  return lists;
}

export async function fetchW3cAccounts(
  fetchUrl: Fetch,
  specs: unknown,
  shortnames: ReadonlySet<string>,
  limit = ACCOUNTS_LIMIT,
): Promise<Omit<Accounts, 'fetched'> & { failures: number }> {
  const w3c: Record<string, string> = {};
  const names = new Map<string, Map<string, string | null>>();
  let lists: Record<string, string> = {};
  let failures = 0;
  const listed = (Array.isArray(specs) ? (specs as Raw[]) : []).filter((s) => shortnames.has(s?.shortname) && s.organization === 'W3C');
  const jobs: (() => Promise<void>)[] = [];
  // Each group's members, page by page.
  const readMembers = async (users: string, page = 1): Promise<void> => {
    const body = await getJson(fetchUrl, `${users}?items=1000&embed=true&page=${page}`);
    if (!names.has(users)) names.set(users, new Map());
    addUsers(w3c, body?._embedded?.users, names.get(users));
    if (typeof body?.pages === 'number' && page < body.pages) jobs.push(() => readMembers(users, page + 1));
  };
  // Each TR version's editors, through the spec's latest version.
  const editors = async (shortname: string): Promise<void> => {
    const latest = (await getJson(fetchUrl, `${W3C_API}specifications/${shortname}`))?._links?.['latest-version']?.href;
    if (typeof latest === 'string') addUsers(w3c, (await getJson(fetchUrl, `${latest}/editors?embed=true`))?._embedded?.editors);
  };
  try {
    lists = await memberLists(fetchUrl, listed);
    for (const users of new Set(Object.values(lists))) jobs.push(() => readMembers(users));
  } catch (e) {
    console.log(`${String(e)}; no W3C group members`);
    failures++;
  }
  for (const s of listed) if (s.release?.url) jobs.push(() => editors(s.shortname));
  const worker = async () => {
    for (let job = jobs.shift(); job; job = jobs.shift()) {
      try {
        await job();
      } catch (e) {
        console.log(String(e));
        failures++;
      }
    }
  };
  await Promise.all(Array.from({ length: limit }, worker));
  const members = Object.fromEntries(
    [...names].map(([users, byName]) => [users, Object.fromEntries([...byName].filter((e): e is [string, string] => e[1] !== null))]),
  );
  return { w3c, members, lists, failures };
}

const strings = (v: Record<string, unknown>) => Object.fromEntries(Object.entries(v).filter((e): e is [string, string] => typeof e[1] === 'string'));

// The last build's accounts, or nothing for a file of any other shape, an older one included, which a build replaces.
function readAccounts(raw: unknown): Accounts | undefined {
  if (!isObject(raw) || typeof raw.fetched !== 'string' || Number.isNaN(Date.parse(raw.fetched))) return undefined;
  if (!isObject(raw.w3c) || !isObject(raw.members) || !isObject(raw.lists)) return undefined;
  const members = Object.fromEntries(Object.entries(raw.members).flatMap(([k, v]) => (isObject(v) ? [[k, strings(v)]] : [])));
  return { fetched: raw.fetched, w3c: strings(raw.w3c), members, lists: strings(raw.lists) };
}

// The last build's accounts while they're under a day old, or else the accounts read afresh. When some request fails,
// it adds what the rest gave to the last build's accounts, and keeps their date, so the next build tries again.
export async function editorAccounts(fetchUrl: Fetch, specs: unknown, shortnames: ReadonlySet<string>, now: Date): Promise<Accounts> {
  let before: Accounts | undefined;
  try {
    before = readAccounts(await getJson(fetchUrl, ACCOUNTS_CACHE));
  } catch (e) {
    console.log(`${String(e)}; reading every editor's account afresh`);
  }
  if (before && now.getTime() - Date.parse(before.fetched) < ACCOUNTS_MAX_AGE) return before;
  const { failures, ...found } = await fetchW3cAccounts(fetchUrl, specs, shortnames);
  if (failures === 0) return { fetched: now.toISOString(), ...found };
  return {
    fetched: before?.fetched ?? new Date(0).toISOString(),
    w3c: { ...before?.w3c, ...found.w3c },
    members: { ...before?.members, ...found.members },
    lists: { ...before?.lists, ...found.lists },
  };
}

// Each listed spec's groups' URLs in browser-specs, which its editors' names are looked for among the members of.
export function specGroups(specs: unknown): Map<string, string[]> {
  const list: Raw[] = Array.isArray(specs) ? specs : [];
  return new Map(
    list.flatMap((s) =>
      typeof s?.shortname === 'string' && Array.isArray(s.groups) ? [[s.shortname, s.groups.map((g: Raw) => String(g?.url ?? ''))]] : [],
    ),
  );
}

// Each spec's facts, with the GitHub login of each editor whose W3C ID has one, or else, for an editor whose page gives
// no W3C ID, the login of the one member of the spec's groups with their name. A login the page gives is kept.
export function linkAccounts(
  facts: ReadonlyMap<string, PageFacts>,
  accounts: Accounts,
  groups: ReadonlyMap<string, readonly string[]>,
): Map<string, PageFacts> {
  const { w3c, members, lists } = accounts;
  return new Map(
    [...facts].map(([shortname, f]) => {
      if (!f.editors) return [shortname, f];
      const named = (groups.get(shortname) ?? []).flatMap((url) => {
        const list = Object.hasOwn(lists, slash(url)) ? lists[slash(url)] : undefined;
        return list && Object.hasOwn(members, list) ? [members[list]] : [];
      });
      const editors = f.editors.map((e) => {
        if (e.github) return e;
        if (e.w3cid !== undefined) return Object.hasOwn(w3c, e.w3cid) ? { ...e, github: w3c[e.w3cid] } : e;
        const logins = new Set(named.flatMap((byName) => (Object.hasOwn(byName, nameKey(e.name)) ? [byName[nameKey(e.name)]] : [])));
        return logins.size === 1 ? { ...e, github: [...logins][0] } : e;
      });
      return [shortname, { ...f, editors }];
    }),
  );
}

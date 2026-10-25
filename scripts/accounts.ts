// Finds each editor's GitHub account, which their spec panel links their name to, by the W3C ID the spec's page gives
// for them: from the W3C API, where each user lists the accounts they've connected to their W3C account. The API has
// no lookup by W3C ID, but each group's list of members gives every member's ID and accounts, a page of 1,000 at a
// time. So the build reads the lists of the listed specs' groups, and the editors of each TR version, for the editors
// who have left their spec's group. That's a few hundred requests, and the accounts rarely change, so the build keeps
// what it found in data/editor-accounts.json, and reads it all again only once a day.
import type { PageFacts } from '../src/logic/specpage.ts';
import type { Fetch } from './fetch.ts';

export const W3C_API = 'https://api.w3.org/';
export const ACCOUNTS_CACHE = 'https://browser-specs.github.io/data/editor-accounts.json';
export const ACCOUNTS_MAX_AGE = 24 * 60 * 60 * 1000;
export const ACCOUNTS_LIMIT = 8;

export interface Accounts {
  fetched: string; // when every request last succeeded, ISO
  w3c: Record<string, string>; // each W3C ID with a GitHub account, and its login
}

// Upstream records are untyped JSON; each reader reads only the fields it keeps.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = any;

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const slash = (url: string) => url.replace(/\/?$/, '/');

async function getJson(fetchUrl: Fetch, url: string): Promise<Raw> {
  const res = await fetchUrl(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

// Each user's GitHub login, by their W3C ID.
function addUsers(out: Record<string, string>, users: unknown): void {
  for (const u of Array.isArray(users) ? (users as Raw[]) : []) {
    const github = (Array.isArray(u?.['connected-accounts']) ? u['connected-accounts'] : []).find((a: Raw) => a?.service === 'github');
    if (typeof u?.id === 'number' && typeof github?.nickname === 'string') out[u.id] = github.nickname;
  }
}

// The members list of each group the listed W3C specs name, found by the group's URL in browser-specs, which is either
// its page on w3.org/groups or its homepage.
async function memberLists(fetchUrl: Fetch, specs: Raw[]): Promise<string[]> {
  const listed = await getJson(fetchUrl, `${W3C_API}groups?items=1000&embed=true`);
  const byUrl = new Map<string, string>();
  for (const g of Array.isArray(listed?._embedded?.groups) ? listed._embedded.groups : []) {
    const users = g?._links?.users?.href;
    const self = /^https:\/\/api\.w3\.org\/groups\/(\w+\/[^/]+)$/.exec(g?._links?.self?.href ?? '');
    if (typeof users !== 'string' || !self) continue;
    byUrl.set(`https://www.w3.org/groups/${self[1]}/`, users);
    if (typeof g._links.homepage?.href === 'string') byUrl.set(slash(g._links.homepage.href), users);
  }
  const urls = specs.flatMap((s) => (Array.isArray(s.groups) ? s.groups : []).map((g: Raw) => byUrl.get(slash(String(g?.url ?? '')))));
  return [...new Set(urls.filter((u): u is string => !!u))];
}

export async function fetchW3cAccounts(
  fetchUrl: Fetch,
  specs: unknown,
  shortnames: ReadonlySet<string>,
  limit = ACCOUNTS_LIMIT,
): Promise<{ w3c: Record<string, string>; failures: number }> {
  const w3c: Record<string, string> = {};
  let failures = 0;
  const listed = (Array.isArray(specs) ? (specs as Raw[]) : []).filter((s) => shortnames.has(s?.shortname) && s.organization === 'W3C');
  const jobs: (() => Promise<void>)[] = [];
  // Each group's members, page by page.
  const members = async (users: string, page = 1): Promise<void> => {
    const body = await getJson(fetchUrl, `${users}?items=1000&embed=true&page=${page}`);
    addUsers(w3c, body?._embedded?.users);
    if (typeof body?.pages === 'number' && page < body.pages) jobs.push(() => members(users, page + 1));
  };
  // Each TR version's editors, through the spec's latest version.
  const editors = async (shortname: string): Promise<void> => {
    const latest = (await getJson(fetchUrl, `${W3C_API}specifications/${shortname}`))?._links?.['latest-version']?.href;
    if (typeof latest === 'string') addUsers(w3c, (await getJson(fetchUrl, `${latest}/editors?embed=true`))?._embedded?.editors);
  };
  try {
    for (const users of await memberLists(fetchUrl, listed)) jobs.push(() => members(users));
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
  return { w3c, failures };
}

function readAccounts(raw: unknown): Accounts | undefined {
  if (!isObject(raw) || typeof raw.fetched !== 'string' || Number.isNaN(Date.parse(raw.fetched)) || !isObject(raw.w3c)) return undefined;
  return { fetched: raw.fetched, w3c: Object.fromEntries(Object.entries(raw.w3c).filter((e): e is [string, string] => typeof e[1] === 'string')) };
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
  const { w3c, failures } = await fetchW3cAccounts(fetchUrl, specs, shortnames);
  if (failures === 0) return { fetched: now.toISOString(), w3c };
  return { fetched: before?.fetched ?? new Date(0).toISOString(), w3c: { ...before?.w3c, ...w3c } };
}

// Each spec's facts, with the GitHub login of each editor whose W3C ID has one, unless the page already gave one.
export function linkAccounts(facts: ReadonlyMap<string, PageFacts>, w3c: Readonly<Record<string, string>>): Map<string, PageFacts> {
  return new Map(
    [...facts].map(([shortname, f]) => {
      if (!f.editors) return [shortname, f];
      const editors = f.editors.map((e) => (!e.github && e.w3cid !== undefined && Object.hasOwn(w3c, e.w3cid) ? { ...e, github: w3c[e.w3cid] } : e));
      return [shortname, { ...f, editors }];
    }),
  );
}

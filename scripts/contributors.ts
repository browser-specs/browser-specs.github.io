// Finds the GitHub accounts of the editors the W3C can't name one for, which is every editor of a WHATWG standard or an
// RFC, by their name among the top contributors to their spec's repo: The GitHub API gives a repo's contributors, and
// GraphQL their profiles' names, 80 at a query. An editor named by an initial and a surname, as an RFC names its
// authors ("A. van Kesteren"), matches a contributor whose name starts with that initial and ends with that surname.
// Only the one repo's contributors count, and a name more than one of them fits links no one. That's about a hundred
// requests, so the build keeps what it found in data/repo-contributors.json, and reads it all again only once a day.
// It needs a token, which the workflow gives it; a build without one keeps the last build's contributors.
import type { PageFacts } from '../src/logic/specpage.ts';
import { nameKey } from './accounts.ts';
import type { Fetch } from './fetch.ts';

export const GITHUB_API = 'https://api.github.com/';
export const CONTRIBUTORS_CACHE = 'https://browser-specs.github.io/data/repo-contributors.json';
export const CONTRIBUTORS_MAX_AGE = 24 * 60 * 60 * 1000;
export const CONTRIBUTORS_LIMIT = 8;
const NAMES_PER_QUERY = 80;
const USER_AGENT = 'browser-specs.github.io (+https://github.com/browser-specs/browser-specs.github.io)';

export interface Contributors {
  fetched: string; // when every request last succeeded, ISO
  repos: Record<string, Record<string, string>>; // each repo's contributors' logins, by nameKey() of their names
}

// Upstream records are untyped JSON; each reader reads only the fields it keeps.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = any;

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const LOGIN = /^[A-Za-z\d](?:[A-Za-z\d-]*[A-Za-z\d])?$/;

function readContributors(raw: unknown): Contributors | undefined {
  if (!isObject(raw) || typeof raw.fetched !== 'string' || Number.isNaN(Date.parse(raw.fetched)) || !isObject(raw.repos)) return undefined;
  const repos = Object.entries(raw.repos).flatMap(([repo, byName]) =>
    isObject(byName) ? [[repo, Object.fromEntries(Object.entries(byName).filter((e): e is [string, string] => typeof e[1] === 'string'))]] : [],
  );
  return { fetched: raw.fetched, repos: Object.fromEntries(repos) };
}

// Each spec's GitHub repo, as owner/name.
export function specRepos(specs: unknown): Map<string, string> {
  const list: Raw[] = Array.isArray(specs) ? specs : [];
  return new Map(
    list.flatMap((s) => {
      const m = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/.exec(String(s?.nightly?.repository ?? ''));
      return typeof s?.shortname === 'string' && m ? [[s.shortname, m[1]]] : [];
    }),
  );
}

// The contributors of each of repos: the last build's while they're under a day old (with any repo they lack read
// now), or else all of them read afresh. A repo that fails to load keeps the last build's copy, and keeps the last
// build's date with it, so the next build tries again.
export async function repoContributors(fetchUrl: Fetch, repos: readonly string[], token: string | undefined, now: Date): Promise<Contributors> {
  let before: Contributors | undefined;
  try {
    const res = await fetchUrl(CONTRIBUTORS_CACHE);
    if (res.ok) before = readContributors(await res.json());
    else await res.body?.cancel();
  } catch (e) {
    console.log(`${String(e)} for ${CONTRIBUTORS_CACHE}`);
  }
  const empty: Contributors = { fetched: new Date(0).toISOString(), repos: {} };
  if (!token) {
    console.log('no GITHUB_TOKEN; keeping the last build’s repo contributors');
    return before ?? empty;
  }
  const fresh = before && now.getTime() - Date.parse(before.fetched) < CONTRIBUTORS_MAX_AGE ? before : undefined;
  const wanted = fresh ? repos.filter((r) => !Object.hasOwn(fresh.repos, r)) : [...repos];
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': USER_AGENT };
  let failures = 0;

  const logins = new Map<string, string[]>();
  const queue = [...wanted];
  const worker = async () => {
    for (let repo = queue.shift(); repo; repo = queue.shift()) {
      try {
        const res = await fetchUrl(`${GITHUB_API}repos/${repo}/contributors?per_page=100`, { headers });
        if (res.status === 204) logins.set(repo, []);
        else if (!res.ok) throw new Error(`HTTP ${res.status} for ${repo}'s contributors`);
        else {
          const list: Raw[] = await res.json();
          logins.set(repo, (Array.isArray(list) ? list : []).flatMap((c) => (c?.type === 'User' && LOGIN.test(c.login) ? [c.login] : [])));
        }
      } catch (e) {
        console.log(String(e));
        failures++;
      }
    }
  };
  await Promise.all(Array.from({ length: CONTRIBUTORS_LIMIT }, worker));

  const names = new Map<string, string>();
  const everyone = [...new Set([...logins.values()].flat())];
  for (let i = 0; i < everyone.length; i += NAMES_PER_QUERY) {
    const batch = everyone.slice(i, i + NAMES_PER_QUERY);
    const query = `query { ${batch.map((login, j) => `u${j}: user(login: "${login}") { login name }`).join(' ')} }`;
    try {
      const res = await fetchUrl(`${GITHUB_API}graphql`, { method: 'POST', headers, body: JSON.stringify({ query }) });
      if (!res.ok) throw new Error(`HTTP ${res.status} for GitHub's GraphQL API`);
      const body: Raw = await res.json();
      for (const user of Object.values(isObject(body?.data) ? body.data : {}) as Raw[]) {
        if (typeof user?.login === 'string' && typeof user.name === 'string' && user.name.trim()) names.set(user.login, user.name);
      }
    } catch (e) {
      console.log(String(e));
      failures++;
    }
  }

  const out: Record<string, Record<string, string>> = fresh ? { ...fresh.repos } : {};
  for (const repo of wanted) {
    if (!logins.has(repo)) {
      if (before && Object.hasOwn(before.repos, repo)) out[repo] = before.repos[repo];
      continue;
    }
    // A name two contributors share is null, which links neither of them.
    const byName = new Map<string, string | null>();
    for (const login of logins.get(repo)!) {
      const name = names.get(login);
      if (!name) continue;
      const key = nameKey(name);
      byName.set(key, byName.has(key) && byName.get(key) !== login ? null : login);
    }
    out[repo] = Object.fromEntries([...byName].filter((e): e is [string, string] => e[1] !== null));
  }
  const fetched = fresh ? fresh.fetched : failures === 0 ? now.toISOString() : (before?.fetched ?? empty.fetched);
  return { fetched, repos: out };
}

// The one contributor login an editor's name fits, if just one does: the same name, or for a name that's an initial
// and a surname, a name that starts with that initial and ends with that surname. An RFC's "Ed." mark is ignored.
function loginFor(name: string, byName: Readonly<Record<string, string>>): string | undefined {
  const bare = name.replace(/,\s*Ed\.?$/, '');
  if (Object.hasOwn(byName, nameKey(bare))) return byName[nameKey(bare)];
  const m = /^(\p{Lu})\.\s+(.+)$/u.exec(bare);
  if (!m) return undefined;
  const [initial, surname] = [nameKey(m[1]), nameKey(m[2])];
  const fits = new Set(
    Object.entries(byName)
      .filter(([key]) => key.startsWith(initial) && key.includes(' ') && key.endsWith(` ${surname}`))
      .map(([, login]) => login),
  );
  return fits.size === 1 ? [...fits][0] : undefined;
}

// Each spec's facts, with the login of the one contributor to its repo that each editor with neither a login nor a
// W3C ID fits. (An editor with a W3C ID that has no GitHub account is left alone, as the name could be someone else's.)
export function linkContributors(
  facts: ReadonlyMap<string, PageFacts>,
  repos: Contributors['repos'],
  specs: ReadonlyMap<string, string>,
): Map<string, PageFacts> {
  return new Map(
    [...facts].map(([shortname, f]) => {
      const repo = specs.get(shortname);
      const byName = repo && Object.hasOwn(repos, repo) ? repos[repo] : undefined;
      if (!f.editors || !byName) return [shortname, f];
      const editors = f.editors.map((e) => {
        if (e.github || e.w3cid !== undefined) return e;
        const github = loginFor(e.name, byName);
        return github ? { ...e, github } : e;
      });
      return [shortname, { ...f, editors }];
    }),
  );
}

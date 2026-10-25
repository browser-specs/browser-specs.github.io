import { describe, it, expect } from 'vitest';
import type { Fetch } from '../scripts/fetch.ts';
import { CONTRIBUTORS_CACHE, GITHUB_API, linkContributors, repoContributors, specRepos, type Contributors } from '../scripts/contributors.ts';

// Answers each URL (and for GraphQL, each login asked about) from the given bodies, a 404 for any other, and records
// what was asked, with the Authorization header.
function fake(bodies: Record<string, unknown>, names: Record<string, string | null> = {}) {
  const asked: { url: string; auth: string | null }[] = [];
  const fetchUrl: Fetch = async (url, init) => {
    asked.push({ url, auth: new Headers(init?.headers).get('Authorization') });
    if (url === `${GITHUB_API}graphql`) {
      const query = JSON.parse(String(init?.body)).query as string;
      const users = [...query.matchAll(/(u\d+): user\(login: "([^"]+)"\)/g)];
      const data = Object.fromEntries(users.map(([, alias, login]) => [alias, Object.hasOwn(names, login) ? { login, name: names[login] } : null]));
      return Response.json({ data });
    }
    const body = bodies[url];
    if (body === undefined) return new Response('', { status: 404 });
    return typeof body === 'number' ? new Response('', { status: body }) : Response.json(body);
  };
  return { asked, fetchUrl };
}

const contributors = (repo: string) => `${GITHUB_API}repos/${repo}/contributors?per_page=100`;
const NOW = new Date('2026-10-26T00:00:00Z');

describe('repoContributors', () => {
  const bodies = {
    [contributors('whatwg/dom')]: [{ login: 'annevk', type: 'User' }, { login: 'Ms2ger', type: 'User' }, { login: 'dependabot[bot]', type: 'Bot' }],
    [contributors('whatwg/html')]: [{ login: 'zcorpan', type: 'User' }, { login: 'annevk', type: 'User' }],
  };
  const names = { annevk: 'Anne van Kesteren', Ms2ger: null, zcorpan: 'Simon Pieters' };

  it("gives each repo's contributors, by the name on their GitHub profile, asking with the token", async () => {
    const f = fake({ ...bodies, [CONTRIBUTORS_CACHE]: 404 }, names);
    const got = await repoContributors(f.fetchUrl, ['whatwg/dom', 'whatwg/html'], 'secret', NOW);
    expect(got).toEqual({
      fetched: NOW.toISOString(),
      repos: { 'whatwg/dom': { 'anne van kesteren': 'annevk' }, 'whatwg/html': { 'simon pieters': 'zcorpan', 'anne van kesteren': 'annevk' } },
    });
    expect(f.asked.filter((a) => a.url.startsWith(GITHUB_API)).every((a) => a.auth === 'Bearer secret')).toBe(true);
  });

  it("keeps the last build's contributors while they're under a day old, and adds a repo it lacks", async () => {
    const recent: Contributors = { fetched: '2026-10-25T12:00:00.000Z', repos: { 'whatwg/dom': { old: 'old' } } };
    const f = fake({ ...bodies, [CONTRIBUTORS_CACHE]: recent }, names);
    const got = await repoContributors(f.fetchUrl, ['whatwg/dom', 'whatwg/html'], 'secret', NOW);
    expect(got.repos).toEqual({ 'whatwg/dom': { old: 'old' }, 'whatwg/html': { 'simon pieters': 'zcorpan', 'anne van kesteren': 'annevk' } });
    expect(got.fetched).toBe(recent.fetched);
    expect(f.asked.map((a) => a.url)).not.toContain(contributors('whatwg/dom'));
  });

  it("keeps the last build's copy of a repo whose contributors fail to load, and tries again next build", async () => {
    const old: Contributors = { fetched: '2026-10-01T00:00:00.000Z', repos: { 'whatwg/dom': { old: 'old' } } };
    const f = fake({ ...bodies, [CONTRIBUTORS_CACHE]: old, [contributors('whatwg/dom')]: 502 }, names);
    const got = await repoContributors(f.fetchUrl, ['whatwg/dom', 'whatwg/html'], 'secret', NOW);
    expect(got.repos['whatwg/dom']).toEqual({ old: 'old' });
    expect(got.repos['whatwg/html']).toEqual({ 'simon pieters': 'zcorpan', 'anne van kesteren': 'annevk' });
    expect(got.fetched).toBe(old.fetched);
  });

  it("asks GitHub nothing without a token, and keeps the last build's contributors", async () => {
    const old: Contributors = { fetched: '2026-10-01T00:00:00.000Z', repos: { 'whatwg/dom': { old: 'old' } } };
    const f = fake({ [CONTRIBUTORS_CACHE]: old });
    expect(await repoContributors(f.fetchUrl, ['whatwg/dom'], undefined, NOW)).toEqual(old);
    expect(f.asked.map((a) => a.url)).toEqual([CONTRIBUTORS_CACHE]);
  });
});

describe('specRepos', () => {
  it("gives each spec's GitHub repo, as owner/name", () => {
    const specs = [
      { shortname: 'dom', nightly: { repository: 'https://github.com/whatwg/dom' } },
      { shortname: 'x', nightly: { repository: 'https://gitlab.example/x' } },
      { shortname: 'y' },
    ];
    expect([...specRepos(specs)]).toEqual([['dom', 'whatwg/dom']]);
  });
});

describe('linkContributors', () => {
  const repos: Contributors['repos'] = {
    'whatwg/dom': { 'anne van kesteren': 'annevk', 'simon pieters': 'zcorpan' },
    'httpwg/x': { 'anne van kesteren': 'annevk', 'mike west': 'mikewest', 'martin thomson': 'martinthomson', 'mark nottingham': 'mnot' },
  };
  const specs = new Map([['dom', 'whatwg/dom'], ['cookies', 'httpwg/x']]);

  it("links an editor by their name among their spec's repo's contributors", () => {
    const facts = new Map([['dom', { editors: [{ name: 'Anne van Kesteren' }, { name: 'Domenic Denicola' }] }]]);
    expect(linkContributors(facts, repos, specs).get('dom')!.editors).toEqual([{ name: 'Anne van Kesteren', github: 'annevk' }, { name: 'Domenic Denicola' }]);
  });

  it('links an editor named by an initial and a surname, with or without an Ed. mark, when one contributor alone fits', () => {
    const facts = new Map([['cookies', { editors: [{ name: 'A. van Kesteren' }, { name: 'M. West' }, { name: 'M. Thomson' }, { name: 'M. Nottingham, Ed.' }] }]]);
    expect(linkContributors(facts, repos, specs).get('cookies')!.editors).toEqual([
      { name: 'A. van Kesteren', github: 'annevk' },
      { name: 'M. West', github: 'mikewest' },
      { name: 'M. Thomson', github: 'martinthomson' },
      { name: 'M. Nottingham, Ed.', github: 'mnot' },
    ]);
  });

  it('leaves alone an editor with a login or a W3C ID, and a spec with no repo', () => {
    const facts = new Map([
      ['dom', { editors: [{ name: 'Simon Pieters', github: 'own' }, { name: 'Simon Pieters', w3cid: 1 }] }],
      ['other', { editors: [{ name: 'Anne van Kesteren' }] }],
    ]);
    const out = linkContributors(facts, repos, specs);
    expect(out.get('dom')!.editors).toEqual([{ name: 'Simon Pieters', github: 'own' }, { name: 'Simon Pieters', w3cid: 1 }]);
    expect(out.get('other')!.editors).toEqual([{ name: 'Anne van Kesteren' }]);
  });
});

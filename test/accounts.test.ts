import { describe, it, expect } from 'vitest';
import type { Fetch } from '../scripts/fetch.ts';
import { ACCOUNTS_CACHE, ACCOUNTS_MAX_AGE, editorAccounts, fetchW3cAccounts, linkAccounts, W3C_API } from '../scripts/accounts.ts';

// Answers each URL with its JSON body, or a status for a number, a 404 for any other, and records what was asked.
function fake(bodies: Record<string, unknown>) {
  const asked: string[] = [];
  const fetchUrl: Fetch = async (url) => {
    asked.push(url);
    const body = bodies[url];
    if (body === undefined) return new Response('', { status: 404 });
    return typeof body === 'number' ? new Response('', { status: body }) : Response.json(body);
  };
  return { asked, fetchUrl };
}

const user = (id: number, github?: string) => ({
  id,
  name: `User ${id}`,
  'connected-accounts': github ? [{ service: 'github', nickname: github, href: `https://github.com/${github}` }] : [],
});

const GROUPS = `${W3C_API}groups?items=1000&embed=true`;
const groups = {
  _embedded: {
    groups: [
      { _links: { self: { href: `${W3C_API}groups/wg/css` }, homepage: { href: 'https://www.w3.org/Style/CSS/' }, users: { href: `${W3C_API}groups/wg/css/users` } } },
      { _links: { self: { href: `${W3C_API}groups/cg/wicg` }, homepage: { href: 'https://www.w3.org/community/wicg/' }, users: { href: `${W3C_API}groups/cg/wicg/users` } } },
    ],
  },
};
const members = (group: string, page: number) => `${W3C_API}groups/${group}/users?items=1000&embed=true&page=${page}`;

const spec = (shortname: string, groupUrl: string, release = false) => ({
  shortname,
  organization: 'W3C',
  groups: [{ name: 'G', url: groupUrl }],
  ...(release ? { release: { url: `https://www.w3.org/TR/${shortname}/` } } : {}),
});

const bodies = (): Record<string, unknown> => ({
  [GROUPS]: groups,
  [members('wg/css', 1)]: { pages: 2, _embedded: { users: [user(1, 'one'), user(2)] } },
  [members('wg/css', 2)]: { pages: 2, _embedded: { users: [user(3, 'three')] } },
  [members('cg/wicg', 1)]: { pages: 1, _embedded: { users: [user(4, 'four')] } },
  [`${W3C_API}specifications/css-grid-2`]: { _links: { 'latest-version': { href: `${W3C_API}specifications/css-grid-2/versions/20250326` } } },
  [`${W3C_API}specifications/css-grid-2/versions/20250326/editors?embed=true`]: { _embedded: { editors: [user(5, 'five'), user(1, 'one')] } },
});

describe('fetchW3cAccounts', () => {
  it("maps the W3C ID of each member of the specs' groups, and of each editor of their TR versions, to a GitHub login", async () => {
    const specs = [
      spec('css-grid-2', 'https://www.w3.org/groups/wg/css/', true),
      spec('webnn', 'https://www.w3.org/community/wicg'),
      spec('unlisted', 'https://www.w3.org/groups/wg/other/', true),
    ];
    const f = fake(bodies());
    const { w3c, failures } = await fetchW3cAccounts(f.fetchUrl, specs, new Set(['css-grid-2', 'webnn']));
    expect(w3c).toEqual({ 1: 'one', 3: 'three', 4: 'four', 5: 'five' });
    expect(failures).toBe(0);
    expect(f.asked).not.toContain(`${W3C_API}specifications/unlisted`);
  });

  it('counts the requests that fail, and keeps what the rest gave', async () => {
    const f = fake({ ...bodies(), [members('cg/wicg', 1)]: 500 });
    const specs = [spec('css-grid-2', 'https://www.w3.org/groups/wg/css/'), spec('webnn', 'https://www.w3.org/community/wicg/')];
    const { w3c, failures } = await fetchW3cAccounts(f.fetchUrl, specs, new Set(['css-grid-2', 'webnn']));
    expect(w3c).toEqual({ 1: 'one', 3: 'three' });
    expect(failures).toBe(1);
  });
});

describe('editorAccounts', () => {
  const NOW = new Date('2026-10-26T00:00:00Z');
  const specs = [spec('css-grid-2', 'https://www.w3.org/groups/wg/css/', true)];
  const listed = new Set(['css-grid-2']);

  it("keeps the last build's accounts while they're under a day old", async () => {
    const recent = { fetched: new Date(NOW.getTime() - ACCOUNTS_MAX_AGE + 60_000).toISOString(), w3c: { 9: 'nine' } };
    const f = fake({ [ACCOUNTS_CACHE]: recent });
    expect(await editorAccounts(f.fetchUrl, specs, listed, NOW)).toEqual(recent);
    expect(f.asked).toEqual([ACCOUNTS_CACHE]);
  });

  it('fetches them again once they are a day old', async () => {
    const old = { fetched: new Date(NOW.getTime() - ACCOUNTS_MAX_AGE).toISOString(), w3c: { 9: 'nine' } };
    const f = fake({ ...bodies(), [ACCOUNTS_CACHE]: old });
    expect(await editorAccounts(f.fetchUrl, specs, listed, NOW)).toEqual({ fetched: NOW.toISOString(), w3c: { 1: 'one', 3: 'three', 5: 'five' } });
  });

  it("adds what it could fetch to the last build's accounts when a request fails, and tries again next build", async () => {
    const old = { fetched: '2026-10-01T00:00:00.000Z', w3c: { 9: 'nine' } };
    const f = fake({ ...bodies(), [ACCOUNTS_CACHE]: old, [members('wg/css', 2)]: 503 });
    expect(await editorAccounts(f.fetchUrl, specs, listed, NOW)).toEqual({ fetched: old.fetched, w3c: { 1: 'one', 5: 'five', 9: 'nine' } });
  });

  it('starts afresh when the deployed site has no accounts file', async () => {
    const f = fake(bodies());
    expect((await editorAccounts(f.fetchUrl, specs, listed, NOW)).w3c).toEqual({ 1: 'one', 3: 'three', 5: 'five' });
  });
});

describe('linkAccounts', () => {
  it("links each editor that has a W3C ID with a GitHub account, and keeps a login the page itself gives", () => {
    const facts = new Map([['a', { abstract: ['A.'], editors: [{ name: 'One', w3cid: 1 }, { name: 'Two', w3cid: 2 }, { name: 'Gh', w3cid: 1, github: 'own' }, { name: 'None' }] }]]);
    expect(linkAccounts(facts, { 1: 'one' }).get('a')).toEqual({
      abstract: ['A.'],
      editors: [{ name: 'One', w3cid: 1, github: 'one' }, { name: 'Two', w3cid: 2 }, { name: 'Gh', w3cid: 1, github: 'own' }, { name: 'None' }],
    });
  });
});

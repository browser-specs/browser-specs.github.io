// From Web Specs Companion's src/shared/url.ts, copied whole so that copying it again re-syncs it.
const GITHUB_RESERVED = new Set([
  'settings', 'orgs', 'organizations', 'notifications', 'marketplace', 'explore', 'topics', 'sponsors',
  'login', 'logout', 'signup', 'search', 'new', 'pulls', 'issues', 'codespaces', 'features', 'about',
]);

export function normalizeSpecUrl(input: string): string {
  const u = new URL(input);
  let path = u.pathname.replace(/\/(index|Overview)\.html$/, '/');
  const last = path.split('/').pop() ?? '';
  if (!path.endsWith('/') && !last.includes('.')) path += '/';
  return `https://${u.host.toLowerCase()}${path}`;
}

export function datedTrShortname(url: string): string | undefined {
  const m = /^https?:\/\/www\.w3\.org\/TR\/\d{4}\/[A-Z]+-(.+)-\d{8}\/?/.exec(url);
  return m?.[1];
}

export function historyShortname(url: string): string | undefined {
  return /^https?:\/\/www\.w3\.org\/standards\/history\/([^/?#]+)/.exec(url)?.[1];
}

export interface GitHubPage {
  owner: string;
  repo: string;
  nwo: string;
  kind: 'repo' | 'issue' | 'pr';
  number?: number;
}

export function parseGitHubUrl(url: string): GitHubPage | undefined {
  const u = new URL(url);
  if (u.hostname !== 'github.com') return undefined;
  const [owner, repo, section, num] = u.pathname.split('/').filter(Boolean);
  if (!owner || !repo || GITHUB_RESERVED.has(owner)) return undefined;
  const base = { owner, repo, nwo: `${owner}/${repo}` };
  const n = Number(num);
  if (section === 'issues' && Number.isInteger(n) && n > 0) return { ...base, kind: 'issue' as const, number: n };
  if (section === 'pull' && Number.isInteger(n) && n > 0) return { ...base, kind: 'pr' as const, number: n };
  return { ...base, kind: 'repo' as const };
}

export function parseGroupUrl(url: string): string | undefined {
  const g = /^https?:\/\/www\.w3\.org\/groups\/(wg|ig|cg|bg|tf|other)\/([^/?#]+)/.exec(url);
  if (g) return `${g[1]}/${g[2]}`;
  const c = /^https?:\/\/www\.w3\.org\/community\/([^/?#]+)/.exec(url);
  return c ? `cg/${c[1]}` : undefined;
}

export function fragmentOf(url: string): string | undefined {
  const hash = new URL(url).hash;
  if (hash.length < 2) return undefined;
  try {
    return decodeURIComponent(hash.slice(1));
  } catch {
    return hash.slice(1);
  }
}

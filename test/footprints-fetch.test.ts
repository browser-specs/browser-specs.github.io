import { describe, it, expect } from 'vitest';
import type { Fetch } from '../scripts/fetch.ts';
import { fetchExtracts, WEBREF_ED_BASE } from '../scripts/footprints.ts';

const backrefs = [{ id: 'x', href: 'https://example.test/a/#x', linkingText: ['x'], type: 'dfn', for: [], access: 'public', referencedBy: [] }];
const refs = { normative: [], informative: [] };

// Answers each URL from files, a 404 for any other, and records what was asked.
function fake(files: Record<string, unknown>) {
  const asked: string[] = [];
  const fetchUrl: Fetch = async (url) => {
    asked.push(url);
    const body = files[url];
    if (typeof body === 'number') return new Response('', { status: body });
    return body === undefined ? new Response('', { status: 404 }) : new Response(JSON.stringify(body));
  };
  return { asked, fetchUrl };
}

const index = { date: '2026-10-22T18:48:27.351Z', results: [{ shortname: 'a', backrefs: 'backrefs/a.json', refs: 'refs/a.json' }] };

describe('fetchExtracts', () => {
  it("fetches the extracts each listed spec's webref entry names, and unwraps them", async () => {
    const f = fake({ [`${WEBREF_ED_BASE}backrefs/a.json`]: { backrefs }, [`${WEBREF_ED_BASE}refs/a.json`]: { refs } });
    const map = await fetchExtracts(f.fetchUrl, index, ['a']);
    expect(map.get('a')).toEqual({ backrefs, refs });
    expect(f.asked.sort()).toEqual([`${WEBREF_ED_BASE}backrefs/a.json`, `${WEBREF_ED_BASE}refs/a.json`]);
  });

  it('leaves out a spec webref has no entry for, and keeps one whose entry names no extracts', async () => {
    const map = await fetchExtracts(fake({}).fetchUrl, { results: [{ shortname: 'b' }] }, ['b', 'zzz']);
    expect([...map]).toEqual([['b', {}]]);
  });

  it('treats a 404 as a missing extract', async () => {
    const map = await fetchExtracts(fake({ [`${WEBREF_ED_BASE}backrefs/a.json`]: { backrefs } }).fetchUrl, index, ['a']);
    expect(map.get('a')).toEqual({ backrefs });
  });

  it('fails on any other answer', async () => {
    const f = fake({ [`${WEBREF_ED_BASE}backrefs/a.json`]: { backrefs }, [`${WEBREF_ED_BASE}refs/a.json`]: 500 });
    await expect(fetchExtracts(f.fetchUrl, index, ['a'])).rejects.toThrow('HTTP 500');
  });

  it('never has more than limit fetches in flight', async () => {
    let now = 0;
    let most = 0;
    const fetchUrl: Fetch = async () => {
      most = Math.max(most, ++now);
      await new Promise((r) => setTimeout(r, 1));
      now--;
      return new Response(JSON.stringify({ refs }));
    };
    const results = Array.from({ length: 40 }, (_, i) => ({ shortname: `s${i}`, refs: `refs/s${i}.json` }));
    const map = await fetchExtracts(fetchUrl, { results }, results.map((r) => r.shortname), 4);
    expect(most).toBe(4);
    expect(map.size).toBe(40);
    expect([...map.values()].every((e) => e.refs)).toBe(true);
  });
});

import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { getJson, getJsonIfFound, retrying, type Fetch } from '../scripts/fetch.ts';

describe('retrying', () => {
  // Answers each call with the next item, a status or an error to throw.
  function fake(...answers: (number | Error)[]) {
    const asked: (RequestInit | undefined)[] = [];
    const fetchUrl: Fetch = async (_url, init) => {
      asked.push(init);
      const a = answers[Math.min(asked.length, answers.length) - 1];
      if (a instanceof Error) throw a;
      return new Response('{}', { status: a });
    };
    return { asked, fetchUrl };
  }

  let log: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    log = vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => log.mockRestore());

  it('tries again after a server error or a 429, and resolves to the first good answer', async () => {
    const f = fake(429, 502, 200);
    const init = { method: 'POST', body: '{}' };
    expect((await retrying(f.fetchUrl, [0, 0])('https://example.test/', init)).status).toBe(200);
    expect(f.asked).toEqual([init, init, init]);
    expect(log.mock.calls).toEqual([['HTTP 429 for https://example.test/; trying again in 0s'], ['HTTP 502 for https://example.test/; trying again in 0s']]);
  });

  it('tries again after a network error', async () => {
    const f = fake(new TypeError('fetch failed'), 200);
    expect((await retrying(f.fetchUrl, [0, 0])('https://example.test/')).status).toBe(200);
    expect(f.asked).toHaveLength(2);
  });

  it('resolves to the last answer once its tries run out', async () => {
    const f = fake(503);
    expect((await retrying(f.fetchUrl, [0, 0])('https://example.test/')).status).toBe(503);
    expect(f.asked).toHaveLength(3);
  });

  it('rethrows the last network error once its tries run out', async () => {
    const f = fake(new TypeError('fetch failed'));
    await expect(retrying(f.fetchUrl, [0, 0])('https://example.test/')).rejects.toThrow('fetch failed');
    expect(f.asked).toHaveLength(3);
  });

  it("doesn't try again after a client error", async () => {
    const f = fake(404, 200);
    expect((await retrying(f.fetchUrl, [0, 0])('https://example.test/')).status).toBe(404);
    expect(f.asked).toHaveLength(1);
  });
});

describe('getJson', () => {
  it('throws on an HTTP error, naming the URL', async () => {
    const fetchUrl: Fetch = async () => new Response('', { status: 503 });
    await expect(getJson(fetchUrl, 'https://example.test/x.json')).rejects.toThrow('HTTP 503 for https://example.test/x.json');
  });
});

describe('getJsonIfFound', () => {
  const answer = (status: number, body: unknown = {}): Fetch => async () => new Response(JSON.stringify(body), { status });
  it('gives nothing for a 404, the body for a 200, and throws on anything else', async () => {
    expect(await getJsonIfFound(answer(404), 'https://example.test/x.json')).toBeUndefined();
    expect(await getJsonIfFound(answer(200, { a: 1 }), 'https://example.test/x.json')).toEqual({ a: 1 });
    await expect(getJsonIfFound(answer(500), 'https://example.test/x.json')).rejects.toThrow('HTTP 500 for https://example.test/x.json');
  });
});

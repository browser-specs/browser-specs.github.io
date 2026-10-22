// Fetching for the build: a fetch that retries the failures that clear on their own, and a JSON getter that fails on
// any answer that isn't OK.
import { setTimeout as sleep } from 'node:timers/promises';

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

// The npm registry and jsDelivr sometimes answer with a 502 or a 503 that clears within a minute. So, the build tries a
// fetch that fails with a server error, a 429, or a network error again after each of these waits, in ms, rather than
// failing the hourly run on a blip.
export const RETRY_DELAYS = [5_000, 15_000, 45_000];

// Wraps fetchUrl so that it tries again after each of delays, and logs each failed try. Once the tries run out, it
// resolves to the last answer, or rethrows the last error, for the caller to report.
export function retrying(fetchUrl: Fetch, delays: readonly number[] = RETRY_DELAYS): Fetch {
  return async (url, init) => {
    for (const delay of delays) {
      try {
        const res = await fetchUrl(url, init);
        if (res.status < 500 && res.status !== 429) return res;
        await res.body?.cancel();
        console.log(`HTTP ${res.status} for ${url}; trying again in ${delay / 1000}s`);
      } catch (e) {
        console.log(`${String(e)} for ${url}; trying again in ${delay / 1000}s`);
      }
      await sleep(delay);
    }
    return fetchUrl(url, init);
  };
}

export async function getJson(fetchUrl: Fetch, url: string): Promise<unknown> {
  const res = await fetchUrl(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

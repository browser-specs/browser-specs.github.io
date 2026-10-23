// Checks the category guesses against the old hand-kept list, specdata.json as of babedf6, while the guesses are tuned.
// It's run by hand ("npm run yardstick"), never by the build, which doesn't read the old list. It prints how many of
// the old list's specs match a row, how many of those the guesses agree with, each disagreement, and the rows left in
// Other, and fails when fewer than 75% agree or 10% or more of the rows are in Other.
import { execFileSync } from 'node:child_process';
import { makeCategorizer, type Category } from '../src/logic/categories.ts';
import { slimCaniuse, slimImplementations, slimMdn, slimWpt } from '../src/logic/files.ts';
import { buildRows, specLike, type SpecLike } from '../src/logic/rows.ts';
import { retrying } from './fetch.ts';
import { fetchSources } from './sources.ts';

// The old list's names, and the categories each one agrees with: Some were renamed or merged, and a few of the old
// names covered topics that now have categories of their own.
const OLD_NAMES: Record<string, Category[]> = {
  'HTTP and addressing': ['HTTP and networking'],
  'Performance/profiling': ['Performance'],
  Security: ['Security and privacy', 'Payments and identity'],
  'Service Workers': ['Workers and offline'],
  Utilities: ['Core'],
  'Platform interaction': ['Platform interaction', 'Devices and sensors', 'Payments and identity'],
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = any;

const bare = (url: string) => url.replace(/[/]+$/, '');

async function main() {
  const old: { spec_url: string; spec_name: string; spec_category: string }[] = JSON.parse(
    execFileSync('git', ['show', 'babedf6:specdata.json'], { encoding: 'utf8' }),
  );
  const sources = await fetchSources(retrying(fetch));
  const raw: Raw[] = Array.isArray(sources.specs) ? sources.specs : [];
  const specs = raw.map(specLike).filter((s): s is SpecLike => !!s);
  const file = buildRows(
    {
      specs: raw,
      webref: sources.webref,
      impl: slimImplementations(sources.implementations),
      mdn: slimMdn(sources.mdn),
      caniuse: slimCaniuse(sources.caniuse),
      wpt: slimWpt(sources.wpt),
      webFeatures: sources.webFeatures,
      // The categories don't depend on the footprints, so the yardstick doesn't fetch webref's extracts.
      footprints: { crawled: '', specs: {}, footprints: {} },
    },
    makeCategorizer(sources.webFeatures.data, specs),
    new Date(),
  );
  const category = new Map(file.rows.map((r) => [r.shortname, r.category]));
  const byUrl = new Map<string, string>();
  for (const s of raw) {
    if (!category.has(s?.shortname)) continue;
    const urls = [s.url, s.nightly?.url, s.release?.url, s.series?.nightlyUrl, s.series?.releaseUrl, ...(s.nightly?.alternateUrls ?? [])];
    for (const u of urls) if (typeof u === 'string') byUrl.set(bare(u), s.shortname);
  }
  let matched = 0;
  let agreed = 0;
  for (const o of old) {
    const shortname = byUrl.get(bare(o.spec_url));
    if (!shortname) continue;
    matched++;
    const guess = category.get(shortname)!;
    if (((OLD_NAMES[o.spec_category] ?? [o.spec_category]) as string[]).includes(guess)) agreed++;
    else console.log(`disagree: ${shortname} was ${o.spec_category}, now ${guess}`);
  }
  const other = file.rows.filter((r) => r.category === 'Other');
  for (const r of other) console.log(`other: ${r.shortname} (${r.title})`);
  const agreement = (100 * agreed) / matched;
  const otherShare = (100 * other.length) / file.rows.length;
  console.log(`${file.rows.length} rows; ${matched} of the old list's ${old.length} specs matched; agreement ${agreement.toFixed(1)}%; Other ${other.length} (${otherShare.toFixed(1)}%)`);
  if (agreement < 75 || otherShare >= 10) process.exitCode = 1;
}

await main();

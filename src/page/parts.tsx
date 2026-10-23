// The pieces a spec's row and its card share: its linked title, with the filter's match marked; the browsers' logos for
// its engines; the WPT pass-rate bars; and the Updated date.
import type { Engine } from '../logic/implementations.ts';
import { BROWSER_NAMES, formatPct, tint, WPT_BROWSERS } from '../logic/wpt.ts';
import { ago, daysSince, formatDate, freshness } from '../logic/dates.ts';
import type { Row } from '../logic/rows.ts';
import { footprintSize } from '../logic/footprints.ts';
import { highlight } from './state.ts';

const BROWSERS: { engine: Engine; name: string; logo: string }[] = [
  { engine: 'gecko', name: 'Firefox', logo: 'icons/browsers/firefox.svg' },
  { engine: 'webkit', name: 'Safari', logo: 'icons/browsers/safari.svg' },
  { engine: 'blink', name: 'Chrome', logo: 'icons/browsers/chrome.svg' },
];
const CHECKS = {
  all: 'Implemented in all three engines',
  two: 'Implemented in two of the three engines',
};

export function Title({ row, q }: { row: Row; q: string }) {
  return (
    <a class="name" href={row.url} title={row.fullTitle !== row.title ? row.fullTitle : undefined}>
      {highlight(row.title, q).map((part, i) => (part.mark ? <mark key={i}>{part.text}</mark> : part.text))}
    </a>
  );
}

// Each browser's logo, as Web Specs Companion's card shows it: in color for an engine that ships the spec, and gray for
// one that doesn't, each named for what it says, so the color is never the only sign. Then a check mark, green for all
// three engines and gray for two, in a slot that keeps its width when it's empty, so the logos line up. A spec BCD has
// no record for says so instead.
export function EngineBadges({ row }: { row: Row }) {
  const engines = row.engines;
  if (!engines) return <span class="muted">No data</span>;
  const check = engines.length >= 3 ? 'all' : engines.length === 2 ? 'two' : undefined;
  return (
    <span class="engines">
      {BROWSERS.map((b) => {
        const ships = engines.includes(b.engine);
        return (
          <img key={b.engine} src={b.logo} width={20} height={20} class={ships ? undefined : 'no'} alt={`${b.name} ${ships ? 'ships it' : 'doesn\u2019t ship it'}`} />
        );
      })}
      {check ? (
        <span class={`check ${check}`} role="img" aria-label={CHECKS[check]} title={CHECKS[check]}>
          {'\u2714\ufe0e'}
        </span>
      ) : (
        <span class="check" aria-hidden="true" />
      )}
    </span>
  );
}

export function WptBars({ row }: { row: Row }) {
  const wpt = row.wpt;
  if (!wpt) return <span class="muted">no WPT data</span>;
  return (
    <span class="wpt">
      {WPT_BROWSERS.map((b) => {
        const label = `${BROWSER_NAMES[b]} ${formatPct(wpt[b])}%`;
        return (
          <span key={b} class="bar" role="img" aria-label={label} title={label}>
            <i class={tint(wpt[b])} style={`width:${wpt[b]}%`} />
          </span>
        );
      })}
    </span>
  );
}

export function Updated({ row, now }: { row: Row; now: number }) {
  if (!row.updated) return null;
  const days = daysSince(row.updated, now);
  return (
    <span class="updated">
      <span class={`dot ${freshness(days)}`} aria-hidden="true" />
      <time dateTime={row.updated} title={formatDate(row.updated)}>
        {ago(days)}
      </time>
    </span>
  );
}

// The org and the spec's first group, as the row's and the card's second line: just the org when the group shares it.
export function Sub({ row }: { row: Row }) {
  const group = row.groups[0] !== row.org ? row.groups[0] : undefined;
  return <div class="sub">{[row.org, group].filter(Boolean).join(' \u00b7 ')}</div>;
}

// The footprint's count, after a dot whose size says if that's a large, medium, or small footprint. The dot repeats
// what the count says, so it's hidden from screen readers. A spec webref has nothing for gets a dash.
export function FootprintCount({ row }: { row: Row }) {
  if (row.footprint === undefined) return <>{'\u2013'}</>;
  return (
    <span class="fp-count">
      <span class={`fp-dot ${footprintSize(row.footprint)}`} aria-hidden="true" />
      {row.footprint}
    </span>
  );
}

// The links to a GitHub repo's issues and to its new-issue page, as Web Specs Companion's card has them, or none for a
// repo anywhere else.
export function issueLinks(repo: string | undefined): { label: string; href: string }[] {
  const base = repo?.replace(/\/$/, '');
  if (!base?.startsWith('https://github.com/')) return [];
  return [
    { label: 'Open issues', href: `${base}/issues` },
    { label: 'File an issue', href: `${base}/issues/new/choose` },
  ];
}

// A category's two parts, when its name joins them with "and", the second capitalized: "Graphics", "Typography".
export function splitCategory(name: string): [string] | [string, string] {
  const at = name.indexOf(' and ');
  if (at < 0) return [name];
  const second = name.slice(at + ' and '.length);
  return [name.slice(0, at), second.charAt(0).toUpperCase() + second.slice(1)];
}

// A card's category tag, on two lines when the name has an "and", which the line break replaces on screen but screen
// readers still hear, so the tag takes less of the card's width. The hidden part keeps the spaces around "and", since
// the line break itself adds no space to the text.
export function CategoryTag({ name }: { name: string }) {
  const [first, second] = splitCategory(name);
  return (
    <span class="tag">
      {first}
      {second !== undefined && (
        <>
          <span class="sr-only"> and </span>
          <br />
          {second}
        </>
      )}
    </span>
  );
}

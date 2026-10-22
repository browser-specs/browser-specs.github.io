// The pieces a spec's row and its card share: its linked title, with the filter's match marked; the engine badges; the
// WPT pass-rate bars; and the Updated date.
import { ENGINES, type Engine } from '../logic/implementations.ts';
import { BROWSER_NAMES, formatPct, WPT_BROWSERS } from '../logic/wpt.ts';
import { ago, daysSince, formatDate, freshness } from '../logic/dates.ts';
import type { Row } from '../logic/rows.ts';
import { highlight } from './state.ts';

const ENGINE_NAMES: Record<Engine, string> = { gecko: 'Gecko', webkit: 'WebKit', blink: 'Blink' };

export function Title({ row, q }: { row: Row; q: string }) {
  return (
    <a class="name" href={row.url} title={row.fullTitle !== row.title ? row.fullTitle : undefined}>
      {highlight(row.title, q).map((part, i) => (part.mark ? <mark key={i}>{part.text}</mark> : part.text))}
    </a>
  );
}

// A letter for each engine, filled for one that ships the spec and outlined for one that doesn't, each named for what
// it says, so the color is never the only sign. A spec BCD has no record for says so instead.
export function EngineBadges({ row }: { row: Row }) {
  const engines = row.engines;
  if (!engines) return <span class="muted">No data</span>;
  return (
    <span class="engines">
      {ENGINES.map((e) => {
        const ships = engines.includes(e);
        return (
          <span key={e} class={`e ${ships ? 'yes' : 'no'}`} role="img" aria-label={`${ENGINE_NAMES[e]} ${ships ? 'ships it' : 'doesn\u2019t ship it'}`}>
            {ENGINE_NAMES[e][0]}
          </span>
        );
      })}
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
            <i style={`width:${wpt[b]}%`} />
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

// The org and the spec's first group, as the row's and the card's second line.
export function Sub({ row }: { row: Row }) {
  return <div class="sub">{[row.org, row.groups[0]].filter(Boolean).join(' \u00b7 ')}</div>;
}

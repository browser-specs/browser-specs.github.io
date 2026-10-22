// From Web Specs Companion's src/ui/components/Caniuse.tsx (sideshowbarker/web-specs-companion): the Can I Use panel.
import { useState } from 'preact/hooks';
import { featureView, filterByTitle, noteParts, type CiuAnswer, type CiuEntry, type CiuFeatureView, type CiuNote, type CiuSegment } from '../../logic/caniuse.ts';
import { formatDate } from '../../logic/dates.ts';

const LOGOS = { firefox: 'icons/browsers/firefox.svg', safari: 'icons/browsers/safari.svg', chrome: 'icons/browsers/chrome.svg' };

// A spec with at most OPEN_UP_TO features opens them all, a list of more than FILTER_ABOVE features gets a filter box,
// and a feature with more than NOTES_SHOWN notes folds them under a disclosure.
const OPEN_UP_TO = 3;
const FILTER_ABOVE = 10;
const NOTES_SHOWN = 3;

const count = (n: number) => (n === 1 ? '1 Can I Use feature' : `${n} Can I Use features`);

const LEGEND: [string, string][] = [['y', 'Yes'], ['a', 'Partial'], ['n', 'No'], ['n flag', 'Behind a flag'], ['y prefix', 'Prefixed'], ['y beta', 'Beta']];

const segmentClass = (s: CiuSegment) => ['ciu-seg', s.support, s.flag && 'flag', s.prefix && 'prefix', s.beta && 'beta'].filter(Boolean).join(' ');

function Note({ note }: { note: CiuNote }) {
  return (
    <li value={note.n}>
      <span class="muted">{`${note.cited}:`}</span>{' '}
      {noteParts(note.text).map((p, i) => (p.code ? <code key={i}>{p.text}</code> : p.href ? <a key={i} href={p.href}>{p.text}</a> : p.text))}
    </li>
  );
}

function Notes({ notes }: { notes: CiuNote[] }) {
  if (notes.length === 0) return null;
  const list = <ol class="ciu-notes">{notes.map((n) => <Note key={n.n} note={n} />)}</ol>;
  if (notes.length <= NOTES_SHOWN) return list;
  return (
    <details class="ciu-more">
      <summary>{`Notes (${notes.length})`}</summary>
      {list}
    </details>
  );
}

// A bar per browser, each with its whole history in words for screen readers, then the axis, the legend, and the
// notes. Each segment paints above the ones after it, so a short run's minimum width shows over the next run's start.
function Timeline({ view }: { view: CiuFeatureView }) {
  return (
    <div class="ciu-history">
      {view.bars.map((b) => (
        <div class="ciu-line" key={b.browser}>
          <img src={LOGOS[b.browser]} width={14} height={14} alt={b.name} />
          <div class="ciu-bar" role="img" aria-label={b.text} title={b.text}>
            <span class="ciu-today" style={`--at:${view.today}%;z-index:${b.segments.length + 1}`} />
            {b.segments.map((s, i) => (
              <span key={i} class={segmentClass(s)} style={`--at:${s.start}%;--w:${s.width}%;z-index:${b.segments.length - i}`} title={s.tip} />
            ))}
          </div>
          <span class="ciu-label">{b.label}</span>
        </div>
      ))}
      <div class="ciu-axis">
        {view.ticks.map((t) => <span key={t.label} style={`--at:${t.at}%`}>{t.label}</span>)}
      </div>
      <div class="ciu-legend">
        {LEGEND.map(([kind, label]) => <span key={label}><i class={`ciu-swatch ${kind}`} />{label}</span>)}
      </div>
      <Notes notes={view.notes} />
    </div>
  );
}

function Feature({ entry, now, open }: { entry: CiuEntry; now: number; open: boolean }) {
  const view = featureView(entry.id, entry, now);
  return (
    <details class="ciu-feature" open={open}>
      <summary>
        <span class="ciu-head">
          <a href={view.url}>{view.title}</a>{' '}
          <span class="ciu-usage" title="Global support across all browsers, per caniuse">{`${view.usage.toFixed(1)}%`}</span>
          {view.bars.map((b) => (
            <span key={b.browser} class={`ciu-chip ${b.support}`} title={`${b.name}: ${b.label}`}>
              <img src={LOGOS[b.browser]} width={12} height={12} alt={b.name} />
              {b.chip}
            </span>
          ))}
        </span>
      </summary>
      <Timeline view={view} />
    </details>
  );
}

function Features({ answer, now }: { answer: CiuAnswer; now: number }) {
  const [query, setQuery] = useState('');
  const n = answer.features.length;
  const shown = filterByTitle(answer.features, query);
  return (
    <>
      <p><strong>{count(n)}</strong></p>
      {n > FILTER_ABOVE && (
        <input
          type="search"
          class="mdn-filter"
          placeholder="Filter features"
          aria-label="Filter features"
          value={query}
          onInput={(e) => setQuery((e.currentTarget as HTMLInputElement).value)}
        />
      )}
      {shown.map((f) => <Feature key={f.id} entry={f} now={now} open={n <= OPEN_UP_TO} />)}
      {query.trim() !== '' && shown.length === 0 && <p>No features match.</p>}
      <p class="muted">
        From <a href="https://caniuse.com/">caniuse.com</a>, by Alexis Deveria (CC BY 4.0), data as of {formatDate(answer.source.updated)}. Desktop Firefox, Safari, and Chrome; mobile and other browsers are on caniuse.com.
      </p>
    </>
  );
}

// The features under the spec's row or inside its card, rendered only while it's open.
export function CaniusePanel({ answer, id, now = Date.now() }: { answer: CiuAnswer; id: string; now?: number }) {
  return (
    <div id={id} class="caniuse-list">
      <Features answer={answer} now={now} />
    </div>
  );
}

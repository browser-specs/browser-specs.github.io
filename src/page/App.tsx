// The page: It loads the list of specs, keeps the controls' state in the URL, and shows the specs that state lets
// through, as a table or as cards, with an empty state, a loading message, and a way to try again when loading fails.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { BUCKETS, type RowsFile } from '../logic/rows.ts';
import { Cards } from './Cards.tsx';
import { Controls } from './Controls.tsx';
import { Footer } from './Footer.tsx';
import { bucketCounts, DEFAULT_STATE, parseState, sortPhrase, stateQuery, visibleRows, withSort, type State } from './state.ts';
import { Table } from './Table.tsx';

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isRow = (v: unknown) =>
  isObject(v) && ['shortname', 'title', 'fullTitle', 'url', 'org', 'category'].every((k) => typeof v[k] === 'string')
  && Array.isArray(v.groups) && BUCKETS.includes(v.bucket as never) && typeof v.mdn === 'number' && typeof v.caniuse === 'number';

export function isRowsFile(v: unknown): v is RowsFile {
  if (!isObject(v) || !isObject(v.sources) || !Array.isArray(v.rows)) return false;
  const s = v.sources;
  return ['built', 'webref', 'bcd', 'mdnContent', 'caniuse', 'webFeatures'].every((k) => typeof s[k] === 'string') && isObject(s.wpt) && v.rows.every(isRow);
}

export async function loadRows(fetchUrl: typeof fetch = fetch): Promise<RowsFile> {
  const res = await fetchUrl('data/specs.json');
  if (!res.ok) throw new Error(`HTTP ${res.status} for data/specs.json`);
  const file: unknown = await res.json();
  if (!isRowsFile(file)) throw new Error("data/specs.json isn't a list of specs");
  return file;
}

// How long after the last change the count is announced, so typing in the Filter box isn't announced every keystroke.
const ANNOUNCE_DELAY = 500;

export function App({ load = loadRows, now = Date.now() }: { load?: () => Promise<RowsFile>; now?: number }) {
  const [file, setFile] = useState<RowsFile>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<State>(() => parseState(location.search));
  const [announced, setAnnounced] = useState('');

  useEffect(() => {
    let live = true;
    setFailed(false);
    load().then(
      (f) => live && setFile(f),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [attempt]);

  useEffect(() => {
    history.replaceState(history.state, '', `${location.pathname}${stateQuery(state)}${location.hash}`);
  }, [state]);

  const rows = file?.rows ?? [];
  const shown = useMemo(() => visibleRows(rows, state), [rows, state]);
  const counts = useMemo(() => bucketCounts(rows, state.q), [rows, state.q]);
  const count = shown.length === rows.length ? `${rows.length} specs` : `${shown.length} of ${rows.length} specs`;

  useEffect(() => {
    if (!file) return;
    const timer = setTimeout(() => setAnnounced(count), ANNOUNCE_DELAY);
    return () => clearTimeout(timer);
  }, [count, file]);

  // A new sort is announced at once, since it comes from a click rather than typing. The first render's isn't new.
  const sorted = useRef(false);
  useEffect(() => {
    if (sorted.current) setAnnounced(`Sorted ${sortPhrase(state.sort)}`);
    sorted.current = true;
  }, [state.sort.key, state.sort.reversed]);

  let body;
  if (failed) {
    body = (
      <div class="error" role="alert">
        <p>{'The list of specifications didn\u2019t load.'}</p>
        <button type="button" class="plain" onClick={() => setAttempt((a) => a + 1)}>
          Try again
        </button>
      </div>
    );
  } else if (!file) {
    body = (
      <p role="status" class="loading">
        {'Loading specifications\u2026'}
      </p>
    );
  } else {
    body = (
      <>
        <Controls state={state} counts={counts} count={count} onChange={setState} />
        <p class="sr-only" role="status">
          {announced}
        </p>
        {shown.length === 0 ? (
          <div class="empty">
            <p>No matching specifications.</p>
            <button type="button" class="plain" onClick={() => setState({ ...state, q: '', buckets: [...DEFAULT_STATE.buckets] })}>
              Reset filters
            </button>
          </div>
        ) : state.view === 'cards' ? (
          <Cards rows={shown} grouped={state.grouped} q={state.q} now={now} />
        ) : (
          <Table rows={shown} grouped={state.grouped} sort={state.sort} q={state.q} now={now} onSort={(key) => setState(withSort(state, key))} />
        )}
      </>
    );
  }

  return (
    <>
      <header>
        <h1>The Web Platform: Browser technologies</h1>
      </header>
      <main>{body}</main>
      <Footer sources={file?.sources} />
    </>
  );
}

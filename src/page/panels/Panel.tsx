// A spec's panels: which one is open (at most one per spec), the buttons that open them, and the panel itself. Escape
// in a panel, or on its button, closes it and puts the focus back on its button.
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { ImplFile } from '../../logic/implementations.ts';
import { mdnView, type MdnFile } from '../../logic/mdn.ts';
import type { CiuFile } from '../../logic/caniuse.ts';
import { formatPct, type WptFile } from '../../logic/wpt.ts';
import { caniuseAnswer, missingView, wptAnswer, type PanelKind } from '../../logic/panels.ts';
import type { Row } from '../../logic/rows.ts';
import { CaniusePanel } from './CaniusePanel.tsx';
import { loadPanel } from './load.ts';
import { MdnPanel } from './MdnPanel.tsx';
import { Why } from './Why.tsx';
import { WptPanel } from './WptPanel.tsx';

export interface PanelState {
  open: PanelKind | null;
  toggle: (kind: PanelKind) => void;
  close: () => void;
  button: (kind: PanelKind) => (el: HTMLButtonElement | null) => void;
}

export function usePanels(): PanelState {
  const [open, setOpen] = useState<PanelKind | null>(null);
  const buttons = useRef<Partial<Record<PanelKind, HTMLButtonElement | null>>>({});
  return {
    open,
    toggle: (kind) => setOpen((current) => (current === kind ? null : kind)),
    close: () => {
      setOpen(null);
      if (open) buttons.current[open]?.focus();
    },
    button: (kind) => (el) => {
      buttons.current[kind] = el;
    },
  };
}

export const panelId = (row: Row, kind: PanelKind) => `panel-${row.shortname}-${kind}`;

export function Toggle(props: { panels: PanelState; kind: PanelKind; row: Row; label: string; class?: string; children: ComponentChildren }) {
  const { panels, kind, row, label } = props;
  const open = panels.open === kind;
  return (
    <button
      type="button"
      ref={panels.button(kind)}
      class={props.class ? `toggle ${props.class}` : 'toggle'}
      aria-expanded={open}
      aria-controls={panelId(row, kind)}
      aria-label={label}
      title={label}
      onClick={() => panels.toggle(kind)}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.preventDefault();
          panels.close();
        }
      }}
    >
      {props.children}
    </button>
  );
}

function content(kind: PanelKind, data: unknown, row: Row, id: string, now: number) {
  if (kind === 'missing') {
    const impl = missingView(data as ImplFile, row.shortname);
    return impl && <Why impl={impl} id={id} />;
  }
  if (kind === 'mdn') {
    const view = mdnView(data as MdnFile, row.shortname);
    return view && <MdnPanel view={view} id={id} />;
  }
  if (kind === 'caniuse') {
    const answer = caniuseAnswer(data as CiuFile, row.shortname);
    return answer && <CaniusePanel answer={answer} id={id} now={now} />;
  }
  const answer = wptAnswer(data as WptFile, row.shortname);
  return answer && <WptPanel answer={answer} id={id} />;
}

export function SpecPanel({ kind, row, now, onClose }: { kind: PanelKind; row: Row; now: number; onClose: () => void }) {
  const id = panelId(row, kind);
  const [data, setData] = useState<unknown>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setFailed(false);
    setData(undefined);
    loadPanel(kind).then(
      (d) => live && setData(d),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [kind, attempt]);
  let body;
  if (failed) {
    body = (
      <div id={id} class="panel-note">
        <p>{'This panel didn\u2019t load.'}</p>
        <button type="button" class="plain" onClick={() => setAttempt((a) => a + 1)}>
          Try again
        </button>
      </div>
    );
  } else if (data === undefined) {
    body = (
      <p id={id} class="panel-note muted">
        {'Loading\u2026'}
      </p>
    );
  } else {
    body = content(kind, data, row, id, now) || (
      <p id={id} class="panel-note muted">
        Nothing to show.
      </p>
    );
  }
  return (
    <div
      class="panel"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        }
      }}
    >
      {body}
    </div>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const list = (names: string[]) => (names.length === 0 ? 'none' : names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')}${names.length > 2 ? ',' : ''} and ${names.at(-1)}`);
const ENGINE_NAMES = { gecko: 'Gecko', webkit: 'WebKit', blink: 'Blink' } as const;

export const labels = {
  missing: (row: Row) => `Engines for ${row.title}: ${list((row.engines ?? []).map((e) => ENGINE_NAMES[e]))}`,
  mdn: (row: Row) => `${plural(row.mdn, 'MDN article', 'MDN articles')} for ${row.title}`,
  caniuse: (row: Row) => `${plural(row.caniuse, 'Can I Use feature', 'Can I Use features')} for ${row.title}`,
  wpt: (row: Row) =>
    `WPT pass rates for ${row.title}: ${row.wpt ? `Firefox ${formatPct(row.wpt.firefox)}%, Safari ${formatPct(row.wpt.safari)}%, Chrome ${formatPct(row.wpt.chrome)}%` : 'none'}`,
};

// Only a spec that some engine doesn't fully ship has anything for "What's missing?" to list.
export const hasMissing = (row: Row) => !!row.engines && row.engines.length < 3;

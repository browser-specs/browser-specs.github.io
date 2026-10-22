// From Web Specs Companion's src/ui/components/Mdn.tsx (sideshowbarker/web-specs-companion): the MDN panel.
import { useRef, useState } from 'preact/hooks';
import { filterItems, MDN_DOCS, type MdnItem, type MdnView } from '../../logic/mdn.ts';
import { formatDate } from '../../logic/dates.ts';

// The sections start open when the spec has at most OPEN_UP_TO top-level articles, and a list of more than
// FILTER_ABOVE articles gets a filter box.
const OPEN_UP_TO = 12;
const FILTER_ABOVE = 40;

const articles = (n: number) => (n === 1 ? '1 MDN article' : `${n} MDN articles`);
const plain = (title: string) => title.replace(/`/g, '');
const childrenId = (prefix: string, item: MdnItem) => `${prefix}:${item.url.slice(MDN_DOCS.length)}`;

function flip(set: Set<string>, key: string): Set<string> {
  const next = new Set(set);
  if (!next.delete(key)) next.add(key);
  return next;
}

// Renders the text between a title's backticks as code.
function Title({ text }: { text: string }) {
  return <>{text.split('`').map((part, i) => (i % 2 ? <code key={i}>{part}</code> : part))}</>;
}

// Each item links to its page, and an item with members gets a toggle for them. While the filter has text, every
// toggle on a match's path is open, and can't be closed.
function Items({ prefix, items, filtering, expanded, onExpand }: {
  prefix: string;
  items: MdnItem[];
  filtering: boolean;
  expanded: Set<string>;
  onExpand: (url: string) => void;
}) {
  return (
    <ul>
      {items.map((item) => {
        const open = filtering || expanded.has(item.url);
        const n = item.count;
        return (
          <li key={item.url}>
            <a href={item.url}><Title text={item.title} /></a>
            {item.children.length > 0 && (
              <>
                {' '}
                <button
                  type="button"
                  class="linkish members"
                  aria-expanded={open}
                  aria-controls={childrenId(prefix, item)}
                  aria-label={`${n} ${n === 1 ? 'article' : 'articles'} under ${plain(item.title)}`}
                  disabled={filtering}
                  onClick={() => onExpand(item.url)}
                >
                  {n}
                </button>
                <div id={childrenId(prefix, item)} hidden={!open}>
                  {open && <Items prefix={prefix} items={item.children} filtering={filtering} expanded={expanded} onExpand={onExpand} />}
                </div>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Articles({ view, prefix }: { view: MdnView; prefix: string }) {
  const top = view.sections.reduce((n, s) => n + s.items.length, 0);
  const [query, setQuery] = useState('');
  const [openSections, setOpenSections] = useState(() => new Set(top <= OPEN_UP_TO ? view.sections.map((s) => s.name) : []));
  const [expanded, setExpanded] = useState(() => new Set<string>());
  const filtering = query.trim() !== '';
  // Opening a section for the filter fires its toggle event too, which mustn't count as the reader's choice, so the
  // handler reads the filter from here, rather than from the render that attached it.
  const filteringNow = useRef(filtering);
  filteringNow.current = filtering;
  const sections = view.sections.map((s) => ({ ...s, items: filterItems(s.items, query) })).filter((s) => s.items.length > 0);
  return (
    <>
      <p><strong>{articles(view.count)}</strong></p>
      {view.overviews.length > 0 && (
        <p>
          {view.overviews.length === 1 ? 'Overview: ' : 'Overviews: '}
          {view.overviews.map((o, i) => (
            <span key={o.url}>{i > 0 && ', '}<a href={o.url}><Title text={o.title} /></a></span>
          ))}
        </p>
      )}
      {view.count > FILTER_ABOVE && (
        <input
          type="search"
          class="mdn-filter"
          placeholder="Filter articles"
          aria-label="Filter articles"
          value={query}
          onInput={(e) => setQuery((e.currentTarget as HTMLInputElement).value)}
        />
      )}
      {sections.map((s) => (
        <details
          key={s.name}
          open={filtering || openSections.has(s.name)}
          onToggle={(e) => {
            const isOpen = (e.currentTarget as HTMLDetailsElement).open;
            if (!filteringNow.current) setOpenSections((cur) => (isOpen === cur.has(s.name) ? cur : flip(cur, s.name)));
          }}
        >
          <summary>{`${s.name} (${s.items.length})`}</summary>
          {(filtering || openSections.has(s.name)) && (
            <Items prefix={prefix} items={s.items} filtering={filtering} expanded={expanded} onExpand={(url) => setExpanded((cur) => flip(cur, url))} />
          )}
        </details>
      ))}
      {filtering && sections.length === 0 && <p>No articles match.</p>}
      <p class="muted">
        From <a href="https://github.com/mdn/content">MDN</a>, as of {formatDate(view.content.date)}.
      </p>
    </>
  );
}

// The list under the spec's row or inside its card, rendered only while it's open.
export function MdnPanel({ view, id }: { view: MdnView; id: string }) {
  return (
    <div id={id} class="mdn-list">
      <Articles view={view} prefix={id} />
    </div>
  );
}

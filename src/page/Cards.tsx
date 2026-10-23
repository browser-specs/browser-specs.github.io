// The cards view: a card per spec in a grid, and in Grouped order, a heading and a grid per category.
import type { Row } from '../logic/rows.ts';
import { hasMissing, labels, SpecPanel, Toggle, usePanels } from './panels/Panel.tsx';
import { CategoryTag, EngineBadges, issueLinks, Sub, Title, Updated, WptBars } from './parts.tsx';
import { groupRows } from './state.ts';

const specs = (n: number) => (n === 1 ? '1 spec' : `${n} specs`);

function Card({ row, q, now }: { row: Row; q: string; now: number }) {
  const id = `card-${row.shortname}`;
  const panels = usePanels();
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return (
    <li class={panels.open ? 'wide' : undefined}>
      <article class="card" aria-labelledby={id}>
        <div class="card-head">
          <span id={id}>
            <Title row={row} q={q} />
          </span>
          <CategoryTag name={row.category} />
        </div>
        <Sub row={row} />
        <div class="line">
          {hasMissing(row) ? (
            <Toggle panels={panels} kind="missing" row={row} label={labels.missing(row)}>
              <EngineBadges row={row} />
            </Toggle>
          ) : (
            <EngineBadges row={row} />
          )}
          {row.wpt ? (
            <Toggle panels={panels} kind="wpt" row={row} label={labels.wpt(row)}>
              <WptBars row={row} />
            </Toggle>
          ) : (
            <WptBars row={row} />
          )}
        </div>
        {row.updated && (
          <div class="sub">
            Updated <Updated row={row} now={now} />
          </div>
        )}
        <div class="links">
          {row.repo && <a href={row.repo}>Repo</a>}
          {issueLinks(row.repo).map((l) => (
            <a key={l.label} href={l.href}>
              {l.label}
            </a>
          ))}
          {row.mdn > 0 && (
            <Toggle panels={panels} kind="mdn" row={row} label={labels.mdn(row)} class="linkish">
              {plural(row.mdn, 'MDN article', 'MDN articles')}
            </Toggle>
          )}
          {row.caniuse > 0 && (
            <Toggle panels={panels} kind="caniuse" row={row} label={labels.caniuse(row)} class="linkish">
              {plural(row.caniuse, 'Can I Use feature', 'Can I Use features')}
            </Toggle>
          )}
          {row.footprint !== undefined && (
            <Toggle panels={panels} kind="footprint" row={row} label={labels.footprintLink(row)} class="linkish">
              <span aria-hidden="true">{'\u{1f463}'}</span> Footprint
            </Toggle>
          )}
        </div>
        {panels.open && <SpecPanel kind={panels.open} row={row} now={now} onClose={panels.close} />}
      </article>
    </li>
  );
}

export function Cards({ rows, grouped, q, now }: { rows: Row[]; grouped: boolean; q: string; now: number }) {
  const grid = (list: Row[]) => (
    <ul class="cards">
      {list.map((row) => (
        <Card key={row.shortname} row={row} q={q} now={now} />
      ))}
    </ul>
  );
  if (!grouped) return grid(rows);
  return (
    <>
      {groupRows(rows).map((g, i) => (
        <section key={g.category} aria-labelledby={`group-${i}`}>
          <h2 class="group-head" id={`group-${i}`}>
            {g.category} <span class="n">{`\u00b7 ${specs(g.rows.length)}`}</span>
          </h2>
          {grid(g.rows)}
        </section>
      ))}
    </>
  );
}

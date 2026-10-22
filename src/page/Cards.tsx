// The cards view: a card per spec in a grid, and in Grouped order, a heading and a grid per category.
import type { Row } from '../logic/rows.ts';
import { EngineBadges, Sub, Title, Updated, WptBars } from './parts.tsx';
import { groupRows, type Order } from './state.ts';

const specs = (n: number) => (n === 1 ? '1 spec' : `${n} specs`);

function Card({ row, q, now }: { row: Row; q: string; now: number }) {
  const id = `card-${row.shortname}`;
  return (
    <li>
      <article class="card" aria-labelledby={id}>
        <div class="card-head">
          <span id={id}>
            <Title row={row} q={q} />
          </span>
          <span class="tag">{row.category}</span>
        </div>
        <Sub row={row} />
        <div class="line">
          <EngineBadges row={row} />
          <WptBars row={row} />
        </div>
        {row.updated && (
          <div class="sub">
            Updated <Updated row={row} now={now} />
          </div>
        )}
        <div class="links">
          <a href={row.url}>Spec</a>
          {row.repo && <a href={row.repo}>Repo</a>}
          {row.mdn > 0 && <span>{`MDN ${row.mdn}`}</span>}
          {row.tests && <a href={row.tests}>Tests</a>}
          {row.caniuse > 0 && <span>{`Can I Use ${row.caniuse}`}</span>}
        </div>
      </article>
    </li>
  );
}

export function Cards({ rows, order, q, now }: { rows: Row[]; order: Order; q: string; now: number }) {
  const grid = (list: Row[]) => (
    <ul class="cards">
      {list.map((row) => (
        <Card key={row.shortname} row={row} q={q} now={now} />
      ))}
    </ul>
  );
  if (order !== 'grouped') return grid(rows);
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

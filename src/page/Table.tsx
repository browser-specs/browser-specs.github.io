// The table view: a row per spec, and in Grouped order, a heading row per category instead of the Category column. Its
// elements carry their roles explicitly, since the narrow layout restyles the rows and cells as blocks, and some
// browsers drop a table's semantics when its parts' display changes.
import type { Row } from '../logic/rows.ts';
import { EngineBadges, Sub, Title, Updated, WptBars } from './parts.tsx';
import { groupRows, type Order } from './state.ts';

const CAPTIONS: Record<Order, string> = {
  name: 'Browser specifications, by name',
  recent: 'Browser specifications, by most recently updated',
  grouped: 'Browser specifications, grouped by category',
};

const specs = (n: number) => (n === 1 ? '1 spec' : `${n} specs`);

function SpecRow({ row, q, now, grouped }: { row: Row; q: string; now: number; grouped: boolean }) {
  return (
    <tr role="row">
      <td role="cell" class="spec">
        <Title row={row} q={q} />
        <Sub row={row} />
      </td>
      <td role="cell" class="upd">
        <Updated row={row} now={now} />
      </td>
      <td role="cell" class="eng">
        <EngineBadges row={row} />
      </td>
      <td role="cell" class="wpt-cell">
        <WptBars row={row} />
      </td>
      <td role="cell" class="num mdn">
        {row.mdn || '\u2013'}
      </td>
      <td role="cell" class="num ciu">
        {row.caniuse || '\u2013'}
      </td>
      {!grouped && (
        <td role="cell" class="cat">
          <span class="tag">{row.category}</span>
        </td>
      )}
    </tr>
  );
}

export function Table({ rows, order, q, now }: { rows: Row[]; order: Order; q: string; now: number }) {
  const grouped = order === 'grouped';
  const heads = ['Specification', 'Updated', 'Engines', 'WPT pass', 'MDN', 'Can I Use', ...(grouped ? [] : ['Category'])];
  const body = (list: Row[]) => list.map((row) => <SpecRow key={row.shortname} row={row} q={q} now={now} grouped={grouped} />);
  return (
    <table class="specs" role="table">
      <caption class="sr-only">{CAPTIONS[order]}</caption>
      <thead role="rowgroup">
        <tr role="row">
          {heads.map((h) => (
            <th key={h} scope="col" role="columnheader">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      {grouped ? (
        groupRows(rows).map((g) => (
          <tbody key={g.category} role="rowgroup">
            <tr role="row" class="group">
              <th scope="rowgroup" role="rowheader" colSpan={heads.length}>
                {g.category} <span class="n">{`\u00b7 ${specs(g.rows.length)}`}</span>
              </th>
            </tr>
            {body(g.rows)}
          </tbody>
        ))
      ) : (
        <tbody role="rowgroup">{body(rows)}</tbody>
      )}
    </table>
  );
}

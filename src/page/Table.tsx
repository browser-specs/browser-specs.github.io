// The table view: a row per spec, and in Grouped order, a heading row per category instead of the Category column. Each
// header is a button that sorts by its column, and the sorted one carries aria-sort. The elements carry their roles
// explicitly, since the narrow layout restyles the rows and cells as blocks, and some browsers drop a table's semantics
// when its parts' display changes.
import type { Row } from '../logic/rows.ts';
import { hasMissing, labels, nameProps, SpecPanel, Toggle, usePanels } from './panels/Panel.tsx';
import { EngineBadges, FootprintCount, SortLabel, sortHeads, Sub, Title, Updated, WptBars } from './parts.tsx';
import { direction, groupRows, sortPhrase, type Sort, type SortKey } from './state.ts';

const specs = (n: number) => (n === 1 ? '1 spec' : `${n} specs`);

function SpecRow({ row, q, now, grouped, columns }: { row: Row; q: string; now: number; grouped: boolean; columns: number }) {
  const panels = usePanels();
  return (
    <>
    <tr role="row" class={panels.open ? 'opened' : undefined}>
      <td role="cell" class="spec">
        <Title row={row} q={q} link={nameProps(panels, row)} />
        <Sub row={row} />
      </td>
      <td role="cell" class="upd">
        <Updated row={row} now={now} />
      </td>
      <td role="cell" class="eng">
        {hasMissing(row) ? (
          <Toggle panels={panels} kind="missing" row={row} label={labels.missing(row)}>
            <EngineBadges row={row} />
          </Toggle>
        ) : (
          <EngineBadges row={row} />
        )}
      </td>
      <td role="cell" class="wpt-cell">
        {row.wpt ? (
          <Toggle panels={panels} kind="wpt" row={row} label={labels.wpt(row)}>
            <WptBars row={row} />
          </Toggle>
        ) : (
          <WptBars row={row} />
        )}
      </td>
      <td role="cell" class="num mdn">
        {row.mdn > 0 ? (
          <Toggle panels={panels} kind="mdn" row={row} label={labels.mdn(row)} class="count-toggle">
            {row.mdn}
          </Toggle>
        ) : (
          '\u2013'
        )}
      </td>
      <td role="cell" class="num ciu">
        {row.caniuse > 0 ? (
          <Toggle panels={panels} kind="caniuse" row={row} label={labels.caniuse(row)} class="count-toggle">
            {row.caniuse}
          </Toggle>
        ) : (
          '\u2013'
        )}
      </td>
      <td role="cell" class="num fp">
        {row.footprint !== undefined ? (
          <Toggle panels={panels} kind="footprint" row={row} label={labels.footprint(row)} class="count-toggle">
            <FootprintCount row={row} />
          </Toggle>
        ) : (
          <FootprintCount row={row} />
        )}
      </td>
      {!grouped && (
        <td role="cell" class="cat">
          <span class="tag">{row.category}</span>
        </td>
      )}
    </tr>
    {panels.open && (
      <tr role="row" class="panel-row">
        <td role="cell" colSpan={columns}>
          <SpecPanel kind={panels.open} row={row} now={now} onClose={panels.close} />
        </td>
      </tr>
    )}
    </>
  );
}

export function Table(props: { rows: Row[]; grouped: boolean; sort: Sort; q: string; now: number; onSort: (key: SortKey) => void }) {
  const { rows, grouped, sort, q, now } = props;
  const heads = sortHeads(grouped);
  const body = (list: Row[]) => list.map((row) => <SpecRow key={row.shortname} row={row} q={q} now={now} grouped={grouped} columns={heads.length} />);
  return (
    <table class="specs" role="table">
      <caption class="sr-only">{`Browser specs${grouped ? ', grouped by category' : ''}, ${sortPhrase(sort)}`}</caption>
      <thead role="rowgroup">
        <tr role="row">
          {heads.map(([key, label]) => {
            const sorted = sort.key === key ? direction(sort) : undefined;
            return (
              <th key={key} scope="col" role="columnheader" aria-sort={sorted}>
                <button type="button" class="sort" onClick={() => props.onSort(key)}>
                  <SortLabel label={label} sorted={sorted} />
                </button>
              </th>
            );
          })}
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

// The controls above the list: the Filter box; the engine-count chips, any mix of which can be on; the order and the
// view, each a group of radio buttons styled as a segmented control; and the count of the specs shown.
import { Fragment } from 'preact';
import { BUCKETS, type Bucket } from '../logic/rows.ts';
import type { Order, State, View } from './state.ts';

const BUCKET_LABELS: Record<Bucket, string> = { '3': '3 engines', '2': '2 engines', '1': '1 engine', none: 'None', nodata: 'No data' };
const ORDERS: [Order, string][] = [['name', 'Name'], ['recent', 'Recent'], ['grouped', 'Grouped']];
const VIEWS: [View, string][] = [['table', 'Table'], ['cards', 'Cards']];

function Segmented<T extends string>(props: { legend: string; name: string; options: [T, string][]; value: T; onChange: (value: T) => void }) {
  return (
    <fieldset class="seg">
      <legend>{props.legend}</legend>
      <span class="opts">
        {props.options.map(([value, label]) => (
          <Fragment key={value}>
            <input type="radio" id={`${props.name}-${value}`} name={props.name} value={value} checked={props.value === value} onChange={() => props.onChange(value)} />
            <label for={`${props.name}-${value}`}>{label}</label>
          </Fragment>
        ))}
      </span>
    </fieldset>
  );
}

export function Controls({ state, counts, count, onChange }: { state: State; counts: Record<Bucket, number>; count: string; onChange: (state: State) => void }) {
  const toggle = (b: Bucket) =>
    onChange({ ...state, buckets: state.buckets.includes(b) ? state.buckets.filter((x) => x !== b) : [...state.buckets, b] });
  return (
    <div class="controls">
      <label class="sr-only" for="filter">
        Filter specifications
      </label>
      <input
        id="filter"
        type="search"
        placeholder={'Filter specifications\u2026'}
        autocomplete="off"
        spellcheck={false}
        value={state.q}
        onInput={(e) => onChange({ ...state, q: (e.target as HTMLInputElement).value })}
      />
      <div class="row">
        <div class="chips" role="group" aria-labelledby="engines-label">
          <span id="engines-label" class="label">
            Engines
          </span>
          {BUCKETS.map((b) => (
            <button type="button" key={b} class="chip" aria-pressed={state.buckets.includes(b)} onClick={() => toggle(b)}>
              {BUCKET_LABELS[b]} <span class="n">{counts[b]}</span>
            </button>
          ))}
        </div>
        <Segmented legend="Order" name="order" options={ORDERS} value={state.order} onChange={(order) => onChange({ ...state, order })} />
        <Segmented legend="View" name="view" options={VIEWS} value={state.view} onChange={(view) => onChange({ ...state, view })} />
        <p class="count">{count}</p>
      </div>
    </div>
  );
}

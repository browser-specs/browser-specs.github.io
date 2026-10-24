// The controls above the list: the Filter box, which stays at the top while the list scrolls; the engine-count chips,
// any mix of which can be on; the order and the view, each a group of radio buttons styled as a segmented control; and
// the count of the specs shown.
import { Fragment } from 'preact';
import { BUCKETS, type Bucket } from '../logic/rows.ts';
import { orderOf, withOrder, type Order, type State, type View } from './state.ts';

const BUCKET_LABELS: Record<Bucket, string> = { '3': '3 engines', '2': '2 engines', '1': '1 engine', none: 'None', nodata: 'No data' };
const ORDERS: [Order, string][] = [['name', 'Name'], ['recent', 'Recent'], ['grouped', 'Grouped']];
const VIEWS: [View, string][] = [['table', 'Table'], ['cards', 'Cards']];

// With no value, no option is checked: The Order group has none for a sort other than Name's and Recent's.
function Segmented<T extends string>(props: { legend: string; name: string; options: [T, string][]; value: T | undefined; onChange: (value: T) => void }) {
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

// The view is the one the page shows, which is the screen's default until the reader picks one.
export function Controls(props: { state: State; view: View; counts: Record<Bucket, number>; count: string; onChange: (state: State) => void }) {
  const { state, counts, count, onChange } = props;
  const toggle = (b: Bucket) =>
    onChange({ ...state, buckets: state.buckets.includes(b) ? state.buckets.filter((x) => x !== b) : [...state.buckets, b] });
  return (
    <>
    <div class="filter-bar">
      <label class="sr-only" for="filter">
        Filter specs
      </label>
      <input
        id="filter"
        type="search"
        placeholder={'Filter specs\u2026'}
        autocomplete="off"
        spellcheck={false}
        value={state.q}
        onInput={(e) => onChange({ ...state, q: (e.target as HTMLInputElement).value })}
      />
    </div>
    <div class="controls">
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
        <Segmented legend="Order" name="order" options={ORDERS} value={orderOf(state)} onChange={(order) => onChange(withOrder(state, order))} />
        <Segmented legend="View" name="view" options={VIEWS} value={props.view} onChange={(view) => onChange({ ...state, view })} />
        <p class="count">{count}</p>
      </div>
    </div>
    </>
  );
}

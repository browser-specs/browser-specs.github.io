// From Web Specs Companion's src/ui/components/Implementations.tsx: the "What's missing?" panel.
import type { Engine, ImplFeature, ImplView } from '../../logic/implementations.ts';
import { formatDate } from '../../logic/dates.ts';

const BROWSERS: { engine: Engine; name: string }[] = [
  { engine: 'gecko', name: 'Firefox' },
  { engine: 'webkit', name: 'Safari' },
  { engine: 'blink', name: 'Chrome' },
];

const CORE = { shared: 'at least two engines ship', any: 'any engine ships' };

// How much of the core an engine ships, e.g. "ships 3 of the 21 features at least two engines ship".
function shipped(impl: ImplView, engine: Engine): string {
  const core = CORE[impl.basis === 'any' ? 'any' : 'shared'];
  if (impl.core === 1) return `${impl.ships[engine] ? 'ships' : 'doesn\u2019t ship'} the one feature ${core}`;
  return `ships ${impl.ships[engine]} of the ${impl.core} features ${core}`;
}

function noneShip(impl: ImplView): string {
  return impl.core === 1
    ? 'No engine ships the one feature BCD lists for this spec'
    : `No engine ships any of the ${impl.core} features BCD lists for this spec`;
}

function Lacking({ list }: { list?: { features: ImplFeature[]; more: number } }) {
  if (!list) return null;
  return (
    <ul>
      {list.features.map((f) => (
        <li key={f.key}>{f.mdn ? <a href={f.mdn}><code>{f.key}</code></a> : <code>{f.key}</code>}</li>
      ))}
      {list.more > 0 && <li>and {list.more} more</li>}
    </ul>
  );
}

// The list of what each gray engine lacks, which "What's missing?" opens below the row. There's none when all three
// engines implement the spec.
export function Why({ impl, id }: { impl: ImplView; id: string }) {
  if (impl.engines.length === 3) return null;
  const gray = BROWSERS.filter((b) => !impl.engines.includes(b.engine));
  return (
    <div id={id} class="impl-why">
      {impl.basis === 'none' ? (
        <>
          <p>{`${noneShip(impl)}:`}</p>
          <Lacking list={impl.lacks.gecko} />
        </>
      ) : (
        gray.map((b) => (
          <div key={b.engine}>
            <p>{`${b.name} ${shipped(impl, b.engine)}. It lacks:`}</p>
            <Lacking list={impl.lacks[b.engine]} />
          </div>
        ))
      )}
      <p class="muted">
        From <a href="https://github.com/mdn/browser-compat-data">BCD</a> {impl.bcd.version}, {formatDate(impl.bcd.timestamp.slice(0, 10))}.
      </p>
    </div>
  );
}


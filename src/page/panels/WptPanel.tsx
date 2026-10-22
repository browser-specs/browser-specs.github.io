// From Web Specs Companion's src/ui/components/Wpt.tsx (sideshowbarker/web-specs-companion): the wpt.fyi panel.
import {
  allUrl, BROWSER_NAMES, dirUrl, formatPct, onlyUrl, passRate, runsSentence, subtests, tint, WPT_BROWSERS,
  type WptAnswer, type WptBrowser, type WptFile, type WptSpec, type WptStats,
} from '../../logic/wpt.ts';
import { formatDate } from '../../logic/dates.ts';

const LOGOS: Record<WptBrowser, string> = { firefox: 'icons/browsers/firefox.svg', safari: 'icons/browsers/safari.svg', chrome: 'icons/browsers/chrome.svg' };

const INTEROP = 'Interop: each test\u2019s lowest pass rate of the three, averaged over the tests';

const count = (n: number, one: string, many: string) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

function Row({ name, href, stats, total }: { name: string; href: string; stats: WptStats; total?: boolean }) {
  return (
    <tr class={total ? 'total' : undefined}>
      <th scope="row">
        <a href={href}>{name}</a> <span class="muted">{stats.tests.toLocaleString('en-US')}</span>
      </th>
      {WPT_BROWSERS.map((b) => {
        const rate = passRate(stats.pass[b]);
        return <td key={b} class={tint(rate)} title={subtests(stats.pass[b])}>{formatPct(rate)}</td>;
      })}
      <td class={tint(stats.interop)} title={INTEROP}>{formatPct(stats.interop)}</td>
    </tr>
  );
}

// Each browser's count of the tests it fails while the other two pass, linked to wpt.fyi's view of exactly those tests.
function OnlyLine({ spec, runs }: { spec: WptSpec; runs: WptFile['runs'] }) {
  const { only } = spec.all;
  if (WPT_BROWSERS.every((b) => only[b] === 0)) return null;
  return (
    <p class="wpt-only">
      Fail in only one browser:{' '}
      {WPT_BROWSERS.map((b) => {
        const others = WPT_BROWSERS.filter((o) => o !== b).map((o) => BROWSER_NAMES[o]).join(' and ');
        return (
          <a key={b} href={onlyUrl(spec, b, runs)} title={`Tests where ${BROWSER_NAMES[b]} fails something ${others} pass`}>
            <img src={LOGOS[b]} width={12} height={12} alt={BROWSER_NAMES[b]} />
            {only[b].toLocaleString('en-US')}
          </a>
        );
      })}
    </p>
  );
}

function Results({ answer }: { answer: WptAnswer }) {
  const { spec, runs } = answer;
  return (
    <>
      <table class="wpt-table">
        <caption>
          <strong>{count(spec.all.tests, 'test', 'tests')}</strong> <span class="muted">% of subtests passing</span>
        </caption>
        <thead>
          <tr>
            <td></td>
            {WPT_BROWSERS.map((b) => (
              <th key={b} scope="col"><img src={LOGOS[b]} width={14} height={14} alt={BROWSER_NAMES[b]} /></th>
            ))}
            <th scope="col">Interop</th>
          </tr>
        </thead>
        <tbody>
          <Row name="All tests" href={allUrl(spec, runs)} stats={spec.all} total />
          {(spec.dirs ?? []).map(([dir, stats]) => <Row key={dir} name={`${dir}/`} href={dirUrl(spec, dir, runs)} stats={stats} />)}
        </tbody>
      </table>
      <OnlyLine spec={spec} runs={runs} />
      <p class="muted">
        From <a href="https://wpt.fyi/">wpt.fyi</a>: {runsSentence(runs)}, at WPT {answer.revision.slice(0, 10)}, {formatDate(answer.date)}.
      </p>
    </>
  );
}

// The results under the spec's row or inside its card, rendered only while they're open.
export function WptPanel({ answer, id }: { answer: WptAnswer; id: string }) {
  return (
    <div id={id} class="wpt-list">
      <Results answer={answer} />
    </div>
  );
}

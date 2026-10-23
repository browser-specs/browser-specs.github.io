// The footprint panel: Web Specs Companion's Platform footprint (src/ui/components/Footprint.tsx), without its notes
// about TR pages and crawled revisions, which have nothing to say on this page. Its two titles are text rather than
// headings, as no other panel puts a heading inside the list.
import type { SpecRef } from '../../shared/types.ts';
import { formatDate } from '../../logic/dates.ts';
import { webidlpediaUrl, type FootprintView } from '../../logic/footprints.ts';

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// A link, or just the text when there's no URL to link to.
const Linked = ({ href, text }: { href?: string; text: string }) => (href ? <a href={href}>{text}</a> : <>{text}</>);

function List({ summary, items }: { summary: string; items: { key: string; href?: string; text: string }[] }) {
  return (
    <li>
      <details>
        <summary>{summary}</summary>
        <ul>
          {items.map((i) => (
            <li key={i.key}>
              <Linked href={i.href} text={i.text} />
            </li>
          ))}
        </ul>
      </details>
    </li>
  );
}

const specItems = (specs: SpecRef[]) => specs.map((s) => ({ key: s.shortname, href: s.url || undefined, text: s.title }));

export function FootprintPanel({ view, id }: { view: FootprintView; id: string }) {
  return (
    <div id={id} class="footprint">
      <p class="panel-head">Platform footprint</p>
      <ul class="footprint-lists">
        <List summary={`Referenced by ${count(view.referencedBy.length, 'other spec', 'other specs')}`} items={specItems(view.referencedBy)} />
        <List summary={`Uses terms from ${count(view.usesTermsFrom.length, 'spec', 'specs')}`} items={specItems(view.usesTermsFrom)} />
        <List
          summary={count(view.normativeRefs.length, 'normative reference', 'normative references')}
          items={view.normativeRefs.map((r, i) => ({ key: `${i}`, href: r.url, text: r.name }))}
        />
        {view.extendsInterfaces.length > 0 && (
          <List
            summary={`Adds to ${count(view.extendsInterfaces.length, 'interface', 'interfaces')} defined elsewhere`}
            items={view.extendsInterfaces.map((n) => ({ key: n, href: webidlpediaUrl(n), text: n }))}
          />
        )}
      </ul>
      {view.mostUsed.length > 0 && (
        <>
          <p class="panel-head">Most-used definitions</p>
          <ul>
            {view.mostUsed.map((d) => (
              <li key={d.href}>
                <a href={d.href}>{d.term}</a> <span class="muted">{`used by ${count(d.count, 'other spec', 'other specs')}`}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <p class="muted">
        {`From webref${view.crawlDate ? `, crawled ${formatDate(view.crawlDate)}` : ''}. `}
        <a href={view.specdex}>Every definition on specdex</a>
      </p>
    </div>
  );
}

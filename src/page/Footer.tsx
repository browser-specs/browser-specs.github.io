// The footer: when the data was built, and from which versions of its sources, each linking to its home, and the repo.
import { formatDate } from '../logic/dates.ts';
import type { SourceVersions } from '../logic/rows.ts';

const when = (iso: string) => `${formatDate(iso.slice(0, 10))}, ${iso.slice(11, 16)} UTC`;
const dated = (text: string, date: string) => (date ? `${text} (${formatDate(date)})` : text);

export function Footer({ sources }: { sources?: SourceVersions }) {
  const parts: [string, string][] = sources
    ? [
        ['https://github.com/w3c/browser-specs', 'browser-specs'],
        ['https://github.com/w3c/webref', dated('webref', sources.webref)],
        ['https://github.com/mdn/browser-compat-data', `BCD ${sources.bcd}`],
        ['https://github.com/mdn/content', dated('MDN content', sources.mdnContent)],
        ['https://caniuse.com/', `Can I Use ${sources.caniuse}`],
        ['https://wpt.fyi/', dated(`WPT ${sources.wpt.revision}`, sources.wpt.date)],
        ['https://github.com/web-platform-dx/web-features', `web-features ${sources.webFeatures}`],
      ]
    : [];
  return (
    <footer>
      {sources && (
        <p>
          {`Built ${when(sources.built)}, from `}
          {parts.map(([href, text], i) => (
            <span key={href}>
              {i === parts.length - 1 ? 'and ' : ''}
              <a href={href}>{text}</a>
              {i === parts.length - 1 ? '.' : ', '}
            </span>
          ))}
        </p>
      )}
      <p>
        <a href="https://github.com/browser-specs/browser-specs.github.io">Source on GitHub</a>
      </p>
    </footer>
  );
}

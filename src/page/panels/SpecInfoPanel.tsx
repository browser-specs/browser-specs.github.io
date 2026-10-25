// A spec's own panel, which its name opens: what the spec is, without opening it. Its full title, linked; its status;
// its abstract; its editors, groups, other levels, and former names; and the links to its versions and its repo. Its
// status chip repeats the status's name beside it, so it's hidden from screen readers.
import type { SpecInfo } from '../../logic/specinfo.ts';
import type { Row } from '../../logic/rows.ts';
import { issueLinks } from '../parts.tsx';

const editorName = (e: { name: string; org?: string }) => (e.org ? `${e.name} (${e.org})` : e.name);

export function SpecInfoPanel({ info, row, id }: { info: SpecInfo; row: Pick<Row, 'shortname' | 'fullTitle' | 'url' | 'repo'>; id: string }) {
  const links = [
    ...(info.ed ? [{ label: 'Editor’s Draft', href: info.ed }] : []),
    ...(info.tr ? [{ label: 'Published version', href: info.tr }] : []),
    ...(row.repo ? [{ label: 'Repo', href: row.repo }] : []),
    ...issueLinks(row.repo),
  ];
  return (
    <div id={id} class="spec-info">
      <p class="panel-head">
        <a href={row.url}>{row.fullTitle}</a>
      </p>
      {info.status && (
        <p class="status">
          {info.status.code && (
            <span class={`status-chip ${info.status.code.toLowerCase()}`} aria-hidden="true">
              {info.status.code}
            </span>
          )}
          {info.status.name}
        </p>
      )}
      {info.abstract?.map((p, i) => (
        <p key={i} class="abstract">
          {p}
        </p>
      ))}
      <dl class="facts">
        {info.editors && (
          <>
            <dt>{info.editors.length === 1 ? 'Editor' : 'Editors'}</dt>
            <dd>{info.editors.map(editorName).join(', ')}</dd>
          </>
        )}
        {info.groups.length > 0 && (
          <>
            <dt>{info.groups.length === 1 ? 'Group' : 'Groups'}</dt>
            <dd>
              {info.groups.map((g, i) => (
                <span key={g.url}>
                  {i > 0 && ', '}
                  <a href={g.url}>{g.name}</a>
                </span>
              ))}
            </dd>
          </>
        )}
        {info.levels && (
          <>
            <dt>Levels</dt>
            <dd class="levels">
              {info.levels.map((l) =>
                l.shortname === row.shortname ? (
                  <strong key={l.shortname} aria-current="true">
                    {l.label}
                  </strong>
                ) : (
                  <a key={l.shortname} href={l.url}>
                    {l.label}
                  </a>
                ),
              )}
            </dd>
          </>
        )}
        {info.formerNames && (
          <>
            <dt>Formerly</dt>
            <dd>{info.formerNames.join(', ')}</dd>
          </>
        )}
      </dl>
      {links.length > 0 && (
        <p class="links">
          {links.map((l) => (
            <a key={l.label} href={l.href}>
              {l.label}
            </a>
          ))}
        </p>
      )}
    </div>
  );
}

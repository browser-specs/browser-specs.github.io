import { describe, it, expect } from 'vitest';
import { buildSpecInfo, readSpecInfo, specInfoView, statusOf } from '../src/logic/specinfo.ts';
import type { PageFacts } from '../src/logic/specpage.ts';

const spec = (shortname: string, over: Record<string, unknown> = {}) => ({
  shortname,
  title: `${shortname} title`,
  url: `https://www.w3.org/TR/${shortname}/`,
  organization: 'W3C',
  groups: [{ name: 'Cascading Style Sheets (CSS) Working Group', url: 'https://www.w3.org/groups/wg/css/' }],
  standing: 'good',
  categories: ['browser'],
  series: { shortname, currentSpecification: shortname },
  nightly: { url: `https://drafts.csswg.org/${shortname}/`, status: "Editor's Draft", repository: 'https://github.com/w3c/csswg-drafts' },
  ...over,
});

describe('statusOf', () => {
  it.each([
    [{ release: { status: 'Working Draft' } }, { code: 'WD', name: 'Working Draft' }],
    [{ release: { status: 'First Public Working Draft' } }, { code: 'FPWD', name: 'First Public Working Draft' }],
    [{ release: { status: 'Candidate Recommendation Draft' } }, { code: 'CRD', name: 'Candidate Recommendation Draft' }],
    [{ release: { status: 'Candidate Recommendation Snapshot' } }, { code: 'CRS', name: 'Candidate Recommendation Snapshot' }],
    [{ release: { status: 'Recommendation' } }, { code: 'REC', name: 'Recommendation' }],
    [{ release: { status: 'Draft Note' } }, { code: 'NOTE', name: 'Draft Note' }],
    [{ release: { status: 'Draft Registry' } }, { code: 'REG', name: 'Draft Registry' }],
    [{}, { code: 'ED', name: 'Editor’s Draft' }],
    [{ nightly: { status: 'Draft Community Group Report' } }, { code: 'CG', name: 'Draft Community Group Report' }],
    [{ nightly: { status: 'Unofficial Proposal Draft' } }, { code: 'UD', name: 'Unofficial Proposal Draft' }],
    [{ organization: 'WHATWG', nightly: { status: 'Living Standard' } }, { code: 'LS', name: 'Living Standard' }],
    [{ organization: 'IETF', nightly: { status: 'Proposed Standard' } }, { code: 'RFC', name: 'Proposed Standard' }],
    [{ organization: 'IETF', nightly: { status: 'Informational' } }, { code: 'RFC', name: 'Informational' }],
    [{ organization: 'IETF', nightly: { status: "Editor's Draft" } }, { code: 'I-D', name: 'Internet-Draft' }],
    [{ organization: 'Alliance for Open Media', nightly: { status: 'Draft Deliverable' } }, { name: 'Draft Deliverable' }],
  ])('names the status of %o', (over, status) => {
    expect(statusOf(spec('x', over))).toEqual(status);
  });

  it('gives nothing for a spec browser-specs gives no status', () => {
    expect(statusOf(spec('x', { organization: 'ISO/IEC', nightly: undefined }))).toBeUndefined();
  });
});

describe('buildSpecInfo', () => {
  const facts = new Map<string, PageFacts>([['css-grid-2', { abstract: ['Grid.'], editors: [{ name: 'Tab Atkins Jr.', org: 'Google' }] }]]);
  const specs = [
    spec('css-grid-2', {
      release: { url: 'https://www.w3.org/TR/css-grid-2/', status: 'Candidate Recommendation Draft' },
      series: { shortname: 'css-grid', currentSpecification: 'css-grid-2' },
      seriesVersion: '2',
      formerNames: ['css3-grid'],
    }),
    spec('css-grid-1', { series: { shortname: 'css-grid', currentSpecification: 'css-grid-2' }, seriesVersion: '1', categories: [] }),
    spec('css-grid-3', { series: { shortname: 'css-grid', currentSpecification: 'css-grid-2' }, seriesVersion: '3' }),
    spec('webnn', { groups: [{ name: 'Web Machine Learning Working Group', url: 'https://www.w3.org/groups/wg/webmachinelearning/' }] }),
  ];

  it("joins a spec's browser-specs entry with what its page says", () => {
    const file = buildSpecInfo(specs, new Set(['css-grid-2', 'webnn']), facts);
    expect(Object.keys(file.specs)).toEqual(['css-grid-2', 'webnn']);
    expect(file.specs['css-grid-2']).toEqual({
      status: { code: 'CRD', name: 'Candidate Recommendation Draft' },
      ed: 'https://drafts.csswg.org/css-grid-2/',
      tr: 'https://www.w3.org/TR/css-grid-2/',
      abstract: ['Grid.'],
      editors: [{ name: 'Tab Atkins Jr.', org: 'Google' }],
      groups: [{ name: 'CSS Working Group', url: 'https://www.w3.org/groups/wg/css/' }],
      levels: [
        { shortname: 'css-grid-1', label: '1', url: 'https://drafts.csswg.org/css-grid-1/' },
        { shortname: 'css-grid-2', label: '2', url: 'https://drafts.csswg.org/css-grid-2/' },
        { shortname: 'css-grid-3', label: '3', url: 'https://drafts.csswg.org/css-grid-3/' },
      ],
      formerNames: ['css3-grid'],
    });
  });

  it('gives a spec with no TR version, no other levels, and nothing from its page just its status and groups', () => {
    expect(buildSpecInfo(specs, new Set(['webnn']), new Map()).specs.webnn).toEqual({
      status: { code: 'ED', name: 'Editor’s Draft' },
      groups: [{ name: 'Web Machine Learning Working Group', url: 'https://www.w3.org/groups/wg/webmachinelearning/' }],
    });
  });
});

describe('readSpecInfo', () => {
  it('reads a file it built', () => {
    const file = buildSpecInfo([spec('a')], new Set(['a']), new Map());
    expect(readSpecInfo(JSON.parse(JSON.stringify(file)))).toEqual(file);
  });

  it('fails on a file of the wrong shape', () => {
    expect(() => readSpecInfo({ specs: [] })).toThrow(/^spec: expected/);
    expect(() => readSpecInfo({ specs: { a: { groups: 'x' } } })).toThrow('spec: bad entry for a');
  });
});

describe('specInfoView', () => {
  it("gives a spec's entry, or nothing for a spec the file lacks", () => {
    const file = buildSpecInfo([spec('a')], new Set(['a']), new Map());
    expect(specInfoView(file, 'a')).toBe(file.specs.a);
    expect(specInfoView(file, 'b')).toBeUndefined();
    expect(specInfoView(file, 'constructor')).toBeUndefined();
  });
});

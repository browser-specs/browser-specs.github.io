// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { App } from '../src/page/App.tsx';
import { resetPanels } from '../src/page/panels/load.ts';
import { Why } from '../src/page/panels/Why.tsx';
import { MdnPanel } from '../src/page/panels/MdnPanel.tsx';
import { CaniusePanel } from '../src/page/panels/CaniusePanel.tsx';
import { WptPanel } from '../src/page/panels/WptPanel.tsx';
import type { ImplFile, ImplView } from '../src/logic/implementations.ts';
import { mdnView, type MdnFile } from '../src/logic/mdn.ts';
import type { CiuFeature, CiuFile } from '../src/logic/caniuse.ts';
import { allUrl, dirUrl, onlyUrl, type WptFile, type WptSpec } from '../src/logic/wpt.ts';
import type { Row, RowsFile } from '../src/logic/rows.ts';

const NOW = Date.parse('2026-10-22T13:00:00Z');
const bcd = { version: '8.1.6', timestamp: '2026-10-15T10:11:12.000Z' };

const referrerPolicy: ImplView = {
  engines: ['webkit', 'blink'],
  basis: 'shared',
  core: 21,
  ships: { gecko: 3, webkit: 21, blink: 21 },
  lacks: {
    gecko: {
      features: [
        { key: 'api.HTMLAnchorElement.referrerPolicy.unsafe-url', mdn: 'https://developer.mozilla.org/docs/Web/API/HTMLAnchorElement/referrerPolicy' },
        { key: 'api.HTMLAreaElement.referrerPolicy.unsafe-url' },
      ],
      more: 16,
    },
  },
  bcd,
};

const mdn: MdnFile = {
  content: { commit: 'f'.repeat(40), date: '2026-10-22' },
  types: ['guide', 'web-api-interface', 'web-api-overview', 'web-api-instance-property'],
  pages: [
    ['Web/API/Fetch_API', 'Fetch API', 2],
    ['Web/API/Request', 'Request', 1],
    ['Web/API/Request/url', 'Request: url property', 3],
    ['Web/API/Fetch_API/Using_Fetch', 'Using the Fetch API', 0],
  ],
  specs: { dom: [0, 1, 2, 3], 'css-color-5': [3] },
};

const feature: CiuFeature = {
  title: 'Fetch',
  usage: 96.4,
  runs: {
    firefox: [{ from: '2', to: '38', support: 'n', month: '2006-10' }, { from: '39', to: '158', support: 'y', month: '2015-07', current: true }],
    safari: [{ from: '3.1', to: '10', support: 'n', month: '2008-03' }, { from: '10.1', to: '27', support: 'y', month: '2017-03', current: true }],
    chrome: [{ from: '4', to: '41', support: 'n', month: '2010-01' }, { from: '42', to: '155', support: 'y', month: '2015-04', current: true }],
  },
  notes: {},
};
const caniuse: CiuFile = { caniuse: { version: '1.0.30001819', updated: '2026-10-22' }, features: { fetch: feature }, specs: { dom: ['fetch'] } };

const stats = (pass: [number, number][], interop: number, only: [number, number, number]) => ({
  tests: 100,
  pass: { firefox: pass[0], safari: pass[1], chrome: pass[2] },
  interop,
  only: { firefox: only[0], safari: only[1], chrome: only[2] },
});
const domTests: WptSpec = {
  paths: ['dom', 'shadow-dom'],
  all: stats([[983, 1000], [982, 1000], [994, 1000]], 72.3, [49, 126, 12]),
  dirs: [['dom', stats([[900, 910], [905, 910], [910, 910]], 80, [40, 100, 10])], ['shadow-dom', stats([[83, 90], [77, 90], [84, 90]], 60, [9, 26, 2])]],
};
const wpt: WptFile = {
  runs: { firefox: { id: 1, version: '158.0', os: 'linux' }, safari: { id: 2, version: '27.0', os: 'mac' }, chrome: { id: 3, version: '155.0', os: 'linux' } },
  revision: 'abc1234567def',
  date: '2026-10-18',
  specs: { dom: domTests },
};
const { bcd: _bcd, ...record } = referrerPolicy;
const missing: ImplFile = { bcd, specs: { 'css-color-5': record } };

describe('the panels', () => {
  afterEach(cleanup);

  it("lists what each engine that doesn't ship the spec lacks", () => {
    render(<Why impl={referrerPolicy} id="w" />);
    expect(screen.getByText('Firefox ships 3 of the 21 features at least two engines ship. It lacks:')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'api.HTMLAnchorElement.referrerPolicy.unsafe-url' }).getAttribute('href'))
      .toBe('https://developer.mozilla.org/docs/Web/API/HTMLAnchorElement/referrerPolicy');
    expect(screen.queryByRole('link', { name: 'api.HTMLAreaElement.referrerPolicy.unsafe-url' })).toBeNull();
    expect(screen.getByText('and 16 more')).toBeTruthy();
    expect(screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === 'From BCD 8.1.6, 15 October 2026.')).toBeTruthy();
  });

  it('lists the features once when no engine ships any', () => {
    const lacking = { features: [{ key: 'api.A' }, { key: 'api.B' }], more: 0 };
    render(<Why impl={{ ...referrerPolicy, engines: [], basis: 'none', core: 2, ships: { gecko: 0, webkit: 0, blink: 0 }, lacks: { gecko: lacking, webkit: lacking, blink: lacking } }} id="w" />);
    expect(screen.getByText('No engine ships any of the 2 features BCD lists for this spec:')).toBeTruthy();
    expect(screen.getAllByText('api.A')).toHaveLength(1);
  });

  it('lists the MDN articles: the overview, then a section for each kind, with members nested', () => {
    render(<MdnPanel view={mdnView(mdn, 'dom')!} id="m" />);
    expect(screen.getByText('4 MDN articles')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Fetch API' }).getAttribute('href')).toBe('https://developer.mozilla.org/docs/Web/API/Fetch_API');
    expect(screen.getAllByRole('group').length).toBeGreaterThan(0);
    const members = screen.getByRole('button', { name: '1 article under Request' });
    fireEvent.click(members);
    expect(screen.getByRole('link', { name: 'url property' })).toBeTruthy();
    expect(document.getElementById(members.getAttribute('aria-controls')!)!.id.startsWith('m:')).toBe(true);
  });

  it("shows each Can I Use feature's chips and its history", () => {
    render(<CaniusePanel answer={{ features: [{ ...feature, id: 'fetch' }], source: caniuse.caniuse }} id="c" now={NOW} />);
    expect(screen.getByText('1 Can I Use feature')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Fetch' }).getAttribute('href')).toBe('https://caniuse.com/fetch');
    expect(screen.getAllByRole('img', { name: /^Chrome: no in 4/ })).toHaveLength(1);
  });

  it('shows the WPT pass rates for all tests and for each directory, and the tests failing in only one browser', () => {
    render(<WptPanel answer={{ spec: domTests, runs: wpt.runs, revision: wpt.revision, date: wpt.date }} id="t" />);
    expect(screen.getByRole('link', { name: 'All tests' }).getAttribute('href')).toBe(allUrl(domTests, wpt.runs));
    expect(screen.getByRole('link', { name: 'shadow-dom/' }).getAttribute('href')).toBe(dirUrl(domTests, 'shadow-dom', wpt.runs));
    expect(screen.getByRole('link', { name: /Safari/ }).getAttribute('href')).toBe(onlyUrl(domTests, 'safari', wpt.runs));
  });
});

const base = (over: Partial<Row>): Row => ({
  shortname: 'x', title: 'X', fullTitle: 'X', url: 'https://example.test/x/', org: 'W3C', groups: [], bucket: '3', mdn: 0, caniuse: 0, category: 'Core', ...over,
});
const FILE: RowsFile = {
  sources: { built: '2026-10-22T13:00:00.000Z', webref: '2026-10-20', bcd: '8.1.6', mdnContent: '2026-10-22', caniuse: '1.0.30001819', wpt: { revision: 'abc1234567', date: '2026-10-18' }, webFeatures: '3.4.0' },
  rows: [
    base({ shortname: 'dom', title: 'DOM', fullTitle: 'DOM', engines: ['gecko', 'webkit', 'blink'], bucket: '3', mdn: 4, caniuse: 1, wpt: { firefox: 98.3, safari: 98.2, chrome: 99.4 }, tests: 'https://wpt.fyi/results/dom' }),
    base({ shortname: 'css-color-5', title: 'CSS Color 5', fullTitle: 'CSS Color 5', engines: ['webkit', 'blink'], bucket: '2', mdn: 1, category: 'CSS' }),
    base({ shortname: 'zzz', title: 'Zzz', fullTitle: 'Zzz', bucket: 'nodata', category: 'Other' }),
  ],
};
const BODIES: Record<string, unknown> = {
  'data/panels/missing.json': missing,
  'data/panels/mdn.json': mdn,
  'data/panels/caniuse.json': caniuse,
  'data/panels/wpt.json': wpt,
};

describe('opening the panels from the list', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    history.replaceState(null, '', '/?engines=3,2,nodata');
    resetPanels();
    fetchMock = vi.fn(async (url: string) => (Object.hasOwn(BODIES, url) ? new Response(JSON.stringify(BODIES[url])) : new Response('', { status: 404 })));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });
  const start = async () => {
    render(<App load={() => Promise.resolve(structuredClone(FILE))} now={NOW} />);
    await screen.findByRole('table');
  };
  const calls = (url: string) => fetchMock.mock.calls.filter(([u]) => u === url).length;
  // Looked up afresh each time, since the loaded panel replaces the loading message under the same id.
  const panelOf = (button: HTMLElement) => document.getElementById(button.getAttribute('aria-controls')!)!;

  it('opens the MDN panel from its count, and fetches its file only once', async () => {
    await start();
    const button = screen.getByRole('button', { name: '4 MDN articles for DOM' });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    await waitFor(() => expect(within(panelOf(button)).getByRole('link', { name: 'Fetch API' })).toBeTruthy());
    fireEvent.click(button);
    expect(document.getElementById(button.getAttribute('aria-controls')!)).toBeNull();
    fireEvent.click(button);
    await screen.findByRole('link', { name: 'Fetch API' });
    expect(calls('data/panels/mdn.json')).toBe(1);
  });

  it('opens one panel at a time for a spec, and leaves other specs alone', async () => {
    await start();
    fireEvent.click(screen.getByRole('button', { name: '1 MDN article for CSS Color 5' }));
    fireEvent.click(screen.getByRole('button', { name: '4 MDN articles for DOM' }));
    fireEvent.click(screen.getByRole('button', { name: '1 Can I Use feature for DOM' }));
    expect(screen.getByRole('button', { name: '4 MDN articles for DOM' }).getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByRole('button', { name: '1 Can I Use feature for DOM' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: '1 MDN article for CSS Color 5' }).getAttribute('aria-expanded')).toBe('true');
    await screen.findByText('1 Can I Use feature');
  });

  it('closes on Escape, and puts focus back on its button', async () => {
    await start();
    const button = screen.getByRole('button', { name: 'Engines for CSS Color 5: WebKit and Blink' });
    fireEvent.click(button);
    await waitFor(() => expect(within(panelOf(button)).getByText(/^Firefox ships 3 of the 21 features/)).toBeTruthy());
    fireEvent.keyDown(within(panelOf(button)).getByRole('link', { name: 'api.HTMLAnchorElement.referrerPolicy.unsafe-url' }), { key: 'Escape' });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(button);
  });

  it("says a panel didn't load, and Try again loads it", async () => {
    fetchMock.mockImplementationOnce(async () => new Response('', { status: 503 }));
    await start();
    fireEvent.click(screen.getByRole('button', { name: /^WPT pass rates for DOM/ }));
    expect((await screen.findByText(/This panel didn.t load\./)).textContent).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByRole('link', { name: 'All tests' });
  });

  it("says a panel didn't load when its file doesn't fit its type, and the list still works", async () => {
    BODIES['data/panels/caniuse.json'] = { specs: 1 };
    try {
      await start();
      fireEvent.click(screen.getByRole('button', { name: '1 Can I Use feature for DOM' }));
      await screen.findByText(/This panel didn.t load\./);
      fireEvent.input(screen.getByRole('searchbox', { name: 'Filter specifications' }), { target: { value: 'css' } });
      expect(screen.getByText('1 of 3 specs')).toBeTruthy();
    } finally {
      BODIES['data/panels/caniuse.json'] = caniuse;
    }
  });

  it('offers no button for a count of 0, for three engines, or for No data', async () => {
    await start();
    expect(screen.queryByRole('button', { name: /Can I Use features? for CSS Color 5/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Engines for DOM/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /for Zzz/ })).toBeNull();
  });

  it('opens a panel inside a card in the cards view', async () => {
    history.replaceState(null, '', '/?view=cards');
    render(<App load={() => Promise.resolve(structuredClone(FILE))} now={NOW} />);
    await waitFor(() => expect(screen.getAllByRole('article').length).toBe(2));
    const card = screen.getAllByRole('article').find((a) => within(a).queryByRole('link', { name: 'DOM' }))!;
    fireEvent.click(within(card).getByRole('button', { name: '4 MDN articles for DOM' }));
    await waitFor(() => expect(within(card).getByRole('link', { name: 'Fetch API' })).toBeTruthy());
    expect(card.closest('li')!.classList.contains('wide')).toBe(true);
  });
});

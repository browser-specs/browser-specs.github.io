// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { App } from '../src/page/App.tsx';
import { issueLinks, shortGroup, splitCategory } from '../src/page/parts.tsx';
import type { Row, RowsFile } from '../src/logic/rows.ts';

const NOW = Date.parse('2026-10-22T13:00:00Z');

const base = (over: Partial<Row>): Row => ({
  shortname: 'x', title: 'X', fullTitle: 'X', url: 'https://example.test/x/', org: 'W3C', groups: ['Some Working Group'],
  bucket: '3', mdn: 0, caniuse: 0, category: 'Core', ...over,
});

const FILE: RowsFile = {
  sources: {
    built: '2026-10-22T13:00:00.000Z', webref: '2026-10-20', bcd: '8.1.6', mdnContent: '2026-10-22', caniuse: '1.0.30001819',
    wpt: { revision: 'abc1234567', date: '2026-10-18' }, webFeatures: '3.4.0',
  },
  rows: [
    base({
      shortname: 'dom', title: 'DOM', fullTitle: 'DOM', url: 'https://dom.spec.whatwg.org/', org: 'WHATWG', groups: ['DOM Workstream'],
      repo: 'https://github.com/whatwg/dom', updated: '2026-10-19', engines: ['gecko', 'webkit', 'blink'], bucket: '3',
      wpt: { firefox: 98.3, safari: 98.2, chrome: 99.4 }, tests: 'https://wpt.fyi/results/dom', mdn: 380, caniuse: 20, category: 'Core', footprint: 249,
    }),
    base({
      shortname: 'css-color-5', title: 'CSS Color 5', fullTitle: 'CSS Color Module Level 5', groups: ['Cascading Style Sheets (CSS) Working Group'],
      updated: '2026-10-08', engines: ['webkit', 'blink'], bucket: '2', mdn: 16, caniuse: 1, category: 'CSS',
    }),
    base({ shortname: 'webxr', title: 'WebXR Device API', fullTitle: 'WebXR Device API', updated: '2022-03-31', engines: ['blink'], bucket: '1', category: 'Mixed reality', footprint: 16 }),
    base({ shortname: 'zzz', title: 'Zzz', fullTitle: 'Zzz', bucket: 'nodata', category: 'Other' }),
  ],
};

const loaded = () => Promise.resolve(structuredClone(FILE));
const rowNames = () => screen.getAllByRole('row').slice(1).flatMap((r) => within(r).queryAllByRole('link').slice(0, 1).map((a) => a.textContent));
const filter = () => screen.getByRole('searchbox', { name: 'Filter specs' });

beforeEach(() => history.replaceState(null, '', '/'));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('the page', () => {
  it('shows the loading message, then the default view', async () => {
    render(<App load={loaded} now={NOW} />);
    expect(screen.getByRole('status').textContent).toContain('Loading specifications');
    await screen.findByRole('table');
    expect(rowNames()).toEqual(['DOM', 'CSS Color 5']);
    expect(screen.getByText('2 of 4 specs')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Browser specs');
    expect(filter().getAttribute('placeholder')).toBe('Filter specs\u2026');
  });

  it('turns a chip on, and records it in the URL', async () => {
    render(<App load={loaded} now={NOW} />);
    await screen.findByRole('table');
    const one = screen.getByRole('button', { name: /^1 engine/ });
    expect(one.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(one);
    expect(one.getAttribute('aria-pressed')).toBe('true');
    expect(location.search).toBe('?engines=3%2C2%2C1');
    expect(rowNames()).toEqual(['DOM', 'CSS Color 5', 'WebXR Device API']);
  });

  it('filters as the reader types, and marks the match', async () => {
    render(<App load={loaded} now={NOW} />);
    await screen.findByRole('table');
    fireEvent.input(filter(), { target: { value: 'colo' } });
    expect(rowNames()).toEqual(['CSS Color 5']);
    expect(document.querySelector('mark')?.textContent).toBe('Colo');
    expect(screen.getByText('1 of 4 specs')).toBeTruthy();
  });

  it('shows a filter of HTML as text', async () => {
    render(<App load={loaded} now={NOW} />);
    await screen.findByRole('table');
    fireEvent.input(filter(), { target: { value: '<b>' } });
    expect(document.querySelector('b')).toBeNull();
    expect(screen.getByText('No matching specifications.')).toBeTruthy();
  });

  it('switches to cards, keeping the filter', async () => {
    render(<App load={loaded} now={NOW} />);
    await screen.findByRole('table');
    fireEvent.input(filter(), { target: { value: 'dom' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Cards' }));
    expect(location.search).toBe('?q=dom&view=cards');
    expect(screen.queryByRole('table')).toBeNull();
    const [card] = screen.getAllByRole('article');
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(within(card).getAllByRole('link').map((a) => a.textContent)).toEqual(['DOM', 'Repo', 'Open issues', 'File issue']);
    expect(within(card).getByRole('button', { name: '380 MDN articles for DOM' }).textContent).toBe('380 MDN articles');
  });

  it('orders by Name, and by Grouped with a heading per category and no Category column', async () => {
    render(<App load={loaded} now={NOW} />);
    await screen.findByRole('table');
    fireEvent.click(screen.getByRole('radio', { name: 'Name' }));
    expect(rowNames()).toEqual(['CSS Color 5', 'DOM']);
    expect(screen.getByRole('columnheader', { name: 'Category' })).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'Grouped' }));
    expect(screen.getAllByRole('rowheader').map((h) => h.textContent)).toEqual(['Core \u00b7 1 spec', 'CSS \u00b7 1 spec']);
    expect(screen.queryByRole('columnheader', { name: 'Category' })).toBeNull();
    // Grouped keeps the sort Name chose.
    expect(location.search).toBe('?order=grouped&sort=spec');
  });

  it('shows the empty state, and Reset filters brings back the defaults', async () => {
    render(<App load={loaded} now={NOW} />);
    await screen.findByRole('table');
    fireEvent.click(screen.getByRole('button', { name: /^3 engines/ }));
    fireEvent.click(screen.getByRole('button', { name: /^2 engines/ }));
    expect(screen.getByText('No matching specifications.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }));
    expect(location.search).toBe('');
    expect(rowNames()).toEqual(['DOM', 'CSS Color 5']);
  });

  it('says when the list fails to load, and Try again loads it', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('HTTP 503')).mockImplementation(loaded);
    render(<App load={load} now={NOW} />);
    expect((await screen.findByRole('alert')).textContent).toContain('The list of specifications didn\u2019t load.');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByRole('table');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('starts from the state in the URL', async () => {
    history.replaceState(null, '', '/?view=cards&q=dom');
    render(<App load={loaded} now={NOW} />);
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(1));
    expect((filter() as HTMLInputElement).value).toBe('dom');
    expect((screen.getByRole('radio', { name: 'Cards' }) as HTMLInputElement).checked).toBe(true);
  });

  it('announces the count once typing stops', async () => {
    render(<App load={loaded} now={NOW} />);
    await screen.findByRole('table');
    const live = () => screen.getByRole('status').textContent;
    await waitFor(() => expect(live()).toBe('2 of 4 specs'));
    vi.useFakeTimers();
    fireEvent.input(filter(), { target: { value: 'dom' } });
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(live()).toBe('2 of 4 specs');
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(live()).toBe('1 of 4 specs');
  });

  it('reads Updated as relative text, with the full date as its tooltip', async () => {
    render(<App load={loaded} now={NOW} />);
    await screen.findByRole('table');
    const time = screen.getByText('3 days ago');
    expect(time.tagName).toBe('TIME');
    expect(time.getAttribute('datetime')).toBe('2026-10-19');
    expect(time.getAttribute('title')).toBe('19 October 2026');
  });

  it("shows the browsers' logos, with a green check for three engines and a gray one for two", async () => {
    history.replaceState(null, '', '/?engines=3,2,1');
    render(<App load={loaded} now={NOW} />);
    await screen.findByRole('table');
    for (const name of ['Firefox ships it', 'Safari ships it', 'Chrome ships it']) {
      const logos = screen.getAllByRole('img', { name });
      expect(logos[0].getAttribute('title')).toBe(name);
      expect(logos[0].getAttribute('src')).toMatch(/^icons\/browsers\/(firefox|safari|chrome)\.svg$/);
    }
    const missing = screen.getAllByRole('img', { name: 'Firefox doesn\u2019t ship it' });
    expect(missing).toHaveLength(2);
    expect(missing.every((img) => img.classList.contains('no') && img.getAttribute('title') === img.getAttribute('alt'))).toBe(true);
    const all = screen.getAllByRole('img', { name: 'Implemented in all three engines' });
    const two = screen.getAllByRole('img', { name: 'Implemented in two of the three engines' });
    expect([all.length, two.length]).toEqual([1, 1]);
    expect([all[0].className, two[0].className]).toEqual(['check all', 'check two']);
    expect(screen.getByRole('img', { name: 'Firefox 98.3%' })).toBeTruthy();
  });

  it('colors each test bar by its pass rate', async () => {
    const rows = FILE.rows.map((r) => (r.shortname === 'css-color-5' ? { ...r, wpt: { firefox: 89.8, safari: 7.4, chrome: 95 } } : r));
    render(<App load={() => Promise.resolve({ ...structuredClone(FILE), rows })} now={NOW} />);
    await screen.findByRole('table');
    const bars = ['Firefox 89.8%', 'Safari 7.4%', 'Chrome 95.0%'].map((name) => screen.getByRole('img', { name }).querySelector('i')!.className);
    expect(bars).toEqual(['mid', 'lo', 'hi']);
  });

  it("names a group once when it has its org's name", async () => {
    const rows = FILE.rows.map((r) => (r.shortname === 'dom' ? { ...r, org: 'CompuServe Incorporated', groups: ['CompuServe Incorporated'] } : r));
    render(<App load={() => Promise.resolve({ ...structuredClone(FILE), rows })} now={NOW} />);
    await screen.findByRole('table');
    expect(screen.getByRole('link', { name: 'DOM' }).closest('td')!.querySelector('.sub')!.textContent).toBe('CompuServe Incorporated');
  });

  it('names its sources in the footer once the list loads', async () => {
    render(<App load={loaded} now={NOW} />);
    await screen.findByRole('table');
    const footer = screen.getByRole('contentinfo');
    expect(footer.textContent).toContain('Built 22 October 2026, 13:00 UTC, from browser-specs, webref (20 October 2026), BCD 8.1.6');
    expect(within(footer).getByRole('link', { name: 'Source on GitHub' }).getAttribute('href')).toBe('https://github.com/browser-specs/browser-specs.github.io');
  });
});

describe('sorting', () => {
  const header = (name: string) => screen.getByRole('columnheader', { name });
  const sortBy = (name: string) => fireEvent.click(within(header(name)).getByRole('button'));
  const checked = () => screen.getAllByRole('radio').filter((r) => (r as HTMLInputElement).name === 'order' && (r as HTMLInputElement).checked).map((r) => r.getAttribute('value'));

  it('makes each header a sort button, and marks the sorted one', async () => {
    render(<App load={loaded} now={NOW} />);
    await screen.findByRole('table');
    const heads = screen.getAllByRole('columnheader');
    expect(heads.map((h) => h.textContent?.replace(/[\u2195\u25b2\u25bc]/g, ''))).toEqual(['Spec', 'Updated', 'Engines', 'Tests', 'Docs', 'Can I Use', 'Footprint', 'Category']);
    expect(heads.every((h) => within(h).queryByRole('button'))).toBe(true);
    expect(heads.map((h) => h.getAttribute('aria-sort'))).toEqual([null, 'descending', null, null, null, null, null, null]);
  });

  it('sorts by a header, reverses on a second click, and keeps missing values last', async () => {
    history.replaceState(null, '', '/?engines=3,2,1');
    render(<App load={loaded} now={NOW} />);
    await screen.findByRole('table');
    sortBy('Footprint');
    expect(rowNames()).toEqual(['DOM', 'WebXR Device API', 'CSS Color 5']);
    expect(header('Footprint').getAttribute('aria-sort')).toBe('descending');
    expect(header('Spec').getAttribute('aria-sort')).toBeNull();
    expect(location.search).toBe('?engines=3%2C2%2C1&sort=footprint');
    await waitFor(() => expect(screen.getByText('Sorted by footprint, largest first')).toBeTruthy());
    sortBy('Footprint');
    expect(rowNames()).toEqual(['WebXR Device API', 'DOM', 'CSS Color 5']);
    expect(header('Footprint').getAttribute('aria-sort')).toBe('ascending');
    expect(location.search).toBe('?engines=3%2C2%2C1&sort=-footprint');
  });

  it('selects Name or Recent for their headers, and neither for any other', async () => {
    render(<App load={loaded} now={NOW} />);
    await screen.findByRole('table');
    expect(checked()).toEqual(['recent']);
    sortBy('Spec');
    expect(checked()).toEqual(['name']);
    sortBy('Docs');
    expect(checked()).toEqual([]);
    fireEvent.click(screen.getByRole('radio', { name: 'Recent' }));
    expect(checked()).toEqual(['recent']);
    expect(header('Updated').getAttribute('aria-sort')).toBe('descending');
    expect(rowNames()).toEqual(['DOM', 'CSS Color 5']);
  });

  it('sorts within each category when Grouped is on, and keeps Grouped', async () => {
    history.replaceState(null, '', '/?engines=3,2,1&order=grouped');
    const rows = FILE.rows.map((r) => (r.shortname === 'webxr' ? { ...r, category: 'Core', mdn: 5 } : r));
    render(<App load={() => Promise.resolve({ ...structuredClone(FILE), rows })} now={NOW} />);
    await screen.findByRole('table');
    expect(rowNames()).toEqual(['DOM', 'WebXR Device API', 'CSS Color 5']);
    sortBy('Docs');
    sortBy('Docs');
    expect(rowNames()).toEqual(['WebXR Device API', 'DOM', 'CSS Color 5']);
    expect(screen.getAllByRole('rowheader').map((h) => h.textContent)).toEqual(['Core \u00b7 2 specs', 'CSS \u00b7 1 spec']);
    expect(checked()).toEqual(['grouped']);
    expect(document.querySelector('caption')?.textContent).toBe('Browser specs, grouped by category, by MDN articles, fewest first');
  });

  it('shows the cards in the sort the table had', async () => {
    history.replaceState(null, '', '/?engines=3,2,1');
    render(<App load={loaded} now={NOW} />);
    await screen.findByRole('table');
    sortBy('Footprint');
    fireEvent.click(screen.getByRole('radio', { name: 'Cards' }));
    expect(screen.getAllByRole('article').map((a) => within(a).getAllByRole('link')[0].textContent)).toEqual(['DOM', 'WebXR Device API', 'CSS Color 5']);
  });

  it('gives the cards a row of sort buttons, the sorted one marked, with its direction', async () => {
    history.replaceState(null, '', '/?engines=3,2,1&view=cards');
    render(<App load={loaded} now={NOW} />);
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(3));
    const sorts = screen.getByRole('group', { name: 'Sort' });
    const current = () => within(sorts).getAllByRole('button').filter((b) => b.getAttribute('aria-current') === 'true');
    const cardNames = () => screen.getAllByRole('article').map((a) => within(a).getAllByRole('link')[0].textContent);
    expect(within(sorts).getAllByRole('button').map((b) => b.textContent?.replace(/[\u2195\u25b2\u25bc]/g, ''))).toEqual([
      'Spec', 'Updated', 'Engines', 'Tests', 'Docs', 'Can I Use', 'Footprint', 'Category',
    ]);
    expect(current()).toEqual([within(sorts).getByRole('button', { name: 'Updated, newest first' })]);
    fireEvent.click(within(sorts).getByRole('button', { name: 'Footprint' }));
    expect(cardNames()).toEqual(['DOM', 'WebXR Device API', 'CSS Color 5']);
    expect(current()).toEqual([within(sorts).getByRole('button', { name: 'Footprint, largest first' })]);
    expect(location.search).toBe('?engines=3%2C2%2C1&sort=footprint&view=cards');
    await waitFor(() => expect(screen.getByText('Sorted by footprint, largest first')).toBeTruthy());
    fireEvent.click(within(sorts).getByRole('button', { name: 'Footprint, largest first' }));
    expect(cardNames()).toEqual(['WebXR Device API', 'DOM', 'CSS Color 5']);
    expect(current()).toEqual([within(sorts).getByRole('button', { name: 'Footprint, smallest first' })]);
  });

  it("leaves the cards' sort buttons without Category when Grouped is on", async () => {
    history.replaceState(null, '', '/?view=cards&order=grouped');
    render(<App load={loaded} now={NOW} />);
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2));
    expect(within(screen.getByRole('group', { name: 'Sort' })).queryByRole('button', { name: 'Category' })).toBeNull();
  });

  it('names the sort in the caption', async () => {
    render(<App load={loaded} now={NOW} />);
    await screen.findByRole('table');
    expect(document.querySelector('caption')?.textContent).toBe('Browser specs, by date, newest first');
  });
});

describe('the cards', () => {
  it("links a GitHub repo's issues and its new-issue page", () => {
    expect(issueLinks('https://github.com/w3c/csswg-drafts/')).toEqual([
      { label: 'Open issues', href: 'https://github.com/w3c/csswg-drafts/issues' },
      { label: 'File issue', href: 'https://github.com/w3c/csswg-drafts/issues/new/choose' },
    ]);
    expect(issueLinks('https://gitlab.example/x')).toEqual([]);
    expect(issueLinks(undefined)).toEqual([]);
  });

  it('splits a category at "and", capitalizing the second part', () => {
    expect(splitCategory('Graphics and typography')).toEqual(['Graphics', 'Typography']);
    expect(splitCategory('HTTP and networking')).toEqual(['HTTP', 'Networking']);
    expect(splitCategory('CSS')).toEqual(['CSS']);
  });

  it("lists a card's links in order, without Spec or Tests", async () => {
    history.replaceState(null, '', '/?view=cards&q=dom');
    render(<App load={loaded} now={NOW} />);
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(1));
    const links = screen.getByRole('article').querySelector('.links')!;
    expect([...links.children].map((el) => el.textContent)).toEqual([
      'Repo', 'Open issues', 'File issue', '380 MDN articles', '20 Can I Use features', 'Footprint',
    ]);
    expect(within(links as HTMLElement).getByRole('link', { name: 'Open issues' }).getAttribute('href')).toBe('https://github.com/whatwg/dom/issues');
    expect(within(links as HTMLElement).getByRole('button', { name: 'Footprint: 249 other specs reference DOM' })).toBeTruthy();
    expect(within(links as HTMLElement).queryByRole('link', { name: 'Spec' })).toBeNull();
    expect(within(links as HTMLElement).queryByRole('link', { name: 'Tests' })).toBeNull();
  });

  it("shows a card's tag on two lines, and reads it with its 'and'", async () => {
    const rows = FILE.rows.map((r) => (r.shortname === 'dom' ? { ...r, category: 'Graphics and typography' } : r));
    const load = () => Promise.resolve({ ...structuredClone(FILE), rows });
    history.replaceState(null, '', '/?view=cards&q=dom');
    render(<App load={load} now={NOW} />);
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(1));
    const tag = screen.getByRole('article').querySelector('.tag')!;
    expect(tag.textContent).toBe('Graphics and Typography');
    expect(tag.querySelector('br')).toBeTruthy();
    expect(tag.querySelector('.sr-only')!.textContent).toBe(' and ');
    fireEvent.click(screen.getByRole('radio', { name: 'Grouped' }));
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Graphics and typography \u00b7 1 spec');
    fireEvent.click(screen.getByRole('radio', { name: 'Name' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Table' }));
    expect(screen.getByRole('link', { name: 'DOM' }).closest('tr')!.querySelector('td.cat')!.textContent).toBe('Graphics and typography');
  });

  it('gives a card without a footprint no Footprint button', async () => {
    history.replaceState(null, '', '/?view=cards&q=css%20color');
    render(<App load={loaded} now={NOW} />);
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(1));
    expect(within(screen.getByRole('article')).queryByRole('button', { name: /^Footprint/ })).toBeNull();
  });
});

describe('group names on cards', () => {
  it('shortens "Working Group" to "WG" and "Community Group" to "CG"', () => {
    expect(shortGroup('Immersive Web Working Group')).toBe('Immersive Web WG');
    expect(shortGroup('Web Platform Incubator Community Group')).toBe('Web Platform Incubator CG');
    expect(shortGroup('TC39')).toBe('TC39');
  });

  it("uses the short forms in a card's subtitle, and the full names in the table", async () => {
    history.replaceState(null, '', '/?view=cards&q=css%20color');
    render(<App load={loaded} now={NOW} />);
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(1));
    expect(screen.getByRole('article').querySelector('.sub')!.textContent).toBe('W3C \u00b7 Cascading Style Sheets (CSS) WG');
    fireEvent.click(screen.getByRole('radio', { name: 'Table' }));
    const cell = screen.getByRole('link', { name: 'CSS Color 5' }).closest('td')!;
    expect(cell.querySelector('.sub')!.textContent).toBe('W3C \u00b7 Cascading Style Sheets (CSS) Working Group');
  });
});

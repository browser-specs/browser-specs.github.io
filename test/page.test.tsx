// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { App } from '../src/page/App.tsx';
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
      wpt: { firefox: 98.3, safari: 98.2, chrome: 99.4 }, tests: 'https://wpt.fyi/results/dom', mdn: 380, caniuse: 20, category: 'Core',
    }),
    base({
      shortname: 'css-color-5', title: 'CSS Color 5', fullTitle: 'CSS Color Module Level 5', groups: ['Cascading Style Sheets (CSS) Working Group'],
      updated: '2026-10-08', engines: ['webkit', 'blink'], bucket: '2', mdn: 16, caniuse: 1, category: 'CSS',
    }),
    base({ shortname: 'webxr', title: 'WebXR Device API', fullTitle: 'WebXR Device API', updated: '2022-03-31', engines: ['blink'], bucket: '1', category: 'Mixed reality' }),
    base({ shortname: 'zzz', title: 'Zzz', fullTitle: 'Zzz', bucket: 'nodata', category: 'Other' }),
  ],
};

const loaded = () => Promise.resolve(structuredClone(FILE));
const rowNames = () => screen.getAllByRole('row').slice(1).flatMap((r) => within(r).queryAllByRole('link').slice(0, 1).map((a) => a.textContent));
const filter = () => screen.getByRole('searchbox', { name: 'Filter specifications' });

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
    expect(rowNames()).toEqual(['CSS Color 5', 'DOM']);
    expect(screen.getByText('2 of 4 specs')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('The Web Platform: Browser technologies');
  });

  it('turns a chip on, and records it in the URL', async () => {
    render(<App load={loaded} now={NOW} />);
    await screen.findByRole('table');
    const one = screen.getByRole('button', { name: /^1 engine/ });
    expect(one.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(one);
    expect(one.getAttribute('aria-pressed')).toBe('true');
    expect(location.search).toBe('?engines=3%2C2%2C1');
    expect(rowNames()).toEqual(['CSS Color 5', 'DOM', 'WebXR Device API']);
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
    expect(within(card).getAllByRole('link').map((a) => a.textContent)).toEqual(['DOM', 'Spec', 'Repo', 'Tests']);
    expect(within(card).getByText('MDN 380')).toBeTruthy();
  });

  it('orders by Recent, and by Grouped with a heading per category and no Category column', async () => {
    render(<App load={loaded} now={NOW} />);
    await screen.findByRole('table');
    fireEvent.click(screen.getByRole('radio', { name: 'Recent' }));
    expect(rowNames()).toEqual(['DOM', 'CSS Color 5']);
    expect(screen.getByRole('columnheader', { name: 'Category' })).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'Grouped' }));
    expect(screen.getAllByRole('rowheader').map((h) => h.textContent)).toEqual(['Core \u00b7 1 spec', 'CSS \u00b7 1 spec']);
    expect(screen.queryByRole('columnheader', { name: 'Category' })).toBeNull();
    expect(location.search).toBe('?order=grouped');
  });

  it('shows the empty state, and Reset filters brings back the defaults', async () => {
    render(<App load={loaded} now={NOW} />);
    await screen.findByRole('table');
    fireEvent.click(screen.getByRole('button', { name: /^3 engines/ }));
    fireEvent.click(screen.getByRole('button', { name: /^2 engines/ }));
    expect(screen.getByText('No matching specifications.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }));
    expect(location.search).toBe('');
    expect(rowNames()).toEqual(['CSS Color 5', 'DOM']);
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

  it('names each engine badge for what it says, and each WPT bar for its rate', async () => {
    render(<App load={loaded} now={NOW} />);
    await screen.findByRole('table');
    expect(screen.getAllByRole('img', { name: 'Gecko ships it' })).toHaveLength(1);
    expect(screen.getAllByRole('img', { name: 'Gecko doesn\u2019t ship it' })).toHaveLength(1);
    expect(screen.getByRole('img', { name: 'Firefox 98.3%' })).toBeTruthy();
  });

  it('names its sources in the footer once the list loads', async () => {
    render(<App load={loaded} now={NOW} />);
    await screen.findByRole('table');
    const footer = screen.getByRole('contentinfo');
    expect(footer.textContent).toContain('Built 22 October 2026, 13:00 UTC, from browser-specs, webref (20 October 2026), BCD 8.1.6');
    expect(within(footer).getByRole('link', { name: 'Source on GitHub' }).getAttribute('href')).toBe('https://github.com/html-now/html-now.github.io');
  });
});

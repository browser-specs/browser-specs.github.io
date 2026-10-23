import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../site/style.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

// Every rule's selectors, with the at-rules' own lines left out.
const selectors = [...css.matchAll(/([^{}]+)\{[^{}]*\}/g)]
  .map((m) => m[1].trim())
  .filter((s) => !s.startsWith('@'))
  .flatMap((s) => s.split(',').map((x) => x.trim()));

// The declarations of the one rule whose selector list is exactly the selector, by property.
function declarations(selector: string): Record<string, string> {
  const rule = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find((m) => m[1].trim() === selector);
  const pairs = (rule?.[2] ?? '').split(';').map((d) => d.split(':').map((x) => x.trim()));
  return Object.fromEntries(pairs.filter((d) => d.length === 2 && d[0]));
}

describe('the stylesheet', () => {
  it("keeps a card's title in whole words, and its tag to at most 45% of the card", () => {
    expect(declarations('.card-head > span:first-child')).toMatchObject({ 'min-width': '0', 'overflow-wrap': 'break-word' });
    expect(declarations('.card-head > .tag')).toMatchObject({ 'max-width': '45%', 'white-space': 'normal', flex: 'none' });
    expect(selectors.filter((s) => s === '.card-head > span:first-child')).toHaveLength(1);
  });

  it("never lets a card's content widen the card, so a title's one long word wraps within it", () => {
    expect(declarations('.card')).toMatchObject({ 'grid-template-columns': 'minmax(0, 1fr)' });
  });

  it("scopes the list table's rules to its own parts, so the table in a wpt.fyi panel keeps its own layout", () => {
    expect(selectors.filter((s) => /\.specs\s+(?!>)/.test(s))).toEqual([]);
  });

  it('keeps a focused element clear of the sticky Filter bar', () => {
    const html = /(?:^|\n)html\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    const padding = /scroll-padding-top:\s*(\d+)px/.exec(html);
    expect(Number(padding?.[1] ?? 0)).toBeGreaterThanOrEqual(64);
  });

  it('shows the headers as a row of sort buttons on a phone', () => {
    const phone = /@media \(max-width: 640px\)\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
    expect(phone).toMatch(/\.specs > thead > tr\s*\{[^}]*display:\s*flex/);
    expect(phone).not.toMatch(/\.specs > thead\s*\{[^}]*position:\s*absolute/);
  });

  it("styles the footprint's count, never its table cell, which keeps the class fp", () => {
    expect(selectors.filter((s) => s === '.fp')).toEqual([]);
  });

  it('labels the counts on a phone as the headers name them', () => {
    const phone = /@media \(max-width: 640px\)\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
    expect(phone).toMatch(/td\.mdn::before\s*\{\s*content:\s*"Docs "/);
  });
});

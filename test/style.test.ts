import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../site/style.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

// Every rule's selectors, with the at-rules' own lines left out.
const selectors = [...css.matchAll(/([^{}]+)\{[^{}]*\}/g)]
  .map((m) => m[1].trim())
  .filter((s) => !s.startsWith('@'))
  .flatMap((s) => s.split(',').map((x) => x.trim()));

describe('the stylesheet', () => {
  it("scopes the list table's rules to its own parts, so the table in a wpt.fyi panel keeps its own layout", () => {
    expect(selectors.filter((s) => /\.specs\s+(?!>)/.test(s))).toEqual([]);
  });

  it('keeps a focused element clear of the sticky Filter bar', () => {
    const html = /(?:^|\n)html\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    const padding = /scroll-padding-top:\s*(\d+)px/.exec(html);
    expect(Number(padding?.[1] ?? 0)).toBeGreaterThanOrEqual(64);
  });

  it("styles the footprint's count, never its table cell, which keeps the class fp", () => {
    expect(selectors.filter((s) => s === '.fp')).toEqual([]);
  });
});

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
});

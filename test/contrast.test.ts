import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../site/style.css', import.meta.url), 'utf8');

// The custom properties a block sets, e.g. the light scheme's on :root and the dark scheme's inside its media query.
function props(block: string): Record<string, string> {
  return Object.fromEntries([...block.matchAll(/(--[a-z-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map((m) => [m[1], m[2]]));
}

const light = props(/^:root\s*\{([^}]*)\}/m.exec(css)?.[1] ?? '');
const dark = props(/@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? '');

// WCAG 2's contrast ratio, from each color's relative luminance.
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const ratio = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const PAIRS: [string, string, number][] = [
  ['--fg', '--bg', 4.5], ['--muted', '--bg', 4.5], ['--muted', '--surface', 4.5], ['--fg', '--surface', 4.5],
  ['--link', '--bg', 4.5], ['--link', '--surface', 4.5], ['--tag-fg', '--tag-bg', 4.5], ['--fg', '--mark', 4.5],
  ['--no-border', '--bg', 3], ['--focus', '--bg', 3], ['--bg', '--link', 4.5],
  ['--pass-hi', '--track', 3], ['--pass-mid', '--track', 3], ['--pass-lo', '--track', 3],
  ['--pass-hi', '--bg', 3], ['--pass-mid', '--bg', 3], ['--pass-lo', '--bg', 3], ['--check-all', '--bg', 3],
];
// --check-two is the extension's gray, and is under 3:1 against the background. But it repeats what the logos and
// their names already say, so it's never the only cue.

describe('the colors', () => {
  it.each([['light', light], ['dark', dark]])('meet the contrast floors in the %s scheme', (_, scheme) => {
    for (const [a, b, floor] of PAIRS) {
      expect(scheme[a], a).toMatch(/^#/);
      expect(scheme[b], b).toMatch(/^#/);
      expect(ratio(scheme[a], scheme[b]), `${a} on ${b}`).toBeGreaterThanOrEqual(floor);
    }
  });
});

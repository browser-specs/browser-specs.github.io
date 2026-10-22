import { describe, it, expect } from 'vitest';
import { ago, daysSince, formatDate, freshness, parseSpecDate } from '../src/logic/dates.ts';

describe('parseSpecDate', () => {
  it.each([
    ['19 October 2026', '2026-10-19'],
    ['7 May 2026', '2026-05-07'],
    ['  3 June 2026 ', '2026-06-03'],
    ['October 19, 2026', '2026-10-19'],
    ['February 26, 2026', '2026-02-26'],
    ['Table of Contents', undefined],
    ['31 February 2026', undefined],
    ['', undefined],
    [undefined, undefined],
    [42, undefined],
  ])('reads %j as %j', (text, iso) => expect(parseSpecDate(text)).toBe(iso));
});

describe('ago', () => {
  it.each([
    [0, 'today'],
    [1, 'yesterday'],
    [3, '3 days ago'],
    [7, 'last week'],
    [14, '2 weeks ago'],
    [29, '4 weeks ago'],
    [30, 'last month'],
    [46, 'last month'],
    [141, '4 months ago'],
    [364, '12 months ago'],
    [365, 'last year'],
    [1666, '4 years ago'],
  ])('says %i days is %j', (days, text) => expect(ago(days)).toBe(text));
});

describe('freshness', () => {
  it.each([
    [0, 'recent'],
    [29, 'recent'],
    [30, 'moderate'],
    [179, 'moderate'],
    [180, 'stale'],
  ])('files %i days as %s', (days, f) => expect(freshness(days)).toBe(f));
});

describe('daysSince', () => {
  it('counts whole days since a date, in UTC, and never fewer than none', () => {
    expect(daysSince('2026-10-19', Date.parse('2026-10-22T13:00:00Z'))).toBe(3);
    expect(daysSince('2026-10-23', Date.parse('2026-10-22T13:00:00Z'))).toBe(0);
  });
});

describe('formatDate', () => {
  it('formats a date the way the panels do', () => expect(formatDate('2026-10-19')).toBe('19 October 2026'));
});

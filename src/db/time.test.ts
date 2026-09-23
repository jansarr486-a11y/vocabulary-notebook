import { describe, expect, it } from 'vitest';
import { DAY_MS, dayKey, daysBetween, dayStart, dueState } from './time';

const NOW = new Date(2026, 8, 23, 15, 30).getTime();

describe('time helpers', () => {
  it('dayKey formats local date', () => {
    expect(dayKey(NOW)).toBe('2026-09-23');
  });

  it('dayStart zeroes the clock', () => {
    const s = new Date(dayStart(NOW));
    expect([s.getHours(), s.getMinutes(), s.getSeconds(), s.getMilliseconds()]).toEqual([0, 0, 0, 0]);
  });

  it('daysBetween counts whole local days', () => {
    const yesterday = NOW - 24 * 60 * 60 * 1000;
    expect(daysBetween(yesterday, NOW)).toBe(1);
    expect(daysBetween(NOW - 3600_000, NOW)).toBe(0);
    expect(daysBetween(NOW, NOW - 2 * 24 * 3600_000)).toBe(-2);
  });

  it('dueState classification', () => {
    expect(dueState(undefined, undefined, NOW)).toBe('locked');
    expect(dueState(NOW, undefined, NOW)).toBe('due');
    expect(dueState(NOW - 24 * 3600_000, undefined, NOW)).toBe('overdue');
    expect(dueState(NOW - 10 * DAY_MS, NOW - DAY_MS, NOW)).toBe('done');
  });
});

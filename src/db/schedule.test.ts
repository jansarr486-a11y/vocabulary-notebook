import { describe, expect, it } from 'vitest';
import {
  applyReviewRating,
  computeStreak,
  recordActivity,
  reviewScore,
  sectionUnlockAt,
  unlockLabel,
  wordSectionStatuses,
} from './schedule';
import { DAY_MS, dayKey } from './time';
import { DEFAULT_INTERVALS, type WordSection } from './models';

// Fixed "now": 2026-09-23 15:00 local time
const NOW = new Date(2026, 8, 23, 15, 0, 0).getTime();

describe('sectionUnlockAt', () => {
  it('unlocks section 1 immediately', () => {
    expect(sectionUnlockAt(1, undefined, DEFAULT_INTERVALS, NOW)).toBe(NOW);
  });

  it('locks section 2 while section 1 is incomplete', () => {
    const s1: WordSection = { text: '' };
    expect(sectionUnlockAt(2, s1, DEFAULT_INTERVALS, NOW)).toBeUndefined();
  });

  it('unlocks section 2 two days after section 1 completion (default)', () => {
    const completed = NOW - 3 * DAY_MS;
    const s1: WordSection = { text: 'def', completedAt: completed };
    expect(sectionUnlockAt(2, s1, DEFAULT_INTERVALS, NOW)).toBe(completed + 2 * DAY_MS);
  });

  it('honours custom intervals', () => {
    const completed = NOW - DAY_MS;
    const s1: WordSection = { text: 'x', completedAt: completed };
    const custom = { s1: 0, s2: 5, s3: 10, s4: null };
    expect(sectionUnlockAt(2, s1, custom, NOW)).toBe(completed + 5 * DAY_MS);
  });
});

describe('wordSectionStatuses', () => {
  const mkWord = (sections: WordSection[]) => ({ sections });

  it('fresh word: only section 1 is due, rest locked (4 is optional)', () => {
    const statuses = wordSectionStatuses(mkWord([{ text: '' }, { text: '' }, { text: '' }, { text: '' }]), DEFAULT_INTERVALS, NOW);
    expect(statuses.map((s) => s.state)).toEqual(['due', 'locked', 'locked', 'optional']);
  });

  it('completed section 1 recently: section 2 locked, unlocks in 2 days', () => {
    const s1: WordSection = { text: 'a', completedAt: NOW - DAY_MS / 2 };
    const statuses = wordSectionStatuses(mkWord([s1, { text: '' }, { text: '' }, { text: '' }]), DEFAULT_INTERVALS, NOW);
    expect(statuses[0].state).toBe('done');
    expect(statuses[1].state).toBe('locked');
    expect(unlockLabel(statuses[1].unlockedAt!, NOW)).toBe('unlocks in 2 days');
  });

  it('section 2 is overdue when its unlock day has passed', () => {
    const s1: WordSection = { text: 'a', completedAt: NOW - 5 * DAY_MS };
    const statuses = wordSectionStatuses(mkWord([s1, { text: '' }, { text: '' }, { text: '' }]), DEFAULT_INTERVALS, NOW);
    expect(statuses[1].state).toBe('overdue');
  });

  it('section 2 is due (yellow) on its unlock day', () => {
    const s1: WordSection = { text: 'a', completedAt: NOW - 2 * DAY_MS - 60_000 };
    const statuses = wordSectionStatuses(mkWord([s1, { text: '' }, { text: '' }, { text: '' }]), DEFAULT_INTERVALS, NOW);
    expect(statuses[1].state).toBe('due');
  });

  it('section 4 is always available once section 3 is done (optional)', () => {
    const done = (text: string, at: number): WordSection => ({ text, completedAt: at });
    const t = NOW - 10 * DAY_MS;
    const statuses = wordSectionStatuses(
      mkWord([done('d', t), done('e', t + DAY_MS), done('own', t + 3 * DAY_MS), { text: '' }]),
      DEFAULT_INTERVALS,
      NOW,
    );
    expect(statuses[3].state).toBe('due');
  });

  it('section 4 available any time even earlier (optional, never red)', () => {
    const s1: WordSection = { text: 'd', completedAt: NOW - DAY_MS };
    const statuses = wordSectionStatuses(mkWord([s1, { text: '' }, { text: '' }, { text: '' }]), DEFAULT_INTERVALS, NOW);
    expect(statuses[3].state).toBe('optional');
  });
});

describe('streaks', () => {
  it('empty activity = streak 0', () => {
    expect(computeStreak([], NOW)).toBe(0);
  });

  it('counts consecutive days ending today', () => {
    const days = [0, 1, 2].map((i) => dayKey(NOW - i * DAY_MS));
    expect(computeStreak(days, NOW)).toBe(3);
  });

  it('yesterday-only activity keeps the streak alive (grace)', () => {
    const days = [1, 2].map((i) => dayKey(NOW - i * DAY_MS));
    expect(computeStreak(days, NOW)).toBe(2);
  });

  it('a gap before yesterday breaks the run', () => {
    // active 2 and 3 days ago, nothing yesterday nor today -> streak 0
    const days = [2, 3].map((i) => dayKey(NOW - i * DAY_MS));
    expect(computeStreak(days, NOW)).toBe(0);
  });

  it('no recent activity at all means streak 0', () => {
    const days = [4, 5, 6].map((i) => dayKey(NOW - i * DAY_MS));
    expect(computeStreak(days, NOW)).toBe(0);
  });

  it('recordActivity adds today and recomputes', () => {
    const yesterday = dayKey(NOW - DAY_MS);
    const stats = recordActivity({ streakCount: 0, activityDays: [yesterday] }, NOW);
    expect(stats.streakCount).toBe(2);
    expect(stats.activityDays).toContain(dayKey(NOW));
  });
});

describe('review weighting', () => {
  it('hard cards score higher than easy cards with the same age', () => {
    const reviewed = NOW - 5 * DAY_MS;
    const hard = applyReviewRating({ weight: 1, pressure: 0 }, 'hard', reviewed);
    const easy = applyReviewRating({ weight: 1, pressure: 0 }, 'easy', reviewed);
    expect(reviewScore(hard, NOW)).toBeGreaterThan(reviewScore(easy, NOW));
  });

  it('older cards surface more', () => {
    const r = { weight: 1, pressure: 0, lastReviewedAt: NOW - 10 * DAY_MS };
    const recent = { ...r, lastReviewedAt: NOW - DAY_MS };
    expect(reviewScore(r, NOW)).toBeGreaterThan(reviewScore(recent, NOW));
  });

  it('weight is clamped', () => {
    const hard = applyReviewRating({ weight: 4, pressure: 0 }, 'hard', NOW);
    expect(hard.weight).toBe(4);
    const easy = applyReviewRating({ weight: 0.5, pressure: 0 }, 'easy', NOW);
    expect(easy.weight).toBeGreaterThanOrEqual(0.5);
  });
});

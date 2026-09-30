import { DAY_MS, dayKey, daysBetween, dayStart, dueState, type DueState } from './time';
import type { ProfileStats, ScheduleIntervals, Word } from './models';

export interface SectionLike {
  text: string;
  completedAt?: number;
  unlockedAt?: number;
}

/** The delay for entering section n lives in intervals['s' + n]. */
export function intervalFor(intervals: ScheduleIntervals, section: number): number | null {
  const keys = ['s1', 's2', 's3', 's4'] as const;
  const key = keys[section - 1] ?? 's1';
  return intervals[key];
}

/**
 * When does section `index` (1-4) of a word unlock?
 * Section 1 unlocks immediately when the word is created.
 * Section n unlocks `intervals.sn` days after section n-1 was completed.
 * Unlock times are computed at completion time and stored on the section, so
 * later edits to the settings' intervals never retroactively move old words.
 */
export function sectionUnlockAt(
  index: 1 | 2 | 3 | 4,
  prev: SectionLike | undefined,
  intervals: ScheduleIntervals,
  now: number,
): number | undefined {
  if (index === 1) return now;
  if (!prev?.completedAt) return undefined;
  const gap = intervalFor(intervals, index) ?? 0;
  return prev.completedAt + gap * DAY_MS;
}

/** Is section `index` open for editing right now? */
export function isSectionUnlocked(
  index: 1 | 2 | 3 | 4,
  word: Pick<Word, 'sections' | 'dateAdded'>,
  intervals: ScheduleIntervals,
  now: number,
): boolean {
  const s = word.sections[index - 1];
  if (s?.completedAt != null) return true;
  if (index === 4) return true; // optional section: available any time
  const unlockedAt = s?.unlockedAt ?? sectionUnlockAt(index, word.sections[index - 2], intervals, now);
  return unlockedAt != null && now >= unlockedAt;
}

/** Human label for a locked section: "unlocks tomorrow", "in 3 days", "today". */
/**
 * Human label for when a locked section unlocks. Pass the i18n `t` to get a
 * localized string; omitted, it falls back to English (tests, non-React use).
 */
export function unlockLabel(
  unlockedAt: number,
  now: number,
  t?: (key: string, vars?: Record<string, string | number>) => string,
): string {
  const d = daysBetween(now, unlockedAt);
  if (t) {
    if (d <= 0) return t('section.unlockToday');
    if (d === 1) return t('section.unlockTomorrow');
    return t('section.unlockIn', { n: d });
  }
  if (d <= 0) return 'unlocks today';
  if (d === 1) return 'unlocks tomorrow';
  return `unlocks in ${d} days`;
}

export interface SectionStatus {
  index: 1 | 2 | 3 | 4;
  state: DueState;
  /** Filled when state is 'locked' and a future unlock time is known. */
  unlockedAt?: number;
}

/**
 * Status of all four sections of one word, for card + dashboard rendering.
 * Section 4 is optional: it is always editable, never turns red. Before the
 * word's core (sections 1-3) is done it renders as a neutral 'optional';
 * afterwards it becomes a gentle yellow 'due' invite.
 */
export function wordSectionStatuses(
  word: Pick<Word, 'sections'>,
  intervals: ScheduleIntervals,
  now: number,
): SectionStatus[] {
  return [1, 2, 3, 4].map((i) => {
    const idx = i as 1 | 2 | 3 | 4;
    const s = word.sections[idx - 1];
    const unlockedAt = s?.unlockedAt ?? sectionUnlockAt(idx, word.sections[idx - 2], intervals, now);
    let state = dueState(unlockedAt, s?.completedAt, now);
    if (idx === 4 && s?.completedAt == null) {
      const coreDone = word.sections.slice(0, 3).every((x) => x?.completedAt != null);
      state = coreDone ? 'due' : 'optional';
    }
    return { index: idx, state, unlockedAt };
  });
}

/**
 * Review deck scoring. Words the student marked "hard" resurface sooner;
 * "easy" ones fade back. Deliberately light — no full SRS algorithm.
 * score = pressure + weight * ln(1 + days since last review)
 */
export function reviewScore(review: { lastReviewedAt?: number; weight: number; pressure: number }, now: number): number {
  const days = review.lastReviewedAt ? daysBetween(review.lastReviewedAt, now) : 30;
  return review.pressure + review.weight * Math.log(1 + Math.max(0, days));
}

/**
 * New review state after a card was graded.
 *
 * The scheduler is deliberately light (no full SM-2): each grade moves the
 * word's `weight` — the pressure multiplier that decides how soon the card
 * resurfaces — while the existing easy/hard behaviour is kept exactly as
 * before and the two new middle grades interpolate between them:
 *   again → weight ×2.2 (soonest return) · hard → ×1.6 (previous "Hard")
 *   good  → weight ×1.0 · easy → ×0.75 (previous "Easy", clamped ≥ 0.5)
 */
export function applyReviewRating(
  review: { lastReviewedAt?: number; weight: number; pressure: number },
  rating: 'easy' | 'hard' | 'again' | 'good',
  now: number,
): { lastReviewedAt: number; weight: number; pressure: number } {
  if (rating === 'again') {
    return {
      lastReviewedAt: now,
      weight: Math.min(4, review.weight * 2.2),
      pressure: 0,
    };
  }
  if (rating === 'good') {
    return { lastReviewedAt: now, weight: review.weight, pressure: 0 };
  }
  return {
    lastReviewedAt: now,
    weight: rating === 'hard' ? Math.min(4, review.weight * 1.6) : Math.max(0.5, review.weight * 0.75),
    pressure: 0,
  };
}

/**
 * Automatic grade for one quiz answer: correctness decides Again-vs-pass,
 * answer speed splits passes into Easy / Good / Hard.
 * Thresholds come from the profile's quiz settings (defaults 4s / 10s).
 */
export function gradeFromQuizAnswer(
  correct: boolean,
  elapsedMs: number,
  thresholds: { easyUnderMs: number; goodUnderMs: number },
): 'again' | 'hard' | 'good' | 'easy' {
  if (!correct) return 'again';
  if (elapsedMs < thresholds.easyUnderMs) return 'easy';
  if (elapsedMs < thresholds.goodUnderMs) return 'good';
  return 'hard';
}

/**
 * Streak: consecutive local days ending today (or yesterday, grace) where at
 * least one section was completed. Pure — callers persist the result.
 */
export function computeStreak(activityDays: string[], now: number): number {
  if (activityDays.length === 0) return 0;
  const set = new Set(activityDays);
  const today = dayKey(now);
  const yesterday = dayKey(now - DAY_MS);
  if (!set.has(today) && !set.has(yesterday)) return 0;
  let cursor = set.has(today) ? now : now - DAY_MS;
  let streak = 0;
  while (set.has(dayKey(cursor))) {
    streak++;
    cursor -= DAY_MS;
  }
  return streak;
}

/** Record that something was completed "today"; returns the new stats object. */
export function recordActivity(stats: ProfileStats, now: number): ProfileStats {
  const today = dayKey(now);
  const days = stats.activityDays.includes(today) ? stats.activityDays : [...stats.activityDays, today];
  return { ...stats, activityDays: days, streakCount: computeStreak(days, now), lastActiveDay: today };
}

/** Progress bar: sections completed today vs daily goal. */
export function todayProgress(
  words: { sections: { completedAt?: number }[] }[],
  goal: number,
  now: number,
): { done: number; goal: number } {
  const start = dayStart(now);
  const done = words.reduce(
    (n, w) => n + w.sections.filter((s) => s.completedAt != null && s.completedAt >= start).length,
    0,
  );
  return { done, goal };
}

export { dueState };

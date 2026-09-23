/** Local-day helpers — all streak/day logic uses the student's own timezone. */

export const DAY_MS = 24 * 60 * 60 * 1000;

/** 'YYYY-MM-DD' for a timestamp in local time. */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Start of local day (00:00) for a timestamp. */
export function dayStart(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Whole days between two timestamps, measured from local-day starts. */
export function daysBetween(fromTs: number, toTs: number): number {
  return Math.round((dayStart(toTs) - dayStart(fromTs)) / DAY_MS);
}

export type DueState = 'overdue' | 'due' | 'done' | 'locked' | 'optional';

/**
 * Classify a section for the dashboard.
 * - 'overdue': unlocked but not done, and the unlock day has fully passed.
 * - 'due':     unlocked, not done, unlock day is today.
 * - 'done':    completed (green when completed on/before its unlock day).
 * - 'locked':  not yet unlocked.
 * - 'optional' (section 4 only, set in wordSectionStatuses): never nags red.
 */
export function dueState(
  unlockedAt: number | undefined,
  completedAt: number | undefined,
  now: number,
): DueState {
  if (completedAt != null) return 'done';
  if (unlockedAt == null) return 'locked';
  if (now < unlockedAt) return 'locked';
  return daysBetween(unlockedAt, now) > 0 ? 'overdue' : 'due';
}

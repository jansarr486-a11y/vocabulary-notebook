/**
 * One-shot handoff: the Progress tab queues word ids for a focused practice
 * session; Review/Spelling consume them once at session start. Stored in
 * sessionStorage so a refresh simply drops the focus (no stale filters).
 */
const KEY = 'practiceFocusWordIds';

export function setPracticeFocus(wordIds: number[]): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(wordIds));
  } catch {
    /* private mode etc. — focus practice silently unavailable */
  }
}

/** Read the queued focus WITHOUT consuming it (null when absent). */
export function peekPracticeFocus(): number[] | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const ids = JSON.parse(raw) as number[];
    return Array.isArray(ids) && ids.length > 0 ? ids : null;
  } catch {
    return null;
  }
}

/** Consume the queued focus (returns null when absent). */
export function takePracticeFocus(): number[] | null {
  const ids = peekPracticeFocus();
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  return ids;
}

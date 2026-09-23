import type { Word, WordSpelling } from './models';

/**
 * Pure engine for the Spelling Puzzle game. No I/O — repo.ts owns persistence.
 * All per-session state lives in one SpellingSession value the UI owns.
 */

// ---------- eligibility & pool ----------

/** A word is playable once its definition (section 1) is completed. */
export function isSpellingEligible(word: Word): boolean {
  return word.sections[0]?.completedAt != null;
}

// ---------- difficulty score (persisted per word) ----------

/** Cap so one bad night can't make a word feel hopeless. */
export const SPELLING_DIFFICULTY_MAX = 10;

export function spellingDifficulty(word: Pick<Word, 'spelling'>): number {
  return word.spelling?.difficulty ?? 0;
}

/** +1 per mistake, clamped at the cap. Pure — caller persists. */
export function bumpDifficulty(spelling: WordSpelling, now: number): WordSpelling {
  const current = spelling?.difficulty ?? 0;
  return {
    ...spelling,
    difficulty: Math.min(SPELLING_DIFFICULTY_MAX, current + 1),
    lastAttemptAt: now,
  };
}

/**
 * Slow decay for words the student has under control: a word that was spelled
 * cleanly gets a small difficulty reduction per passing day.
 */
export function decayDifficulty(spelling: WordSpelling | undefined, today: string): WordSpelling {
  if (!spelling || spelling.difficulty <= 0) return spelling ?? { difficulty: 0 };
  const last = spelling.lastSessionDay;
  if (last === today) return spelling; // practiced today — no decay yet
  return {
    ...spelling,
    difficulty: Math.max(0, spelling.difficulty - 0.25),
  };
}

// ---------- session scheduling ----------

/** Session-local tally for one word (drives the summary + persistence). */
export interface WordTally {
  attempts: number;
  mistakes: number;
}

/** How far back a misspelled word is pushed in the same-session queue. */
const RETRY_OFFSETS = [3, 4, 5];

/**
 * Push a failed word back into the queue, 3-5 positions behind the cursor
 * (past the next couple of words, so the return feels like real recall).
 */
export function requeueWord<T>(
  queue: T[],
  entry: T,
  cursor: number,
  rng: () => number = Math.random,
): T[] {
  const next = [...queue];
  const offset = RETRY_OFFSETS[Math.floor(rng() * RETRY_OFFSETS.length)];
  const insertAt = Math.min(next.length, cursor + 1 + offset);
  next.splice(insertAt, 0, entry);
  return next;
}

// ---------- scramble ----------

/** Fisher-Yates with an injectable RNG (tests stay deterministic). */
export function scrambledLetters(word: string, rng: () => number = Math.random): string[] {
  const letters = word.split('');
  if (letters.length <= 1) return letters;
  // Guarantee the scramble differs from the correct spelling when possible.
  for (let attempt = 0; attempt < 8; attempt++) {
    const pool = [...letters];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    if (pool.some((ch, i) => ch !== letters[i]) || new Set(letters).size === 1) return pool;
  }
  return [...letters].reverse();
}

// ---------- checking ----------

export interface LetterFeedback {
  ch: string;
  /** correct position, wrong letter, or right letter in the wrong slot. */
  state: 'correct' | 'wrong' | 'misplaced';
}

/**
 * Position-by-position comparison. Doubled letters are handled by accounting:
 * 'correct' wins first, remaining occurrences are 'misplaced' if the target
 * still has an unmatched copy of that letter, otherwise 'wrong'.
 */
export function checkArrangement(guess: string[], target: string): LetterFeedback[] {
  const remaining: Record<string, number> = {};
  for (let i = 0; i < target.length; i++) {
    if (guess[i] !== target[i]) remaining[target[i]] = (remaining[target[i]] ?? 0) + 1;
  }
  const seenWrong: Record<string, number> = {};
  return guess.map((ch, i) => {
    if (ch === target[i]) return { ch, state: 'correct' as const };
    const available = remaining[ch] ?? 0;
    const used = seenWrong[ch] ?? 0;
    seenWrong[ch] = used + 1;
    return { ch, state: available > used ? ('misplaced' as const) : ('wrong' as const) };
  });
}

export function isFullyCorrect(guess: string[], target: string): boolean {
  return guess.length === target.length && guess.every((ch, i) => ch === target[i]);
}

// ---------- pool ordering ----------

/**
 * Practice order for a filtered pool: hardest words first (difficulty
 * descending, stable by id), then everything else shuffled. Fresh sessions
 * shuffle via the passed rng so two sessions rarely look identical.
 */
export function orderPool(words: Word[], rng: () => number = Math.random): Word[] {
  const hard = words
    .filter((w) => spellingDifficulty(w) > 0)
    .sort((a, b) => spellingDifficulty(b) - spellingDifficulty(a) || (a.id ?? 0) - (b.id ?? 0));
  const rest = words.filter((w) => spellingDifficulty(w) <= 0);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return [...hard, ...rest];
}

// ---------- eligibility helpers ----------

/** Filter a notebook down to playable words, honouring the level/course filters. */
export function filterPlayable(
  words: Word[],
  filter: { levelTags: string[]; courseQuery: string },
): Word[] {
  const q = filter.courseQuery.trim().toLowerCase();
  return words.filter((w) => {
    if (!isSpellingEligible(w)) return false;
    if (filter.levelTags.length > 0 && !w.levelTags.some((t) => filter.levelTags.includes(t))) return false;
    if (q && !(w.courseTag ?? '').toLowerCase().includes(q)) return false;
    return true;
  });
}

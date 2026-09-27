/**
 * Auto-graded recognition quiz — pure logic.
 *
 * Everything here is deterministic given its inputs (randomness is isolated
 * behind an injectable `rng` so tests are reproducible) and touches no
 * storage: the Review screen hands it the student's words and gets back
 * ready-to-render option lists and grades. No network, no AI.
 */

import type { QuizAnswerMode, ReviewGrade, Word } from '../../db/models';
import { gradeFromQuizAnswer } from '../../db/schedule';

export type { ReviewGrade };

/** A single tappable answer option. */
export interface QuizOption {
  /** Stable key for React and for grading. */
  key: string;
  /** Text shown on the chip. */
  label: string;
  /** True for the option matching the target word. */
  isCorrect: boolean;
}

/** Deterministic PRNG (mulberry32) so shuffles are reproducible in tests. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates using the injected rng. Returns a new array. */
export function shuffled<T>(items: readonly T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * A word is eligible as a distractor source once its meaning is known —
 * i.e. the definition section (1) has been completed in the learning cycle.
 */
export function isDistractorEligible(w: Word): boolean {
  return w.sections[0]?.completedAt != null && (w.sections[0]?.text ?? '').trim().length > 0;
}

/** The text shown on an option chip for a given answer mode. */
function answerText(w: Word, mode: QuizAnswerMode): string {
  if (mode === 'persian') return (w.persianMeaning ?? '').trim();
  return (w.sections[0]?.text ?? '').trim();
}

/**
 * Pick distractor words for one quiz card.
 *
 * Rules, in order:
 *  1. Only words with a completed definition are eligible (the student has
 *     actually learned them), and never the target word itself.
 *  2. Prefer same-part-of-speech words when enough exist.
 *  3. Lightly randomize so the same word doesn't always get the same
 *     distractor set across consecutive sessions.
 */
export function pickDistractorWords(
  target: Word,
  allWords: Word[],
  mode: QuizAnswerMode,
  rng: () => number,
): Word[] {
  const answerOf = (w: Word) => answerText(w, mode);
  const eligible = allWords.filter(
    (w) => w.id !== target.id && isDistractorEligible(w) && answerOf(w).length > 0 && answerOf(w) !== answerOf(target),
  );
  const samePos = target.partOfSpeech
    ? eligible.filter((w) => w.partOfSpeech === target.partOfSpeech)
    : [];
  const pool = samePos.length >= 3 ? shuffled(samePos, rng) : shuffled(eligible, rng);
  return pool.slice(0, 3);
}

export interface BuiltQuiz {
  options: QuizOption[];
  /** How many options were actually built (4 when possible, down to 2). */
  count: number;
  /** True when the notebook is too small for a full 4-option quiz. */
  smallNotebook: boolean;
}

/**
 * Build one quiz card: the correct answer plus distractors, shuffled into
 * random order. Falls back to 3 or 2 options for tiny notebooks rather than
 * blocking the quiz. Returns null when not even 2 options are possible
 * (e.g. the word has no definition/meaning to show).
 */
export function buildQuizOptions(
  target: Word,
  allWords: Word[],
  mode: QuizAnswerMode,
  rng: () => number,
): BuiltQuiz | null {
  const correct = answerText(target, mode);
  if (!correct) return null;

  const distractors = pickDistractorWords(target, allWords, mode, rng);
  const distractorTexts = distractors
    .map((w) => answerText(w, mode))
    .filter((t) => t && t !== correct);

  const optionCount = Math.min(4, 1 + distractorTexts.length);
  if (optionCount < 2) return null;

  const options: QuizOption[] = [
    { key: 'correct', label: correct, isCorrect: true },
    ...distractorTexts.slice(0, optionCount - 1).map((label, i) => ({
      key: `d${i}`,
      label,
      isCorrect: false,
    })),
  ];

  return {
    options: shuffled(options, rng),
    count: optionCount,
    smallNotebook: optionCount < 4,
  };
}

/**
 * Map a quiz outcome to an SM-2-style grade.
 * Wrong → again (regardless of time); correct → easy/good/hard by speed.
 */
export function gradeQuizAnswer(
  pickedCorrect: boolean,
  elapsedMs: number,
  thresholds: { easyUnderMs: number; goodUnderMs: number },
): ReviewGrade {
  return gradeFromQuizAnswer(pickedCorrect, elapsedMs, thresholds);
}

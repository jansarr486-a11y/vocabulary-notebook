import { describe, expect, it } from 'vitest';
import {
  buildQuizOptions,
  gradeQuizAnswer,
  isDistractorEligible,
  makeRng,
  pickDistractorWords,
  shuffled,
} from './quiz';
import { gradeFromQuizAnswer } from '../../db/schedule';
import { createReview, emptySections, type Word } from '../../db/models';

const rng = makeRng(42);

function mkWord(
  id: number,
  word: string,
  opts: {
    pos?: string;
    def?: string;
    defDone?: boolean;
    persian?: string;
  } = {},
): Word {
  const sections = emptySections();
  sections[0] = { text: opts.def ?? `${word} meaning`, completedAt: opts.defDone === false ? undefined : 1000 };
  return {
    id,
    profileId: 1,
    word,
    wordLower: word.toLowerCase(),
    partOfSpeech: opts.pos,
    persianMeaning: opts.persian,
    levelTags: [],
    dateAdded: 0,
    sections,
    review: createReview(),
    schemaVersion: 1,
  };
}

const TARGET = mkWord(1, 'abundant', { pos: 'adjective', def: 'existing in large quantities.', persian: 'فراوان' });

const NOTEBOOK = [
  TARGET,
  mkWord(2, 'ample', { pos: 'adjective', def: 'enough or more than enough.' }),
  mkWord(3, 'plentiful', { pos: 'adjective', def: 'existing in large amounts.' }),
  mkWord(4, 'scarce', { pos: 'adjective', def: 'not enough for what is needed.' }),
  mkWord(5, 'abundantly', { pos: 'adverb', def: 'in a plentiful way.' }),
  mkWord(6, 'void', { pos: 'noun', def: 'a completely empty space.' }),
];

describe('isDistractorEligible', () => {
  it('requires a completed definition section', () => {
    expect(isDistractorEligible(mkWord(9, 'done', { def: 'x' }))).toBe(true);
    expect(isDistractorEligible(mkWord(10, 'undone', { def: 'x', defDone: false }))).toBe(false);
  });

  it('requires non-empty definition text', () => {
    expect(isDistractorEligible(mkWord(11, 'blank', { def: '' }))).toBe(false);
  });
});

describe('pickDistractorWords', () => {
  it('prefers same part-of-speech words when 3+ exist', () => {
    const picked = pickDistractorWords(TARGET, NOTEBOOK, 'definition', rng);
    expect(picked).toHaveLength(3);
    expect(picked.every((w) => w.partOfSpeech === 'adjective')).toBe(true);
  });

  it('never includes the target word itself', () => {
    for (let seed = 0; seed < 30; seed++) {
      const picked = pickDistractorWords(TARGET, NOTEBOOK, 'definition', makeRng(seed));
      expect(picked.every((w) => w.id !== TARGET.id)).toBe(true);
    }
  });

  it('falls back to any eligible word when same-POS is scarce', () => {
    const scarce = [TARGET, mkWord(2, 'ample', { pos: 'adjective', def: 'enough.' }), mkWord(6, 'void', { pos: 'noun', def: 'empty space.' })];
    const picked = pickDistractorWords(TARGET, scarce, 'definition', rng);
    expect(picked).toHaveLength(2); // target excluded, so only 2 remain
  });

  it('excludes words without a completed definition (initial cycle unfinished)', () => {
    const pool = [TARGET, mkWord(2, 'ample', { pos: 'adjective', def: 'enough.' }), mkWord(3, 'ghost', { pos: 'noun', def: 'x', defDone: false })];
    for (let seed = 0; seed < 30; seed++) {
      const picked = pickDistractorWords(TARGET, pool, 'definition', makeRng(seed));
      expect(picked.every((w) => w.word !== 'ghost')).toBe(true);
    }
  });

  it('skips distractors whose answer text equals the target answer (mode-aware)', () => {
    const twin = mkWord(7, 'twin', { pos: 'adjective', def: 'existing in large quantities.' });
    const pool = [TARGET, twin, mkWord(2, 'ample', { pos: 'adjective', def: 'enough.' }), mkWord(3, 'scarce', { pos: 'adjective', def: 'not enough.' })];
    for (let seed = 0; seed < 30; seed++) {
      const picked = pickDistractorWords(TARGET, pool, 'definition', makeRng(seed));
      expect(picked.every((w) => w.id !== twin.id)).toBe(true);
    }
  });
});

describe('buildQuizOptions', () => {
  it('builds 4 shuffled options: 1 correct + 3 distractors', () => {
    const q = buildQuizOptions(TARGET, NOTEBOOK, 'definition', rng)!;
    expect(q.count).toBe(4);
    expect(q.smallNotebook).toBe(false);
    expect(q.options.filter((o) => o.isCorrect)).toHaveLength(1);
    expect(q.options).toHaveLength(4);
    expect(q.options.find((o) => o.isCorrect)!.label).toBe('existing in large quantities.');
  });

  it('randomizes option order across appearances (relearning sees fresh layout)', () => {
    const orders = new Set<string>();
    for (let seed = 0; seed < 40; seed++) {
      const q = buildQuizOptions(TARGET, NOTEBOOK, 'definition', makeRng(seed))!;
      orders.add(q.options.map((o) => o.key).join(','));
    }
    expect(orders.size).toBeGreaterThan(1);
  });

  it('persian mode shows persian meanings for all options', () => {
    const faNotebook = [
      TARGET,
      mkWord(2, 'ample', { pos: 'adjective', def: 'enough.', persian: 'کافی' }),
      mkWord(3, 'scarce', { pos: 'adjective', def: 'not enough.', persian: ' کمیاب' }),
      mkWord(4, 'void', { pos: 'noun', def: 'empty space.', persian: 'خلأ' }),
    ];
    const q = buildQuizOptions(TARGET, faNotebook, 'persian', rng)!;
    expect(q.options.find((o) => o.isCorrect)!.label).toBe('فراوان');
    expect(q.options.filter((o) => !o.isCorrect)).toHaveLength(3);
  });

  it('persian mode excludes words lacking a persian meaning from the option pool', () => {
    const q = buildQuizOptions(TARGET, NOTEBOOK, 'persian', rng)!;
    // NOTEBOOK has only TARGET with a persian meaning -> only 1 option possible
    expect(q).toBeNull();
  });

  it('falls back to fewer options (3 or 2) in small notebooks and flags it', () => {
    const small = [TARGET, mkWord(2, 'ample', { pos: 'adjective', def: 'enough.' })];
    const q = buildQuizOptions(TARGET, small, 'definition', rng)!;
    expect(q.count).toBe(2);
    expect(q.smallNotebook).toBe(true);
  });

  it('returns null when the target has no answer text at all', () => {
    const blank = mkWord(1, 'blank', { def: '', persian: undefined });
    expect(buildQuizOptions(blank, NOTEBOOK, 'definition', rng)).toBeNull();
    expect(buildQuizOptions(blank, NOTEBOOK, 'persian', rng)).toBeNull();
  });
});

describe('quiz grading', () => {
  const T = { easyUnderMs: 4000, goodUnderMs: 10000 };

  it('wrong answer is always Again regardless of speed', () => {
    expect(gradeQuizAnswer(false, 100, T)).toBe('again');
    expect(gradeQuizAnswer(false, 60_000, T)).toBe('again');
  });

  it('correct fast → Easy, normal → Good, slow → Hard', () => {
    expect(gradeQuizAnswer(true, 3999, T)).toBe('easy');
    expect(gradeQuizAnswer(true, 4000, T)).toBe('good');
    expect(gradeQuizAnswer(true, 9999, T)).toBe('good');
    expect(gradeQuizAnswer(true, 10_000, T)).toBe('hard');
    expect(gradeQuizAnswer(true, 60_000, T)).toBe('hard');
  });

  it('honours custom thresholds', () => {
    // thresholds: easy < 1000, good < 2000, else hard
    expect(gradeQuizAnswer(true, 500, { easyUnderMs: 1000, goodUnderMs: 2000 })).toBe('easy');
    expect(gradeQuizAnswer(true, 1500, { easyUnderMs: 1000, goodUnderMs: 2000 })).toBe('good');
    expect(gradeQuizAnswer(true, 2500, { easyUnderMs: 1000, goodUnderMs: 2000 })).toBe('hard');
  });

  it('delegates to gradeFromQuizAnswer with identical behaviour', () => {
    const cases: [boolean, number, typeof T][] = [
      [false, 100, T],
      [true, 3999, T],
      [true, 4000, T],
      [true, 10000, T],
    ];
    for (const [c, ms, t] of cases) {
      expect(gradeQuizAnswer(c, ms, t)).toBe(gradeFromQuizAnswer(c, ms, t));
    }
  });
});

describe('shuffled', () => {
  it('keeps all elements (pure permutation)', () => {
    const src = [1, 2, 3, 4, 5];
    expect(shuffled(src, rng).sort()).toEqual(src);
    expect(src).toEqual([1, 2, 3, 4, 5]); // input untouched
  });
});

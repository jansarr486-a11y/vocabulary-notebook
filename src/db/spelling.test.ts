import { describe, expect, it } from 'vitest';
import {
  SPELLING_DIFFICULTY_MAX,
  bumpDifficulty,
  checkArrangement,
  decayDifficulty,
  filterPlayable,
  isFullyCorrect,
  isSpellingEligible,
  orderPool,
  requeueWord,
  scrambledLetters,
  spellingDifficulty,
} from './spelling';
import { createSpelling, emptySections, type Word, type WordSection } from './models';

function mkWord(partial: Partial<Word> & { word: string }): Word {
  return {
    id: undefined,
    profileId: 1,
    wordLower: partial.word.toLowerCase(),
    dateAdded: 0,
    levelTags: [],
    sections: emptySections(),
    review: { weight: 1, pressure: 0 },
    schemaVersion: 1,
    ...partial,
  } as Word;
}

function withSections(sections: WordSection[]): Pick<Word, 'sections'> {
  return { sections };
}

describe('eligibility', () => {
  it('requires a completed definition section', () => {
    expect(isSpellingEligible(mkWord({ word: 'cat' }))).toBe(false);
    const w = mkWord({ word: 'cat' });
    w.sections = withSections([{ text: 'a feline', completedAt: 1 }, { text: '' }, { text: '' }, { text: '' }]).sections;
    expect(isSpellingEligible(w)).toBe(true);
  });
});

describe('filterPlayable', () => {
  const done = (text: string): WordSection => ({ text, completedAt: 1 });
  const words = [
    mkWord({ word: 'habit', levelTags: ['A1'], courseTag: 'Term 1', sections: [done('d'), { text: '' }, { text: '' }, { text: '' }] }),
    mkWord({ word: 'achieve', levelTags: ['B2', 'IELTS'], courseTag: 'Exam prep', sections: [done('d'), { text: '' }, { text: '' }, { text: '' }] }),
    mkWord({ word: 'curious', levelTags: ['A2'], sections: [{ text: '' }, { text: '' }, { text: '' }, { text: '' }] }), // no definition
  ];

  it('excludes words without a completed section 1', () => {
    expect(filterPlayable(words, { levelTags: [], courseQuery: '' }).map((w) => w.word)).toEqual(['habit', 'achieve']);
  });

  it('filters by level tags (any-of)', () => {
    expect(filterPlayable(words, { levelTags: ['IELTS'], courseQuery: '' }).map((w) => w.word)).toEqual(['achieve']);
  });

  it('filters by course tag substring', () => {
    expect(filterPlayable(words, { levelTags: [], courseQuery: 'term' }).map((w) => w.word)).toEqual(['habit']);
  });
});

describe('scrambledLetters', () => {
  it('keeps the same multiset of letters', () => {
    const out = scrambledLetters('friend');
    expect([...out].sort().join('')).toBe('friend'.split('').sort().join(''));
  });

  it('differs from the original spelling (with a fair rng)', () => {
    // Deterministic rng that still shuffles: ((i*7+3) % n)
    const rng = (n: number) => (n * 7 + 3) % n / n;
    const out = scrambledLetters('friend', () => rng(Math.random() > -1 ? 6 : 6));
    expect(out.join('')).not.toBe('friend');
  });

  it('handles single-letter words', () => {
    expect(scrambledLetters('a')).toEqual(['a']);
  });

  it('handles a word of one repeated letter', () => {
    expect(scrambledLetters('bbb').join('')).toBe('bbb');
  });
});

describe('checkArrangement', () => {
  it('marks every position correct on a perfect match', () => {
    expect(checkArrangement(['c', 'a', 't'], 'cat').map((f) => f.state)).toEqual(['correct', 'correct', 'correct']);
  });

  it('marks swapped letters as misplaced (they exist elsewhere)', () => {
    // target 'cat', guess 'cta' → t and a swapped
    const res = checkArrangement(['c', 't', 'a'], 'cat');
    expect(res.map((f) => f.state)).toEqual(['correct', 'misplaced', 'misplaced']);
  });

  it('marks letters that appear too many times as wrong', () => {
    // target 'cat', guess 'cct': second c has no home anywhere → wrong
    const res = checkArrangement(['c', 'c', 't'], 'cat');
    expect(res.map((f) => f.state)).toEqual(['correct', 'wrong', 'correct']);
  });

  it('handles doubled letters without false misplaced hints', () => {
    // target 'ball', guess 'blal': final l matches position, extra a misplaced
    const res = checkArrangement(['b', 'l', 'a', 'l'], 'ball');
    expect(res.map((f) => f.state)).toEqual(['correct', 'misplaced', 'misplaced', 'correct']);
  });
});

describe('isFullyCorrect', () => {
  it('requires exact length and order', () => {
    expect(isFullyCorrect(['c', 'a', 't'], 'cat')).toBe(true);
    expect(isFullyCorrect(['c', 'a'], 'cat')).toBe(false);
    expect(isFullyCorrect(['c', 'a', 'r'], 'cat')).toBe(false);
  });
});

describe('requeueWord', () => {
  const base: number[] = [1, 2, 3, 4, 5, 6];
  const entry = 99;

  it('pushes the word 3-5 positions behind the cursor', () => {
    for (const [rng, expectedIdx] of [
      [() => 0, 4],
      [() => 0.4, 5],
      [() => 0.99, 6],
    ] as const) {
      const q = requeueWord(base, entry, 0, rng);
      const idx = q.indexOf(99);
      expect(idx).toBe(expectedIdx);
      expect(q.filter((e) => e === 99)).toHaveLength(1);
    }
  });

  it('clamps the insert position to the end of the queue', () => {
    const q = requeueWord([99], 99, 50, () => 0.99);
    expect(q).toHaveLength(2);
    expect(q[1]).toBe(99);
  });
});

describe('difficulty score', () => {
  it('starts at 0 for legacy rows without the field', () => {
    expect(spellingDifficulty(mkWord({ word: 'cat' }))).toBe(0);
  });

  it('increments on mistakes and clamps at the cap', () => {
    let s = createSpelling();
    for (let i = 0; i < SPELLING_DIFFICULTY_MAX + 5; i++) s = bumpDifficulty(s, 100);
    expect(s.difficulty).toBe(SPELLING_DIFFICULTY_MAX);
  });

  it('decays slowly on a later clean day, not the same day', () => {
    const s = { ...createSpelling(), difficulty: 4, lastSessionDay: '2026-09-20' };
    expect(decayDifficulty(s, '2026-09-20').difficulty).toBe(4); // same day
    expect(decayDifficulty(s, '2026-09-22')?.difficulty).toBeCloseTo(3.75);
  });

  it('never goes below 0', () => {
    const s = { ...createSpelling(), difficulty: 0.1, lastSessionDay: '2026-09-01' };
    expect(decayDifficulty(s, '2026-10-01')?.difficulty).toBe(0);
  });
});

describe('orderPool', () => {
  it('puts difficult words first, hardest first', () => {
    const easy1 = mkWord({ word: 'cat', id: 1 });
    const easy2 = mkWord({ word: 'dog', id: 2 });
    const mid = mkWord({ word: 'habit', id: 3, spelling: { difficulty: 2 } });
    const hard = mkWord({ word: 'perseverance', id: 4, spelling: { difficulty: 7 } });
    const out = orderPool([easy1, hard, easy2, mid], () => 0.5);
    expect(out.map((w) => w.word)).toEqual(['perseverance', 'habit', 'cat', 'dog']);
  });
});

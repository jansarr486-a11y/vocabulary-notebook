import { describe, expect, it } from 'vitest';
import type { ProgressEvent, Word } from './models';
import {
  isSrsStable,
  hasProductionProof,
  isWordMastered,
  isWordRecognized,
  safeRate,
  MIN_SAMPLE,
  computeSkills,
  collectSkillSamples,
  computeWeekProgress,
  weekStart,
  evaluateBadges,
  computeStruggling,
  LEECH_THRESHOLD,
  gardenSeries,
  buildClassOverview,
  classStruggleWords,
  currentWeekCircles,
} from './progress';
import type { DailySnapshot } from './models';

const DAY = 86_400_000;

function mkWord(over: Partial<Word> = {}): Word {
  return {
    id: 1,
    profileId: 1,
    word: 'test',
    wordLower: 'test',
    levelTags: [],
    dateAdded: Date.now() - 40 * DAY,
    sections: [{ text: '', completedAt: Date.now() - 40 * DAY }, { text: '', completedAt: Date.now() - 30 * DAY }, { text: '', completedAt: undefined }, { text: '' }],
    review: { weight: 0.75, pressure: 0 },
    spelling: { difficulty: 0, lastAttemptAt: Date.now() - 10 * DAY },
    schemaVersion: 1,
    ...over,
  };
}

function ev(type: ProgressEvent['type'], over: Partial<ProgressEvent> = {}): ProgressEvent {
  return { profileId: 1, timestamp: Date.now(), type, schemaVersion: 1, ...over };
}

describe('honest mastered rule', () => {
  it('SRS-stable = low weight, not recently struggled', () => {
    expect(isSrsStable(mkWord())).toBe(true); // weight 0.75, last review 10 days old but below 0.75? no—equal
    expect(isSrsStable(mkWord({ review: { weight: 1, pressure: 0 } }))).toBe(false);
    expect(isSrsStable(mkWord({ review: { weight: 1.6, pressure: 0, lastReviewedAt: Date.now() - 2 * DAY } }))).toBe(false);
    expect(isSrsStable(mkWord({ review: { weight: 0.5, pressure: 0, lastReviewedAt: Date.now() - 40 * DAY } }))).toBe(true);
  });

  it('production proof = first-try spelling or own sentence', () => {
    expect(hasProductionProof(mkWord())).toBe(true); // spelled, difficulty decayed to 0
    expect(hasProductionProof(mkWord({ spelling: { difficulty: 3, lastAttemptAt: Date.now() } }))).toBe(false);
    expect(hasProductionProof(mkWord({ spelling: { difficulty: 0 } }))).toBe(false); // never attempted
    expect(
      hasProductionProof(mkWord({ sections: [{ text: 'a', completedAt: 1 }, { text: 'b', completedAt: 2 }, { text: 'mine', completedAt: 3 }, { text: '' }] })),
    ).toBe(true);
  });

  it('mastered needs BOTH; recognized = stable without proof', () => {
    const stable = mkWord({ spelling: { difficulty: 0 } }); // no proof
    expect(isWordMastered(stable)).toBe(false);
    expect(isWordRecognized(stable)).toBe(true);
    expect(isWordMastered(mkWord())).toBe(true);
    const struggling = mkWord({ review: { weight: 2.2, pressure: 0, lastReviewedAt: Date.now() } });
    expect(isWordRecognized(struggling)).toBe(false);
  });
});

describe('minimum-sample rule', () => {
  it('hides percentages below 20 samples', () => {
    expect(safeRate(19, 19)).toBeUndefined();
    expect(safeRate(20, 20)).toBe(1);
    expect(safeRate(10, 25)).toBe(0.4);
    expect(MIN_SAMPLE).toBe(20);
  });

  it('skills report undefined until each skill has enough data', () => {
    const events: ProgressEvent[] = Array.from({ length: 15 }, (_, i) =>
      ev('review_answered', { wordId: 1, meta: { correct: i % 2 === 0, grade: 'good', responseTimeMs: 100 } }),
    );
    const skills = computeSkills(collectSkillSamples(events, [mkWord()]));
    expect(skills.find((s) => s.id === 'recognition')?.value).toBeUndefined();
    expect(skills.find((s) => s.id === 'retention')?.value).toBeUndefined();
  });

  it('computes percentages at 20+ samples and writing per-10', () => {
    const events: ProgressEvent[] = [
      ...Array.from({ length: 20 }, () => ev('review_answered', { wordId: 1, meta: { correct: true, grade: 'good', responseTimeMs: 100 } })),
      ...Array.from({ length: 5 }, () => ev('own_sentence_written', { wordId: 1 })),
    ];
    const skills = computeSkills(collectSkillSamples(events, Array.from({ length: 25 }, (_, i) => mkWord({ id: i }))));
    expect(skills.find((s) => s.id === 'recognition')?.display).toBe(100);
    expect(skills.find((s) => s.id === 'writing')?.display).toBe(2); // 5 sentences / 25 words * 10
  });
});

describe('weekly goal', () => {
  it('weekStart is Monday 00:00 local', () => {
    const wednesday = new Date(2026, 8, 30, 15, 30).getTime(); // Wed Sep 30 2026
    const start = new Date(weekStart(wednesday));
    expect(start.getDay()).toBe(1);
    expect(start.getHours()).toBe(0);
  });

  it('counts this week’s masterings, sentences and active days', () => {
    const now = Date.now();
    const events: ProgressEvent[] = [
      ev('word_mastered', { wordId: 1, timestamp: now - 1000 }),
      ev('word_mastered', { wordId: 2, timestamp: now - 2000 }),
      ev('own_sentence_written', { wordId: 3, timestamp: now - 3000 }),
      ev('review_answered', { wordId: 1, meta: { correct: true, grade: 'good', responseTimeMs: 100 }, timestamp: now - 4000 }),
    ];
    const words = [mkWord({ id: 1, dateAdded: now - 1000 }), mkWord({ id: 2 })];
    const week = computeWeekProgress(events, words, now);
    expect(week.masteredDone).toBeGreaterThanOrEqual(2);
    expect(week.sentencesDone).toBe(1);
    expect(week.reviewsDone).toBe(1);
    expect(week.reviewAccuracy).toBeUndefined(); // 1 review < 20 samples
    expect(week.activeDays).toBe(1);
  });
});

describe('badges', () => {
  it('unlock on mastered words and sentences, not additions', () => {
    const words = Array.from({ length: 12 }, (_, i) => mkWord({ id: i })); // all mastered
    const badges = evaluateBadges(words, [], [], Date.now());
    expect(badges.find((b) => b.badgeId === 'm10')?.earned).toBe(true);
    expect(badges.find((b) => b.badgeId === 'm50')?.earned).toBe(false);
    expect(badges.find((b) => b.badgeId === 's10')?.earned).toBe(false);
    const withSentences = evaluateBadges(words, Array.from({ length: 10 }, () => ev('own_sentence_written')), [], Date.now());
    expect(withSentences.find((b) => b.badgeId === 's10')?.earned).toBe(true);
  });
});

describe('struggling words & leeches', () => {
  it('ranks by trouble and flags leeches at 8+', () => {
    const ok = mkWord({ id: 1, review: { weight: 0.75, pressure: 0 } });
    const meh = mkWord({ id: 2, review: { weight: 1.6, pressure: 0, lastReviewedAt: Date.now() }, spelling: { difficulty: 2 } });
    const leech = mkWord({ id: 3, review: { weight: 1, pressure: 0 }, spelling: { difficulty: LEECH_THRESHOLD } });
    const out = computeStruggling([ok, meh, leech]);
    expect(out.find((s) => s.word.id === 1)).toBeUndefined(); // no trouble
    expect(out[0].word.id).toBe(3);
    expect(out.find((s) => s.word.id === 3)?.isLeech).toBe(true);
    expect(out.find((s) => s.word.id === 2)?.isLeech).toBe(false);
  });
});

describe('garden series', () => {
  it('carries the last known counts across gap days without inventing new ones', () => {
    const now = Date.now();
    const dayStr = (offset: number) => {
      const d = new Date(now - offset * DAY);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const snaps: DailySnapshot[] = [
      { profileId: 1, date: dayStr(3), counts: { new: 2, learning: 1, review: 0, mastered: 0, recognized: 0 }, totalWords: 3, reviewsDone: 0, sentencesWritten: 0, activeToday: true },
      { profileId: 1, date: dayStr(1), counts: { new: 0, learning: 1, review: 1, mastered: 1, recognized: 0 }, totalWords: 3, reviewsDone: 5, sentencesWritten: 0, activeToday: true },
    ];
    const series = gardenSeries(snaps, 90, now);
    // gaps carry the last known counts forward; today is the last point
    expect(series.length).toBeGreaterThanOrEqual(4);
    const todayPoint = series[series.length - 1];
    expect(todayPoint.counts.mastered).toBe(1);
    expect(todayPoint.date).toBe(dayStr(0));
    expect(series[0].date).toBe(dayStr(3)); // series starts at first snapshot
  });
});

describe('tutor aggregation', () => {
  const base = {
    app: 'vocabulary-notebook-progress' as const,
    version: 1 as const,
    generatedAt: Date.now(),
    range: { from: '2026-09-21', to: '2026-09-28' },
    totals: { words: 50, mastered: 10, recognized: 4 },
    activeDaysThisWeek: 5,
    streakDays: 3,
    weeklyGoal: { masteredGoal: 5, sentencesGoal: 3, masteredDone: 5, sentencesDone: 3, completed: true },
    skills: { samples: { retention: 0, recognition: 0, spelling: 0, words: 0 } },
    daily: [],
    strugglingWords: [],
    bookCoverage: [],
  };

  it('sorts by need for attention and tracks trend from previous reports', () => {
    const rows = buildClassOverview([
      { ...base, studentName: 'Amy', skills: { recognition: 0.5, samples: { retention: 0, recognition: 30, spelling: 0, words: 0 } } },
      { ...base, studentName: 'Ben', skills: { recognition: 0.9, samples: { retention: 0, recognition: 30, spelling: 0, words: 0 } } },
      { ...base, studentName: 'Amy', generatedAt: Date.now() - DAY, skills: { recognition: 0.8, samples: { retention: 0, recognition: 30, spelling: 0, words: 0 } } },
    ]);
    expect(rows[0].name).toBe('Amy'); // dropped 0.8 → 0.5
    expect(rows[0].trend).toBe('down');
    expect(rows.find((r) => r.name === 'Ben')?.trend).toBe('flat');
  });

  it('flags words struggled by 3+ students', () => {
    const rows = buildClassOverview([
      { ...base, studentName: 'A', strugglingWords: [{ word: 'rhythm', wrongCount: 9 }] },
      { ...base, studentName: 'B', strugglingWords: [{ word: 'Rhythm', wrongCount: 5 }] },
      { ...base, studentName: 'C', strugglingWords: [{ word: 'rhythm', wrongCount: 3 }, { word: 'queue', wrongCount: 2 }] },
      { ...base, studentName: 'D', strugglingWords: [{ word: 'island', wrongCount: 1 }] },
    ]);
    const words = classStruggleWords(rows);
    expect(words).toEqual([{ word: 'rhythm', students: 3 }]);
  });
});

describe('consistency circles', () => {
  it('marks one rest day and today', () => {
    const now = new Date(2026, 8, 30).getTime(); // Wednesday
    const circles = currentWeekCircles([], now);
    expect(circles).toHaveLength(7);
    expect(circles.filter((c) => c.isRest)).toHaveLength(1);
    expect(circles.find((c) => c.isToday)?.label).toBe('We');
  });
});

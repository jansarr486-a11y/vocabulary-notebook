/**
 * Progress engine — pure computations for the Progress tab.
 * No I/O: repo.ts owns persistence; Progress.tsx owns rendering.
 *
 * The honest-mastered rule lives here in ONE place:
 *   mastered  = SRS-stable AND at least one production proof
 *              (first-attempt spelling success OR an own written sentence)
 *   recognized = SRS-stable but no production proof yet
 * Quiz accuracy alone is never enough — 4-option multiple choice invites
 * guessing, so it measures recognition, not ownership.
 */
import type {
  DailySnapshot,
  Profile,
  ProgressEvent,
  ProgressReport,
  SnapshotCounts,
  WeeklyGoals,
  Word,
} from './models';

// ---------- honest mastered rule ----------

/**
 * An SRS-stable word is one whose review weight has settled low AND hasn't
 * been graded Again/Hard recently: the scheduler multiplies weight by 2.2 on
 * "again" and 1.6 on "hard" (up to 4), and by 0.75 on "easy" (floor 0.5), so a
 * word never touched by those grades sits below 1. A word the student keeps
 * struggling with stays above the line and is NOT stable.
 */
export function isSrsStable(word: Word): boolean {
  const r = word.review;
  if (!r) return false;
  if (r.weight >= 1) return false;
  if (r.lastReviewedAt != null) {
    const days = (Date.now() - r.lastReviewedAt) / 86_400_000;
    if (days < 21 && r.weight >= 0.75) return false;
  }
  return true;
}

/** Production proof: spelled correctly on the first attempt, or an own sentence. */
export function hasProductionProof(word: Word): boolean {
  // First-attempt spelling success: a clean session (difficulty fully decayed
  // back to 0) while having attempted the word at least once.
  const spelledFirstTry = word.spelling?.lastAttemptAt != null && (word.spelling?.difficulty ?? 0) <= 0;
  const ownSentence = !!word.sections[2]?.text?.trim();
  return spelledFirstTry || ownSentence;
}

export function isWordMastered(word: Word): boolean {
  return isSrsStable(word) && hasProductionProof(word);
}

export function isWordRecognized(word: Word): boolean {
  return isSrsStable(word) && !hasProductionProof(word);
}

// ---------- minimum-sample rule ----------

/** Below this many data points a percentage shows "Not enough data yet". */
export const MIN_SAMPLE = 20;

/** 0..1 when there are enough samples, otherwise undefined. */
export function safeRate(correct: number, total: number): number | undefined {
  if (total < MIN_SAMPLE) return undefined;
  return total === 0 ? undefined : correct / total;
}

// ---------- live state counts (today) ----------

export function countStates(words: Word[]): SnapshotCounts & { total: number } {
  let mastered = 0;
  let recognized = 0;
  let learning = 0;
  let review = 0;
  for (const w of words) {
    if (isWordMastered(w)) {
      mastered++;
    } else if (isWordRecognized(w)) {
      recognized++;
    } else {
      const done = w.sections.filter((s) => s.completedAt != null).length;
      if (done >= 2) review++;
      else learning++;
    }
  }
  return { new: 0, learning, review, mastered, recognized, total: words.length };
}

// ---------- skills ----------

export interface SkillSamples {
  retention: { correct: number; total: number };
  recognition: { correct: number; total: number };
  spelling: { correct: number; total: number };
  writing: { sentences: number; words: number };
}

export function collectSkillSamples(events: ProgressEvent[], words: Word[]): SkillSamples {
  const retention = { correct: 0, total: 0 };
  const recognition = { correct: 0, total: 0 };
  const spelling = { correct: 0, total: 0 };
  const sentences = { sentences: 0, words: 0 };

  const longInterval = new Set<number>();
  for (const w of words) {
    if (isSrsStable(w)) longInterval.add(w.id!);
  }

  for (const e of events) {
    if (e.type === 'review_answered' && e.wordId != null) {
      recognition.total++;
      if (e.meta?.correct === true) recognition.correct++;
      if (longInterval.has(e.wordId)) {
        retention.total++;
        if (e.meta?.correct === true) retention.correct++;
      }
    } else if (e.type === 'spelling_attempt') {
      spelling.total++;
      if (e.meta?.correct === true) spelling.correct++;
    } else if (e.type === 'own_sentence_written') {
      sentences.sentences++;
    }
  }
  sentences.words = Math.max(words.length, 1);
  return { retention, recognition, spelling, writing: sentences };
}

export interface SkillBar {
  id: 'retention' | 'recognition' | 'spelling' | 'writing';
  /** 0..1, or undefined under the minimum-sample rule. */
  value?: number;
  /** Human value: percentage (0-100) or per-10-words for writing. */
  display?: number;
  samples: number;
}

export function computeSkills(samples: SkillSamples): SkillBar[] {
  const retention = safeRate(samples.retention.correct, samples.retention.total);
  const recognition = safeRate(samples.recognition.correct, samples.recognition.total);
  const spelling = safeRate(samples.spelling.correct, samples.spelling.total);
  // Writing: own sentences per 10 words — needs 10+ words to mean anything.
  const writing =
    samples.writing.words >= MIN_SAMPLE ? Math.min(1, samples.writing.sentences / samples.writing.words) : undefined;

  return [
    {
      id: 'retention',
      value: retention,
      display: retention != null ? Math.round(retention * 100) : undefined,
      samples: samples.retention.total,
    },
    {
      id: 'recognition',
      value: recognition,
      display: recognition != null ? Math.round(recognition * 100) : undefined,
      samples: samples.recognition.total,
    },
    {
      id: 'spelling',
      value: spelling,
      display: spelling != null ? Math.round(spelling * 100) : undefined,
      samples: samples.spelling.total,
    },
    {
      id: 'writing',
      value: writing,
      display: writing != null ? Math.round((samples.writing.sentences / samples.writing.words) * 10 * 10) / 10 : undefined,
      samples: samples.writing.words,
    },
  ];
}

// ---------- weekly goal ----------

export interface WeekProgress {
  masteredDone: number;
  sentencesDone: number;
  newWords: number;
  reviewAccuracy?: number;
  reviewsDone: number;
  activeDays: number;
}

/** Monday-based local week start. */
export function weekStart(now: number): number {
  const d = new Date(now);
  const day = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Active days this week — event days UNION the profile's activityDays
 * (which also records section completions from before events existed), so
 * the circles and the headline number always agree.
 */
export function activeDaysThisWeek(activityDays: string[], events: ProgressEvent[], now: number): number {
  const start = weekStart(now);
  const days = new Set<string>();
  const weekKeyOf = (ts: number) => dayKeyOf(ts);
  for (const d of activityDays) {
    const ts = new Date(d + 'T00:00:00').getTime();
    if (ts >= start && ts <= now + 86_400_000) days.add(d);
  }
  for (const e of events) {
    if (e.timestamp >= start) days.add(weekKeyOf(e.timestamp));
  }
  return days.size;
}

export function computeWeekProgress(events: ProgressEvent[], words: Word[], now: number): WeekProgress {
  const start = weekStart(now);
  const weekEvents = events.filter((e) => e.timestamp >= start);
  const masteredSet = new Set<number>();
  const sentenceEvents = weekEvents.filter((e) => e.type === 'own_sentence_written');
  let reviewsDone = 0;
  let reviewCorrect = 0;
  const activeDays = new Set<string>();

  const addActive = (ts: number) => {
    const d = new Date(ts);
    activeDays.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
  };

  for (const e of weekEvents) {
    addActive(e.timestamp);
    if (e.type === 'word_mastered') masteredSet.add(e.wordId ?? -1);
    else if (e.type === 'review_answered') {
      reviewsDone++;
      if (e.meta?.correct === true) reviewCorrect++;
    }
  }
  const sentencesDone = sentenceEvents.length;
  // Be lenient with words mastered before events existed: also credit words
  // that already meet the live rule and were added/proven this week.
  const liveMasteredIds = new Set(words.filter(isWordMastered).map((w) => w.id!));
  const union = new Set<number>(masteredSet);
  for (const id of liveMasteredIds) {
    const w = words.find((x) => x.id === id)!;
    // Only credit words that were added this week OR proven this week.
    const provenThisWeek = weekEvents.some(
      (e) => e.wordId === id && (e.type === 'own_sentence_written' || (e.type === 'spelling_attempt' && e.meta?.correct === true)),
    );
    if (provenThisWeek || (w.dateAdded >= start && isWordMastered(w))) union.add(id);
  }

  const newWords = words.filter((w) => w.dateAdded >= start).length;

  return {
    masteredDone: union.size,
    sentencesDone,
    newWords,
    reviewsDone,
    reviewAccuracy: reviewsDone >= MIN_SAMPLE ? reviewCorrect / reviewsDone : undefined,
    activeDays: activeDays.size,
  };
}

// ---------- struggling words & leeches ----------

export const LEECH_THRESHOLD = 8;

export interface StrugglingWord {
  word: Word;
  /** Review "again" answers + spelling mistakes — the honest trouble score. */
  wrongCount: number;
  spellingDifficulty: number;
  isLeech: boolean;
}

export function computeStruggling(words: Word[]): StrugglingWord[] {
  const out: StrugglingWord[] = [];
  for (const w of words) {
    const spellingDifficulty = Math.round(w.spelling?.difficulty ?? 0);
    // weight above 1 means recent Again/Hard answers; 1 point per unit above
    const reviewTrouble = Math.max(0, Math.round((w.review.weight - 1) * 2));
    const wrongCount = reviewTrouble + spellingDifficulty;
    if (wrongCount <= 0) continue;
    out.push({
      word: w,
      wrongCount,
      spellingDifficulty,
      isLeech: spellingDifficulty >= LEECH_THRESHOLD || reviewTrouble >= LEECH_THRESHOLD,
    });
  }
  // hardest first, stable
  return out.sort((a, b) => b.wrongCount - a.wrongCount || a.word.wordLower.localeCompare(b.word.wordLower));
}

// ---------- badges ----------

export interface BadgeDef {
  id: string;
  /** Shown on the badge; icon comes from CSS/emoji so no per-badge component. */
  emoji: string;
}

export const BADGES: BadgeDef[] = [
  { id: 'm10', emoji: '🌱' },
  { id: 'm50', emoji: '🌿' },
  { id: 'm100', emoji: '🌳' },
  { id: 's10', emoji: '✏️' },
  { id: 's50', emoji: '📝' },
  { id: 'd7', emoji: '🔥' },
  { id: 'd30', emoji: '🌕' },
  { id: 'book', emoji: '🏔️' },
  { id: 'dreamer', emoji: '🚀' },
];

export interface BadgeEvaluation {
  badgeId: string;
  earned: boolean;
  /** Live metric the requirement is checked against. */
  metric: number;
  target: number;
}

export function evaluateBadges(words: Word[], events: ProgressEvent[], activityDays: string[], now: number): BadgeEvaluation[] {
  const mastered = words.filter(isWordMastered).length;
  const sentences = events.filter((e) => e.type === 'own_sentence_written').length;
  const bestStreak = bestStreakOf(activityDays, now);
  const booksTouched = new Set(words.map((w) => w.librarySource?.bookId).filter(Boolean));
  let finishedBooks = 0;
  for (const bookId of booksTouched) {
    const inBook = words.filter((w) => w.librarySource?.bookId === bookId);
    if (inBook.length > 0 && inBook.every((w) => w.sections.every((s) => s.completedAt != null))) finishedBooks++;
  }
  const metricOf: Record<string, number> = {
    m10: mastered,
    m50: mastered,
    m100: mastered,
    dreamer: mastered,
    s10: sentences,
    s50: sentences,
    d7: bestStreak,
    d30: bestStreak,
    book: finishedBooks,
  };
  const targetOf: Record<string, number> = { m10: 10, m50: 50, m100: 100, dreamer: 250, s10: 10, s50: 50, d7: 7, d30: 30, book: 1 };
  return BADGES.map((b) => ({ badgeId: b.id, earned: (metricOf[b.id] ?? 0) >= targetOf[b.id], metric: metricOf[b.id] ?? 0, target: targetOf[b.id] }));
}

export function bestStreakOf(activityDays: string[], _now?: number): number {
  if (activityDays.length === 0) return 0;
  const set = new Set(activityDays);
  let best = 0;
  for (const day of set) {
    const [y, m, d] = day.split('-').map(Number);
    const start = new Date(y, m - 1, d).getTime();
    if (!set.has(dayKeyOf(start - 86_400_000))) {
      let len = 0;
      let cursor = start;
      while (set.has(dayKeyOf(cursor))) {
        len++;
        cursor += 86_400_000;
      }
      if (len > best) best = len;
    }
  }
  return best;
}

function dayKeyOf(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---------- book coverage ----------

export interface BookCoverage {
  bookId: string;
  bookTitle: string;
  collectionTitle: string;
  added: number;
  mastered: number;
  total: number;
}

export function computeBookCoverage(words: Word[], bookTotals: Map<string, number>): BookCoverage[] {
  const map = new Map<string, BookCoverage>();
  for (const w of words) {
    const src = w.librarySource;
    if (!src) continue;
    let row = map.get(src.bookId);
    if (!row) {
      row = {
        bookId: src.bookId,
        bookTitle: src.bookTitle,
        collectionTitle: src.collectionTitle,
        added: 0,
        mastered: 0,
        total: bookTotals.get(src.bookId) ?? 0,
      };
      map.set(src.bookId, row);
    }
    row.added++;
    if (isWordMastered(w)) row.mastered++;
  }
  return [...map.values()].sort((a, b) => a.collectionTitle.localeCompare(b.collectionTitle) || a.bookTitle.localeCompare(b.bookTitle));
}

// ---------- consistency ----------

export interface WeekCircle {
  /** Local day key 'YYYY-MM-DD'. */
  date: string;
  label: string;
  active: boolean;
  isToday: boolean;
  isRest: boolean;
  future: boolean;
}

/**
 * The current week's 7 circles. One "rest day" (the day with least activity
 * context — chosen as Sunday-equivalent, the 7th slot) never breaks the
 * streak; the UI explains this in a tooltip.
 */
export function currentWeekCircles(activityDays: string[], now: number): WeekCircle[] {
  const set = new Set(activityDays);
  const start = weekStart(now);
  const labels = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
  const out: WeekCircle[] = [];
  for (let i = 0; i < 7; i++) {
    const ts = start + i * 86_400_000;
    const key = dayKeyOf(ts);
    out.push({
      date: key,
      label: labels[i],
      active: set.has(key),
      isToday: key === dayKeyOf(now),
      isRest: i === 6,
      future: ts > now && key !== dayKeyOf(now),
    });
  }
  return out;
}

/** Month heatmap: 5 weeks × 7 days ending today. */
export function monthHeatmap(activityDays: string[], now: number): { date: string; level: 0 | 1 | 2 | 3 }[] {
  const set = new Set(activityDays);
  const end = dayStartOf(now);
  const cells: { date: string; level: 0 | 1 | 2 | 3 }[] = [];
  for (let i = 34; i >= 0; i--) {
    const ts = end - i * 86_400_000;
    const key = dayKeyOf(ts);
    cells.push({ date: key, level: set.has(key) ? 3 : 0 });
  }
  return cells;
}

function dayStartOf(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// ---------- snapshot series for the garden chart ----------

export interface GardenPoint {
  date: string;
  counts: SnapshotCounts;
  total: number;
}

/** Build the chart series from snapshots, filling gaps by carrying forward. */
export function gardenSeries(snapshots: DailySnapshot[], days: 30 | 90 | 0, now: number): GardenPoint[] {
  const byDate = new Map(snapshots.map((s) => [s.date, s]));
  const out: GardenPoint[] = [];    const firstTs = snapshots.length > 0 ? new Date(snapshots[0].date + 'T00:00:00').getTime() : dayStartOf(now);
    const startTs = days === 0 ? firstTs : dayStartOf(now) - (days - 1) * 86_400_000;
  const cur = new Date(startTs);
  cur.setHours(0, 0, 0, 0);
  const end = dayStartOf(now);
  let carry: SnapshotCounts | undefined = undefined;
  while (cur.getTime() <= end) {
    const key = dayKeyOf(cur.getTime());
    const snap = byDate.get(key);
    if (snap) carry = { ...snap.counts };
    // gap days simply keep carrying the last known state — no invented zeroes
    if (carry) out.push({ date: key, counts: { ...carry }, total: carry.new + carry.learning + carry.review + carry.mastered + carry.recognized });
    // days before the first snapshot are left out entirely — a gap, not zeroes
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

// ---------- report building (Part 3) ----------

export function buildProgressReport(
  profile: Profile,
  words: Word[],
  events: ProgressEvent[],
  snapshots: DailySnapshot[],
  goals: WeeklyGoals,
  rangeDays: 7 | 30 | 0,
  now: number,
): ProgressReport {
  const dayKey = (ts: number) => dayKeyOf(ts);
  const from = rangeDays === 0 ? snapshots[0]?.date ?? dayKey(now) : dayKey(now - (rangeDays - 1) * 86_400_000);
  const to = dayKey(now);
  const rangeSnapshots = snapshots.filter((s) => s.date >= from && s.date <= to);
  const samples = collectSkillSamples(events, words);
  const skills = computeSkills(samples);
  const week = computeWeekProgress(events, words, now);
  const struggling = computeStruggling(words).slice(0, 10);
  const mastered = words.filter(isWordMastered).length;
  const recognized = words.filter(isWordRecognized).length;
  const bookTotals = new Map<string, number>();
  const coverage = computeBookCoverage(words, bookTotals);

  return {
    app: 'vocabulary-notebook-progress',
    version: 1,
    studentName: profile.name,
    generatedAt: now,
    range: { from, to },
    totals: { words: words.length, mastered, recognized },
    activeDaysThisWeek: activeDaysThisWeek(profile.stats.activityDays, events, now),
    streakDays: bestStreakOf(profile.stats.activityDays, now),
    weeklyGoal: {
      masteredGoal: goals.masteredPerWeek,
      sentencesGoal: goals.sentencesPerWeek,
      masteredDone: week.masteredDone,
      sentencesDone: week.sentencesDone,
      completed: week.masteredDone >= goals.masteredPerWeek && week.sentencesDone >= goals.sentencesPerWeek,
    },
    skills: {
      retention: skills[0].display != null ? skills[0].display! / 100 : undefined,
      recognition: skills[1].display != null ? skills[1].display! / 100 : undefined,
      spelling: skills[2].display != null ? skills[2].display! / 100 : undefined,
      writing: skills[3].display,
      samples: {
        retention: samples.retention.total,
        recognition: samples.recognition.total,
        spelling: samples.spelling.total,
        words: words.length,
      },
    },
    daily: rangeSnapshots.map((s) => ({
      date: s.date,
      active: s.activeToday,
      reviewsDone: s.reviewsDone,
      reviewAccuracy: s.reviewAccuracy,
      sentencesWritten: s.sentencesWritten,
      counts: s.counts,
    })),
    strugglingWords: struggling.map((s) => ({
      word: s.word.word,
      wrongCount: s.wrongCount,
      spellingDifficulty: s.spellingDifficulty,
    })),
    bookCoverage: coverage.map((c) => ({ bookTitle: c.bookTitle, bookId: c.bookId, added: c.added, mastered: c.mastered })),
  };
}

// ---------- tutor aggregation (Part 4) ----------

export interface ClassRow {
  name: string;
  activeDays: number;
  mastered: number;
  reviewAccuracy?: number;
  trend: 'up' | 'flat' | 'down';
  goalCompleted: boolean;
  sentAt: number;
  struggling: string[];
}

/**
 * Aggregate imported reports. For trend, when a student has several imported
 * reports, compare the two most recent.
 */
export function buildClassOverview(reports: ProgressReport[]): ClassRow[] {
  const byName = new Map<string, ProgressReport[]>();
  for (const r of reports) {
    const list = byName.get(r.studentName) ?? [];
    list.push(r);
    byName.set(r.studentName, list);
  }
  const rows: ClassRow[] = [];
  for (const [name, list] of byName) {
    const sorted = [...list].sort((a, b) => a.generatedAt - b.generatedAt);
    const latest = sorted[sorted.length - 1];
    const prev = sorted.length > 1 ? sorted[sorted.length - 2] : undefined;
    const acc = latest.skills.recognition;
    const prevAcc = prev?.skills.recognition;
    let trend: 'up' | 'flat' | 'down' = 'flat';
    if (acc != null && prevAcc != null) {
      const delta = acc - prevAcc;
      trend = delta > 0.02 ? 'up' : delta < -0.02 ? 'down' : 'flat';
    }
    rows.push({
      name,
      activeDays: latest.activeDaysThisWeek,
      mastered: latest.totals.mastered,
      reviewAccuracy: acc,
      trend,
      goalCompleted: latest.weeklyGoal.completed,
      sentAt: latest.generatedAt,
      struggling: latest.strugglingWords.map((s) => s.word.toLowerCase()),
    });
  }
  return rows.sort((a, b) => classNeedScore(b) - classNeedScore(a));
}

function classNeedScore(r: ClassRow): number {
  // need for attention: low accuracy first, then low mastery, then stale reports
  const acc = r.reviewAccuracy ?? 0.5;
  return (1 - acc) * 100 + (r.trend === 'down' ? 15 : 0) + (r.goalCompleted ? 0 : 5);
}

/** Words appearing in the struggling lists of 3+ students. */
export function classStruggleWords(rows: ClassRow[]): { word: string; students: number }[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    for (const w of new Set(r.struggling)) counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, n]) => n >= 3)
    .map(([word, students]) => ({ word, students }))
    .sort((a, b) => b.students - a.students || a.word.localeCompare(b.word));
}



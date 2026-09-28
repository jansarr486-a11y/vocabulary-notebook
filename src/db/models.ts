/**
 * Vocabulary Notebook — data model.
 * Single source of truth for all persisted shapes.
 * Every record carries `schemaVersion` so future modules (reading/listening
 * practice) can evolve the model without breaking existing notebooks.
 */

export const SCHEMA_VERSION = 1;

export type LevelTag = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'IELTS' | 'TOEFL';

export const LEVEL_TAGS: LevelTag[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'IELTS', 'TOEFL'];

export const PARTS_OF_SPEECH = [
  'noun',
  'verb',
  'adjective',
  'adverb',
  'phrasal verb',
  'preposition',
  'conjunction',
  'pronoun',
  'phrase',
  'other',
] as const;

export type PartOfSpeech = (typeof PARTS_OF_SPEECH)[number];

/** The four progressive sections of a word entry. */
export interface WordSection {
  /** Section 1: dictionary definition; 2: dictionary example; 3: student's own sentence; 4: note/mnemonic. */
  text: string;
  completedAt?: number;
  /** When this section became (or will become) available; stored at completion time of the previous section. */
  unlockedAt?: number;
}

export interface ScheduleIntervals {
  /** Days after previous section completion. s4 is optional — always available, null means "no timer shown". */
  s1: number;
  s2: number;
  s3: number;
  s4: number | null;
}

/**
 * The four possible outcomes of one review card. In the auto-graded quiz these
 * are derived from quiz performance (wrong answer, slow/hesitant answer,
 * normal answer, instant answer) instead of student self-report.
 */
export type ReviewGrade = 'again' | 'hard' | 'good' | 'easy';

/** What the multiple-choice answer options display. */
export type QuizAnswerMode = 'definition' | 'persian';

/** Recognition-quiz preferences (auto-graded review). */
export interface QuizSettings {
  answerMode: QuizAnswerMode;
  /** Correct answers faster than this many ms grade as Easy. */
  easyUnderMs: number;
  /** Correct answers faster than this many ms (but ≥ easyUnderMs) grade as Good; slower grades as Hard. */
  goodUnderMs: number;
}

export const DEFAULT_QUIZ_SETTINGS: QuizSettings = {
  answerMode: 'definition',
  easyUnderMs: 4_000,
  goodUnderMs: 10_000,
};

/** Quiz settings with defaults filled in (rows saved before quizzes existed). */
export function quizSettingsOf(s: ProfileSettings | undefined): QuizSettings {
  return { ...DEFAULT_QUIZ_SETTINGS, ...(s?.quiz ?? {}) };
}

export interface ProfileSettings {
  intervals: ScheduleIntervals;
  /** Sections-per-day target for the progress bar. */
  dailyGoal: number;
  /** How many cards a review session serves. */
  reviewDeckSize: number;
  /** Added in v1.2 — absent on profiles created before the auto-graded quiz. */
  quiz?: QuizSettings;
}

export interface ProfileStats {
  streakCount: number;
  lastActiveDay?: string; // 'YYYY-MM-DD'
  activityDays: string[];
}

export interface Profile {
  id?: number;
  name: string;
  accentColor: string;
  pinHash?: string;
  pinSalt?: string;
  createdAt: number;
  settings: ProfileSettings;
  stats: ProfileStats;
  /** Added in v1.3 — optional profile picture, absent on older rows. */
  avatarBlob?: Blob;
  avatarMime?: string;
  schemaVersion: number;
}

export interface WordReview {
  lastReviewedAt?: number;
  /** >= 1. Grows on "hard", shrinks slightly on "easy". 1 = neutral. */
  weight: number;
  /** 0 = due-now baseline after each session. */
  pressure: number;
}

/**
 * Provenance stamp for words copied in from the Word Library. The entry is a
 * full, independent copy — editing it later never touches the library data.
 */
export interface WordLibrarySource {
  collectionId: string;
  collectionTitle: string;
  bookId: string;
  bookTitle: string;
}

/** Per-word difficulty tracking for the Spelling Puzzle game. */
export interface WordSpelling {
  /** 0 (trivial) .. 10 (always misspelled). +1 per wrong check, decays on clean sweeps. */
  difficulty: number;
  /** Timestamp of the last spelling attempt. */
  lastAttemptAt?: number;
  /** Local-day key of the last session that practiced this word ('YYYY-MM-DD'). */
  lastSessionDay?: string;
}

export interface Word {
  id?: number;
  profileId: number;
  word: string;
  /** Lowercase copy for sorting/searching/indexing. */
  wordLower: string;
  phonetic?: string;
  partOfSpeech?: string;
  /** Optional Persian (fa) translation shown under the English definition. */
  persianMeaning?: string;
  levelTags: LevelTag[];
  courseTag?: string;
  /** Where this word was copied from, if it came from the Word Library. */
  librarySource?: WordLibrarySource;
  dateAdded: number;
  imageBlob?: Blob;
  imageMime?: string;
  sections: WordSection[]; // length 4
  review: WordReview;
  /** Added in v1.1 — absent on rows created before the Spelling Puzzle existed. */
  spelling?: WordSpelling;
  schemaVersion: number;
}

export interface BackupBadge {
  badgeId: string;
  earnedAt: number;
}

/** Envelope for full JSON export/import (backup + device migration). */
export interface BackupWord {
  id?: number;
  word: string;
  phonetic?: string;
  partOfSpeech?: string;
  persianMeaning?: string;
  levelTags: LevelTag[];
  courseTag?: string;
  librarySource?: WordLibrarySource;
  dateAdded: number;
  /** base64 data URL when the entry carries an image. */
  imageDataUrl?: string;
  sections: WordSection[];
  review: WordReview;
  spelling?: WordSpelling;
}

export interface BackupEnvelope {
  app: 'vocabulary-notebook';
  schema: number;
  exportedAt: number;
  profile: {
    name: string;
    settings: ProfileSettings;
    stats: ProfileStats;
    accentColor: string;
    /** base64 data URL when the profile has a picture. */
    avatarDataUrl?: string;
  };
  words: BackupWord[];
  /** Added in v2 — progress history; absent on older backups. */
  progress?: {
    events: Omit<ProgressEvent, 'id' | 'profileId' | 'schemaVersion'>[];
    snapshots: Omit<DailySnapshot, 'id' | 'profileId'>[];
    goals?: WeeklyGoals;
    badges: BackupBadge[];
  };
}

// ---------- progress tracking (added in v2) ----------

/** One learning action, appended by every feature (Notebook/Review/Spelling/Library). */
export type ProgressEventType =
  | 'word_added' // meta: { source: 'manual' | 'library' }
  | 'section_completed' // meta: { sectionNumber: 1 | 2 | 3 | 4 }
  | 'own_sentence_written' // fired together with section_completed when sectionNumber === 3
  | 'review_answered' // meta: { correct: boolean; grade: ReviewGrade; responseTimeMs: number }
  | 'spelling_attempt' // meta: { correct: boolean; attemptsNeeded: number }
  | 'word_mastered'; // appended when a word first meets the honest mastered rule

export interface ProgressEvent {
  id?: number;
  profileId: number;
  timestamp: number;
  type: ProgressEventType;
  wordId?: number;
  meta?: Record<string, unknown>;
  schemaVersion: number;
}

export interface SnapshotCounts {
  new: number;
  learning: number;
  review: number;
  mastered: number;
  /** Mastered by SRS but without production proof — shown separately, never merged into mastered. */
  recognized: number;
}

/** One per local day; powers the charts. Rebuilt from events + word states. */
export interface DailySnapshot {
  id?: number;
  profileId: number;
  date: string; // 'YYYY-MM-DD' local
  counts: SnapshotCounts;
  totalWords: number;
  reviewsDone: number;
  /** 0..1; undefined when no reviews that day (a gap, never a fake 0). */
  reviewAccuracy?: number;
  sentencesWritten: number;
  /** First-attempt spelling accuracy 0..1; undefined when no attempts. */
  spellingAccuracy?: number;
  activeToday: boolean;
}

/** Weekly mastering/writing goals — editable in the Progress tab. */
export interface WeeklyGoals {
  masteredPerWeek: number;
  sentencesPerWeek: number;
}

export const DEFAULT_WEEKLY_GOALS: WeeklyGoals = { masteredPerWeek: 5, sentencesPerWeek: 3 };

export interface ProgressBadgeState {
  id?: number;
  profileId: number;
  badgeId: string;
  earnedAt: number;
}

/** Struggling-word entry inside a shared progress report. */
export interface ReportStruggleWord {
  word: string;
  wrongCount: number;
  spellingDifficulty?: number;
}

/**
 * The JSON report a student hands to their tutor (Part 3). Deliberately
 * compact and self-describing; contains NO written sentences unless the
 * student explicitly opted in via `bestSentences`.
 */
export interface ProgressReport {
  app: 'vocabulary-notebook-progress';
  version: 1;
  studentName: string;
  generatedAt: number;
  range: { from: string; to: string };
  totals: { words: number; mastered: number; recognized: number };
  activeDaysThisWeek: number;
  streakDays: number;
  weeklyGoal: {
    masteredGoal: number;
    sentencesGoal: number;
    masteredDone: number;
    sentencesDone: number;
    completed: boolean;
  };
  skills: {
    /** All 0..1 or undefined (not enough data). */
    retention?: number;
    recognition?: number;
    spelling?: number;
    /** Own sentences per 10 words, capped at 1 for the shared bar scale. */
    writing?: number;
    /** Raw sample sizes so the tutor can apply the minimum-sample rule too. */
    samples: { retention: number; recognition: number; spelling: number; words: number };
  };
  daily: {
    date: string;
    active: boolean;
    reviewsDone: number;
    reviewAccuracy?: number;
    sentencesWritten: number;
    counts: SnapshotCounts;
  }[];
  strugglingWords: ReportStruggleWord[];
  bookCoverage: { bookTitle: string; bookId?: string; added: number; mastered: number }[];
  bestSentences?: { word: string; text: string }[];
}

/** A student report imported into the tutor's device. */
export interface TutorReport {
  id?: number;
  importedAt: number;
  report: ProgressReport;
}

export const DEFAULT_INTERVALS: ScheduleIntervals = { s1: 0, s2: 2, s3: 4, s4: null };

export function defaultSettings(): ProfileSettings {
  return {
    intervals: { ...DEFAULT_INTERVALS },
    dailyGoal: 3,
    reviewDeckSize: 10,
    quiz: { ...DEFAULT_QUIZ_SETTINGS },
  };
}

export function emptyProfileStats(): ProfileStats {
  return { streakCount: 0, activityDays: [] };
}

export function emptySections(): WordSection[] {
  return [0, 1, 2, 3].map(() => ({ text: '' }));
}

export function createReview(): WordReview {
  return { weight: 1, pressure: 0 };
}

export function createSpelling(): WordSpelling {
  return { difficulty: 0 };
}

export const LEVEL_TAG_STYLES: Record<LevelTag, { bg: string; fg: string }> = {
  A1: { bg: '#e3efdd', fg: '#4a6b3f' },
  A2: { bg: '#dff0e8', fg: '#2f6b52' },
  B1: { bg: '#e3ecf7', fg: '#3d5e8c' },
  B2: { bg: '#efe6f5', fg: '#6a4d8c' },
  C1: { bg: '#fbe3ec', fg: '#96386b' },
  IELTS: { bg: '#fdeadd', fg: '#a05a2c' },
  TOEFL: { bg: '#fde3e3', fg: '#a03c3c' },
};

/**
 * Vocabulary Notebook — data model.
 * Single source of truth for all persisted shapes.
 * Every record carries `schemaVersion` so future modules (reading/listening
 * practice) can evolve the model without breaking existing notebooks.
 */

export const SCHEMA_VERSION = 1;

export type LevelTag = 'A1' | 'A2' | 'B1' | 'B2' | 'IELTS' | 'TOEFL';

export const LEVEL_TAGS: LevelTag[] = ['A1', 'A2', 'B1', 'B2', 'IELTS', 'TOEFL'];

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

export interface ProfileSettings {
  intervals: ScheduleIntervals;
  /** Sections-per-day target for the progress bar. */
  dailyGoal: number;
  /** How many cards a review session serves. */
  reviewDeckSize: number;
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
  schemaVersion: number;
}

export interface WordReview {
  lastReviewedAt?: number;
  /** >= 1. Grows on "hard", shrinks slightly on "easy". 1 = neutral. */
  weight: number;
  /** 0 = due-now baseline after each session. */
  pressure: number;
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
  levelTags: LevelTag[];
  courseTag?: string;
  dateAdded: number;
  imageBlob?: Blob;
  imageMime?: string;
  sections: WordSection[]; // length 4
  review: WordReview;
  /** Added in v1.1 — absent on rows created before the Spelling Puzzle existed. */
  spelling?: WordSpelling;
  schemaVersion: number;
}

/** Envelope for full JSON export/import (backup + device migration). */
export interface BackupWord {
  id?: number;
  word: string;
  phonetic?: string;
  partOfSpeech?: string;
  levelTags: LevelTag[];
  courseTag?: string;
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
  };
  words: BackupWord[];
}

export const DEFAULT_INTERVALS: ScheduleIntervals = { s1: 0, s2: 2, s3: 4, s4: null };

export function defaultSettings(): ProfileSettings {
  return { intervals: { ...DEFAULT_INTERVALS }, dailyGoal: 3, reviewDeckSize: 10 };
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
  IELTS: { bg: '#fdeadd', fg: '#a05a2c' },
  TOEFL: { bg: '#fde3e3', fg: '#a03c3c' },
};

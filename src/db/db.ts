import Dexie, { type Table } from 'dexie';
import type { DailySnapshot, Profile, ProgressBadgeState, ProgressEvent, TutorReport, Word } from './models';

/** Cached dictionary lookups so suggestions keep working offline after one fetch. */
export interface DictionaryCacheEntry {
  wordLower: string;
  fetchedAt: number;
  definition?: string;
  example?: string;
  phonetic?: string;
  partOfSpeech?: string;
}

export class VocabDb extends Dexie {
  profiles!: Table<Profile, number>;
  words!: Table<Word, number>;
  dictionaryCache!: Table<DictionaryCacheEntry, string>;
  /** Tiny key/value store for app-level pointers (e.g. last active profile). */
  meta!: Table<{ key: string; value: unknown }, string>;
  /** v2 — append-only learning-event log powering the Progress tab. */
  events!: Table<ProgressEvent, number>;
  /** v2 — one row per profile per local day; powers the charts. */
  snapshots!: Table<DailySnapshot, number>;
  /** v2 — milestone badges already earned (recomputed live otherwise). */
  badges!: Table<ProgressBadgeState, number>;
  /** v2 — student progress reports imported in tutor mode. */
  tutorReports!: Table<TutorReport, number>;

  constructor() {
    super('vocabulary-notebook');
    // v1 — initial schema. Existing data keeps working untouched.
    this.version(1).stores({
      profiles: '++id, createdAt',
      // compound index lets the notebook list per profile ordered by sort key
      words: '++id, profileId, [profileId+wordLower], [profileId+dateAdded]',
      dictionaryCache: 'wordLower',
      meta: 'key',
    });
    // v2 — progress tracking: event log, daily snapshots, earned badges.
    // Non-indexed fields (meta objects) stay out of the index list.
    this.version(2).stores({
      profiles: '++id, createdAt',
      words: '++id, profileId, [profileId+wordLower], [profileId+dateAdded]',
      dictionaryCache: 'wordLower',
      meta: 'key',
      events: '++id, [profileId+type], [profileId+timestamp], wordId',
      snapshots: '++id, [profileId+date], profileId',
      badges: '++id, [profileId+badgeId]',
      tutorReports: '++id, importedAt',
    });
  }
}

export const db = new VocabDb();

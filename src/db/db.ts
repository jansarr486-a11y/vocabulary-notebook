import Dexie, { type Table } from 'dexie';
import type { Profile, Word } from './models';

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

  constructor() {
    super('vocabulary-notebook');
    // v1 — initial schema. Future modules (reading/listening practice) add
    // version(2).upgrade(...) chains; existing data keeps working untouched.
    this.version(1).stores({
      profiles: '++id, createdAt',
      // compound index lets the notebook list per profile ordered by sort key
      words: '++id, profileId, [profileId+wordLower], [profileId+dateAdded]',
      dictionaryCache: 'wordLower',
      meta: 'key',
    });
  }
}

export const db = new VocabDb();

import { dayKey } from './time';
import {
  createReview,
  defaultSettings,
  emptyProfileStats,
  emptySections,
  type BackupEnvelope,
  type BackupWord,
  type LevelTag,
  type Profile,
  type ProfileSettings,
  type Word,
  type WordSection,
} from './models';
import { applyReviewRating, intervalFor, recordActivity } from './schedule';
import { hashPin } from './pin';
import { db, type DictionaryCacheEntry } from './db';

/** Repository — the only module that talks to Dexie directly. */

// ---------- profiles ----------

export async function listProfiles(): Promise<Profile[]> {
  return db.profiles.orderBy('createdAt').toArray();
}

export async function getProfile(id: number): Promise<Profile | undefined> {
  return db.profiles.get(id);
}

export async function createProfile(
  name: string,
  accentColor: string,
  pin?: string,
  settings?: ProfileSettings,
): Promise<Profile> {
  const pinData = pin ? await hashPin(pin) : undefined;
  const profile: Profile = {
    name: name.trim() || 'Student',
    accentColor,
    pinHash: pinData?.pinHash,
    pinSalt: pinData?.pinSalt,
    createdAt: Date.now(),
    settings: settings ?? defaultSettings(),
    stats: emptyProfileStats(),
    schemaVersion: 1,
  };
  profile.id = await db.profiles.add(profile);
  return profile;
}

export async function updateProfile(id: number, changes: Partial<Profile>): Promise<void> {
  await db.profiles.update(id, changes);
}

export async function updateSettings(id: number, settings: ProfileSettings): Promise<void> {
  await db.profiles.update(id, { settings });
}

export async function deleteProfile(id: number): Promise<void> {
  await db.transaction('rw', db.profiles, db.words, async () => {
    await db.words.where('profileId').equals(id).delete();
    await db.profiles.delete(id);
  });
}

/** Bump streak counters after a section completion. */
export async function recordProfileActivity(profileId: number, now: number): Promise<void> {
  const p = await db.profiles.get(profileId);
  if (!p) return;
  await db.profiles.update(profileId, { stats: recordActivity(p.stats, now) });
}

// ---------- words ----------

export interface NewWordInput {
  word: string;
  phonetic?: string;
  partOfSpeech?: string;
  levelTags: LevelTag[];
  courseTag?: string;
  imageBlob?: Blob;
  imageMime?: string;
  /** Edit semantics: explicitly delete the stored image. */
  removeImage?: boolean;
}

export function newWord(profileId: number, input: NewWordInput, now = Date.now()): Word {
  const word = input.word.trim();
  return {
    profileId,
    word,
    wordLower: word.toLowerCase(),
    phonetic: input.phonetic?.trim() || undefined,
    partOfSpeech: input.partOfSpeech || undefined,
    levelTags: input.levelTags,
    courseTag: input.courseTag?.trim() || undefined,
    dateAdded: now,
    imageBlob: input.imageBlob,
    imageMime: input.imageMime,
    sections: emptySections(),
    review: createReview(),
    schemaVersion: 1,
  };
}

export async function addWord(word: Word): Promise<number> {
  return db.words.add(word);
}

export async function getWord(id: number): Promise<Word | undefined> {
  return db.words.get(id);
}

export async function putWord(word: Word): Promise<number> {
  return db.words.put(word);
}

export async function deleteWord(id: number): Promise<void> {
  await db.words.delete(id);
}

export async function listWords(profileId: number): Promise<Word[]> {
  return db.words.where('[profileId+wordLower]').between([profileId, ''], [profileId, '\uffff']).toArray();
}

export async function updateWordHeader(id: number, changes: Partial<NewWordInput>): Promise<void> {
  const w = await db.words.get(id);
  if (!w) return;
  if (changes.word !== undefined) {
    w.word = changes.word.trim();
    w.wordLower = w.word.toLowerCase();
  }
  if (changes.phonetic !== undefined) w.phonetic = changes.phonetic.trim() || undefined;
  if (changes.partOfSpeech !== undefined) w.partOfSpeech = changes.partOfSpeech || undefined;
  if (changes.levelTags !== undefined) w.levelTags = changes.levelTags;
  if (changes.courseTag !== undefined) w.courseTag = changes.courseTag.trim() || undefined;
  if (changes.imageBlob !== undefined) {
    w.imageBlob = changes.imageBlob;
    w.imageMime = changes.imageMime;
  } else if (changes.removeImage) {
    w.imageBlob = undefined;
    w.imageMime = undefined;
  }
  await db.words.put(w);
}

/** Fill a section's text; completion is explicit via completeSection(). */
export async function saveSectionText(wordId: number, index: 1 | 2 | 3 | 4, text: string): Promise<void> {
  const w = await db.words.get(wordId);
  if (!w) return;
  const sections = [...w.sections];
  sections[index - 1] = { ...sections[index - 1], text };
  await db.words.put({ ...w, sections });
}

/**
 * Save text and mark the section complete; chains the next section's unlock.
 * Returns the updated word.
 */
export async function completeSection(
  wordId: number,
  index: 1 | 2 | 3 | 4,
  text: string,
  intervals: ProfileSettings['intervals'],
  profileId: number,
  now = Date.now(),
): Promise<Word | undefined> {
  let result: Word | undefined;
  await db.transaction('rw', db.words, db.profiles, async () => {
    const w = await db.words.get(wordId);
    if (!w) return;
    const sections: WordSection[] = w.sections.map((s) => ({ ...s }));
    sections[index - 1] = { text, completedAt: now };
    // chain next unlock if not already stored
    if (index < 4 && sections[index].unlockedAt == null) {
      const gap = intervalFor(intervals, index + 1) ?? 0;
      sections[index].unlockedAt = now + gap * 24 * 60 * 60 * 1000;
    }
    result = { ...w, sections };
    await db.words.put(result);
    await recordProfileActivity(profileId, now);
  });
  return result;
}

export async function uncompleteSection(wordId: number, index: 1 | 2 | 3 | 4): Promise<void> {
  const w = await db.words.get(wordId);
  if (!w) return;
  const sections = w.sections.map((s) => ({ ...s }));
  sections[index - 1] = { text: sections[index - 1]?.text ?? '', completedAt: undefined };
  await db.words.put({ ...w, sections });
}

export async function applyReviewResult(
  wordId: number,
  rating: 'easy' | 'hard',
  now = Date.now(),
): Promise<void> {
  const w = await db.words.get(wordId);
  if (!w) return;
  w.review = applyReviewRating(w.review, rating, now);
  await db.words.put(w);
}

// ---------- dictionary cache ----------

export async function getCachedDictionaryEntry(wordLower: string): Promise<DictionaryCacheEntry | undefined> {
  return db.dictionaryCache.get(wordLower);
}

export async function putDictionaryEntry(entry: DictionaryCacheEntry): Promise<void> {
  await db.dictionaryCache.put(entry);
}

// ---------- backup / restore ----------

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

export async function exportBackup(profile: Profile): Promise<BackupEnvelope> {
  const words = await listWords(profile.id!);
  const backupWords: BackupWord[] = [];
  for (const w of words) {
    backupWords.push({
      word: w.word,
      phonetic: w.phonetic,
      partOfSpeech: w.partOfSpeech,
      levelTags: w.levelTags,
      courseTag: w.courseTag,
      dateAdded: w.dateAdded,
      imageDataUrl: w.imageBlob ? await blobToDataUrl(w.imageBlob) : undefined,
      sections: w.sections,
      review: w.review,
    });
  }
  return {
    app: 'vocabulary-notebook',
    schema: 1,
    exportedAt: Date.now(),
    profile: {
      name: profile.name,
      settings: profile.settings,
      stats: profile.stats,
      accentColor: profile.accentColor,
    },
    words: backupWords,
  };
}

export interface ImportOptions {
  mode: 'merge' | 'replace';
}

/**
 * Restore a backup envelope into a NEW profile (device migration safe:
 * importing never mutates the profile the backup came from).
 */
export async function importBackup(
  envelope: BackupEnvelope,
  options: ImportOptions,
  now = Date.now(),
): Promise<number> {
  if (envelope?.app !== 'vocabulary-notebook') throw new Error('Not a Vocabulary Notebook backup file.');
  const profile = await createProfile(
    `${envelope.profile.name} (restored)`,
    envelope.profile.accentColor || '#c96f4a',
    undefined,
    envelope.profile.settings,
  );
  const pid = profile.id!;
  if (options.mode === 'replace') {
    // "replace" means: restore the profile stats/streak snapshot as-is
    await db.profiles.update(pid, { stats: envelope.profile.stats });
  }
  for (const bw of envelope.words) {
    const word: Word = {
      profileId: pid,
      word: bw.word,
      wordLower: bw.word.toLowerCase(),
      phonetic: bw.phonetic,
      partOfSpeech: bw.partOfSpeech,
      levelTags: bw.levelTags ?? [],
      courseTag: bw.courseTag,
      dateAdded: bw.dateAdded ?? now,
      imageBlob: bw.imageDataUrl ? await dataUrlToBlob(bw.imageDataUrl) : undefined,
      imageMime: bw.imageDataUrl ? bw.imageDataUrl.slice(5, bw.imageDataUrl.indexOf(';')) : undefined,
      sections: (bw.sections ?? emptySections()).map((s) => ({ ...s })),
      review: bw.review ?? createReview(),
      schemaVersion: 1,
    };
    await db.words.add(word);
  }
  return pid;
}

// ---------- meta (app-level pointers) ----------

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const row = await db.meta.get(key);
  return row?.value as T | undefined;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value });
}

// ---------- misc ----------

export async function todayDoneCount(profileId: number, now = Date.now()): Promise<number> {
  const words = await listWords(profileId);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return words.reduce(
    (n, w) => n + w.sections.filter((s) => s.completedAt != null && s.completedAt >= start.getTime()).length,
    0,
  );
}

export async function touchActivityOnLaunch(profileId: number): Promise<void> {
  // Repair streak display if the app wasn't opened for days (streak resets naturally).
  const p = await db.profiles.get(profileId);
  if (!p) return;
  const stats = { ...p.stats, streakCount: recordActivity(p.stats, Date.now()).streakCount };
  if (stats.streakCount !== p.stats.streakCount) {
    // only recount, don't add today as active — activity marks come from completions
    const today = dayKey(Date.now());
    const withoutToday = { ...p.stats, activityDays: p.stats.activityDays.filter((d) => d !== today) };
    await db.profiles.update(profileId, {
      stats: { ...withoutToday, streakCount: recordActivity(withoutToday, Date.now()).streakCount },
    });
  }
}

export { dayKey };

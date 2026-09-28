/**
 * Progress persistence — the only module (besides repo.ts) that writes the
 * progress stores. Callers fire-and-forget: logging must NEVER break the
 * feature it observes.
 */
import type {
  DailySnapshot,
  ProgressBadgeState,
  ProgressEvent,
  ProgressEventType,
  ProgressReport,
  TutorReport,
} from './models';
import { db } from './db';
import { getMeta, setMeta, listWords } from './repo';
import { evaluateBadges, isWordMastered, countStates } from './progress';
const BADGES_KEY = 'progressBadges';

// ---------- event log ----------

export interface LogEventInput {
  type: ProgressEventType;
  wordId?: number;
  meta?: Record<string, unknown>;
}

/** Append one learning event. Fire-and-forget; failures are swallowed. */
export function logProgressEvent(profileId: number, input: LogEventInput): void {
  if (profileId == null) return;
  const event: ProgressEvent = {
    profileId,
    timestamp: Date.now(),
    type: input.type,
    wordId: input.wordId,
    meta: input.meta,
    schemaVersion: 1,
  };
  void db.events
    .add(event)
    .then(() => {
      // Central mastery detection: if this event just completed the honest
      // rule for the word and no mastered event exists yet, append one.
      if (input.wordId != null) void maybeLogMastered(profileId, input.wordId);
      // Derived artifacts refresh lazily after any event.
      void refreshDailySnapshot(profileId);
    })
    .catch(() => {
      /* storage hiccup must never break the feature that logged */
    });
}

async function maybeLogMastered(profileId: number, wordId: number): Promise<void> {
  try {
    const w = await db.words.get(wordId);
    if (!w || !isWordMastered(w)) return;
    const already = await db.events
      .where('[profileId+type]')
      .equals([profileId, 'word_mastered'])
      .filter((e) => e.wordId === wordId)
      .first();
    if (already) return;
    await db.events.add({
      profileId,
      timestamp: Date.now(),
      type: 'word_mastered',
      wordId,
      schemaVersion: 1,
    });
    void refreshBadgesAfterEvent(profileId);
  } catch {
    /* non-fatal */
  }
}

async function refreshBadgesAfterEvent(profileId: number): Promise<void> {
  try {
    const [words, events, p] = await Promise.all([
      listWords(profileId),
      db.events.where('profileId').equals(profileId).toArray(),
      db.profiles.get(profileId),
    ]);
    if (p) await refreshBadges(profileId, words, events, Date.now(), p.stats.activityDays);
  } catch {
    /* non-fatal */
  }
}

// ---------- daily snapshot ----------

/**
 * Rebuild today's snapshot from live word state + today's events, then keep
 * the stored one in sync. Called on app open and after every logged event.
 * Calls are serialized per profile so concurrent events can never create
 * duplicate rows for the same day.
 */
const snapshotQueues = new Map<number, Promise<void>>();

export function refreshDailySnapshot(profileId: number, now = Date.now()): Promise<void> {
  const prev = snapshotQueues.get(profileId) ?? Promise.resolve();
  const next = prev
    .catch(() => undefined)
    .then(() => doRefreshDailySnapshot(profileId, now))
    .finally(() => {
      if (snapshotQueues.get(profileId) === next) snapshotQueues.delete(profileId);
    });
  snapshotQueues.set(profileId, next);
  return next;
}

async function doRefreshDailySnapshot(profileId: number, now: number): Promise<void> {
  try {
    const [words, dayEvents] = await Promise.all([
      listWords(profileId),
      db.events.where('[profileId+timestamp]').between([profileId, dayStart(now)], [profileId, now + 1]).toArray(),
    ]);
    const counts = countStates(words);
    const reviews = dayEvents.filter((e) => e.type === 'review_answered');
    const reviewCorrect = reviews.filter((e) => e.meta?.correct === true).length;
    const spellings = dayEvents.filter((e) => e.type === 'spelling_attempt');
    const spellCorrect = spellings.filter((e) => e.meta?.correct === true).length;
    const sentences = dayEvents.filter((e) => e.type === 'own_sentence_written').length;

    const snapshot: DailySnapshot = {
      profileId,
      date: dayKey(now),
      counts,
      totalWords: words.length,
      reviewsDone: reviews.length,
      reviewAccuracy: reviews.length > 0 ? reviewCorrect / reviews.length : undefined,
      sentencesWritten: sentences,
      spellingAccuracy: spellings.length > 0 ? spellCorrect / spellings.length : undefined,
      activeToday: dayEvents.length > 0 || words.some((w) => w.sections.some((s) => (s.completedAt ?? 0) >= dayStart(now))),
    };

    // Update-or-insert, and heal any duplicates a pre-fix version created.
    const matching = await db.snapshots.where('[profileId+date]').equals([profileId, snapshot.date]).toArray();
    if (matching.length > 0) {
      await db.snapshots.update(matching[0].id!, snapshot);
      const dupIds = matching.slice(1).map((m) => m.id!);
      if (dupIds.length > 0) await db.snapshots.bulkDelete(dupIds);
    } else {
      await db.snapshots.add(snapshot);
    }
  } catch {
    /* never break the app over analytics */
  }
}

/** Once-per-day hook (first open of the day): refresh + honest backfill. */
export async function ensureDailySnapshot(profileId: number, now = Date.now()): Promise<void> {
  const key = `snapshotDone:${profileId}:${dayKey(now)}`;
  if (await getMeta<boolean>(key)) {
    void refreshDailySnapshot(profileId, now);
    return;
  }
  await refreshDailySnapshot(profileId, now);
  await backfillHistory(profileId, now);
  await setMeta(key, true);
}

/**
 * Backfill past days from existing evidence only:
 *  - events log (rich when present)
 *  - section completions and dateAdded on words (older history)
 * Where nothing can be derived, the day stays a gap — no invented numbers.
 */
async function backfillHistory(profileId: number, now: number): Promise<void> {
  try {
    const [words, allEvents, existingSnaps] = await Promise.all([
      listWords(profileId),
      db.events.where('profileId').equals(profileId).toArray(),
      db.snapshots.where('profileId').equals(profileId).toArray(),
    ]);
    const existingDates = new Set(existingSnaps.map((s) => s.date));
    const todayKey = dayKey(now);

    // 1) derive per-day activity from words themselves (full history)
    const dayDerived = new Map<string, { added: number; sections: number; sentences: number }>();
    for (const w of words) {
      const addedDay = dayKeyOf(w.dateAdded);
      const row = dayDerived.get(addedDay) ?? { added: 0, sections: 0, sentences: 0 };
      row.added++;
      dayDerived.set(addedDay, row);
      for (const s of w.sections) {
        if (s.completedAt == null) continue;
        const k = dayKeyOf(s.completedAt);
        const r = dayDerived.get(k) ?? { added: 0, sections: 0, sentences: 0 };
        r.sections++;
        if (w.sections[2]?.completedAt === s.completedAt) r.sentences++;
        dayDerived.set(k, r);
      }
    }

    // 2) derive review/spelling accuracy from events (only when events exist)
    const evByDay = new Map<string, ProgressEvent[]>();
    for (const e of allEvents) {
      const k = dayKeyOf(e.timestamp);
      const list = evByDay.get(k) ?? [];
      list.push(e);
      evByDay.set(k, list);
    }

    // 3) write snapshots for days that have evidence
    const candidates = new Set<string>([...dayDerived.keys(), ...evByDay.keys()]);
    const toAdd: DailySnapshot[] = [];
    for (const key of candidates) {
      if (existingDates.has(key) || key === todayKey) continue;
      const derived = dayDerived.get(key) ?? { added: 0, sections: 0, sentences: 0 };
      const evs = evByDay.get(key) ?? [];
      const reviews = evs.filter((e) => e.type === 'review_answered');
      const reviewCorrect = reviews.filter((e) => e.meta?.correct === true).length;
      const spellings = evs.filter((e) => e.type === 'spelling_attempt');
      const spellCorrect = spellings.filter((e) => e.meta?.correct === true).length;
      toAdd.push({
        profileId,
        date: key,
        counts: { new: derived.added, learning: 0, review: 0, mastered: 0, recognized: 0 },
        totalWords: 0,
        reviewsDone: reviews.length,
        reviewAccuracy: reviews.length > 0 ? reviewCorrect / reviews.length : undefined,
        sentencesWritten: derived.sentences,
        spellingAccuracy: spellings.length > 0 ? spellCorrect / spellings.length : undefined,
        activeToday: derived.added > 0 || derived.sections > 0 || evs.length > 0,
      });
    }
    if (toAdd.length > 0) await db.snapshots.bulkAdd(toAdd);

    // 4) seed word_mastered events for words that ALREADY meet the honest rule
    //    (stamped today once, so charts/goals/badges see them).
    const masteredStampKey = `masteredStamped:${profileId}`;
    if (!(await getMeta<boolean>(masteredStampKey))) {
      const masteredIds = words.filter(isWordMastered).map((w) => w.id!);
      const already = new Set(
        allEvents.filter((e) => e.type === 'word_mastered').map((e) => e.wordId ?? -1),
      );
      const stamp = masteredIds.filter((id) => !already.has(id));
      if (stamp.length > 0) {
        await db.events.bulkAdd(
          stamp.map((wordId) => ({
            profileId,
            timestamp: now,
            type: 'word_mastered' as const,
            wordId,
            schemaVersion: 1,
          })),
        );
      }
      await setMeta(masteredStampKey, true);
    }

    // 5) evaluate badges once per day too
    await refreshBadges(profileId, words, allEvents, now);
  } catch {
    /* analytics must never break the app */
  }
}

function dayStart(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dayKeyOf(ts: number): string {
  return dayKey(ts);
}

// ---------- goals: defined in repo.ts (owns meta store); re-exported for convenience ----------

// ---------- badges ----------

export async function refreshBadges(
  profileId: number,
  words: import('./models').Word[],
  events: ProgressEvent[],
  now: number,
  activityDays: string[] = [],
): Promise<void> {
  try {
    const evaluations = evaluateBadges(words, events, activityDays, now);
    const earned = evaluations.filter((e) => e.earned);
    const existing = await db.badges.where('profileId').equals(profileId).toArray();
    const have = new Set(existing.map((b) => b.badgeId));
    const fresh = earned.filter((e) => !have.has(e.badgeId));
    if (fresh.length > 0) {
      const rows: ProgressBadgeState[] = fresh.map((e) => ({ profileId, badgeId: e.badgeId, earnedAt: now }));
      await db.badges.bulkAdd(rows);
      await setMeta(BADGES_KEY, now); // cheap "changed" pointer
    }
  } catch {
    /* non-fatal */
  }
}

export async function listEarnedBadges(profileId: number): Promise<ProgressBadgeState[]> {
  return db.badges.where('profileId').equals(profileId).toArray();
}

// ---------- tutor reports ----------

export async function importTutorReports(reports: ProgressReport[]): Promise<number> {
  const rows: TutorReport[] = reports.map((report) => ({ importedAt: Date.now(), report }));
  await db.tutorReports.bulkAdd(rows);
  return rows.length;
}

export async function listTutorReports(): Promise<TutorReport[]> {
  return db.tutorReports.orderBy('importedAt').toArray();
}

export async function clearTutorReports(): Promise<void> {
  await db.tutorReports.clear();
}

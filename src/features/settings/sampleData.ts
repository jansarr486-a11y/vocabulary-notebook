import { db } from '../../db/db';
import { createReview, DEFAULT_INTERVALS, emptySections, type LevelTag, type Word, type WordSection } from '../../db/models';
import { recordActivity } from '../../db/schedule';

interface Spec {
  word: string;
  phonetic?: string;
  pos: string;
  tags: LevelTag[];
  course?: string;
  /** completed section texts, in order (sections 1..n done) */
  done: string[];
  /** days ago the LAST completion happened */
  lastDoneDaysAgo: number;
  /** extra note text for section 4 (done immediately with s3) */
  note?: string;
  own?: string;
}

const SPECS: Spec[] = [
  {
    word: 'curious',
    phonetic: '/ˈkjʊəriəs/',
    pos: 'adjective',
    tags: ['A2'],
    course: 'Term 1 — Fall 2026',
    done: [],
    lastDoneDaysAgo: 0,
  },
  {
    word: 'generous',
    phonetic: '/ˈdʒenərəs/',
    pos: 'adjective',
    tags: ['A2', 'B1'],
    done: ['Willing to give more of something, such as money or time, than is expected.'],
    lastDoneDaysAgo: 1,
  },
  {
    word: 'compare',
    phonetic: '/kəmˈpeə/',
    pos: 'verb',
    tags: ['B1'],
    done: ['To examine how two things are similar or different.'],
    lastDoneDaysAgo: 5,
  },
  {
    word: 'habit',
    phonetic: '/ˈhæbɪt/',
    pos: 'noun',
    tags: ['A1', 'A2'],
    course: 'Term 1 — Fall 2026',
    done: [
      'Something you do often and regularly, sometimes without knowing that you are doing it.',
      'Reading before bed became my favourite habit.',
    ],
    lastDoneDaysAgo: 6,
  },
  {
    word: 'reluctant',
    phonetic: '/rɪˈlʌktənt/',
    pos: 'adjective',
    tags: ['IELTS'],
    done: ['Not willing to do something because you are unsure or do not want to do it.'],
    lastDoneDaysAgo: 2,
  },
  {
    word: 'achieve',
    phonetic: '/əˈtʃiːv/',
    pos: 'verb',
    tags: ['B2', 'IELTS'],
    done: [
      'To succeed in doing or getting something you worked for.',
      'She achieved a band 7 in IELTS after months of practice.',
      'I want to achieve a high score on my exam this year.',
    ],
    lastDoneDaysAgo: 9,
    note: 'achieve → achievement (noun). Think: "a CHIEF achieves goals".',
  },
  {
    word: 'environment',
    phonetic: '/ɪnˈvaɪrənmənt/',
    pos: 'noun',
    tags: ['B1', 'TOEFL'],
    done: [],
    lastDoneDaysAgo: 0,
  },
  {
    word: 'perseverance',
    phonetic: '/ˌpɜːsɪˈvɪərəns/',
    pos: 'noun',
    tags: ['IELTS'],
    done: [
      'Continuing to try hard despite difficulties.',
      'His perseverance paid off when he finally passed the speaking test.',
    ],
    lastDoneDaysAgo: 3,
  },
];

function buildSections(spec: Spec): WordSection[] {
  const sections = emptySections();
  const intervals = DEFAULT_INTERVALS;
  const gaps = [intervals.s1, intervals.s2, intervals.s3, intervals.s4];
  let prevCompleted: number | null = null;
  for (let i = 0; i < spec.done.length; i++) {
    const completedAt = Date.now() - spec.lastDoneDaysAgo * 86_400_000;
    sections[i] = { text: spec.done[i], completedAt };
    prevCompleted = completedAt;
    if (i + 1 < 4 && sections[i + 1].unlockedAt == null) {
      const gap = gaps[i + 1] ?? 0;
      sections[i + 1].unlockedAt = completedAt + gap * 86_400_000;
    }
  }
  if (spec.done.length === 3 && spec.own) sections[2].text = spec.own;
  if (spec.done.length >= 3 && spec.note) {
    sections[3] = { text: spec.note, completedAt: prevCompleted ?? Date.now() };
  }
  return sections;
}

/** Adds 8 demo words (and a small streak) to a profile. */
export async function loadSamplePack(profileId: number): Promise<number> {
  const words: Word[] = SPECS.map((spec) => ({
    profileId,
    word: spec.word,
    wordLower: spec.word.toLowerCase(),
    phonetic: spec.phonetic,
    partOfSpeech: spec.pos,
    levelTags: spec.tags,
    courseTag: spec.course,
    dateAdded: Date.now() - (spec.lastDoneDaysAgo + 1) * 86_400_000,
    sections: buildSections(spec),
    review: createReview(),
    schemaVersion: 1,
  }));
  await db.words.bulkAdd(words);

  // seed a 2-day streak so the counter shows life
  const p = await db.profiles.get(profileId);
  if (p) {
    const now = Date.now();
    const day = (offset: number) => {
      const d = new Date(now - offset * 86_400_000);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const stats = recordActivity({ ...p.stats, activityDays: [day(1)] }, now);
    await db.profiles.update(profileId, { stats });
  }
  return words.length;
}

import { getCachedDictionaryEntry, putDictionaryEntry } from '../../db/repo';

export interface Suggestion {
  definition: string;
  example?: string;
  phonetic?: string;
  partOfSpeech?: string;
  fromCache: boolean;
}

// api.datamuse.com (WordNet-backed) replaced api.dictionaryapi.dev, which is
// unreachable from some proxied networks. `md=dp` adds defs ("pos\tdefinition")
// and a `seq` joined pronunciation. Datamuse has no example sentences, so
// `example` stays empty.
const API = 'https://api.datamuse.com/words';
const TIMEOUT_MS = 8000;

const POS_NAMES: Record<string, string> = {
  n: 'noun',
  v: 'verb',
  adj: 'adjective',
  adv: 'adverb',
  s: 'adjective', // WordNet "satellite adjective"
  r: 'adverb',
  u: '',
};

interface DatamuseWord {
  word: string;
  tags?: string[];
  defs?: string[];
  seq?: string[];
}

function normalizePhonetic(seq: string[]): string | undefined {
  // seq joins AmE/BrE pronunciations ("ˈæbs(ə)ns , abˈsiː ; ˈæbsənt") and may
  // carry stray control characters — keep printable text only.
  const joined = seq
    .join(' ; ')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return joined || undefined;
}

const NOT_FOUND = new Error('404 no definition found');

/**
 * Look up a word. Order: IndexedDB cache → network (cached by the service
 * worker too). Throws on failure; callers must degrade gracefully — this
 * feature is optional and the app is fully usable without it.
 */
export async function suggestDefinition(rawWord: string): Promise<Suggestion> {
  const wordLower = rawWord.trim().toLowerCase();

  const cached = await getCachedDictionaryEntry(wordLower);
  if (cached) {
    if (cached.definition) {
      return {
        definition: cached.definition,
        example: cached.example,
        phonetic: cached.phonetic,
        partOfSpeech: cached.partOfSpeech,
        fromCache: true,
      };
    }
    // cached "not found" marker (fetchedAt 0) — don't re-fetch failures
    if (cached.fetchedAt === 0) throw new Error('No suggestion available (offline or not found)');
  }

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API}?sp=${encodeURIComponent(wordLower)}&md=dp&max=1`, {
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Datamuse ${res.status}`);
    const data = (await res.json()) as DatamuseWord[];
    const entry = Array.isArray(data) ? data[0] : undefined;
    const rawDef = entry?.defs?.find((d) => d.split('\t')[1]?.trim());

    if (!entry || !rawDef) throw NOT_FOUND;
    // `sp=` also matches spelled-like words — a typo would surface a real but
    // irrelevant definition, so only accept the exact word back.
    if (entry.word.toLowerCase() !== wordLower) throw NOT_FOUND;

    const [posTag = '', ...rest] = rawDef.split('\t');
    const definition = rest.join('\t').trim();
    const pos = POS_NAMES[posTag.trim()] ?? '';
    const phonetic = entry.seq ? normalizePhonetic(entry.seq) : undefined;

    await putDictionaryEntry({
      wordLower,
      fetchedAt: Date.now(),
      definition,
      phonetic,
      partOfSpeech: pos || undefined,
    });

    return { definition, phonetic, partOfSpeech: pos || undefined, fromCache: false };
  } catch (err) {
    // Remember misses so we don't hammer the API for nonsense words while offline
    if (err instanceof Error && err.message.includes('404')) {
      await putDictionaryEntry({ wordLower, fetchedAt: 0 }).catch(() => undefined);
    }
    throw err;
  } finally {
    window.clearTimeout(timer);
  }
}

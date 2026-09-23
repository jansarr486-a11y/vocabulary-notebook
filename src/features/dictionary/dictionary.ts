import { getCachedDictionaryEntry, putDictionaryEntry } from '../../db/repo';

export interface Suggestion {
  definition: string;
  example?: string;
  phonetic?: string;
  partOfSpeech?: string;
  fromCache: boolean;
}

const API = 'https://api.dictionaryapi.dev/api/v2/entries/en/';
const TIMEOUT_MS = 6000;

interface ApiDefinition {
  definition: string;
  example?: string;
}
interface ApiMeaning {
  partOfSpeech: string;
  definitions: ApiDefinition[];
}
interface ApiEntry {
  word: string;
  phonetic?: string;
  phonetics?: { text?: string; audio?: string }[];
  meanings?: ApiMeaning[];
}

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
    const res = await fetch(API + encodeURIComponent(wordLower), { signal: controller.signal });
    if (!res.ok) throw new Error(`Dictionary API ${res.status}`);
    const data = (await res.json()) as ApiEntry[];
    if (!Array.isArray(data) || data.length === 0) throw new Error('Empty result');

    // Prefer a meaning whose definition ships with an example.
    let best: { def: string; ex?: string; pos?: string } | undefined;
    let fallback: { def: string; ex?: string; pos?: string } | undefined;
    for (const entry of data) {
      for (const meaning of entry.meanings ?? []) {
        for (const d of meaning.definitions ?? []) {
          if (!d.definition) continue;
          if (!fallback) fallback = { def: d.definition, ex: d.example, pos: meaning.partOfSpeech };
          if (d.example && !best) {
            best = { def: d.definition, ex: d.example, pos: meaning.partOfSpeech };
            break;
          }
        }
        if (best) break;
      }
      if (best) break;
    }
    const chosen = best ?? fallback;
    if (!chosen) throw new Error('No definitions in response');

    const phonetic = data.find((e) => e.phonetic)?.phonetic ?? data[0]?.phonetics?.find((p) => p.text)?.text;

    await putDictionaryEntry({
      wordLower,
      fetchedAt: Date.now(),
      definition: chosen.def,
      example: chosen.ex,
      phonetic,
      partOfSpeech: chosen.pos,
    });

    return { definition: chosen.def, example: chosen.ex, phonetic, partOfSpeech: chosen.pos, fromCache: false };
  } catch (err) {
    // Remember 404s so we don't hammer the API for nonsense words while offline
    if (err instanceof Error && err.message.includes('404')) {
      await putDictionaryEntry({ wordLower, fetchedAt: 0 }).catch(() => undefined);
    }
    throw err;
  } finally {
    window.clearTimeout(timer);
  }
}

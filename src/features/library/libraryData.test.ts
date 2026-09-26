import { describe, expect, it } from 'vitest';
import {
  WORD_LIBRARY,
  bookKey,
  collectionLevels,
  collectionWords,
  findBook,
  isMixedLevels,
} from './libraryData';
import { wordFromLibrary } from '../../db/repo';
import { isSectionUnlocked } from '../../db/schedule';
import { DEFAULT_INTERVALS } from '../../db/models';

/** Guard rails for the static, tutor-edited data file. */
describe('libraryData invariants', () => {
  it('has at least one collection', () => {
    expect(WORD_LIBRARY.length).toBeGreaterThan(0);
  });

  it('every collection has a non-empty books array', () => {
    for (const c of WORD_LIBRARY) {
      expect(c.books.length, `collection "${c.id}"`).toBeGreaterThan(0);
    }
  });

  it('ids are unique across collections and books', () => {
    const collectionIds = WORD_LIBRARY.map((c) => c.id);
    expect(new Set(collectionIds).size).toBe(collectionIds.length);

    const bookIds = WORD_LIBRARY.flatMap((c) => c.books.map((b) => `${c.id}/${b.id}`));
    expect(new Set(bookIds).size).toBe(bookIds.length);
  });

  it('every word inside a book has a headword and a definition', () => {
    for (const c of WORD_LIBRARY) {
      for (const b of c.books) {
        for (const w of b.words) {
          expect(w.word.trim().length, `${c.id}/${b.id} — a word is missing its headword`).toBeGreaterThan(0);
          expect(w.definition.trim().length, `${c.id}/${b.id} — "${w.word}" is missing a definition`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('words are unique inside a book (duplicate adds would fight the notebook)', () => {
    for (const c of WORD_LIBRARY) {
      for (const b of c.books) {
        const lowered = b.words.map((w) => w.word.toLowerCase());
        expect(new Set(lowered).size, `book "${c.id}/${b.id}"`).toBe(lowered.length);
      }
    }
  });

  it('every book resolves to a level (its own, or the collection’s shared one)', () => {
    for (const c of WORD_LIBRARY) {
      const levels = collectionLevels(c);
      for (const b of c.books) {
        const level = b.level ?? c.level;
        expect(level ?? levels.length, `book "${c.id}/${b.id}" has no level anywhere`).toBeTruthy();
      }
    }
  });

  it('mixed-level detection matches the data', () => {
    const iali = WORD_LIBRARY.find((c) => c.id === 'iran-america-language-institute');
    expect(iali).toBeDefined();
    expect(isMixedLevels(iali!)).toBe(true);

    const ielts = WORD_LIBRARY.find((c) => c.id === 'ielts-essential-barron');
    expect(isMixedLevels(ielts!)).toBe(false);
  });

  it('resolves a book by its composite key', () => {
    const ref = findBook(bookKey('iran-america-language-institute', 'iali-intermediate-1'));
    expect(ref?.book.title).toBe('Intermediate 1');
    expect(ref?.level).toBe('B1');

    expect(findBook('nope/also-nope')).toBeUndefined();
    expect(findBook('only-one-segment')).toBeUndefined();
  });

  it('collectionWords flattens across all books', () => {
    const iali = WORD_LIBRARY.find((c) => c.id === 'iran-america-language-institute')!;
    expect(collectionWords(iali).length).toBe(iali.books.reduce((n, b) => n + b.words.length, 0));
  });
});

describe('wordFromLibrary', () => {
  const source = {
    collectionId: 'c1',
    collectionTitle: 'Collection One',
    bookId: 'b1',
    bookTitle: 'Book One',
  };
  const entry = {
    word: 'Mitigate ',
    definition: 'to make something bad less severe',
    example: 'Trees mitigate heat.',
    persianMeaning: 'کاهش دادن',
    partOfSpeech: 'verb',
    phonetic: '/ˈmɪtɪɡeɪt/',
  };

  it('copies all library fields into a fresh notebook word', () => {
    const w = wordFromLibrary(7, entry, source, 'IELTS');
    expect(w.profileId).toBe(7);
    expect(w.word).toBe('Mitigate'); // trimmed
    expect(w.wordLower).toBe('mitigate');
    expect(w.phonetic).toBe('/ˈmɪtɪɡeɪt/');
    expect(w.partOfSpeech).toBe('verb');
    expect(w.persianMeaning).toBe('کاهش دادن');
    expect(w.levelTags).toEqual(['IELTS']);
    expect(w.librarySource).toEqual(source);
  });

  it('pre-fills section 1 but leaves section 3 (own sentence) empty', () => {
    const w = wordFromLibrary(7, entry, source, 'B2');
    expect(w.sections[0].text).toBe(entry.definition);
    expect(w.sections[0].completedAt).toBeUndefined();
    expect(w.sections[2].text).toBe('');
  });

  it('seeds the dictionary example as an editable section-2 draft', () => {
    const w = wordFromLibrary(7, entry, source, 'B2');
    expect(w.sections[1].text).toBe('Trees mitigate heat.');
  });

  it('starts the normal day-0 unlock cycle (section 1 open immediately, section 2 locked)', () => {
    const now = 1_758_000_000_000;
    const w = wordFromLibrary(7, entry, source, 'B2', now);
    // Section 1 is open on day 0; section 2 only opens once section 1 is completed.
    expect(isSectionUnlocked(1, w, DEFAULT_INTERVALS, now)).toBe(true);
    expect(isSectionUnlocked(2, w, DEFAULT_INTERVALS, now)).toBe(false);
  });

  it('references its source in the course tag for quick filtering', () => {
    const w = wordFromLibrary(7, entry, source, 'B2');
    expect(w.courseTag).toBe('Collection One — Book One');
  });

  it('is fully independent from the library entry (defensive copy)', () => {
    const w = wordFromLibrary(7, entry, source, 'B2');
    w.sections[0].text = 'edited by the student';
    expect(entry.definition).toBe('to make something bad less severe');
  });
});

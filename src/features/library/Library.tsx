import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useProfiles } from '../../context/ProfileContext';
import { addLibraryWords, listWords } from '../../db/repo';
import { LevelBadge } from '../../components/ui/Chips';
import { SpeakerButton } from '../../components/ui/SpeakerButton';
import { useToast } from '../../components/ui/ToastProvider';
import {
  WORD_LIBRARY,
  bookKey,
  collectionLevels,
  collectionWords,
  findBook,
  isMixedLevels,
  type LibraryBook,
  type LibraryCollection,
  type LibraryLevel,
  type LibraryWord,
} from './libraryData';

/**
 * Word Library — a curated, read-only word bank the tutor extends by editing
 * libraryData.ts. Browsing costs no API calls; adding copies a word into the
 * student's notebook where it starts the normal 4-section unlock cycle.
 */

interface CardCounts {
  total: number;
  added: number;
}

function useAddedWordSet(profileId: number | undefined) {
  const words = useLiveQuery(
    () => (profileId != null ? listWords(profileId) : Promise.resolve([])),
    [profileId],
  );
  return useMemo(() => new Set((words ?? []).map((w) => w.wordLower)), [words]);
}

function countsFor(words: LibraryWord[], added: Set<string>): CardCounts {
  return { total: words.length, added: words.filter((w) => added.has(w.word.trim().toLowerCase())).length };
}

/** Level badge(s) for a collection card; collapses to one tag when shared. */
function CollectionLevelBadges({ collection }: { collection: LibraryCollection }) {
  if (isMixedLevels(collection)) {
    return (
      <span className="chip lib-chip-mixed" title={collectionLevels(collection).join(', ')}>
        Mixed levels
      </span>
    );
  }
  const [level] = collectionLevels(collection);
  return level ? <LevelBadge tag={level} /> : null;
}

function Breadcrumb({ trail }: { trail: { label: string; to?: string }[] }) {
  return (
    <nav className="lib-breadcrumb" aria-label="Breadcrumb">
      {trail.map((t, i) => (
        <span key={i} className="lib-crumb-item">
          {i > 0 && <span className="lib-crumb-sep" aria-hidden>›</span>}
          {t.to ? (
            <Link to={t.to} className="lib-crumb-link">
              {t.label}
            </Link>
          ) : (
            <span className="lib-crumb-here" aria-current="page">
              {t.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}

/** Strip order for the A–Z margin filter. */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

/** First letter of a headword, for the A–Z filter. */
const firstLetter = (w: LibraryWord) => w.word.trim().charAt(0).toUpperCase();

/**
 * Vertical A–Z margin tab beside the word list. A hard filter (not scroll-to):
 * picking a letter re-renders the list with only those words. Letters with no
 * matches in the book are disabled. Sticks while the list scrolls.
 */
function AlphaStrip({
  active,
  available,
  onPick,
}: {
  active: string | null;
  available: Set<string>;
  onPick: (letter: string | null) => void;
}) {
  return (
    <nav className="alpha-strip" aria-label="Filter words by first letter">
      <button
        type="button"
        className={`alpha-letter ${active === null ? 'active' : ''}`}
        aria-pressed={active === null}
        onClick={() => onPick(null)}
      >
        All
      </button>
      {ALPHABET.map((L) => {
        const has = available.has(L);
        const isActive = active === L;
        return (
          <button
            key={L}
            type="button"
            className={`alpha-letter ${isActive ? 'active' : ''}`}
            disabled={!has && !isActive}
            aria-pressed={isActive}
            aria-label={has ? `Show only words starting with ${L}` : `No words starting with ${L}`}
            title={has ? `${L}` : undefined}
            onClick={() => onPick(L)}
          >
            {L}
          </button>
        );
      })}
    </nav>
  );
}

function WordRow({
  entry,
  alreadyAdded,
  selected,
  onToggle,
}: {
  entry: LibraryWord;
  alreadyAdded: boolean;
  selected: boolean;
  onToggle: (w: LibraryWord) => void;
}) {
  return (
    <li className={`lib-word-row paper-card ${alreadyAdded ? 'lib-word-added' : ''}`}>
      <div className="lib-word-main">
        <div className="lib-word-title">
          <span className="lib-word-headword">{entry.word}</span>
          <SpeakerButton text={entry.word} small />
          {entry.partOfSpeech && <span className="chip lib-chip-pos">{entry.partOfSpeech}</span>}
          {entry.phonetic && <span className="lib-phonetic">{entry.phonetic}</span>}
        </div>
        <p className="lib-word-def">{entry.definition}</p>
        {entry.persianMeaning && <p className="lib-word-fa">{entry.persianMeaning}</p>}
        {entry.example && <p className="lib-word-example">“{entry.example}”</p>}
      </div>
      <div className="lib-word-action">
        {alreadyAdded ? (
          <span className="chip lib-chip-added" title="This word is already in your notebook.">
            ✓ Already added
          </span>
        ) : (
          <label className={`lib-check ${selected ? 'checked' : ''}`}>
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggle(entry)}
            />
            <span>{selected ? 'Selected' : 'Add'}</span>
          </label>
        )}
      </div>
    </li>
  );
}

function WordListView({
  book,
  collection,
  level,
  trail,
  onBack,
}: {
  book: LibraryBook;
  collection: LibraryCollection;
  level: LibraryLevel | undefined;
  trail: { label: string; to?: string }[];
  onBack: () => void;
}) {
  const { profile } = useProfiles();
  const { toast } = useToast();
  const navigate = useNavigate();
  const added = useAddedWordSet(profile?.id);
  const [selected, setSelected] = useState<LibraryWord[]>([]);
  const [query, setQuery] = useState('');
  /** Active A–Z hard filter; null = All. */
  const [letter, setLetter] = useState<string | null>(null);

  const selectedSet = useMemo(() => new Set(selected.map((w) => w.word)), [selected]);
  // Alphabetical by headword — the strip filter assumes (and preserves) A–Z order.
  const sortedWords = useMemo(
    () => [...book.words].sort((a, b) => a.word.localeCompare(b.word, 'en', { sensitivity: 'base' })),
    [book.words],
  );
  const available = sortedWords.filter((w) => !added.has(w.word.trim().toLowerCase()));
  const selectedAvailable = selected.filter((w) => available.includes(w));

  // First letters that actually exist in this book — the rest of the strip is disabled.
  const lettersInBook = useMemo(() => new Set(sortedWords.map(firstLetter)), [sortedWords]);

  // Search box + A–Z letter combine with AND logic.
  const q = query.trim().toLowerCase();
  const visible = useMemo(() => {
    let list = sortedWords;
    if (letter) list = list.filter((w) => firstLetter(w) === letter);
    if (q) {
      list = list.filter(
        (w) =>
          w.word.toLowerCase().includes(q) ||
          w.definition.toLowerCase().includes(q) ||
          (w.persianMeaning ?? '').includes(q),
      );
    }
    return list;
  }, [sortedWords, letter, q]);
  const visibleAvailable = visible.filter((w) => !added.has(w.word.trim().toLowerCase()));

  const pickLetter = (L: string | null) => setLetter((prev) => (prev === L ? null : L));

  const toggle = (w: LibraryWord) => {
    setSelected((prev) => {
      const key = w.word;
      const exists = prev.some((x) => x.word === key);
      return exists ? prev.filter((x) => x.word !== key) : [...prev, w];
    });
  };

  // Select-all respects the search filter: it ticks every visible word not yet added.
  const allSelected =
    visibleAvailable.length > 0 && visibleAvailable.every((w) => selectedSet.has(w.word));
  const selectAll = () => setSelected(allSelected ? [] : visibleAvailable);

  const addSelected = async () => {
    if (!profile || selectedAvailable.length === 0) return;
    const n = await addLibraryWords(
      profile.id!,
      selectedAvailable,
      {
        collectionId: collection.id,
        collectionTitle: collection.title,
        bookId: book.id,
        bookTitle: book.title,
      },
      level,
    );
    setSelected([]);
    toast(
      n === 1
        ? `“${selectedAvailable[0].word}” added to your notebook! 🌱`
        : `${n} words added to your notebook! 🌱`,
    );
    navigate('/notebook');
  };

  return (
    <div>
      <Breadcrumb trail={trail} />
      <div className="notebook-head">
        <div>
          <h1 dir="auto">{book.title}</h1>
          <p className="faint" dir="auto" style={{ marginTop: 2 }}>
            {collection.title}
            {level ? ` · ${level}` : ''}
          </p>
        </div>
        <button className="btn btn-sm" onClick={onBack}>
          ← Back
        </button>
      </div>

      <p className="faint" style={{ marginBottom: 'var(--sp-4)' }}>
        {countsFor(book.words, added).added} / {book.words.length} added to your notebook — tick words and press
        the button to copy them over.
      </p>

      <div className="lib-batch-bar">
        <input
          className="input lib-search"
          type="search"
          placeholder="🔍 Search this book…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search words in this book"
        />
        <span className="muted" style={{ fontSize: '0.9rem' }}>
          {selectedAvailable.length > 0
            ? `${selectedAvailable.length} word${selectedAvailable.length === 1 ? '' : 's'} selected`
            : 'Tick words to add several at once'}
        </span>
        <div className="lib-batch-actions">
          {available.length > 0 && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={selectAll}
              title={
                allSelected
                  ? 'Clear the current selection'
                  : `Select all ${visibleAvailable.length} visible words that are not in your notebook yet`
              }
            >
              {allSelected
                ? '✕ Clear selection'
                : `☑ Select all (${visibleAvailable.length})`}
            </button>
          )}
          <button
            className="btn btn-primary btn-sm"
            disabled={selectedAvailable.length === 0}
            onClick={() => void addSelected()}
          >
            ＋ Add selected words
          </button>
        </div>
      </div>

      <div className="lib-list-layout">
        <div className="lib-list-main">
          {letter && (
            <p className="lib-filter-note" role="status">
              <strong>{visible.length}</strong> word{visible.length === 1 ? '' : 's'} starting with{' '}
              <span className="lib-filter-letter">{letter}</span>
              {q ? ' and matching your search' : ''}
              <button type="button" className="lib-filter-clear" onClick={() => setLetter(null)}>
                show all
              </button>
            </p>
          )}
          <ul className="lib-word-list">
            {visible.map((entry) => (
              <WordRow
                key={entry.word}
                entry={entry}
                alreadyAdded={added.has(entry.word.trim().toLowerCase())}
                selected={selectedSet.has(entry.word)}
                onToggle={toggle}
              />
            ))}
            {book.words.length > 0 && visible.length === 0 && (
              <div className="empty-state">
                <span className="doodle">🔍</span>
                <h3>No words match{q ? ` “${query}”` : ''}</h3>
                <p>Try another spelling — or search the Persian meaning too.</p>
              </div>
            )}
            {book.words.length === 0 && (
              <div className="empty-state">
                <span className="doodle">📖</span>
                <h3>No words here yet</h3>
                <p>The tutor will fill this book soon.</p>
              </div>
            )}
          </ul>
        </div>
        <AlphaStrip active={letter} available={lettersInBook} onPick={pickLetter} />
      </div>
    </div>
  );
}

export function Library() {
  const { collectionId, bookId } = useParams();
  const { profile } = useProfiles();
  const added = useAddedWordSet(profile?.id);
  const navigate = useNavigate();

  // Deep-linked straight to a book: /library/:collectionId/:bookId
  const ref = useMemo(
    () => (collectionId && bookId ? findBook(bookKey(collectionId, bookId)) : undefined),
    [collectionId, bookId],
  );

  if (ref) {
    return (
      <WordListView
        book={ref.book}
        collection={ref.collection}
        level={ref.level}
        trail={[
          { label: 'Word Library', to: '/library' },
          { label: ref.collection.title, to: ref.collection.books.length > 1 ? `/library/${ref.collection.id}` : undefined },
          { label: ref.book.title },
        ]}
        onBack={() => {
          if (ref.collection.books.length > 1) navigate(`/library/${ref.collection.id}`);
          else navigate('/library');
        }}
      />
    );
  }

  // Sub-list: a multi-book collection
  if (collectionId) {
    const collection = WORD_LIBRARY.find((c) => c.id === collectionId);
    if (collection) {
      return (
        <div>
          <Breadcrumb
            trail={[{ label: 'Word Library', to: '/library' }, { label: collection.title }]}
          />
      <div className="notebook-head">
        <div>
          <h1 dir="auto">{collection.title}</h1>
          {collection.description && <p className="faint" dir="auto">{collection.description}</p>}
        </div>
      </div>
          <div className="lib-collection-grid">
            {collection.books.map((book) => {
              const counts = countsFor(book.words, added);
              const bookLevel = book.level ?? collection.level;
              return (
                <Link key={book.id} to={`/library/${collection.id}/${book.id}`} className="lib-collection-card">
                  <span className="lib-card-title" dir="auto">{book.title}</span>
                  <span className="lib-card-meta">
                    {bookLevel && <LevelBadge tag={bookLevel} />}
                    <span className="faint">{counts.total} words</span>
                  </span>
                  <span className="lib-card-counts">
                    <strong>{counts.added} of {counts.total}</strong> added to notebook
                  </span>
                  <span className="lib-card-bar" aria-hidden>
                    <i style={{ width: `${counts.total > 0 ? (counts.added / counts.total) * 100 : 0}%` }} />
                  </span>
                  <span className="lib-card-open" aria-hidden>
                    Open book →
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      );
    }
  }

  // Top level: all collections
  return (
    <div>
      <div className="notebook-head">
        <div>
          <h1>📚 Word Library</h1>
          <p className="faint">Curated word lists chosen by your tutor — read-only, works offline.</p>
        </div>
      </div>

      <div className="lib-collection-grid">
        {WORD_LIBRARY.map((collection) => {
          const counts = countsFor(collectionWords(collection), added);
          return (
            <Link
              key={collection.id}
              to={
                collection.books.length === 1
                  ? `/library/${collection.id}/${collection.books[0].id}`
                  : `/library/${collection.id}`
              }
              className="lib-collection-card"
            >
              <span className="lib-card-title" dir="auto">{collection.title}</span>
              {collection.description && <span className="lib-card-desc" dir="auto">{collection.description}</span>}
              <span className="lib-card-meta">
                <CollectionLevelBadges collection={collection} />
                <span className="faint">
                  {collection.books.length > 1 ? `${collection.books.length} books · ` : ''}
                  {counts.total} words
                </span>
              </span>
              <span className="lib-card-counts">
                <strong>{counts.added} of {counts.total}</strong> added to notebook
              </span>
              <span className="lib-card-bar" aria-hidden>
                <i style={{ width: `${counts.total > 0 ? (counts.added / counts.total) * 100 : 0}%` }} />
              </span>
              <span className="lib-card-open" aria-hidden>
                {collection.books.length > 1 ? 'Browse books →' : 'Open book →'}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

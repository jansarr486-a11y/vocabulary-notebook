import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useProfiles } from '../../context/ProfileContext';
import { addLibraryWords, addLibraryWordsForReview, listWords } from '../../db/repo';
import { logProgressEvent } from '../../db/progressRepo';
import { LevelBadge } from '../../components/ui/Chips';
import { SpeakerButton } from '../../components/ui/SpeakerButton';
import { useToast } from '../../components/ui/ToastProvider';
import { useI18n } from '../../i18n';
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
  const { t } = useI18n();
  if (isMixedLevels(collection)) {
    return (
      <span className="chip lib-chip-mixed" title={collectionLevels(collection).join(', ')}>
        {t('lib.mixedLevels')}
      </span>
    );
  }
  const [level] = collectionLevels(collection);
  return level ? <LevelBadge tag={level} /> : null;
}

function Breadcrumb({ trail }: { trail: { label: string; to?: string }[] }) {
  const { t } = useI18n();
  return (
    <nav className="lib-breadcrumb" aria-label={t('lib.breadcrumb')}>
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
  const { t } = useI18n();
  return (
    <nav className="alpha-strip" aria-label={t('lib.alphaAria')}>
      <button
        type="button"
        className={`alpha-letter ${active === null ? 'active' : ''}`}
        aria-pressed={active === null}
        onClick={() => onPick(null)}
      >
        {t('lib.all')}
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
            aria-label={has ? t('lib.alphaHas', { L }) : t('lib.alphaNone', { L })}
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
  const { t } = useI18n();
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
          <span className="chip lib-chip-added" title={t('lib.alreadyAddedTitle')}>
            {t('lib.alreadyAdded')}
          </span>
        ) : (
          <label className={`lib-check ${selected ? 'checked' : ''}`}>
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggle(entry)}
            />
            <span>{selected ? t('lib.selected') : t('lib.add')}</span>
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
  // When on, added words skip the 3-step notebook cycle: they arrive with the
  // definition section already completed and can be reviewed right away.
  const [directToReview, setDirectToReview] = useState(false);
  const { profile } = useProfiles();
  const { toast } = useToast();
  const { t } = useI18n();
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
    const source = {
      collectionId: collection.id,
      collectionTitle: collection.title,
      bookId: book.id,
      bookTitle: book.title,
    };
    const n = directToReview
      ? await addLibraryWordsForReview(profile.id!, selectedAvailable, source, level)
      : await addLibraryWords(profile.id!, selectedAvailable, source, level);
    setSelected([]);
    // Progress logging: one word_added event per fresh word (fire-and-forget).
    if (profile?.id != null && n > 0) {
      for (let i = 0; i < n; i++) {
        logProgressEvent(profile.id, { type: 'word_added', meta: { source: 'library' } });
      }
    }
    const key =
      n === 1
        ? directToReview
          ? 'lib.addedOneReview'
          : 'lib.addedOne'
        : directToReview
          ? 'lib.addedManyReview'
          : 'lib.addedMany';
    toast(t(key, n === 1 ? { word: selectedAvailable[0].word } : { n }));
    navigate(directToReview ? '/review' : '/notebook');
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
          {t('lib.back')}
        </button>
      </div>

      <p className="faint" style={{ marginBottom: 'var(--sp-4)' }}>
        {t('lib.progress', { added: countsFor(book.words, added).added, total: book.words.length })}
      </p>

      <div className="lib-batch-bar">
        <input
          className="input lib-search"
          type="search"
          placeholder={t('lib.searchPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={t('lib.searchAria')}
        />
        <span className="muted" style={{ fontSize: '0.9rem' }}>
          {selectedAvailable.length > 0
            ? t('lib.nSelected', { n: selectedAvailable.length })
            : t('lib.noneSelected')}
        </span>
        <div className="lib-batch-actions">
          <label
            className={`lib-check lib-check-review ${directToReview ? 'checked' : ''}`}
            title={t('lib.reviewModeTitle')}
          >
            <input
              type="checkbox"
              checked={directToReview}
              onChange={(e) => {
                if (e.target.checked) {
                  const ok = window.confirm(
                    `${t('lib.reviewConfirmTitle')}\n\n${t('lib.reviewConfirmBody')}`,
                  );
                  if (ok) setDirectToReview(true);
                } else {
                  setDirectToReview(false);
                }
              }}
            />
            <span>{t('lib.reviewMode')}</span>
          </label>
          {available.length > 0 && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={selectAll}
              title={
                allSelected
                  ? t('lib.clearSelectionTitle')
                  : t('lib.selectAllTitle', { n: visibleAvailable.length })
              }
            >
              {allSelected
                ? t('lib.clearSelection')
                : t('lib.selectAll', { n: visibleAvailable.length })}
            </button>
          )}
          <button
            className="btn btn-primary btn-sm"
            disabled={selectedAvailable.length === 0}
            onClick={() => void addSelected()}
          >
            {directToReview ? t('lib.addToReview') : t('lib.addSelected')}
          </button>
        </div>
      </div>

      <div className="lib-list-layout">
        <div className="lib-list-main">
          {letter && (
            <p className="lib-filter-note" role="status">
              {t('lib.filterNote', { n: visible.length, L: letter })}
              {q ? t('lib.filterNoteSearch') : ''}
              <button type="button" className="lib-filter-clear" onClick={() => setLetter(null)}>
                {t('lib.showAll')}
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
                <h3>{q ? t('lib.noMatchQ', { q: query }) : t('lib.noMatch')}</h3>
                <p>{t('lib.noMatchBody')}</p>
              </div>
            )}
            {book.words.length === 0 && (
              <div className="empty-state">
                <span className="doodle">📖</span>
                <h3>{t('lib.noWords')}</h3>
                <p>{t('lib.noWordsBody')}</p>
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
  const { t } = useI18n();
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
          { label: t('lib.root'), to: '/library' },
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
            trail={[{ label: t('lib.root'), to: '/library' }, { label: collection.title }]}
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
                    <strong>{t('lib.addedOf', { added: counts.added, total: counts.total })}</strong>
                  </span>
                  <span className="lib-card-bar" aria-hidden>
                    <i style={{ width: `${counts.total > 0 ? (counts.added / counts.total) * 100 : 0}%` }} />
                  </span>
                  <span className="lib-card-open" aria-hidden>
                    {t('lib.openBook')}
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
          <h1>{t('lib.title')}</h1>
          <p className="faint">{t('lib.subtitle')}</p>
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
                  {collection.books.length > 1 ? `${t('lib.books', { n: collection.books.length })} · ` : ''}
                  {t('lib.words', { n: counts.total })}
                </span>
              </span>
              <span className="lib-card-counts">
                <strong>{t('lib.addedOf', { added: counts.added, total: counts.total })}</strong>
              </span>
              <span className="lib-card-bar" aria-hidden>
                <i style={{ width: `${counts.total > 0 ? (counts.added / counts.total) * 100 : 0}%` }} />
              </span>
              <span className="lib-card-open" aria-hidden>
                {collection.books.length > 1 ? t('lib.browseBooks') : t('lib.openBook')}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

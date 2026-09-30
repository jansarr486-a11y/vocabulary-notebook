import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useProfiles } from '../../context/ProfileContext';
import { applySpellingResult, listWords } from '../../db/repo';
import { logProgressEvent } from '../../db/progressRepo';
import {
  checkArrangement,
  filterPlayable,
  isFullyCorrect,
  isSpellingEligible,
  orderPool,
  requeueWord,
  scrambledLetters,
  spellingDifficulty,
  type LetterFeedback,
  type WordTally,
} from '../../db/spelling';
import { LEVEL_TAGS, type LevelTag } from '../../db/models';
import { dayKey } from '../../db/time';
import { peekPracticeFocus } from '../progress/practiceHandoff';
import { LevelBadge } from '../../components/ui/Chips';
import { useObjectUrl } from '../../hooks/useMisc';
import { useI18n } from '../../i18n';
import type { Word } from '../../db/models';

// ---------- setup screen ----------

function Setup({ words, onStart }: { words: Word[]; onStart: (pool: Word[]) => void }) {
  const { t } = useI18n();
  const [levelFilter, setLevelFilter] = useState<LevelTag[]>([]);
  const [courseQuery, setCourseQuery] = useState('');

  const playable = useMemo(
    () => filterPlayable(words, { levelTags: levelFilter.map(String), courseQuery }),
    [words, levelFilter, courseQuery],
  );
  const allTerms = useMemo(() => {
    const set = new Set<string>();
    for (const w of words) if (w.courseTag) set.add(w.courseTag);
    return [...set].sort();
  }, [words]);
  const anyEligible = useMemo(() => words.some((w) => isSpellingEligible(w)), [words]);

  return (
    <div>
      <p className="muted">{t('sp.subtitle')}</p>

      <div className="paper-card washi" style={{ marginTop: 'var(--sp-4)', padding: 'var(--sp-5)' }}>
        <div className="field" style={{ marginBottom: 'var(--sp-4)' }}>
          <label>{t('sp.fromLevels')}</label>
          <div className="chip-row">
            {LEVEL_TAGS.map((tag) => {
              const on = levelFilter.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  className={`chip ${on ? 'chip-on' : ''}`}
                  aria-pressed={on}
                  onClick={() =>
                    setLevelFilter((prev) => (prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag]))
                  }
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </div>
        <div className="field">
          <label>{t('sp.orNarrow')}</label>
          <input
            className="input"
            placeholder={t('sp.coursePlaceholder')}
            value={courseQuery}
            onChange={(e) => setCourseQuery(e.target.value)}
            list="spelling-terms"
            aria-label={t('sp.courseAria')}
          />
          <datalist id="spelling-terms">
            {allTerms.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </div>
      </div>

      {playable.length === 0 ? (
        <div className="empty-state" style={{ marginTop: 'var(--sp-5)' }}>
          <span className="doodle">🧩</span>
          <h3>{anyEligible ? t('sp.noMatch') : t('sp.notReady')}</h3>
          <p>
            {anyEligible
              ? t('sp.noMatchBody')
              : t('sp.notReadyBody')}
          </p>
          <Link to="/notebook" className="btn btn-primary" style={{ marginTop: 'var(--sp-3)' }}>
            {t('rv.goNotebook')}
          </Link>
        </div>
      ) : (
        <div style={{ textAlign: 'center', marginTop: 'var(--sp-5)' }}>
          <button
            className="btn btn-primary"
            style={{ fontSize: '1.1rem', padding: '0 var(--sp-6)' }}
            onClick={() => onStart(orderPool(playable))}
          >
            {t('sp.start', { n: playable.length })}
          </button>
          {playable.some((w) => spellingDifficulty(w) > 0) && (
            <p className="faint" style={{ marginTop: 'var(--sp-2)', fontSize: '0.85rem' }}>
              {t('sp.trickyLead')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- game board ----------

interface Tile {
  /** Unique per physical tile, so doubled letters stay individually tappable. */
  key: string;
  ch: string;
}

interface Slot {
  tile: Tile | null;
}

function GameBoard({
  word,
  onSolved,
  onMistake,
}: {
  word: Word;
  onSolved: (mistakes: number) => void;
  onMistake: () => void;
}) {
  const { t } = useI18n();
  const target = word.word;
  const [tiles, setTiles] = useState<Tile[]>(() => scrambledLetters(target).map((ch, i) => ({ key: `${ch}-${i}`, ch })));
  const [slots, setSlots] = useState<Slot[]>(() => target.split('').map(() => ({ tile: null })));
  const [feedback, setFeedback] = useState<LetterFeedback[] | null>(null);
  const [checked, setChecked] = useState(false);
  const [solved, setSolved] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [shaking, setShaking] = useState(false);
  const image = useObjectUrl(word.imageBlob);

  const canCheck = slots.every((s) => s.tile != null);

  const placeTile = (key: string) => {
    if (solved) return;
    const slotIdx = slots.findIndex((s) => s.tile == null);
    const tile = tiles.find((t) => t.key === key);
    if (slotIdx === -1 || !tile) return;
    setTiles((ts) => ts.filter((t) => t.key !== key));
    setSlots((ss) => ss.map((s, i) => (i === slotIdx ? { tile } : s)));
    setFeedback(null);
    setChecked(false);
  };

  const returnTile = (slotIdx: number) => {
    if (solved) return;
    const tile = slots[slotIdx]?.tile;
    if (!tile) return;
    setTiles((ts) => [...ts, tile]);
    setSlots((ss) => ss.map((s, i) => (i === slotIdx ? { tile: null } : s)));
    setFeedback(null);
    setChecked(false);
  };

  const clearBoard = () => {
    setTiles((ts) => [...ts, ...slots.flatMap((s) => (s.tile ? [s.tile] : []))]);
    setSlots(target.split('').map(() => ({ tile: null })));
    setFeedback(null);
    setChecked(false);
  };

  const onCheck = () => {
    if (!canCheck || solved) return;
    const guess = slots.map((s) => s.tile!.ch);
    const fb = checkArrangement(guess, target);
    setFeedback(fb);
    setChecked(true);
    setAttempts((a) => a + 1);
    if (isFullyCorrect(guess, target)) {
      setSolved(true);
    } else {
      setMistakes((m) => m + 1);
      onMistake();
      setShaking(true);
      window.setTimeout(() => setShaking(false), 500);
    }
  };

  return (
    <div>
      <div className="paper-card washi spelling-clue">
        {image && <img className="spelling-clue-img" src={image} alt="" />}
        <span className="card-label">{t('sp.meaning')}</span>
        {/* English dictionary text — pinned LTR so punctuation/word order survive RTL UI */}
        <p className="spelling-def" dir="ltr">{word.sections[0]?.text || '—'}</p>
        {word.partOfSpeech && (
          <span className="faint" style={{ fontStyle: 'italic' }}>
            {word.partOfSpeech}
          </span>
        )}
        {word.levelTags.length > 0 && (
          <div className="spelling-clue-meta">
            {word.levelTags.map((t) => (
              <LevelBadge key={t} tag={t} />
            ))}
          </div>
        )}
      </div>

      {/* answer row — tap a placed tile to send it back to the pool.
          dir="ltr": the word being spelled is English, so slots must read
          left-to-right even when the surrounding UI is RTL (Farsi). */}
      <div className={`spelling-answer ${shaking ? 'shake' : ''}`} dir="ltr">
        {slots.map((s, i) => {
          const st = checked && feedback ? feedback[i] : null;
          return (
            <button
              key={i}
              type="button"
              className={['spelling-slot', s.tile ? 'filled' : 'empty', st ? `fb-${st.state}` : '', solved ? 'fb-solved' : ''].join(' ')}
              disabled={!s.tile || solved}
              onClick={() => returnTile(i)}
              aria-label={s.tile ? t('sp.slotRemove', { ch: s.tile.ch }) : t('sp.slotEmpty', { n: i + 1 })}
            >
              {s.tile?.ch ?? ''}
            </button>
          );
        })}
      </div>

      {checked && !solved && (
        <p className="spelling-legend" role="status">
          <span className="legend legend-correct">{t('sp.legendOk')}</span>
          <span className="legend legend-misplaced">{t('sp.legendMis')}</span>
          <span className="legend legend-wrong">{t('sp.legendNo')}</span>
        </p>
      )}

      {/* scrambled pool — kept LTR like the answer row */}
      <div className="spelling-pool" dir="ltr">
        {tiles.map((tile) => (
          <button key={tile.key} type="button" className="spelling-tile" onClick={() => placeTile(tile.key)} aria-label={t('sp.tilePlace', { ch: tile.ch })}>
            {tile.ch}
          </button>
        ))}
        {tiles.length === 0 && !solved && <span className="spelling-pool-note">{t('sp.poolEmpty')}</span>}
      </div>

      <div className="spelling-actions">
        {solved ? (
          <>
            <span className="hand spelling-solved-note">
              {t('sp.spelled')} {attempts === 1 ? t('sp.firstTry') : t('sp.afterMisses', { n: attempts - 1 })}
            </span>
            <button className="btn btn-primary" onClick={() => onSolved(mistakes)}>
              {t('sp.nextWord')}
            </button>
          </>
        ) : (
          <>
            <button className="btn" onClick={clearBoard}>
              {t('sp.clear')}
            </button>
            <button className="btn btn-primary" disabled={!canCheck} onClick={onCheck}>
              {t('sp.check')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ---------- session summary ----------

interface SummaryRow {
  word: string;
  attempts: number;
  mistakes: number;
  difficulty: number;
}

function Summary({ rows, onRestart }: { rows: SummaryRow[]; onRestart: () => void }) {
  const { t } = useI18n();
  const perfect = rows.filter((r) => r.mistakes === 0).length;
  const retried = rows.length - perfect;
  const hardest = [...rows].filter((r) => r.difficulty > 0).sort((a, b) => b.difficulty - a.difficulty).slice(0, 5);

  return (
    <div className="paper-card washi" style={{ textAlign: 'center', padding: 'var(--sp-6) var(--sp-5)' }}>
      <h2 style={{ fontSize: '1.6rem', marginBottom: 'var(--sp-2)' }}>{t('sp.done')}</h2>
      <p className="muted" style={{ marginBottom: 'var(--sp-4)' }}>
        {t('sp.summary', { n: rows.length, perfect, retried })}
      </p>
      {hardest.length > 0 && (
        <div style={{ textAlign: 'left', maxWidth: 380, margin: '0 auto var(--sp-4)' }}>
          <p style={{ fontWeight: 700, marginBottom: 'var(--sp-2)' }}>{t('sp.watchThese')}</p>
          <ul className="spelling-summary-list">
            {hardest.map((r) => (
              <li key={r.word}>
                <strong>{r.word}</strong>
                <span className="muted"> — {t('sp.misses', { n: r.mistakes })}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="btn-row" style={{ justifyContent: 'center' }}>
        <button className="btn btn-primary" onClick={onRestart}>
          {t('rv.anotherRound')}
        </button>
        <Link to="/" className="btn">
          {t('rv.today')}
        </Link>
      </div>
    </div>
  );
}

// ---------- main screen ----------

/**
 * Starts a focused session (Progress handoff) once the word list has loaded.
 * The handoff is consumed only here — so a slow DB can never silently drop it.
 */
function AutoFocusStart({ words, focusIds, onStart, onDone }: { words: Word[]; focusIds: number[]; onStart: (pool: Word[]) => void; onDone: () => void }) {
  useEffect(() => {
    const pool = focusIds.map((id) => words.find((w) => w.id === id)).filter((w): w is Word => !!w && isSpellingEligible(w));
    onDone();
    if (pool.length > 0) onStart(orderPool(pool));
    // else: fall through to the normal Setup screen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [words]);
  return null;
}

export function Spelling() {
  const { profile } = useProfiles();
  const { t } = useI18n();
  const words = useLiveQuery(
    () => (profile?.id != null ? listWords(profile.id) : Promise.resolve([] as Word[])),
    [profile?.id],
  );

  const [queue, setQueue] = useState<Word[] | null>(null);
  const [cursor, setCursor] = useState(0);
  /** Per-word tallies for the whole session (survives requeues). */
  const tallies = useRef(new Map<number, WordTally>());
  const [summary, setSummary] = useState<SummaryRow[] | null>(null);
  /** Words handed over from the Progress tab — become the implicit pool. */
  const focusIds = useRef<number[] | null>(peekPracticeFocus());

  const finished = queue !== null && cursor >= queue.length;
  const current = queue !== null && cursor < queue.length ? queue[cursor] : undefined;

  const startSession = useCallback((pool: Word[]) => {
    tallies.current = new Map();
    setQueue(pool);
    setCursor(0);
    setSummary(null);
  }, []);

  const trackMistake = useCallback((word: Word) => {
    const t = tallies.current.get(word.id!) ?? { attempts: 0, mistakes: 0 };
    tallies.current.set(word.id!, { attempts: t.attempts + 1, mistakes: t.mistakes + 1 });
  }, []);

  const finishWord = useCallback(
    (word: Word, mistakes: number) => {
      const t = tallies.current.get(word.id!) ?? { attempts: 0, mistakes: 0 };
      const tally = mistakes > t.mistakes ? mistakes : t.mistakes; // belt & braces
      tallies.current.set(word.id!, { ...t, attempts: t.attempts + 1, mistakes: tally });
      void applySpellingResult(word.id!, { mistakes: tally, sessionDay: dayKey(Date.now()) }).catch(() => {
        /* storage hiccup should never break the game */
      });
      // Progress logging (fire-and-forget, never alters game behaviour).
      if (profile?.id != null) {
        logProgressEvent(profile.id, {
          type: 'spelling_attempt',
          wordId: word.id,
          meta: { correct: tally === 0, attemptsNeeded: tally + 1 },
        });
      }
      setCursor((c) => c + 1);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profile?.id],
  );

  const handleSolved = useCallback(
    (word: Word, mistakes: number) => {
      if (mistakes > 0) {
        // Same-session spaced repeat: return after 3-5 other words.
        setQueue((q) => (q ? requeueWord(q, word, cursor) : q));
        finishWord(word, mistakes);
      } else {
        finishWord(word, 0);
      }
    },
    [cursor, finishWord],
  );

  const buildSummary = useCallback(
    (sessionQueue: Word[]): SummaryRow[] =>
      [...tallies.current.entries()]
        .map(([id, t]) => {
          const w = sessionQueue.find((x) => x.id === id);
          // Prefer the freshly persisted difficulty (liveQuery re-renders after
          // each applySpellingResult write); this session's mistakes act as a
          // floor so a just-updated word never hides.
          const live = words?.find((x) => x.id === id);
          const difficulty = Math.max(live ? spellingDifficulty(live) : 0, t.mistakes);
          return { word: w?.word ?? '?', attempts: t.attempts, mistakes: t.mistakes, difficulty };
        })
        .filter((r) => r.word !== '?'),
    [words],
  );

  // When the queue runs dry, freeze the summary once.
  const summaryBuilt = useRef(false);
  if (finished && !summary && !summaryBuilt.current && queue) {
    summaryBuilt.current = true;
    setSummary(buildSummary(queue));
  }

  if (!profile) return null;

  return (
    <div className="spelling-wrap">
      <h1>{t('sp.title')}</h1>

      {summary ? (
        <Summary
          rows={summary}
          onRestart={() => {
            summaryBuilt.current = false;
            setSummary(null);
            setQueue(null);
          }}
        />
      ) : queue === null ? (
        words ? (
          focusIds.current != null && focusIds.current.length > 0 && words ? (
            <AutoFocusStart words={words} focusIds={focusIds.current} onStart={startSession} onDone={() => (focusIds.current = null)} />
          ) : (
            <Setup words={words} onStart={startSession} />
          )
        ) : (
          <p className="hand" style={{ fontSize: '1.6rem', color: 'var(--ink-soft)', marginTop: 'var(--sp-5)' }}>
            {t('sp.opening')}
          </p>
        )
      ) : current ? (
        <>
          <p className="review-counter" style={{ marginTop: 'var(--sp-4)' }}>
            {t('sp.wordN', { n: cursor + 1, m: queue.length - cursor })}
          </p>
          <GameBoard
            key={`${current.id}-${cursor}`}
            word={current}
            onMistake={() => trackMistake(current)}
            onSolved={(mistakes) => handleSolved(current, mistakes)}
          />
        </>
      ) : null}
    </div>
  );
}


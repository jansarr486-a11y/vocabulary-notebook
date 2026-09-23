import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useProfiles } from '../../context/ProfileContext';
import { applyReviewResult, listWords } from '../../db/repo';
import { reviewScore } from '../../db/schedule';
import { SpeakerButton } from '../../components/ui/SpeakerButton';
import type { Word } from '../../db/models';

function buildDeck(words: Word[], size: number): Word[] {
  const now = Date.now();
  const eligible = words.filter((w) => w.sections.some((s) => s.completedAt != null));
  const scored = eligible
    .map((w) => ({ w, score: reviewScore(w.review, now) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(3, size));
  // shuffle the top slice so sessions feel fresh
  for (let i = scored.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [scored[i], scored[j]] = [scored[j], scored[i]];
  }
  return scored.map((s) => s.w);
}

export function Review() {
  const { profile } = useProfiles();

  const words = useLiveQuery(
    () => (profile?.id != null ? listWords(profile.id) : Promise.resolve([] as Word[])),
    [profile?.id],
  );

  const [deck, setDeck] = useState<Word[] | null>(null);
  const [cursor, setCursor] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [tally, setTally] = useState({ easy: 0, hard: 0, hot: [] as string[] });

  // Build the deck once data arrives; rebuild on profile switch.
  useEffect(() => {
    if (words && deck === null && profile) {
      setDeck(buildDeck(words, profile.settings.reviewDeckSize));
      setCursor(0);
      setFlipped(false);
      setTally({ easy: 0, hard: 0, hot: [] });
    }
  }, [words, deck, profile]);

  const current = deck && cursor < deck.length ? deck[cursor] : undefined;
  const finished = deck !== null && cursor >= deck.length;

  const rate = async (rating: 'easy' | 'hard') => {
    if (!current) return;
    await applyReviewResult(current.id!, rating);
    setTally((t) => ({
      ...t,
      [rating]: t[rating] + 1,
      hot: rating === 'hard' ? [...t.hot, current.word] : t.hot,
    }));
    setFlipped(false);
    window.setTimeout(() => setCursor((c) => c + 1), 120);
  };

  const restart = () => {
    if (!words || !profile) return;
    setDeck(buildDeck(words, profile.settings.reviewDeckSize));
    setCursor(0);
    setFlipped(false);
    setTally({ easy: 0, hard: 0, hot: [] });
  };

  const sec1 = current?.sections[0];
  const sec2 = current?.sections[1];
  const sec3 = current?.sections[2];
  const sec4 = current?.sections[3];
  const hasAnyCompleted = useMemo(() => words?.some((w) => w.sections.some((s) => s.completedAt != null)) ?? false, [words]);

  if (!profile) return null;

  return (
    <div className="review-wrap">
      <h1>Flashcards</h1>
      <p className="muted">Visit older words so they stick. Hard ones come back sooner.</p>

      {!hasAnyCompleted ? (
        <div className="empty-state" style={{ marginTop: 'var(--sp-5)' }}>
          <span className="doodle">🃏</span>
          <h3>No cards yet</h3>
          <p>Finish at least one section of a word and it will appear here.</p>
          <Link to="/notebook" className="btn btn-primary" style={{ marginTop: 'var(--sp-3)' }}>
            📓 Go to my notebook
          </Link>
        </div>
      ) : !deck ? (
        <p className="hand" style={{ fontSize: '1.6rem', color: 'var(--ink-soft)', marginTop: 'var(--sp-5)' }}>
          Shuffling the deck…
        </p>
      ) : finished ? (
        <div className="paper-card washi" style={{ marginTop: 'var(--sp-5)', textAlign: 'center' }}>
          <h2 style={{ fontSize: '2.2rem', marginBottom: 'var(--sp-3)' }}>Session done! 🎉</h2>
          <p>
            Reviewed <strong>{tally.easy + tally.hard}</strong> card{(tally.easy + tally.hard) === 1 ? '' : 's'} —{' '}
            {tally.easy} easy · {tally.hard} hard
          </p>
          {tally.hot.length > 0 && (
            <p className="muted" style={{ marginTop: 'var(--sp-2)' }}>
              Tricky ones to watch: <strong>{tally.hot.join(', ')}</strong>
            </p>
          )}
          <div className="btn-row" style={{ justifyContent: 'center', marginTop: 'var(--sp-4)' }}>
            <button className="btn btn-primary" onClick={restart}>
              🔁 Another round
            </button>
            <Link to="/" className="btn">
              ← Today
            </Link>
          </div>
        </div>
      ) : (
        <>
          <p className="review-counter" style={{ marginTop: 'var(--sp-4)' }}>
            Card {cursor + 1} / {deck.length}
          </p>
          <div className="flip-scene">
            <div
              className={`flip-card ${flipped ? 'flipped' : ''}`}
              onClick={() => setFlipped((f) => !f)}
              role="button"
              aria-pressed={flipped}
              tabIndex={0}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setFlipped((f) => !f)}
            >
              <div className="flip-face front">
                <span className="card-label">WORD</span>
                <div className="card-word" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {current!.word}
                </div>
                {current!.phonetic && <span className="muted">{current!.phonetic}</span>}
                {current!.partOfSpeech && <span className="faint" style={{ fontStyle: 'italic' }}>{current!.partOfSpeech}</span>}
                <span className="card-hint">tap the card to flip 🔁</span>
              </div>
              <div className="flip-face back">
                <span className="card-label">MEANING</span>
                <p className="card-content">{sec1?.text || '—'}</p>
                {sec2?.text && (
                  <p className="card-content" style={{ fontStyle: 'italic', color: 'var(--ink-soft)' }}>
                    “{sec2.text}”
                  </p>
                )}
                {sec3?.completedAt != null && (
                  <p className="card-content" style={{ fontSize: '0.9rem' }}>
                    <strong>Your sentence:</strong> {sec3.text}
                  </p>
                )}
                {sec4?.text && <p className="faint" style={{ fontSize: '0.85rem' }}>💡 {sec4.text}</p>}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 'var(--sp-2)' }}>
            <SpeakerButton text={current!.word} small />
          </div>

          <div className="review-actions">
            {flipped ? (
              <>
                <button className="btn btn-danger" style={{ flex: 1 }} onClick={() => void rate('hard')}>
                  😅 Hard
                </button>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => void rate('easy')}>
                  😎 Easy
                </button>
              </>
            ) : (
              <button className="btn" style={{ flex: 1 }} onClick={() => setFlipped(true)}>
                👀 Show meaning
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

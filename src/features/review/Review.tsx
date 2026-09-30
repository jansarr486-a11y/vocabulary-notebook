import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useProfiles } from '../../context/ProfileContext';
import { applyReviewResult, listWords } from '../../db/repo';
import { logProgressEvent } from '../../db/progressRepo';
import { reviewScore } from '../../db/schedule';
import { quizSettingsOf, type QuizAnswerMode, type Word } from '../../db/models';
import { SpeakerButton } from '../../components/ui/SpeakerButton';
import { useObjectUrl } from '../../hooks/useMisc';
import { buildQuizOptions, gradeQuizAnswer, isQuizServable, makeRng, type BuiltQuiz, type QuizOption } from './quiz';
import { takePracticeFocus } from '../progress/practiceHandoff';
import { useI18n } from '../../i18n';

/** True when `v` looks like a review-state object with usable fields. */
function isReviewState(v: unknown): v is { lastReviewedAt?: number; weight: number; pressure: number } {
  return (
    v != null &&
    typeof v === 'object' &&
    typeof (v as { weight?: unknown }).weight === 'number' &&
    typeof (v as { pressure?: unknown }).pressure === 'number'
  );
}

function buildDeck(words: Word[], size: number, mode: QuizAnswerMode): Word[] {
  const now = Date.now();
  // Only words that can actually be served a quiz card in this answer mode —
  // otherwise they get skipped silently mid-session ("Reviewed 0 cards").
  const eligible = words.filter(
    (w) => isQuizServable(w, mode) && isReviewState(w.review),
  );
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

/** How many cards later an "Again" word comes back within the same session. */
const RELEARN_GAP = 3;
/** Auto-advance delay after a CORRECT answer; wrong answers wait for Next. */
const AUTO_ADVANCE_MS = 1500;

interface Tally {
  again: number;
  hard: number;
  good: number;
  easy: number;
  hot: string[];
}

const EMPTY_TALLY: Tally = { again: 0, hard: 0, good: 0, easy: 0, hot: [] };

export function Review() {
  const { profile } = useProfiles();
  const { t } = useI18n();

  const words = useLiveQuery(
    () => (profile?.id != null ? listWords(profile.id) : Promise.resolve([] as Word[])),
    [profile?.id],
  );

  const [deck, setDeck] = useState<Word[] | null>(null);
  const [cursor, setCursor] = useState(0);
  const [tally, setTally] = useState<Tally>(EMPTY_TALLY);
  /** Some quizzes had fewer options — suggest adding words (in-session + summary). */
  const [smallNotebook, setSmallNotebook] = useState(false);
  /** Increments each time a card is presented — forces a fresh quiz build (relearning too). */
  const [appearance, setAppearance] = useState(0);
  /** One answer mode + timing thresholds per session, snapshotted at session start. */
  const [sessionCfg, setSessionCfg] = useState<{
    mode: QuizAnswerMode;
    easyUnderMs: number;
    goodUnderMs: number;
  } | null>(null);

  // ----- per-card quiz state -----
  const [quiz, setQuiz] = useState<BuiltQuiz | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(0);
  const advancedRef = useRef(false);
  const wordsRef = useRef<Word[]>([]);

  useEffect(() => {
    // Keep only well-formed rows — a malformed legacy row must never be able
    // to crash quiz building (answerText reads sections[0] unguarded).
    if (words) wordsRef.current = words.filter((w) => Array.isArray(w?.sections));
  }, [words]);

  const current = deck && cursor < deck.length ? deck[cursor] : undefined;
  const finished = deck !== null && cursor >= deck.length;
  const thumb = useObjectUrl(current?.imageBlob);

  const cfg = sessionCfg ?? {
    mode: (profile ? quizSettingsOf(profile.settings).answerMode : 'definition') as QuizAnswerMode,
    easyUnderMs: profile ? quizSettingsOf(profile.settings).easyUnderMs : 4000,
    goodUnderMs: profile ? quizSettingsOf(profile.settings).goodUnderMs : 10000,
  };

  // Build the deck once data arrives; rebuild on profile switch.
  useEffect(() => {
    if (words && deck === null && profile) {
      // Focused practice from the Progress tab: serve exactly those words.
      const focus = takePracticeFocus();
      const qs = quizSettingsOf(profile.settings);
      const focused =
        focus != null
          ? focus.map((id) => words.find((w) => w.id === id)).filter((w): w is Word => !!w)
          : null;
      setDeck(
        focused && focused.length > 0
          ? focused.filter((w) => isQuizServable(w, qs.answerMode))
          : buildDeck(words, profile.settings.reviewDeckSize, qs.answerMode),
      );
      setCursor(0);
      setTally(EMPTY_TALLY);
      setSmallNotebook(false);
      setSessionCfg({ mode: qs.answerMode, easyUnderMs: qs.easyUnderMs, goodUnderMs: qs.goodUnderMs });
      setAppearance((a) => a + 1);
    }
  }, [words, deck, profile]);

  // Present the current card: fresh randomized options on every appearance,
  // including relearning re-insertions of the same word.
  useEffect(() => {
    if (!current) return;
    advancedRef.current = false;
    setPicked(null);
    setElapsed(0);
    const seed = (Date.now() % 2 ** 31) + appearance;
    const built = buildQuizOptions(current, wordsRef.current, cfg.mode, makeRng(seed));
    if (built === null) {
      setQuiz(null);
      // Nothing to quiz on (no definition/meaning) — skip quietly.
      const t = window.setTimeout(() => {
        setAppearance((a) => a + 1);
        setCursor((c) => c + 1);
      }, 0);
      return () => window.clearTimeout(t);
    }
    setQuiz(built);
    if (built.smallNotebook) setSmallNotebook(true);
    startRef.current = Date.now();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appearance]);

  const advance = () => {
    advancedRef.current = true;
    setAppearance((a) => a + 1);
    setCursor((c) => c + 1);
  };

  // Auto-advance shortly after a correct answer; wrong answers wait for Next
  // so the student can study the detail panel.
  useEffect(() => {
    if (picked === null) return;
    const opt = quiz?.options.find((o) => o.key === picked);
    if (!opt?.isCorrect) return;
    const t = window.setTimeout(() => {
      if (!advancedRef.current) advance();
    }, AUTO_ADVANCE_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked, quiz]);

  const answer = (opt: QuizOption) => {
    if (picked !== null || !current || !quiz) return;
    const ms = Date.now() - startRef.current;
    const grade = gradeQuizAnswer(opt.isCorrect, ms, cfg);
    setElapsed(ms);
    setPicked(opt.key);
    void applyReviewResult(current.id!, grade);
    // Progress logging (fire-and-forget, never alters quiz behaviour).
    if (profile?.id != null) {
      logProgressEvent(profile.id, {
        type: 'review_answered',
        wordId: current.id,
        meta: { correct: opt.isCorrect, grade, responseTimeMs: ms },
      });
    }
    setTally((t) => ({
      ...t,
      [grade]: t[grade] + 1,
      hot: grade === 'again' ? [...t.hot, current.word] : t.hot,
    }));
    // Relearning: the same word returns a few cards later with brand-new options.
    if (grade === 'again') {
      setDeck((d) => {
        if (!d) return d;
        const next = [...d];
        next.splice(Math.min(next.length, cursor + 1 + RELEARN_GAP), 0, current);
        return next;
      });
    }
  };

  const restart = () => {
    if (!words || !profile) return;
    const qs = quizSettingsOf(profile.settings);
    setDeck(buildDeck(words, profile.settings.reviewDeckSize, qs.answerMode));
    setCursor(0);
    setTally(EMPTY_TALLY);
    setSmallNotebook(false);
    setSessionCfg({ mode: qs.answerMode, easyUnderMs: qs.easyUnderMs, goodUnderMs: qs.goodUnderMs });
    setAppearance((a) => a + 1);
  };

  const sec1 = current?.sections[0];
  const sec2 = current?.sections[1];
  const sec3 = current?.sections[2];
  const sec4 = current?.sections[3];
  const hasAnyCompleted = useMemo(
    () => words?.some((w) => Array.isArray(w?.sections) && w.sections.some((s) => s?.completedAt != null)) ?? false,
    [words],
  );
  const pickedOpt = quiz?.options.find((o) => o.key === picked);
  const verdict = pickedOpt
    ? pickedOpt.isCorrect
      ? elapsed < cfg.easyUnderMs
        ? t('rv.verdict.easy')
        : elapsed < cfg.goodUnderMs
          ? t('rv.verdict.good')
          : t('rv.verdict.hard')
      : t('rv.verdict.again')
    : '';

  if (!profile) return null;
  const mode = cfg.mode;

  return (
    <div className="review-wrap">
      <h1>{t('rv.title')}</h1>
      <p className="muted">
        {t('rv.subtitle')}
      </p>

      {!hasAnyCompleted ? (
        <div className="empty-state" style={{ marginTop: 'var(--sp-5)' }}>
          <span className="doodle">🃏</span>
          <h3>{t('rv.noCards')}</h3>
          <p>{t('rv.noCardsBody')}</p>
          <Link to="/notebook" className="btn btn-primary" style={{ marginTop: 'var(--sp-3)' }}>
            {t('rv.goNotebook')}
          </Link>
        </div>
      ) : !deck ? (
        <p className="hand" style={{ fontSize: '1.6rem', color: 'var(--ink-soft)', marginTop: 'var(--sp-5)' }}>
          {t('rv.shuffling')}
        </p>
      ) : finished ? (
        tally.again + tally.hard + tally.good + tally.easy === 0 ? (
          // Deck was empty (nothing servable) — never claim "Reviewed 0 cards".
          <div className="empty-state" style={{ marginTop: 'var(--sp-5)' }}>
            <span className="doodle">🃏</span>
            <h3>{t('rv.nothingNow')}</h3>
            <p>{t('rv.nothingNowBody')}</p>
            <Link to="/notebook" className="btn btn-primary" style={{ marginTop: 'var(--sp-3)' }}>
              {t('rv.goNotebook')}
            </Link>
          </div>
        ) : (
        <div className="paper-card washi" style={{ marginTop: 'var(--sp-5)', textAlign: 'center' }}>
          <h2 style={{ fontSize: '1.6rem', marginBottom: 'var(--sp-3)' }}>{t('rv.sessionDone')}</h2>
          <p>
            <strong>{t('rv.reviewed', { n: tally.again + tally.hard + tally.good + tally.easy })}</strong>
            {' — '}
            {t('rv.tally', { easy: tally.easy, good: tally.good, hard: tally.hard, again: tally.again })}
          </p>
          {tally.hot.length > 0 && (
            <p className="muted" style={{ marginTop: 'var(--sp-2)' }}>
              {t('rv.watch')} <strong>{[...new Set(tally.hot)].join(', ')}</strong>
            </p>
          )}
          {smallNotebook && (
            <p className="muted" style={{ marginTop: 'var(--sp-2)' }}>
              {t('rv.fewerOptions')} <Link to="/library">{t('rv.addMoreWords')}</Link> {t('rv.fewerOptionsTail')}
            </p>
          )}
          <div className="btn-row" style={{ justifyContent: 'center', marginTop: 'var(--sp-4)' }}>
            <button className="btn btn-primary" onClick={restart}>
              {t('rv.anotherRound')}
            </button>
            <Link to="/" className="btn">
              {t('rv.today')}
            </Link>
          </div>
        </div>
        )
      ) : (
        <>
          <p className="review-counter" style={{ marginTop: 'var(--sp-4)' }}>
            {t('rv.cardN', { n: cursor + 1, total: deck.length })}
          </p>
          <div className="quiz-card paper-card washi">
            <span className="card-label">{t('rv.meaningLabel')}</span>
            <div className="card-word" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              {current!.word}
              <SpeakerButton text={current!.word} small />
            </div>
            {current!.phonetic && <span className="muted">{current!.phonetic}</span>}
            {current!.partOfSpeech && (
              <span className="faint" style={{ fontStyle: 'italic' }}>
                {current!.partOfSpeech}
              </span>
            )}
            {thumb && <img className="quiz-word-img" src={thumb} alt={t('word.illustrationAlt', { word: current!.word })} />}

            {quiz && (
              <div className="quiz-options">
                {quiz.options.map((opt) => {
                  const isPicked = picked === opt.key;
                  const reveal = picked !== null;
                  const stateClass = !reveal ? '' : opt.isCorrect ? 'correct' : isPicked ? 'wrong' : '';
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      className={`quiz-option ${stateClass}`}
                      disabled={reveal}
                      aria-pressed={isPicked}
                      onClick={() => answer(opt)}
                    >
                      <span
                        className="quiz-option-label"
                        dir={mode === 'persian' ? 'rtl' : 'ltr'}
                        lang={mode === 'persian' ? 'fa' : 'en'}
                      >
                        {opt.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {picked !== null && quiz && (
              <div className="quiz-feedback page-turn">
                <p className={`quiz-verdict ${pickedOpt?.isCorrect ? 'ok' : 'no'}`}>{verdict}</p>
                <div className="quiz-detail">
                  {sec1?.text && (
                    <p className="card-content">
                      <span className="faint">{t('rv.definition')}</span> {sec1.text}
                    </p>
                  )}
                  {current!.persianMeaning && (
                    <p className="card-content persian-meaning" dir="rtl" lang="fa">
                      {current!.persianMeaning}
                    </p>
                  )}
                  {sec2?.text && (
                    <p className="card-content" style={{ fontStyle: 'italic', color: 'var(--ink-soft)' }}>
                      “{sec2.text}”
                    </p>
                  )}
                  {sec3?.completedAt != null && sec3?.text && (
                    <p className="card-content" style={{ fontSize: '0.9rem' }}>
                      <strong>{t('rv.yourSentence')}</strong> {sec3.text}
                    </p>
                  )}
                  {sec4?.text && (
                    <p className="faint" style={{ fontSize: '0.85rem' }}>💡 {sec4.text}</p>
                  )}
                </div>
                <button className="btn btn-primary" onClick={advance}>
                  {t('rv.next')}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

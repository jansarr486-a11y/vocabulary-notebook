/**
 * Progress tab (Part 2) — one honest, warm page.
 * All data comes from IndexedDB (words + events + snapshots); nothing network.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useProfiles } from '../../context/ProfileContext';
import { listWords, getWeeklyGoals, saveWeeklyGoals } from '../../db/repo';
import { ensureDailySnapshot } from '../../db/progressRepo';
import { db } from '../../db/db';
import type { Profile, ProgressEvent, DailySnapshot, ProgressBadgeState } from '../../db/models';
import {
  countStates,
  collectSkillSamples,
  computeSkills,
  computeWeekProgress,
  activeDaysThisWeek,
  computeStruggling,
  computeBookCoverage,
  currentWeekCircles,
  monthHeatmap,
  gardenSeries,
  evaluateBadges,
  type StrugglingWord,
} from '../../db/progress';
import { LEECH_THRESHOLD } from '../../db/progress';
import { StackedArea, GoalRing, SkillBarRow, Heatmap, type GardenLayer } from './charts';
import {
  downloadReportJson,
  downloadElementImage,
  downloadCertificate,
  bestSentenceCandidates,
} from './progressShare';
import { setPracticeFocus } from './practiceHandoff';
import { useI18n, Ltr } from '../../i18n';
import { ClassOverview, tutorModeEnabled, getTutorPin } from './ClassOverview';
import { verifyPin } from '../../db/pin';
import { PinPad } from '../../components/ui/PinPad';
import { WORD_LIBRARY } from '../library/libraryData';
import { Modal } from '../../components/ui/Modal';
import { IconLogo } from '../../components/ui/icons';

type Range = 30 | 90 | 0;

export function Progress() {
  const { profile } = useProfiles();
  const { t, lang } = useI18n();
  const navigate = useNavigate();

  // ---- data ----
  const words = useLiveQuery(() => (profile?.id != null ? listWords(profile.id) : Promise.resolve([])), [profile?.id]);
  const events = useLiveQuery(
    () => (profile?.id != null ? db.events.where('profileId').equals(profile.id).toArray() : Promise.resolve([] as ProgressEvent[])),
    [profile?.id],
  );
  const snapshots = useLiveQuery(
    () => (profile?.id != null ? db.snapshots.where('profileId').equals(profile.id).toArray() : Promise.resolve([] as DailySnapshot[])),
    [profile?.id],
  );
  const [goals, setGoals] = useState({ masteredPerWeek: 5, sentencesPerWeek: 3 });
  const [tutorMode, setTutorMode] = useState(false);
  const [tutorAvailable, setTutorAvailable] = useState(false);
  const [askPin, setAskPin] = useState<{ pinHash?: string; salt?: string } | null>(null);

  useEffect(() => {
    if (profile?.id == null) return;
    void ensureDailySnapshot(profile.id);
    void getWeeklyGoals(profile.id).then(setGoals);
    void tutorModeEnabled().then(setTutorAvailable);
  }, [profile?.id]);

  /** Switch to class view — asking the tutor PIN first when one is set. */
  const openClassView = async () => {
    const { hash, salt } = await getTutorPin();
    if (hash && salt) {
      setAskPin({ pinHash: hash, salt });
      return;
    }
    setTutorMode(true);
  };

  // ---- book totals for coverage bars ----
  const bookTotals = useMemo(() => {
    void words;
    const lib = wordLibraryTotals();
    return lib;
  }, []);

  const week = useMemo(() => computeWeekProgress(events ?? [], words ?? [], Date.now()), [events, words]);
  const activeThisWeek = useMemo(
    () => activeDaysThisWeek(profile?.stats.activityDays ?? [], events ?? [], Date.now()),
    [profile?.stats.activityDays, events],
  );
  const skills = useMemo(() => computeSkills(collectSkillSamples(events ?? [], words ?? [])), [events, words]);
  const struggling = useMemo(() => computeStruggling(words ?? []).slice(0, 5), [words]);
  const coverage = useMemo(() => computeBookCoverage(words ?? [], bookTotals), [words, bookTotals]);
  const badges = useMemo(
    () => (words ? evaluateBadges(words, events ?? [], profile?.stats.activityDays ?? [], Date.now()) : []),
    [words, events, profile?.stats.activityDays],
  );
  const earnedBadges = useLiveQuery(
    () => (profile?.id != null ? db.badges.where('profileId').equals(profile.id).toArray() : Promise.resolve([] as ProgressBadgeState[])),
    [profile?.id],
  );

  const [range, setRange] = useState<Range>(90);
  const garden = useMemo(() => {
    const snaps = (snapshots ?? []).slice().sort((a, b) => a.date.localeCompare(b.date));
    return gardenSeries(snaps, range, Date.now());
  }, [snapshots, range]);

  const weekCircles = useMemo(() => currentWeekCircles(profile?.stats.activityDays ?? [], Date.now()), [profile?.stats.activityDays]);
  const heat = useMemo(() => monthHeatmap(profile?.stats.activityDays ?? [], Date.now()), [profile?.stats.activityDays]);

  const daysOfData = (snapshots ?? []).length;
  const isNew = daysOfData < 3 && (words?.length ?? 0) < 3;

  if (!profile) return null;

  const heroAccuracy = week.reviewAccuracy != null ? `${Math.round(week.reviewAccuracy * 100)}%` : null;

  return (
    <div className="progress-wrap">
      {/* header + view switch */}
      <div className="progress-head">
        <div>
          <h1>{t('progress.title')}</h1>
          <p className="muted">{t('progress.subtitle')}</p>
        </div>
        {tutorAvailable && (
          <div className="progress-view-switch" role="tablist" aria-label={t('tutor.title')}>
            <button role="tab" aria-selected={!tutorMode} className={`chip ${!tutorMode ? 'chip-on' : ''}`} onClick={() => setTutorMode(false)}>
              {t('progress.tab.mine')}
            </button>
            <button role="tab" aria-selected={tutorMode} className={`chip ${tutorMode ? 'chip-on' : ''}`} onClick={() => void openClassView()}>
              {t('progress.tab.class')}
            </button>
          </div>
        )}
      </div>

      {tutorMode ? (
        <ClassOverview />
      ) : isNew ? (
        <EmptyState />
      ) : (
        <div className="progress-grid">
          {/* ---------- A. hero ---------- */}
          <section className="paper-card washi progress-hero">
            <p className="hero-sentence hand">
              {heroAccuracy != null
                ? t('hero.weekly', { learned: week.newWords, accuracy: heroAccuracy })
                : t('hero.quiet')}
            </p>
            {heroAccuracy != null && week.masteredDone > 0 && (
              <p className="hero-sub">{t('hero.masteredWeek', { mastered: week.masteredDone })}</p>
            )}
            <div className="hero-goal-row">
              <GoalRing
                value={week.masteredDone}
                max={goals.masteredPerWeek}
                label={t('hero.mastered')}
              />
              <GoalRing value={week.sentencesDone} max={goals.sentencesPerWeek} label={t('hero.sentences')} />
              <GoalEditor goals={goals} onSave={async (g) => { await saveWeeklyGoals(profile.id!, g); setGoals(g); }} />
            </div>
          </section>

          {/* ---------- B. garden ---------- */}
          <section className="paper-card washi progress-card">
            <div className="card-head-row">
              <h2>{t('garden.title')}</h2>
              <div className="range-switch">
                {([30, 90, 0] as Range[]).map((r) => (
                  <button key={r} className={`chip ${range === r ? 'chip-on' : ''}`} aria-pressed={range === r} onClick={() => setRange(r)}>
                    {t(r === 30 ? 'garden.30' : r === 90 ? 'garden.90' : 'garden.all')}
                  </button>
                ))}
              </div>
            </div>
            <p className="muted small">{t('garden.subtitle')}</p>
            {garden.length > 1 ? (
              <StackedArea
                dates={garden.map((g) => g.date)}
                layers={[
                  { key: 'mastered', values: garden.map((g) => g.counts.mastered) },
                  { key: 'review', values: garden.map((g) => g.counts.review) },
                  { key: 'learning', values: garden.map((g) => g.counts.learning) },
                  { key: 'new', values: garden.map((g) => g.counts.new) },
                ] as GardenLayer[]}
              />
            ) : (
              <p className="muted small">{t('empty.desc')}</p>
            )}
          </section>

          {/* ---------- C. consistency ---------- */}
          <section className="paper-card washi progress-card">
            <h2>{t('consistency.title')}</h2>
            <p className="consistency-primary">
              <strong>{t('consistency.activeWeek', { n: activeThisWeek })}</strong>
            </p>
            <div className="week-circles" role="img" aria-label={t('consistency.activeWeek', { n: activeThisWeek })}>
              {weekCircles.map((c) => (
                <span
                  key={c.date}
                  className={[
                    'week-circle',
                    c.active ? 'active' : '',
                    c.isToday ? 'today' : '',
                    c.future ? 'future' : '',
                    c.isRest ? 'rest' : '',
                  ].join(' ')}
                  title={`${c.date}${c.isRest ? ' — ' + t('consistency.rest.info') : ''}`}
                >
                  {c.label}
                </span>
              ))}
            </div>
            <p className="faint small">{t('consistency.streak', { n: profile.stats.streakCount })}</p>
            <p className="faint small rest-info" title={t('consistency.rest.info')}>ⓘ {t('consistency.rest.info')}</p>
            <h3 className="heat-title">{t('consistency.month')}</h3>
            <Heatmap cells={heat} />
          </section>

          {/* ---------- D. skills ---------- */}
          <section className="paper-card washi progress-card">
            <h2>{t('skills.title')}</h2>
            <p className="muted small">{t('skills.subtitle')}</p>
            <div className="skill-list">
              {skills.map((s) => (
                <SkillBarRow
                  key={s.id}
                  label={t(`skills.${s.id}`)}
                  hint={t('skills.notEnough')}
                  value={s.value}
                  display={s.display}
                  samples={s.samples}
                  unit={s.id === 'writing' ? 'per10' : 'percent'}
                />
              ))}
            </div>
          </section>

          {/* ---------- E. coverage ---------- */}
          <section className="paper-card washi progress-card">
            <h2>{t('coverage.title')}</h2>
            <p className="muted small">{t('coverage.subtitle')}</p>
            {coverage.length === 0 ? (
              <p className="muted small">{t('coverage.empty')}</p>
            ) : (
              <div className="coverage-list">
                {coverage.map((c) => (
                  <button key={c.bookId} className="coverage-row" onClick={() => navigate(`/library/oxford-word-skills-upper-int-adv/${c.bookId}`)}>
                    <span className="coverage-title">{c.bookTitle}</span>
                    <span className="coverage-counts">
                      <b dir="ltr">{c.added}</b> {t('coverage.added')} · <Ltr>{t('coverage.masteredOf', { mastered: c.mastered, total: c.total || '…' })}</Ltr>
                    </span>
                    <span className="coverage-bar" role="img" aria-label={`${c.added} added, ${c.mastered} mastered`}>
                      <i className="cov-added" style={{ width: `${c.total ? Math.min(100, (c.added / c.total) * 100) : 0}%` }} />
                      <i className="cov-mastered" style={{ width: `${c.total ? Math.min(100, (c.mastered / c.total) * 100) : 0}%` }} />
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* ---------- F. need help ---------- */}
          <section className="paper-card washi progress-card">
            <h2>{t('help.title')}</h2>
            <p className="muted small">{t('help.subtitle')}</p>
            {struggling.length === 0 ? (
              <p className="muted small">{t('help.empty')}</p>
            ) : (
              <>
                <div className="struggle-list">
                  {struggling.map((s) => (
                    <StruggleCard key={s.word.id} s={s} lang={lang} />
                  ))}
                </div>
                <div className="btn-row">
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      setPracticeFocus(struggling.map((s) => s.word.id!));
                      navigate('/review');
                    }}
                  >
                    🎯 {t('help.practice')}
                  </button>
                  <button
                    className="btn"
                    onClick={() => {
                      setPracticeFocus(struggling.map((s) => s.word.id!));
                      navigate('/spelling');
                    }}
                  >
                    🧩 {t('help.practice.spelling')}
                  </button>
                </div>
              </>
            )}
          </section>

          {/* ---------- G. badges ---------- */}
          <section className="paper-card washi progress-card">
            <h2>{t('badges.title')}</h2>
            <p className="muted small">{t('badges.subtitle')}</p>
            <div className="badge-grid">
              {badges.map((b) => {
                const earnedRow = earnedBadges?.find((e) => e.badgeId === b.badgeId);
                return (
                  <div key={b.badgeId} className={`badge-card ${b.earned ? 'earned' : 'locked'}`}>
                    <span className="badge-emoji" aria-hidden>{BADGE_EMOJI[b.badgeId] ?? '⭐'}</span>
                    <span className="badge-name">{t(`badges.${b.badgeId}.name`)}</span>
                    {b.earned ? (
                      <span className="badge-date faint">{earnedRow ? new Date(earnedRow.earnedAt).toLocaleDateString() : ''}</span>
                    ) : (
                      <span className="badge-req faint">{t(`badges.${b.badgeId}.req`)}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* ---------- share ---------- */}
          <ShareCard profile={profile} />
        </div>
      )}

      {askPin && (
        <PinPad
          title={t('tutor.pin.enter')}
          onClose={() => setAskPin(null)}
          onComplete={async (pin) => {
            const ok = await verifyPin(pin, askPin.pinHash!, askPin.salt!);
            if (ok) {
              setTutorMode(true);
              setAskPin(null);
            } else {
              setAskPin(null);
            }
          }}
        />
      )}
    </div>
  );
}

// ---------- pieces ----------

const BADGE_EMOJI: Record<string, string> = {
  m10: '🌱', m50: '🌿', m100: '🌳', s10: '✏️', s50: '📝',
  d7: '🔥', d30: '🌕', book: '🏔️', dreamer: '🚀',
};

function GoalEditor({ goals, onSave }: { goals: { masteredPerWeek: number; sentencesPerWeek: number }; onSave: (g: { masteredPerWeek: number; sentencesPerWeek: number }) => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [m, setM] = useState(goals.masteredPerWeek);
  const [s, setS] = useState(goals.sentencesPerWeek);
  return (
    <div className="goal-editor">
      <button className="btn btn-sm" onClick={() => { setM(goals.masteredPerWeek); setS(goals.sentencesPerWeek); setOpen(true); }}>
        ⚙️ {t('hero.goal.edit')}
      </button>
      {open && (
        <Modal
          title={t('hero.goal.edit')}
          onClose={() => setOpen(false)}
          footer={
            <>
              <button className="btn" onClick={() => setOpen(false)}>{t('common.cancel')}</button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  onSave({ masteredPerWeek: Math.max(1, m), sentencesPerWeek: Math.max(1, s) });
                  setOpen(false);
                }}
              >
                {t('hero.goal.save')}
              </button>
            </>
          }
        >
          <div className="field">
            <label htmlFor="goal-m">{t('hero.goal.mastered')}</label>
            <input id="goal-m" className="input" type="number" min={1} max={50} value={m} onChange={(e) => setM(Number(e.target.value))} />
          </div>
          <div className="field">
            <label htmlFor="goal-s">{t('hero.goal.sentences')}</label>
            <input id="goal-s" className="input" type="number" min={1} max={50} value={s} onChange={(e) => setS(Number(e.target.value))} />
          </div>
          <p className="faint small">{t('hero.goal.desc', { masteredGoal: Math.max(1, m), sentenceGoal: Math.max(1, s) })}</p>
        </Modal>
      )}
    </div>
  );
}

function StruggleCard({ s, lang }: { s: StrugglingWord; lang: string }) {
  const { t } = useI18n();
  const leech = s.spellingDifficulty >= LEECH_THRESHOLD || s.wrongCount >= LEECH_THRESHOLD;
  return (
    <div className="struggle-card">
      <div className="struggle-main">
        <strong>{s.word.word}</strong>
        {s.word.persianMeaning && lang === 'fa' && <span className="muted small"> · {s.word.persianMeaning.slice(0, 24)}</span>}
        <span className="faint small" dir="ltr"> ×{s.wrongCount} {t('help.times')}</span>
      </div>
      {leech && (
        <div className="leech-tag" title={t('help.leech.tip')}>
          🌀 {t('help.leech.tag')}
        </div>
      )}
    </div>
  );
}

/** Book totals straight from the bundled library data (read-only, offline). */
function wordLibraryTotals(): Map<string, number> {
  const map = new Map<string, number>();
  for (const c of WORD_LIBRARY) {
    for (const b of c.books) map.set(b.id, b.words.length);
  }
  return map;
}

function EmptyState() {
  const { t } = useI18n();
  return (
    <div className="empty-state progress-empty">
      <span className="doodle" aria-hidden>🌸</span>
      <h3>{t('empty.title')}</h3>
      <p>{t('empty.desc')}</p>
      <Link to="/notebook" className="btn btn-primary" style={{ marginTop: 'var(--sp-3)' }}>
        {t('empty.cta')}
      </Link>
    </div>
  );
}

// ---------- share card ----------

function ShareCard({ profile }: { profile: Profile }) {
  const { t } = useI18n();
  const [includeSentences, setIncludeSentences] = useState(false);
  const [range, setRange] = useState<7 | 30 | 0>(7);
  const [busy, setBusy] = useState(false);
  const imgRef = useRef<HTMLDivElement>(null);
  const [sentencePicker, setSentencePicker] = useState(false);
  const [pickedSentences, setPickedSentences] = useState<{ word: string; text: string }[]>([]);
  const [certName, setCertName] = useState(profile.name);

  const doJson = async () => {
    setBusy(true);
    try {
      await downloadReportJson(profile, range, includeSentences ? pickedSentences.slice(0, 3) : undefined);
    } finally {
      setBusy(false);
    }
  };

  const doImage = async () => {
    if (!imgRef.current) return;
    setBusy(true);
    try {
      await downloadElementImage(imgRef.current, `progress-summary-${new Date().toISOString().slice(0, 10)}.png`);
    } finally {
      setBusy(false);
    }
  };

  const doCert = async () => {
    setBusy(true);
    try {
      await downloadCertificate({ ...profile, name: certName || profile.name }, await getWeeklyGoals(profile.id!));
    } finally {
      setBusy(false);
    }
  };

  const openPicker = async () => {
    const cands = await bestSentenceCandidates(profile);
    setPickedSentences(cands.slice(0, 3).map(({ word, text }) => ({ word, text })));
    setSentencePicker(true);
  };

  return (
    <section className="paper-card washi progress-card share-card">
      <h2>📤 {t('share.title')}</h2>
      <p className="muted small">{t('share.desc')}</p>

      <div className="share-controls">
        <div className="field">
          <label>{t('share.range')}</label>
          <div className="chip-row">
            {([7, 30, 0] as const).map((r) => (
              <button key={r} className={`chip ${range === r ? 'chip-on' : ''}`} aria-pressed={range === r} onClick={() => setRange(r)}>
                {t(r === 7 ? 'share.week' : r === 30 ? 'share.month' : 'share.term')}
              </button>
            ))}
          </div>
        </div>
        <label className="check-row">
          <input type="checkbox" checked={includeSentences} onChange={(e) => { setIncludeSentences(e.target.checked); if (e.target.checked) void openPicker(); }} />
          <span>
            {t('share.includeSentences')}
            <span className="faint small block">{t('share.sentencesHint')}</span>
          </span>
        </label>
        <div className="btn-row">
          <button className="btn btn-primary" disabled={busy} onClick={() => void doJson()}>📄 {t('share.json')}</button>
          <button className="btn" disabled={busy} onClick={() => void doImage()}>🖼 {t('share.image')}</button>
        </div>
        <details className="cert-details">
          <summary className="btn btn-sm" style={{ display: 'inline-flex', cursor: 'pointer' }}>🏅 {t('share.cert')}</summary>
          <div className="cert-form">
            <label className="faint small" htmlFor="cert-name">{t('share.certName')}</label>
            <input id="cert-name" className="input" value={certName} onChange={(e) => setCertName(e.target.value)} maxLength={60} />
            <button className="btn" disabled={busy} onClick={() => void doCert()}>🏅 {t('share.cert')}</button>
          </div>
        </details>
      </div>

      {/* hidden summary card rendered to image */}
      <div className="share-summary-source" aria-hidden>
        <SummaryImageCard innerRef={imgRef} profile={profile} range={range} pickedSentences={includeSentences ? pickedSentences : []} />
      </div>

      {sentencePicker && (
        <Modal title={t('share.pickSentences')} onClose={() => setSentencePicker(false)} footer={<button className="btn btn-primary" onClick={() => setSentencePicker(false)}>{t('common.close')}</button>}>
          {pickedSentences.length === 0 ? (
            <p className="muted">{t('help.empty')}</p>
          ) : (
            pickedSentences.map((s, i) => (
              <div key={i} className="sentence-pick">
                <strong>{s.word}</strong>
                <p className="muted small">“{s.text}”</p>
              </div>
            ))
          )}
        </Modal>
      )}
    </section>
  );
}

/** The printed summary: same numbers, framed for a parent/tutor. */
function SummaryImageCard({ innerRef, profile, range, pickedSentences }: {
  innerRef: React.RefObject<HTMLDivElement>;
  profile: Profile;
  range: 7 | 30 | 0;
  pickedSentences: { word: string; text: string }[];
}) {
  const { t } = useI18n();
  const words = useLiveQuery(() => listWords(profile.id!), [profile?.id]);
  const events = useLiveQuery(() => db.events.where('profileId').equals(profile.id!).toArray(), [profile?.id]);
  const live = words ? countStates(words) : null;
  void range;
  const week = useMemo(() => computeWeekProgress(events ?? [], words ?? [], Date.now()), [events, words]);
  const skills = useMemo(() => computeSkills(collectSkillSamples(events ?? [], words ?? [])), [events, words]);

  return (
    <div className="share-summary" ref={innerRef}>
      <div className="share-summary-head">
        <IconLogo size={30} />
        <div>
          <strong>{profile.name}</strong>
          <span className="faint"> · {new Date().toLocaleDateString()}</span>
        </div>
      </div>
      <div className="share-summary-stats">
        <span>📚 <b dir="ltr">{live?.total ?? 0}</b> {t('common.words')}</span>
        <span>🏆 <b dir="ltr">{live?.mastered ?? 0}</b> {t('garden.mastered')}</span>
        <span>✍️ <b dir="ltr">{week.sentencesDone}</b> {t('hero.sentences')}</span>
        <span>🔥 <b dir="ltr">{profile.stats.streakCount}</b> {t('common.days')}</span>
      </div>
      <div className="share-summary-skills">
        {skills.map((s) => (
          <span key={s.id}>
            {t(`skills.${s.id}`)}: <b dir="ltr">{s.display != null ? (s.id === 'writing' ? `${s.display}/10` : `${s.display}%`) : t('skills.notEnough')}</b>
          </span>
        ))}
      </div>
      {pickedSentences.length > 0 && (
        <div className="share-summary-sentences">
          {pickedSentences.map((s, i) => (
            <p key={i}><strong>{s.word}:</strong> “{s.text}”</p>
          ))}
        </div>
      )}
      <span className="faint small">{t('share.certFoot')}</span>
    </div>
  );
}

import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useProfiles } from '../../context/ProfileContext';
import { listWords } from '../../db/repo';
import { todayProgress, wordSectionStatuses } from '../../db/schedule';
import { StateDot } from '../../components/ui/Chips';
import { SpeakerButton } from '../../components/ui/SpeakerButton';
import { IconStreak, IconAddWord } from '../../components/ui/icons';
import { useI18n } from '../../i18n';
import type { Word } from '../../db/models';

interface DueItem {
  word: Word;
  index: 1 | 2 | 3 | 4;
  overdueDays: number;
  state: string;
}

export function Dashboard() {
  const { profile } = useProfiles();
  const { t } = useI18n();
  const navigate = useNavigate();

  const words = useLiveQuery(
    () => (profile?.id != null ? listWords(profile.id) : Promise.resolve([] as Word[])),
    [profile?.id],
  );

  const { dueItems, progress, doneToday } = useMemo(() => {
    const now = Date.now();
    if (!words || !profile) return { dueItems: [] as DueItem[], progress: { done: 0, goal: 3 }, doneToday: 0 };
    const items: DueItem[] = [];
    for (const w of words) {
      for (const st of wordSectionStatuses(w, profile.settings.intervals, now)) {
        if (st.state === 'due' || st.state === 'overdue') {
          items.push({
            word: w,
            index: st.index,
            state: st.state,
            overdueDays: st.unlockedAt != null ? Math.max(0, Math.floor((now - st.unlockedAt) / 86_400_000) - 0) : 0,
          });
        }
      }
    }
    items.sort((a, b) => b.overdueDays - a.overdueDays || a.word.wordLower.localeCompare(b.word.wordLower));
    const prog = todayProgress(words, profile.settings.dailyGoal, now);
    return { dueItems: items, progress: prog, doneToday: prog.done };
  }, [words, profile]);

  if (!profile) return null;

  const pct = Math.min(100, Math.round((progress.done / Math.max(1, progress.goal)) * 100));
  const firstName = profile.name.split(' ')[0];
  const hour = new Date().getHours();
  const greeting =
    hour < 12
      ? t('today.greeting.morning', { name: firstName })
      : hour < 18
        ? t('today.greeting.afternoon', { name: firstName })
        : t('today.greeting.evening', { name: firstName });

  // group consecutive per word
  const groups: { word: Word; items: DueItem[] }[] = [];
  for (const item of dueItems) {
    const last = groups[groups.length - 1];
    if (last && last.word.id === item.word.id) last.items.push(item);
    else groups.push({ word: item.word, items: [item] });
  }

  return (
    <div>
      <div className="dash-hero">
        <div>
          <h1 className="dash-greeting">{greeting}</h1>
          <p className="muted">
            {dueItems.length === 0
              ? t('today.nothingDue')
              : t('today.sectionsWaiting', { n: dueItems.length })}
          </p>
        </div>
        <span className="streak-pill" title={t('today.streakTitle')}>
          <IconStreak /> {t('today.streak', { n: profile.stats.streakCount })}
        </span>
      </div>

      <div className="dash-progress">
        <div
          className="progress-track"
          role="progressbar"
          aria-valuenow={progress.done}
          aria-valuemin={0}
          aria-valuemax={progress.goal}
          aria-label={t('today.progressLabel')}
        >
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="dash-progress-label" style={{ whiteSpace: 'nowrap' }}>
          {t('today.sessions', { done: doneToday, goal: progress.goal })} {pct >= 100 ? t('today.goalMet') : ''}
        </span>
      </div>

      {groups.length === 0 ? (
        <div className="empty-state">
          <span className="doodle">🌈</span>
          <h3>{t('today.caughtUp')}</h3>
          <p>{t('today.caughtUpBody')}</p>
          <div className="btn-row" style={{ justifyContent: 'center', marginTop: 'var(--sp-4)' }}>
            <Link to="/notebook" className="btn btn-primary">
              {t('today.myWords')}
            </Link>
            <Link to="/review" className="btn">
              {t('today.reviewCards')}
            </Link>
          </div>
        </div>
      ) : (
        <div>
          {groups.map((g) => (
            <div key={g.word.id} className="due-group">
              <button className="due-word-head" onClick={() => navigate(`/word/${g.word.id}`)}>
                <span className="word">{g.word.word}</span>
                <SpeakerButton text={g.word.word} small />
                <span className="due-count faint">
                  {g.word.levelTags.length > 0 ? g.word.levelTags.join(' · ') : ''}
                </span>
              </button>
              <div className="due-sections">
                {g.items.map((item) => (
                  <button
                    key={item.index}
                    className="due-section-row"
                    onClick={() => navigate(`/word/${item.word.id}?section=${item.index}`)}
                  >
                    <StateDot state={item.state} />
                    <span className="sec-name">
                      {/* isolate "3." so the dot stays attached to the digit in RTL */}
                      <span dir="ltr" style={{ unicodeBidi: 'isolate' }}>{item.index}.</span>{' '}
                      {t(`section.${item.index}`)}
                    </span>
                    <span className={`sec-note ${item.state}`}>
                      {item.state === 'overdue'
                        ? item.overdueDays > 0
                          ? t('today.daysOverdue', { n: item.overdueDays })
                          : t('today.overdue')
                        : t('today.dueToday')}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Link to="/notebook" className="fab" aria-label={t('today.addWord')} title={t('today.addWord')}>
        <IconAddWord />
      </Link>
    </div>
  );
}

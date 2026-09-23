import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useProfiles } from '../../context/ProfileContext';
import { listWords } from '../../db/repo';
import { todayProgress, wordSectionStatuses } from '../../db/schedule';
import { StateDot } from '../../components/ui/Chips';
import { SpeakerButton } from '../../components/ui/SpeakerButton';
import type { Word } from '../../db/models';

const SECTION_SHORT = ['Definition', 'Example', 'Own sentence', 'Note'];

interface DueItem {
  word: Word;
  index: 1 | 2 | 3 | 4;
  overdueDays: number;
  state: string;
}

export function Dashboard() {
  const { profile } = useProfiles();
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
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

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
          <h1 className="dash-greeting">
            {greeting}, {firstName}!
          </h1>
          <p className="muted">
            {dueItems.length === 0
              ? 'Nothing is due — add a new word or review old ones. 🎈'
              : `${dueItems.length} section${dueItems.length === 1 ? '' : 's'} waiting for you.`}
          </p>
        </div>
        <span className="streak-pill" title="Days in a row with at least one section completed">
          🔥 {profile.stats.streakCount} day{profile.stats.streakCount === 1 ? '' : 's'}
        </span>
      </div>

      <div className="dash-progress">
        <div
          className="progress-track"
          role="progressbar"
          aria-valuenow={progress.done}
          aria-valuemin={0}
          aria-valuemax={progress.goal}
          aria-label="Daily goal progress"
        >
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
          {doneToday}/{progress.goal} today {pct >= 100 ? '🌟' : ''}
        </span>
      </div>

      {groups.length === 0 ? (
        <div className="empty-state">
          <span className="doodle">🌈</span>
          <h3>All caught up!</h3>
          <p>Write a sentence, add a word, or flip through some flashcards.</p>
          <div className="btn-row" style={{ justifyContent: 'center', marginTop: 'var(--sp-4)' }}>
            <Link to="/notebook" className="btn btn-primary">
              📓 My words
            </Link>
            <Link to="/review" className="btn">
              🔁 Review flashcards
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
                <span className="faint" style={{ marginLeft: 'auto', fontSize: '0.8rem' }}>
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
                      {item.index}. {SECTION_SHORT[item.index - 1]}
                    </span>
                    <span className="sec-note">
                      {item.state === 'overdue' ? `${item.overdueDays} day${item.overdueDays === 1 ? '' : 's'} late` : 'due today'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Link to="/notebook" className="fab" aria-label="Add a word" title="Add a word">
        ＋
      </Link>
    </div>
  );
}

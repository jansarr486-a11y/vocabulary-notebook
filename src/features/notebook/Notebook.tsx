import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useProfiles } from '../../context/ProfileContext';
import { addWord, newWord, listWords } from '../../db/repo';
import { LEVEL_TAGS, type LevelTag } from '../../db/models';
import { wordSectionStatuses } from '../../db/schedule';
import { StateDot } from '../../components/ui/Chips';
import { SpeakerButton } from '../../components/ui/SpeakerButton';
import { WordFormModal } from './WordFormModal';
import { useObjectUrl } from '../../hooks/useMisc';
import { useToast } from '../../components/ui/ToastProvider';
import type { Word } from '../../db/models';

function WordTile({ word, intervals }: { word: Word; intervals: { s1: number; s2: number; s3: number; s4: number | null } }) {
  const thumb = useObjectUrl(word.imageBlob);
  const now = Date.now();
  const statuses = wordSectionStatuses(word, intervals, now);
  const doneCount = statuses.filter((s) => s.state === 'done').length;

  return (
    <Link to={`/word/${word.id}`} className="word-tile">
      {thumb && <img className="word-thumb" src={thumb} alt="" />}
      <span className="w">
        {word.word}
        <SpeakerButton text={word.word} small />
      </span>
      <span className="pos">
        {word.partOfSpeech ? `${word.partOfSpeech} · ` : ''}
        added {new Date(word.dateAdded).toLocaleDateString()}
      </span>
      {word.persianMeaning && (
        <span className="persian-meaning" dir="rtl" lang="fa">
          {word.persianMeaning}
        </span>
      )}
      <div className="dots">
        {statuses.map((s) => (
          <StateDot key={s.index} state={s.state} />
        ))}
      </div>
      <div className="tile-bar" aria-hidden>
        <i style={{ width: `${(doneCount / 4) * 100}%` }} />
      </div>
      <span className="count">
        {doneCount}/4 sections {word.levelTags.length > 0 && `· ${word.levelTags.join(', ')}`}
      </span>
    </Link>
  );
}

export function Notebook() {
  const { profile } = useProfiles();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState<LevelTag[]>([]);

  const words = useLiveQuery(
    () => (profile?.id != null ? listWords(profile.id) : Promise.resolve([])),
    [profile?.id],
  );

  const filtered = useMemo(() => {
    if (!words) return [];
    const q = query.trim().toLowerCase();
    return words.filter((w) => {
      if (q && !w.wordLower.includes(q) && !(w.courseTag ?? '').toLowerCase().includes(q)) return false;
      if (levelFilter.length > 0 && !w.levelTags.some((t) => levelFilter.includes(t))) return false;
      return true;
    });
  }, [words, query, levelFilter]);

  if (!profile) return null;

  const submitNew = async (input: Parameters<typeof newWord>[1]) => {
    const id = await addWord(newWord(profile.id!, input));
    setAdding(false);
    toast(`“${input.word.trim()}” added to your notebook!`);
    navigate(`/word/${id}`);
  };

  return (
    <div>
      <div className="notebook-head">
        <h1>My Notebook</h1>
        <input
          className="input"
          style={{ maxWidth: 260 }}
          placeholder="🔍 Search words…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search words"
        />
      </div>

      <div className="chip-row" style={{ marginBottom: 'var(--sp-4)' }}>
        {LEVEL_TAGS.map((tag) => {
          const on = levelFilter.includes(tag);
          return (
            <button
              key={tag}
              className={`chip ${on ? 'chip-on' : ''}`}
              aria-pressed={on}
              onClick={() => setLevelFilter((prev) => (prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag]))}
            >
              {tag}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <span className="doodle">🌱</span>
          <h3>{words && words.length > 0 ? 'Nothing matches' : 'Your notebook is empty'}</h3>
          <p>
            {words && words.length > 0
              ? 'Try a different search or filter.'
              : 'Every big vocabulary starts with one word. Add your first!'}
          </p>
        </div>
      ) : (
        <div className="word-grid">
          {filtered.map((w) => (
            <WordTile key={w.id} word={w} intervals={profile.settings.intervals} />
          ))}
        </div>
      )}

      <button className="fab" onClick={() => setAdding(true)} aria-label="Add a word" title="Add a word">
        ＋
      </button>

      {adding && <WordFormModal onClose={() => setAdding(false)} onSubmit={submitNew} />}
    </div>
  );
}


import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useProfiles } from '../../context/ProfileContext';
import { getWord, deleteWord, completeSection, saveSectionText, uncompleteSection, updateWordHeader } from '../../db/repo';
import { unlockLabel, wordSectionStatuses } from '../../db/schedule';
import { suggestDefinition, type Suggestion } from '../dictionary/dictionary';
import { LevelBadge, StateBadge } from '../../components/ui/Chips';
import { SpeakerButton } from '../../components/ui/SpeakerButton';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/ToastProvider';
import { useObjectUrl } from '../../hooks/useMisc';
import { WordFormModal } from './WordFormModal';
import type { Word } from '../../db/models';

const SECTION_TITLES = [
  'Dictionary definition',
  'Dictionary example',
  'Your own sentence',
  'Note · mnemonic · synonyms',
];
const SECTION_SUBS = [
  'One short sentence: what does this word mean?',
  'A sentence from a dictionary that shows how the word is used.',
  'Write it yourself — no hints, that’s how memory grows! 💪',
  'Optional: a trick to remember it, or words with similar meaning.',
];

interface SuggestState {
  loading: boolean;
  error?: string;
  suggestion?: Suggestion;
}

function SectionEditor({
  word,
  index,
  onDone,
  onClose,
}: {
  word: Word;
  index: 1 | 2 | 3 | 4;
  onDone: () => void;
  onClose: () => void;
}) {
  const { profile } = useProfiles();
  const { toast } = useToast();
  const [text, setText] = useState(word.sections[index - 1]?.text ?? '');
  const [suggest, setSuggest] = useState<SuggestState>({ loading: false });
  const textRef = useRef<HTMLTextAreaElement>(null);

  const canSuggest = index === 1 || index === 2;
  const isOwn = index === 3;

  const doSuggest = async () => {
    setSuggest({ loading: true });
    try {
      const s = await suggestDefinition(word.word);
      setSuggest({ loading: false, suggestion: s });
    } catch {
      setSuggest({
        loading: false,
        error: 'No suggestion right now (offline or word not found). You can still write it yourself!',
      });
    }
  };

  const complete = async () => {
    if (!text.trim()) {
      textRef.current?.focus();
      return;
    }
    await completeSection(word.id!, index, text.trim(), profile!.settings.intervals, profile!.id!);
    toast(`Section ${index} complete! ${index < 4 ? 'The next one unlocks soon. 🌟' : 'Word finished! 🎉'}`);
    onDone();
  };

  const saveDraft = async () => {
    await saveSectionText(word.id!, index, text);
    toast('Draft saved — finish it later.');
    onClose();
  };

  return (
    <div className="section-editor page-turn">
      {canSuggest && (
        <button type="button" className="btn btn-sm" disabled={suggest.loading} onClick={() => void doSuggest()}>
          {suggest.loading ? 'Looking it up…' : '✨ Suggest from dictionary'}
        </button>
      )}
      {isOwn && (
        <p className="faint" style={{ fontSize: '0.8rem', marginBottom: 'var(--sp-2)' }}>
          ✍️ No auto-suggestions here — this one is all you.
        </p>
      )}

      {suggest.suggestion && (
        <div className="suggest-box">
          <span className="card-label" style={{ fontSize: '0.7rem', letterSpacing: '0.08em', color: 'var(--ink-faint)' }}>
            SUGGESTION {suggest.suggestion.fromCache ? '(saved offline)' : '(from dictionary)'} — edit freely
          </span>
          <p className="s-def">{suggest.suggestion.definition}</p>
          {suggest.suggestion.example && <p className="s-ex">“{suggest.suggestion.example}”</p>}
          <div className="suggest-actions">
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => {
                setText(
                  index === 1
                    ? suggest.suggestion!.definition
                    : (suggest.suggestion!.example ?? suggest.suggestion!.definition),
                );
                textRef.current?.focus();
              }}
            >
              Use it
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setSuggest({ loading: false })}>
              Dismiss
            </button>
          </div>
        </div>
      )}
      {suggest.error && (
        <p style={{ color: 'var(--red)', fontSize: '0.85rem', marginBottom: 'var(--sp-2)' }}>{suggest.error}</p>
      )}

      <textarea
        ref={textRef}
        className="textarea"
        autoFocus
        placeholder={index === 4 ? 'e.g. “generous” sounds like “genie” — a genie is generous with wishes!' : 'Type here…'}
        value={text}
        maxLength={1200}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="sec-actions">
        <button type="button" className="btn btn-primary" disabled={!text.trim()} onClick={() => void complete()}>
          ✓ Mark as done
        </button>
        <button type="button" className="btn" onClick={() => void saveDraft()}>
          Save draft
        </button>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export function WordCard() {
  const { id } = useParams();
  const wordId = Number(id);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { profile } = useProfiles();
  const { toast } = useToast();

  const word = useLiveQuery(() => getWord(wordId), [wordId]);
  const [now, setNow] = useState(Date.now());
  const [openSection, setOpenSection] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [exporting, setExporting] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  // Deep-link: /word/:id?section=2 opens that section's editor
  useEffect(() => {
    const s = searchParams.get('section');
    if (s && word) setOpenSection(Number(s));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, word?.id]);

  const thumb = useObjectUrl(word?.imageBlob);

  const statuses = useMemo(
    () => (word && profile ? wordSectionStatuses(word, profile.settings.intervals, now) : []),
    [word, profile, now],
  );

  if (!profile) return null;
  if (!word) {
    return (
      <div className="empty-state">
        <span className="doodle">🔍</span>
        <h3>Word not found</h3>
        <Link to="/notebook" className="btn" style={{ marginTop: 'var(--sp-3)' }}>
          ← Back to the notebook
        </Link>
      </div>
    );
  }

  const shareImage = async () => {
    if (!cardRef.current) return;
    setExporting(true);
    try {
      await new Promise((r) => window.setTimeout(r, 60));
      // Lazy-loaded: only fetched when the student shares a card image.
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(cardRef.current, {
        backgroundColor: '#faf6ee',
        pixelRatio: 2,
        cacheBust: true,
      });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${word.wordLower}-card.png`;
      a.click();
      toast('Card image saved — ready to share! 📤');
    } catch {
      toast('Could not create the image.');
    } finally {
      setExporting(false);
    }
  };

  const removeWord = async () => {
    await deleteWord(word.id!);
    toast(`“${word.word}” removed from the notebook.`);
    navigate('/notebook');
  };

  return (
    <div className="word-card" ref={cardRef}>
      <Link to="/notebook" className="word-card-back faint">
        ← back to notebook
      </Link>

      <div className="word-head paper-card washi">
        <div className="title-row">
          <h1 className="big-word">{word.word}</h1>
          <SpeakerButton text={word.word} />
          {word.phonetic && <span className="phon">{word.phonetic}</span>}
        </div>
        <div className="meta-row">
          {word.partOfSpeech && <span className="chip" style={{ background: 'var(--paper-deep)', color: 'var(--ink-soft)' }}>{word.partOfSpeech}</span>}
          {word.levelTags.map((t) => (
            <LevelBadge key={t} tag={t} />
          ))}
          {word.courseTag && <span className="chip" style={{ background: 'var(--blue-soft)', color: 'var(--blue)' }}>{word.courseTag}</span>}
          <span className="faint" style={{ fontSize: '0.8rem' }}>
            added {new Date(word.dateAdded).toLocaleDateString()}
          </span>
        </div>
        {thumb && (
          <div className="img-wrap">
            <img src={thumb} alt={`Illustration for ${word.word}`} />
          </div>
        )}
        {word.persianMeaning && (
          <p className="persian-meaning" dir="rtl" lang="fa">
            {word.persianMeaning}
          </p>
        )}
        <div className="sec-actions" style={{ marginTop: 'var(--sp-4)' }}>
          <button className="btn btn-sm" onClick={() => setEditing(true)}>
            ✏️ Edit word
          </button>
          <button className="btn btn-sm" disabled={exporting} onClick={() => void shareImage()}>
            📤 Share as image
          </button>
          <button className="btn btn-sm btn-danger" onClick={() => setConfirmDelete(true)}>
            🗑 Delete
          </button>
        </div>
      </div>

      {statuses.map((st) => {
        const idx = st.index as 1 | 2 | 3 | 4;
        const section = word.sections[idx - 1];
        const isDone = st.state === 'done';
        const isLocked = st.state === 'locked';
        const isOpen = openSection === idx;

        return (
          <div key={idx} className={`section-entry ${isDone ? 'done' : ''} ${st.state === 'overdue' ? 'overdue' : ''} ${isLocked ? 'locked-look' : ''}`}>
            <div className="sec-head">
              <span className="sec-num">{isDone ? '✓' : idx}</span>
              <div style={{ flex: 1 }}>
                <div className="sec-title">{SECTION_TITLES[idx - 1]}</div>
                <div className="sec-sub">{SECTION_SUBS[idx - 1]}</div>
              </div>
              <StateBadge state={st.state} />
            </div>

            {isLocked ? (
              <div className="unlock-note">🔒 {st.unlockedAt != null ? unlockLabel(st.unlockedAt, now) : 'Complete the previous section first'}.</div>
            ) : isDone && !isOpen ? (
              <div className="sec-body">
                <p className="sec-text">{section?.text}</p>
                {idx === 1 && word.persianMeaning && (
                  <p className="persian-meaning" dir="rtl" lang="fa">
                    {word.persianMeaning}
                  </p>
                )}
                <div className="sec-actions">
                  <span className="faint" style={{ fontSize: '0.78rem', alignSelf: 'center' }}>
                    done {section?.completedAt ? new Date(section.completedAt).toLocaleDateString() : ''}
                  </span>
                  <button className="btn btn-sm" onClick={() => setOpenSection(idx)}>
                    Improve
                  </button>
                  <button
                    className="btn btn-sm btn-ghost"
                    title="Re-open this section"
                    onClick={async () => {
                      await uncompleteSection(word.id!, idx);
                      setOpenSection(idx);
                    }}
                  >
                    Mark as not done
                  </button>
                </div>
              </div>
            ) : isDone && isOpen ? (
              <div className="sec-body">
                <SectionEditor
                  word={word}
                  index={idx}
                  onDone={() => setOpenSection(null)}
                  onClose={() => setOpenSection(null)}
                />
              </div>
            ) : isOpen ? (
              <div className="sec-body">
                <SectionEditor word={word} index={idx} onDone={() => setOpenSection(null)} onClose={() => setOpenSection(null)} />
              </div>
            ) : (
              <div className="sec-body" style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
                {section?.text && <p className="sec-text muted" style={{ flex: 1 }}>draft: {section.text}</p>}
                <button className={`btn ${st.state === 'due' || st.state === 'overdue' ? 'btn-primary' : ''}`} onClick={() => setOpenSection(idx)}>
                  {section?.text ? 'Continue' : 'Start writing'}
                </button>
              </div>
            )}
          </div>
        );
      })}

      {editing && (
        <WordFormModal
          existing={word}
          title={`Edit “${word.word}”`}
          onClose={() => setEditing(false)}
          onSubmit={async (input) => {
            await updateWordHeader(word.id!, input);
            setEditing(false);
            toast('Word updated ✏️');
          }}
        />
      )}

      {confirmDelete && (
        <Modal
          title={`Delete “${word.word}”?`}
          onClose={() => setConfirmDelete(false)}
          footer={
            <>
              <button className="btn" onClick={() => setConfirmDelete(false)}>
                Keep it
              </button>
              <button className="btn btn-danger" onClick={() => void removeWord()}>
                Delete forever
              </button>
            </>
          }
        >
          <p>This removes the word and all four sections from your notebook. There is no undo.</p>
        </Modal>
      )}
    </div>
  );
}

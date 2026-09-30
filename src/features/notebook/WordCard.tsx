import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useProfiles } from '../../context/ProfileContext';
import { getWord, deleteWord, completeSection, saveSectionText, uncompleteSection, updateWordHeader } from '../../db/repo';
import { logProgressEvent } from '../../db/progressRepo';
import { unlockLabel, wordSectionStatuses } from '../../db/schedule';
import { suggestDefinition, type Suggestion } from '../dictionary/dictionary';
import { LevelBadge, StateBadge } from '../../components/ui/Chips';
import { SpeakerButton } from '../../components/ui/SpeakerButton';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/ToastProvider';
import { useObjectUrl } from '../../hooks/useMisc';
import { useI18n } from '../../i18n';
import { WordFormModal } from './WordFormModal';
import type { Word } from '../../db/models';

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
  const { t } = useI18n();
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
        error: t('section.suggestFail'),
      });
    }
  };

  const complete = async () => {
    if (!text.trim()) {
      textRef.current?.focus();
      return;
    }
    await completeSection(word.id!, index, text.trim(), profile!.settings.intervals, profile!.id!);
    // Progress logging (fire-and-forget, never alters the section flow).
    if (profile?.id != null) {
      logProgressEvent(profile.id, {
        type: 'section_completed',
        wordId: word.id,
        meta: { sectionNumber: index },
      });
      if (index === 3) {
        logProgressEvent(profile.id, { type: 'own_sentence_written', wordId: word.id });
      }
    }
    toast(`${t('section.n', { n: index })} ${index < 4 ? t('section.nextSoon') : t('section.wordFinished')}`);
    onDone();
  };

  const saveDraft = async () => {
    await saveSectionText(word.id!, index, text);
    toast(t('section.draftSaved'));
    onClose();
  };

  return (
    <div className="section-editor page-turn">
      {canSuggest && (
        <button type="button" className="btn btn-sm" disabled={suggest.loading} onClick={() => void doSuggest()}>
          {suggest.loading ? t('section.lookingUp') : t('section.suggest')}
        </button>
      )}
      {isOwn && (
        <p className="faint" style={{ fontSize: '0.8rem', marginBottom: 'var(--sp-2)' }}>
          {t('section.noAuto')}
        </p>
      )}

      {suggest.suggestion && (
        <div className="suggest-box">
          <span className="card-label" style={{ fontSize: '0.7rem', letterSpacing: '0.08em', color: 'var(--ink-faint)' }}>
            {t('section.suggestion', {
              src: suggest.suggestion.fromCache ? t('section.sugCache') : t('section.sugDict'),
            })}
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
              {t('section.useIt')}
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setSuggest({ loading: false })}>
              {t('section.dismiss')}
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
        placeholder={index === 4 ? t('section.ph4') : t('section.typeHere')}
        value={text}
        maxLength={1200}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="sec-actions">
        <button type="button" className="btn btn-primary" disabled={!text.trim()} onClick={() => void complete()}>
          {t('section.markDone')}
        </button>
        <button type="button" className="btn" onClick={() => void saveDraft()}>
          {t('section.saveDraft')}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          {t('common.cancel')}
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
  const { t, lang } = useI18n();

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
        <h3>{t('word.notFound')}</h3>
        <Link to="/notebook" className="btn" style={{ marginTop: 'var(--sp-3)' }}>
          {t('word.backToNotebook')}
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
      toast(t('word.imageSaved'));
    } catch {
      toast(t('word.imageFail'));
    } finally {
      setExporting(false);
    }
  };

  const removeWord = async () => {
    await deleteWord(word.id!);
    toast(t('word.removedToast', { word: word.word }));
    navigate('/notebook');
  };

  return (
    <div className="word-card" ref={cardRef}>
      <Link to="/notebook" className="word-card-back">
        {t('word.backToNotebook')}
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
            {t('nb.addedOn', { date: new Date(word.dateAdded).toLocaleDateString() })}
          </span>
        </div>
        {thumb && (
          <div className="img-wrap">
            <img src={thumb} alt={t('word.illustrationAlt', { word: word.word })} />
          </div>
        )}
        {word.persianMeaning && (
          <p className="persian-meaning" dir="rtl" lang="fa">
            {word.persianMeaning}
          </p>
        )}
        <div className="sec-actions" style={{ marginTop: 'var(--sp-4)' }}>
          <button className="btn btn-sm" onClick={() => setEditing(true)}>
            {t('word.edit')}
          </button>
          <button className="btn btn-sm" disabled={exporting} onClick={() => void shareImage()}>
            {t('word.shareImage')}
          </button>
          <button className="btn btn-sm btn-danger" onClick={() => setConfirmDelete(true)}>
            {t('word.delete')}
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
                <div className="sec-title">{t(`section.${idx}.full`)}</div>
                <div className="sec-sub">{t(`section.${idx}.sub`)}</div>
              </div>
              <StateBadge state={st.state} />
            </div>

            {isLocked ? (
              <div className="unlock-note">
                🔒 {st.unlockedAt != null ? unlockLabel(st.unlockedAt, now, t) : t('section.unlockPrev')}.
              </div>
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
                    {section?.completedAt ? t('section.doneAgo', { date: new Date(section.completedAt).toLocaleDateString() }) : ''}
                  </span>
                  <button className="btn btn-sm" onClick={() => setOpenSection(idx)}>
                    {t('section.improve')}
                  </button>
                  <button
                    className="btn btn-sm btn-ghost"
                    title={t('section.reopenTitle')}
                    onClick={async () => {
                      await uncompleteSection(word.id!, idx);
                      setOpenSection(idx);
                    }}
                  >
                    {t('section.markNotDone')}
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
                {section?.text && (
                  <p className="sec-text muted" style={{ flex: 1 }}>
                    {t('section.draft')} {section.text}
                  </p>
                )}
                <button className={`btn ${st.state === 'due' || st.state === 'overdue' ? 'btn-primary' : ''}`} onClick={() => setOpenSection(idx)}>
                  {section?.text ? t('section.continue') : t('section.startWriting')}
                </button>
              </div>
            )}
          </div>
        );
      })}

      {editing && (
        <WordFormModal
          existing={word}
          title={lang === 'fa' ? `ویرایش «${word.word}»` : `Edit “${word.word}”`}
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
          title={t('word.deleteTitle', { word: word.word })}
          onClose={() => setConfirmDelete(false)}
          footer={
            <>
              <button className="btn" onClick={() => setConfirmDelete(false)}>
                {t('word.keepIt')}
              </button>
              <button className="btn btn-danger" onClick={() => void removeWord()}>
                {t('word.deleteForever')}
              </button>
            </>
          }
        >
          <p>{t('word.deleteBody')}</p>
        </Modal>
      )}
    </div>
  );
}

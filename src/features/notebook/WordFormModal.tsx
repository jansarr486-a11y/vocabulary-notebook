import { useEffect, useRef, useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { LevelChips } from '../../components/ui/Chips';
import { downscaleImage } from '../../utils/image';
import { useObjectUrl } from '../../hooks/useMisc';
import { PARTS_OF_SPEECH, type LevelTag, type Word } from '../../db/models';
import { useI18n } from '../../i18n';
import type { NewWordInput } from '../../db/repo';

interface Props {
  onClose: () => void;
  onSubmit: (input: NewWordInput) => Promise<void> | void;
  existing?: Word;
  title?: string;
}

export function WordFormModal({ onClose, onSubmit, existing, title }: Props) {
  const { t } = useI18n();
  const [word, setWord] = useState(existing?.word ?? '');
  const [phonetic, setPhonetic] = useState(existing?.phonetic ?? '');
  const [pos, setPos] = useState(existing?.partOfSpeech ?? '');
  const [persian, setPersian] = useState(existing?.persianMeaning ?? '');
  const [tags, setTags] = useState<LevelTag[]>(existing?.levelTags ?? []);
  const [course, setCourse] = useState(existing?.courseTag ?? '');
  const [blob, setBlob] = useState<Blob | undefined>(undefined);
  const [removeImage, setRemoveImage] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const currentImage = useObjectUrl(blob ?? existing?.imageBlob);

  useEffect(() => {
    const t = window.setTimeout(() => document.getElementById('wf-word')?.focus(), 60);
    return () => window.clearTimeout(t);
  }, []);

  const pickImage = async (file: File) => {
    try {
      const { blob: b } = await downscaleImage(file);
      setBlob(b);
      setRemoveImage(false);
    } catch {
      // non-image or undecodable file — ignore silently
    }
  };

  const canSave = word.trim().length > 0 && !busy;

  const submit = async () => {
    if (!canSave) return;
    setBusy(true);
    try {
      await onSubmit({
        word: word.trim(),
        phonetic: phonetic.trim() || undefined,
        partOfSpeech: pos || undefined,
        persianMeaning: persian.trim() || undefined,
        levelTags: tags,
        courseTag: course.trim() || undefined,
        imageBlob: removeImage ? undefined : (blob ?? undefined),
        imageMime: blob?.type,
        removeImage: removeImage,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={title ?? (existing ? t('form.editTitle') : t('form.addTitle'))}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn btn-primary" disabled={!canSave} onClick={() => void submit()}>
            {existing ? t('form.saveChanges') : `${t('form.addToNotebook')} ✏️`}
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="wf-word">{t('form.word')}</label>
        <input
          id="wf-word"
          className="input"
          style={{ fontFamily: 'var(--font-hand)', fontSize: '1.4rem' }}
          placeholder={t('form.wordPlaceholder')}
          value={word}
          maxLength={60}
          onChange={(e) => setWord(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void submit()}
        />
      </div>

      <div className="edit-head">
        <div className="field">
          <label htmlFor="wf-phon">{t('form.phonetic')}</label>
          <input
            id="wf-phon"
            className="input"
            placeholder="/ˈdʒenərəs/"
            value={phonetic}
            maxLength={60}
            onChange={(e) => setPhonetic(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="wf-pos">{t('form.pos')}</label>
          <select id="wf-pos" className="select" value={pos} onChange={(e) => setPos(e.target.value)}>
            <option value="">{t('form.posChoose')}</option>
            {PARTS_OF_SPEECH.map((p) => (
              <option key={p} value={p}>
                {t(`pos.${p}`)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field">
        <label htmlFor="wf-persian">{t('form.persian')}</label>
        <input
          id="wf-persian"
          className="input"
          dir="rtl"
          lang="fa"
          placeholder="مثلاً: سخاوتمند"
          value={persian}
          maxLength={120}
          onChange={(e) => setPersian(e.target.value)}
        />
      </div>

      <div className="field">
        <label>{t('form.levels')}</label>
        <LevelChips selected={tags} onToggle={(t) => setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))} />
      </div>

      <div className="field">
        <label htmlFor="wf-course">{t('form.course')}</label>
        <input
          id="wf-course"
          className="input"
          placeholder={t('form.coursePlaceholder')}
          value={course}
          maxLength={80}
          onChange={(e) => setCourse(e.target.value)}
        />
      </div>

      <div className="field">
        <label>{t('form.picture')}</label>
        {currentImage && !removeImage ? (
          <div className="img-wrap" style={{ position: 'relative', display: 'inline-block' }}>
            <img src={currentImage} alt="Word illustration" style={{ maxHeight: 140, borderRadius: 10, border: '2px solid var(--line)' }} />
            <button
              type="button"
              className="btn btn-sm btn-danger img-remove"
              onClick={() => {
                setRemoveImage(true);
                setBlob(undefined);
              }}
            >
              {t('form.remove')}
            </button>
          </div>
        ) : (
          <button type="button" className="btn btn-ghost" onClick={() => fileRef.current?.click()}>
            {t('form.choosePicture')}
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void pickImage(f);
            e.target.value = '';
          }}
        />
      </div>
    </Modal>
  );
}

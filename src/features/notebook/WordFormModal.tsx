import { useEffect, useRef, useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { LevelChips } from '../../components/ui/Chips';
import { downscaleImage } from '../../utils/image';
import { useObjectUrl } from '../../hooks/useMisc';
import { PARTS_OF_SPEECH, type LevelTag, type Word } from '../../db/models';
import type { NewWordInput } from '../../db/repo';

interface Props {
  onClose: () => void;
  onSubmit: (input: NewWordInput) => Promise<void> | void;
  existing?: Word;
  title?: string;
}

export function WordFormModal({ onClose, onSubmit, existing, title }: Props) {
  const [word, setWord] = useState(existing?.word ?? '');
  const [phonetic, setPhonetic] = useState(existing?.phonetic ?? '');
  const [pos, setPos] = useState(existing?.partOfSpeech ?? '');
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
      title={title ?? (existing ? 'Edit word' : 'Add a word')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={!canSave} onClick={() => void submit()}>
            {existing ? 'Save changes' : 'Add to notebook'} ✏️
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="wf-word">Word *</label>
        <input
          id="wf-word"
          className="input"
          style={{ fontFamily: 'var(--font-hand)', fontSize: '1.4rem' }}
          placeholder="e.g. generous"
          value={word}
          maxLength={60}
          onChange={(e) => setWord(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void submit()}
        />
      </div>

      <div className="edit-head">
        <div className="field">
          <label htmlFor="wf-phon">Phonetics (optional)</label>
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
          <label htmlFor="wf-pos">Part of speech</label>
          <select id="wf-pos" className="select" value={pos} onChange={(e) => setPos(e.target.value)}>
            <option value="">— choose —</option>
            {PARTS_OF_SPEECH.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field">
        <label>Level tags (choose any)</label>
        <LevelChips selected={tags} onToggle={(t) => setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))} />
      </div>

      <div className="field">
        <label htmlFor="wf-course">Course / term (optional)</label>
        <input
          id="wf-course"
          className="input"
          placeholder="e.g. Term 1 — Fall 2026"
          value={course}
          maxLength={80}
          onChange={(e) => setCourse(e.target.value)}
        />
      </div>

      <div className="field">
        <label>Picture (optional — great for younger students)</label>
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
              Remove
            </button>
          </div>
        ) : (
          <button type="button" className="btn btn-ghost" onClick={() => fileRef.current?.click()}>
            🖼️ Choose a picture
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

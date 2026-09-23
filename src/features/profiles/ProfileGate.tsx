import { useRef, useState } from 'react';
import { useProfiles } from '../../context/ProfileContext';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/ToastProvider';
import { importBackup } from '../../db/repo';
import type { BackupEnvelope } from '../../db/models';

const ACCENTS = ['#c96f4a', '#d9a13c', '#7fa05f', '#8c5f9d', '#4a7bb5', '#c95f7f'];

export function ProfileGate() {
  const { profiles, choose, createNew, refresh, activate } = useProfiles();
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [accent, setAccent] = useState(ACCENTS[0]);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const submitCreate = async () => {
    if (!name.trim()) return;
    if (pin && !/^\d{4}$/.test(pin)) {
      toast('PIN must be exactly 4 digits (or leave it empty)');
      return;
    }
    setBusy(true);
    try {
      await createNew(name, accent, pin || undefined);
    } finally {
      setBusy(false);
    }
  };

  const onRestoreFile = async (file: File) => {
    try {
      const text = await file.text();
      const envelope = JSON.parse(text) as BackupEnvelope;
      if (envelope?.app !== 'vocabulary-notebook') throw new Error('bad');
      setBusy(true);
      const newId = await importBackup(envelope, { mode: 'merge' });
      await refresh();
      await activate(newId);
      toast(`Welcome back, ${envelope.profile.name}! Notebook restored.`);
    } catch {
      toast('That file is not a Vocabulary Notebook backup.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gate-wrap">
      <div className="gate-card paper-card washi">
        <h1>Vocabulary Notebook</h1>
        <p className="sub">Who is writing today?</p>

        <div className="profile-list">
          {profiles.map((p) => (
            <button key={p.id} className="profile-tile" onClick={() => choose(p.id!)}>
              <span className="avatar-btn" style={{ background: p.accentColor }}>
                {p.name.trim().charAt(0).toUpperCase()}
              </span>
              <span>
                <span className="name">{p.name}</span>
                <br />
                <span className="meta">
                  {p.pinHash ? '🔒 PIN protected · ' : ''}
                  since {new Date(p.createdAt).toLocaleDateString()}
                </span>
              </span>
            </button>
          ))}
        </div>

        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          ➕ New notebook
        </button>

        <div className="gate-divider">or</div>

        <button className="btn btn-ghost" disabled={busy} onClick={() => fileRef.current?.click()}>
          📁 Restore from a backup file
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onRestoreFile(f);
            e.target.value = '';
          }}
        />
      </div>

      {creating && (
        <Modal
          title="New notebook"
          onClose={() => setCreating(false)}
          footer={
            <>
              <button className="btn" onClick={() => setCreating(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" disabled={busy || !name.trim()} onClick={() => void submitCreate()}>
                Create
              </button>
            </>
          }
        >
          <div className="field">
            <label htmlFor="gate-name">Display name</label>
            <input
              id="gate-name"
              className="input"
              placeholder="e.g. Amina"
              value={name}
              autoFocus
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void submitCreate()}
            />
          </div>
          <div className="field">
            <label>Notebook colour</label>
            <div className="chip-row">
              {ACCENTS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Colour ${c}`}
                  onClick={() => setAccent(c)}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    background: c,
                    border: accent === c ? '3px solid var(--ink)' : '2px solid rgba(59,49,40,0.2)',
                    cursor: 'pointer',
                  }}
                />
              ))}
            </div>
          </div>
          <div className="field">
            <label htmlFor="gate-pin">Secret PIN (optional — 4 digits)</label>
            <input
              id="gate-pin"
              className="input"
              inputMode="numeric"
              placeholder="····"
              maxLength={4}
              value={pin}
              style={{ letterSpacing: '0.4em', textAlign: 'center' }}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            />
            <p className="faint" style={{ fontSize: '0.78rem' }}>
              A gentle lock to keep nosy siblings out — not real security.
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}

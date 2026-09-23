import { useRef, useState } from 'react';
import { useProfiles } from '../../context/ProfileContext';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/ToastProvider';
import { PinPad } from '../../components/ui/PinPad';
import { deleteProfile, updateSettings, updateProfile, importBackup } from '../../db/repo';
import { hashPin, verifyPin } from '../../db/pin';
import { exportPdf, downloadJsonBackup, buildProgressSummary, shareOrCopySummary } from '../exports/exporters';
import { loadSamplePack } from './sampleData';
import type { BackupEnvelope } from '../../db/models';

const ACCENTS = ['#c96f4a', '#d9a13c', '#7fa05f', '#8c5f9d', '#4a7bb5', '#c95f7f'];

export function Settings() {
  const { profile, refresh, signOut } = useProfiles();
  const { toast } = useToast();

  const s = profile?.settings;
  const [s2, setS2] = useState(s?.intervals.s2 ?? 2);
  const [s3, setS3] = useState(s?.intervals.s3 ?? 4);
  const [dailyGoal, setDailyGoal] = useState(s?.dailyGoal ?? 3);
  const [deckSize, setDeckSize] = useState(s?.reviewDeckSize ?? 10);

  const [name, setName] = useState(profile?.name ?? '');
  const [accent, setAccent] = useState(profile?.accentColor ?? ACCENTS[0]);

  const [pinStep, setPinStep] = useState<'idle' | 'old' | 'new' | 'new2'>('idle');
  const pendingPin = useRef('');

  const [confirmDeleteProfile, setConfirmDeleteProfile] = useState(false);
  const [importing, setImporting] = useState<BackupEnvelope | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  if (!profile) return null;
  const pid = profile.id!;

  const saveSchedule = async () => {
    await updateSettings(pid, {
      ...profile.settings,
      intervals: { s1: 0, s2, s3, s4: null },
      dailyGoal,
      reviewDeckSize: deckSize,
    });
    await refresh();
    toast('Schedule saved ✅');
  };

  const saveIdentity = async () => {
    if (!name.trim()) return;
    await updateProfile(pid, { name: name.trim(), accentColor: accent });
    await refresh();
    toast('Profile updated ✏️');
  };

  const onPinComplete = async (pin: string) => {
    try {
      if (pinStep === 'old') {
        const ok = await verifyPin(pin, profile.pinHash!, profile.pinSalt!);
        if (!ok) {
          toast('That is not the current PIN.');
          return;
        }
        setPinStep('new');
      } else if (pinStep === 'new') {
        pendingPin.current = pin;
        setPinStep('new2');
      } else if (pinStep === 'new2') {
        if (pin !== pendingPin.current) {
          toast('The two PINs did not match — starting again.');
          setPinStep('new');
          return;
        }
        const { pinHash, pinSalt } = await hashPin(pin);
        await updateProfile(pid, { pinHash, pinSalt });
        await refresh();
        toast('PIN set 🔒');
        setPinStep('idle');
      }
    } catch {
      toast('Something went wrong — try again.');
    }
  };

  const removePin = async () => {
    setPinStep('idle');
    await updateProfile(pid, { pinHash: undefined, pinSalt: undefined });
    await refresh();
    toast('PIN removed.');
  };

  const doPdf = async () => {
    setBusy(true);
    try {
      await exportPdf(profile);
      toast('PDF notebook saved 📄');
    } catch {
      toast('Could not build the PDF.');
    } finally {
      setBusy(false);
    }
  };

  const doJson = async () => {
    setBusy(true);
    try {
      await downloadJsonBackup(profile);
      toast('Backup downloaded 💾');
    } finally {
      setBusy(false);
    }
  };

  const doSummary = async () => {
    const text = await buildProgressSummary(profile);
    setSummary(text);
  };

  const onImportFile = async (file: File) => {
    try {
      const envelope = JSON.parse(await file.text()) as BackupEnvelope;
      if (envelope?.app !== 'vocabulary-notebook') throw new Error('bad');
      setImporting(envelope);
    } catch {
      toast('That file is not a Vocabulary Notebook backup.');
    }
  };

  const runImport = async (mode: 'merge' | 'replace') => {
    if (!importing) return;
    setBusy(true);
    try {
      await importBackup(importing, { mode });
      await refresh();
      toast(`Restored ${importing.words.length} words into a new profile.`);
      setImporting(null);
    } catch {
      toast('Import failed — is the file complete?');
    } finally {
      setBusy(false);
    }
  };

  const loadSamples = async () => {
    setBusy(true);
    try {
      const n = await loadSamplePack(pid);
      await refresh();
      toast(`${n} sample words added — explore and delete them anytime.`);
    } finally {
      setBusy(false);
    }
  };

  const reallyDeleteProfile = async () => {
    await deleteProfile(pid);
    await signOut();
  };

  return (
    <div className="settings-stack">
      <h1>Settings</h1>

      {/* ---------- Schedule ---------- */}
      <section className="settings-group paper-card">
        <h2>⏳ Review schedule</h2>
        <p className="muted" style={{ marginBottom: 'var(--sp-3)' }}>
          How many days after finishing a section the next one unlocks. Section 1 is always immediate; the
          final note section is optional and available any time.
        </p>
        <div className="intervals-grid">
          <div className="interval-item">
            <label htmlFor="iv-s2">Section 1 → 2 (days)</label>
            <input
              id="iv-s2"
              className="input"
              type="number"
              min={0}
              max={60}
              value={s2}
              onChange={(e) => setS2(Math.max(0, Number(e.target.value)))}
            />
          </div>
          <div className="interval-item">
            <label htmlFor="iv-s3">Section 2 → 3 (days)</label>
            <input
              id="iv-s3"
              className="input"
              type="number"
              min={0}
              max={60}
              value={s3}
              onChange={(e) => setS3(Math.max(0, Number(e.target.value)))}
            />
          </div>
          <div className="interval-item">
            <label htmlFor="iv-s4">Section 3 → 4</label>
            <input id="iv-s4" className="input" value="optional" disabled title="Section 4 is optional" />
          </div>
        </div>
        <div className="interval-item" style={{ marginTop: 'var(--sp-3)' }}>
          <label htmlFor="iv-goal">Daily goal: {dailyGoal} section{dailyGoal === 1 ? '' : 's'} per day</label>
          <div className="range-row">
            <input id="iv-goal" type="range" min={1} max={10} value={dailyGoal} onChange={(e) => setDailyGoal(Number(e.target.value))} />
            <span className="range-val">{dailyGoal}</span>
          </div>
        </div>
        <div className="interval-item" style={{ marginTop: 'var(--sp-3)' }}>
          <label htmlFor="iv-deck">Flashcards per review session: {deckSize}</label>
          <div className="range-row">
            <input id="iv-deck" type="range" min={5} max={30} value={deckSize} onChange={(e) => setDeckSize(Number(e.target.value))} />
            <span className="range-val">{deckSize}</span>
          </div>
        </div>
        <div className="btn-row" style={{ marginTop: 'var(--sp-4)' }}>
          <button className="btn btn-primary" onClick={() => void saveSchedule()}>
            Save schedule
          </button>
        </div>
        <p className="faint" style={{ fontSize: '0.78rem', marginTop: 'var(--sp-2)' }}>
          Changes apply to new sections — words already in motion keep their original unlock dates.
        </p>
      </section>

      {/* ---------- Profile ---------- */}
      <section className="settings-group paper-card">
        <h2>👤 My profile</h2>
        <div className="field" style={{ marginBottom: 'var(--sp-3)' }}>
          <label htmlFor="set-name">Display name</label>
          <input id="set-name" className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field" style={{ marginBottom: 'var(--sp-3)' }}>
          <label>Notebook colour</label>
          <div className="chip-row">
            {ACCENTS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Colour ${c}`}
                onClick={() => setAccent(c)}
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: '50%',
                  background: c,
                  border: accent === c ? '3px solid var(--ink)' : '2px solid rgba(59,49,40,0.2)',
                  cursor: 'pointer',
                }}
              />
            ))}
          </div>
        </div>
        <button className="btn" onClick={() => void saveIdentity()}>
          Save profile
        </button>

        <div style={{ marginTop: 'var(--sp-4)' }}>
          <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--ink-soft)' }}>Secret PIN</label>
          <p className="faint" style={{ fontSize: '0.8rem', marginBottom: 'var(--sp-2)' }}>
            {profile.pinHash ? 'A PIN is set for this notebook.' : 'No PIN set — a gentle lock against nosy siblings.'}
          </p>
          <div className="btn-row">
            {profile.pinHash ? (
              <>
                <button className="btn btn-sm" onClick={() => setPinStep('old')}>
                  Change PIN
                </button>
                <button className="btn btn-sm btn-ghost" onClick={() => void removePin()}>
                  Remove PIN
                </button>
              </>
            ) : (
              <button className="btn btn-sm" onClick={() => setPinStep('new')}>
                Set a PIN
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ---------- Data & backup ---------- */}
      <section className="settings-group paper-card">
        <h2>💾 Backup &amp; export</h2>
        <div className="btn-row">
          <button className="btn btn-primary" disabled={busy} onClick={() => void doPdf()}>
            📄 Notebook as PDF
          </button>
          <button className="btn" disabled={busy} onClick={() => void doJson()}>
            💾 Full JSON backup
          </button>
          <button className="btn" disabled={busy} onClick={() => void doSummary()}>
            📈 Progress summary
          </button>
        </div>

        {summary && (
          <div style={{ marginTop: 'var(--sp-3)' }}>
            <pre className="summary-output">{summary}</pre>
            <div className="btn-row" style={{ marginTop: 'var(--sp-2)' }}>
              <button
                className="btn btn-sm"
                onClick={async () => {
                  const how = await shareOrCopySummary(summary);
                  toast(how === 'shared' ? 'Shared! 📤' : how === 'copied' ? 'Copied — paste it to your tutor 📋' : 'Saved as .txt');
                }}
              >
                📤 Share / copy
              </button>
            </div>
          </div>
        )}

        <div style={{ marginTop: 'var(--sp-4)' }}>
          <button className="btn btn-ghost" disabled={busy} onClick={() => importRef.current?.click()}>
            📁 Restore a backup file
          </button>
          <input
            ref={importRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onImportFile(f);
              e.target.value = '';
            }}
          />
        </div>
      </section>

      {/* ---------- Sample data ---------- */}
      <section className="settings-group paper-card">
        <h2>🧪 Try it out</h2>
        <p className="muted" style={{ marginBottom: 'var(--sp-3)' }}>
          Adds 8 sample words (A1 → IELTS) in different stages so you can see how the notebook, dashboard and
          flashcards feel. Real words are untouched; samples can be deleted like any other word.
        </p>
        <button className="btn" disabled={busy} onClick={() => void loadSamples()}>
          ✨ Load sample pack
        </button>
      </section>

      {/* ---------- Danger zone ---------- */}
      <section className="settings-group paper-card" style={{ borderColor: 'var(--red)' }}>
        <h2>⚠️ Danger zone</h2>
        <div className="btn-row">
          <button className="btn" onClick={() => void signOut()}>
            🔁 Switch profile
          </button>
          <button className="btn btn-danger" onClick={() => setConfirmDeleteProfile(true)}>
            🗑 Delete this profile
          </button>
        </div>
      </section>

      {/* ---------- Modals ---------- */}
      {pinStep !== 'idle' && (
        <PinPad
          key={pinStep}
          title={pinStep === 'old' ? 'Current PIN' : pinStep === 'new' ? 'New PIN' : 'Repeat new PIN'}
          subtitle={pinStep === 'new' ? '4 digits — something memorable' : undefined}
          onClose={() => setPinStep('idle')}
          onComplete={(pin) => void onPinComplete(pin)}
        />
      )}

      {importing && (
        <Modal
          title={`Restore backup of ${importing.profile.name}?`}
          onClose={() => setImporting(null)}
          footer={
            <>
              <button className="btn" onClick={() => setImporting(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" disabled={busy} onClick={() => void runImport('replace')}>
                Restore as saved
              </button>
              <button className="btn" disabled={busy} onClick={() => void runImport('merge')}>
                Restore (latest wins)
              </button>
            </>
          }
        >
          <p>
            The backup contains <strong>{importing.words.length} words</strong> exported{' '}
            {new Date(importing.exportedAt).toLocaleString()}.
          </p>
          <p className="muted">
            Restoring always creates a <strong>new profile</strong>, so nothing currently on this device is
            overwritten or lost.
          </p>
        </Modal>
      )}

      {confirmDeleteProfile && (
        <Modal
          title="Delete this profile?"
          onClose={() => setConfirmDeleteProfile(false)}
          footer={
            <>
              <button className="btn" onClick={() => setConfirmDeleteProfile(false)}>
                Keep it
              </button>
              <button className="btn btn-danger" onClick={() => void reallyDeleteProfile()}>
                Delete everything
              </button>
            </>
          }
        >
          <p>
            This permanently deletes <strong>{profile.name}</strong>'s profile and every word in this notebook
            from this device. Export a JSON backup first if you might want it back!
          </p>
        </Modal>
      )}
    </div>
  );
}

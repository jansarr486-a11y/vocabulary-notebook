import { useRef, useState } from 'react';
import { useProfiles } from '../../context/ProfileContext';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/ToastProvider';
import { AvatarPicker } from '../../components/ui/AvatarPicker';
import { useObjectUrl } from '../../hooks/useMisc';
import { useI18n } from '../../i18n';
import { importBackup } from '../../db/repo';
import type { BackupEnvelope, Profile } from '../../db/models';

const ACCENTS = ['#c96f4a', '#d9a13c', '#7fa05f', '#8c5f9d', '#4a7bb5', '#c95f7f'];

/** Gate tile avatar: the profile picture when set, otherwise the accent initial. */
function TileAvatar({ profile }: { profile: Profile }) {
  const url = useObjectUrl(profile.avatarBlob);
  return (
    <span className="avatar-btn" style={{ background: url ? 'var(--paper-deep)' : profile.accentColor }}>
      {url ? <img src={url} alt="" /> : profile.name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

export function ProfileGate() {
  const { profiles, choose, createNew, refresh, activate } = useProfiles();
  const { toast } = useToast();
  const { t } = useI18n();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [accent, setAccent] = useState(ACCENTS[0]);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [avatar, setAvatar] = useState<{ blob: Blob; mime: string } | undefined>(undefined);
  const fileRef = useRef<HTMLInputElement>(null);

  const submitCreate = async () => {
    if (!name.trim()) return;
    if (pin && !/^\d{4}$/.test(pin)) {
      toast(t('gate.pinDigits'));
      return;
    }
    setBusy(true);
    try {
      await createNew(name, accent, pin || undefined, avatar);
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
      toast(t('gate.restored', { name: envelope.profile.name }));
    } catch {
      toast(t('gate.badFile'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gate-wrap">
      <div className="gate-card paper-card washi">
        <h1>{t('app.name')}</h1>
        <p className="sub">{t('gate.who')}</p>

        <div className="profile-list">
          {profiles.map((p) => (
            <button key={p.id} className="profile-tile" onClick={() => choose(p.id!)}>
              <TileAvatar profile={p} />
              <span>
                <span className="name">{p.name}</span>
                <br />
                <span className="meta">
                  {p.pinHash ? t('gate.pinProtected') : ''}
                  {t('gate.since', { date: new Date(p.createdAt).toLocaleDateString() })}
                </span>
              </span>
            </button>
          ))}
        </div>

        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          {t('gate.new')}
        </button>

        <div className="gate-divider">{t('gate.or')}</div>

        <button className="btn btn-ghost" disabled={busy} onClick={() => fileRef.current?.click()}>
          {t('gate.restore')}
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

      {creating && (        <Modal
          title={t('gate.createTitle')}
          onClose={() => setCreating(false)}
          footer={
            <>
              <button className="btn" onClick={() => setCreating(false)}>
                {t('common.cancel')}
              </button>
              <button className="btn btn-primary" disabled={busy || !name.trim()} onClick={() => void submitCreate()}>
                {t('gate.create')}
              </button>
            </>
          }
          >
          <div className="profile-edit-row">
            <AvatarPicker accent={accent} name={name || '?'} onChange={setAvatar} size={84} />
            <div className="profile-edit-fields" style={{ flex: 1 }}>
              <div className="field">
                <label htmlFor="gate-name">{t('gate.displayName')}</label>
                <input
                  id="gate-name"
                  className="input"
                  placeholder={t('gate.namePlaceholder')}
                  value={name}
                  maxLength={40}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void submitCreate()}
                />
              </div>
            </div>
          </div>
          <div className="field">
            <label>{t('gate.colour')}</label>
            <div className="chip-row">
              {ACCENTS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={t('gate.colourAria', { c })}
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
            <label htmlFor="gate-pin">{t('gate.pin')}</label>
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
              {t('gate.pinHint')}
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}

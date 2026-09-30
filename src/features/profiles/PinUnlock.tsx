import { useState } from 'react';
import { useProfiles } from '../../context/ProfileContext';
import { PinPad } from '../../components/ui/PinPad';
import { verifyPin } from '../../db/pin';
import { useI18n } from '../../i18n';

export function PinUnlock() {
  const { profile, activate, signOut } = useProfiles();
  const { t } = useI18n();
  const [error, setError] = useState('');

  if (!profile) return null;

  const check = async (pin: string) => {
    const ok = await verifyPin(pin, profile.pinHash!, profile.pinSalt!);
    if (ok) {
      setError('');
      await activate(profile.id!);
    } else {
      setError(t('pin.wrong'));
      window.setTimeout(() => setError(''), 2000);
    }
  };

  return (
    <div className="gate-wrap">
      <div className="gate-card paper-card washi">
        <span className="avatar-btn" style={{ background: profile.accentColor, margin: '0 auto var(--sp-3)' }}>
          {profile.name.trim().charAt(0).toUpperCase()}
        </span>
        <h1 style={{ fontSize: '2.2rem' }}>{t('pin.hi', { name: profile.name })}</h1>
        <p className="sub">{t('pin.enterSub')}</p>
        <PinPad title={t('pin.title')} onComplete={(pin) => void check(pin)} error={error} />
        <button className="btn btn-ghost btn-sm" onClick={() => void signOut()}>
          {t('pin.different')}
        </button>
      </div>
    </div>
  );
}

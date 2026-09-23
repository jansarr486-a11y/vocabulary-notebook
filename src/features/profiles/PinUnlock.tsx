import { useState } from 'react';
import { useProfiles } from '../../context/ProfileContext';
import { PinPad } from '../../components/ui/PinPad';
import { verifyPin } from '../../db/pin';

export function PinUnlock() {
  const { profile, activate, signOut } = useProfiles();
  const [error, setError] = useState('');

  if (!profile) return null;

  const check = async (pin: string) => {
    const ok = await verifyPin(pin, profile.pinHash!, profile.pinSalt!);
    if (ok) {
      setError('');
      await activate(profile.id!);
    } else {
      setError('Wrong PIN — try again');
      window.setTimeout(() => setError(''), 2000);
    }
  };

  return (
    <div className="gate-wrap">
      <div className="gate-card paper-card washi">
        <span className="avatar-btn" style={{ background: profile.accentColor, margin: '0 auto var(--sp-3)' }}>
          {profile.name.trim().charAt(0).toUpperCase()}
        </span>
        <h1 style={{ fontSize: '2.2rem' }}>Hi, {profile.name}!</h1>
        <p className="sub">Enter your secret PIN to open your notebook.</p>
        <PinPad title="PIN" onComplete={(pin) => void check(pin)} error={error} />
        <button className="btn btn-ghost btn-sm" onClick={() => void signOut()}>
          ← Different student
        </button>
      </div>
    </div>
  );
}

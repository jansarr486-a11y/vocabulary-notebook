import { useState } from 'react';
import { useI18n } from '../../i18n';
import { NetworkUnavailableError, verifyLicense } from './licenseApi';
import { reasonKey } from './licenseLogic';
import { getOrCreateDeviceId, saveLicense, type LicenseRecord } from './licenseDb';
import './license.css';

interface Props {
  /** Stored credentials when re-activating (e.g. after a revocation). */
  initialEmail?: string;
  initialLicenseKey?: string;
  /** Warning line shown above the form (e.g. license flagged invalid earlier). */
  notice?: string;
  /** Called after the license record has been stored successfully. */
  onActivated: (record: LicenseRecord) => void;
}

/**
 * First-run activation gate. Requires one successful online check; after
 * that the stored license keeps the app unlocked fully offline.
 */
export function ActivationScreen({ initialEmail = '', initialLicenseKey = '', notice, onActivated }: Props) {
  const { t } = useI18n();
  const [email, setEmail] = useState(initialEmail);
  const [licenseKey, setLicenseKey] = useState(initialLicenseKey);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    const trimmedEmail = email.trim();
    const trimmedKey = licenseKey.trim();
    if (!trimmedEmail || !trimmedKey) {
      setError(t('lic.err.missing_fields'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const deviceId = await getOrCreateDeviceId();
      const outcome = await verifyLicense(trimmedEmail, trimmedKey, deviceId);
      if (!outcome.ok) {
        setError(t(reasonKey(outcome.reason)));
        return;
      }
      const record: LicenseRecord = {
        id: 'current',
        email: trimmedEmail,
        licenseKey: trimmedKey,
        payload: outcome.payload,
        signature: outcome.signature,
        lastVerifiedAt: Date.now(),
      };
      await saveLicense(record);
      onActivated(record);
    } catch (e) {
      setError(t(e instanceof NetworkUnavailableError ? 'lic.err.network' : 'lic.err.generic'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gate-wrap">
      <div className="gate-card paper-card washi license-card">
        <h1>{t('lic.title')}</h1>
        <p className="sub">{t('lic.subtitle')}</p>

        {notice && (
          <p className="license-error" role="alert">
            {notice}
          </p>
        )}

        <div className="field">
          <label htmlFor="lic-email">{t('lic.email')}</label>
          <input
            id="lic-email"
            className="input"
            type="email"
            dir="ltr"
            autoComplete="email"
            placeholder={t('lic.emailPlaceholder')}
            value={email}
            disabled={busy}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void submit()}
          />
        </div>

        <div className="field">
          <label htmlFor="lic-key">{t('lic.key')}</label>
          <input
            id="lic-key"
            className="input"
            dir="ltr"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder={t('lic.keyPlaceholder')}
            value={licenseKey}
            disabled={busy}
            style={{ letterSpacing: '0.12em' }}
            onChange={(e) => setLicenseKey(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void submit()}
          />
        </div>

        {error && (
          <div>
            <p className="license-error" role="alert">
              {error}
            </p>
            {error !== t('lic.err.missing_fields') && <p className="faint license-hint">{t('lic.err.hint')}</p>}
          </div>
        )}

        <button className="btn btn-primary license-activate" disabled={busy} onClick={() => void submit()}>
          {busy ? t('lic.activating') : t('lic.activate')}
        </button>

        <p className="faint license-note">📶 {t('lic.internetNote')}</p>
      </div>
    </div>
  );
}

import { useEffect, useState, type ReactNode } from 'react';
import { useI18n } from '../../i18n';
import { verifyLicense } from './licenseApi';
import { getLicense, getOrCreateDeviceId, saveLicense, type LicenseRecord } from './licenseDb';
import { isStale } from './licenseLogic';
import { ActivationScreen } from './ActivationScreen';
import './license.css';

type GateState = 'checking' | 'locked' | 'open';

/**
 * License gate — an additive wrapper around the whole app.
 *
 * - No stored license (or one flagged invalid by a previous re-check):
 *   only the Activation screen renders; nothing else of the app mounts.
 * - Valid license: the app renders unchanged, plus a silent background
 *   re-check when the last verification is older than 14 days AND the
 *   device is online.
 * - Re-check returns invalid: a non-intrusive banner appears and the flag
 *   is stored; the current session keeps working. The NEXT app open shows
 *   the Activation screen instead of the app.
 * - Re-check cannot reach the network: nothing happens at all — the last
 *   stored license keeps the app working (offline-first is a hard rule).
 */
export function LicenseGate({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [state, setState] = useState<GateState>('checking');
  const [record, setRecord] = useState<LicenseRecord | undefined>(undefined);
  const [bannerVisible, setBannerVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await getLicense();
      if (cancelled) return;
      if (!stored || stored.needsAttention) {
        setRecord(stored);
        setState('locked');
        return;
      }
      setRecord(stored);
      setState('open');
      // Silent periodic re-check — never blocks or interrupts the session.
      if (isStale(stored.lastVerifiedAt, Date.now()) && navigator.onLine) {
        void recheck(stored, cancelled);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Run once per app open. eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const recheck = async (stored: LicenseRecord, cancelled: boolean) => {
    try {
      const deviceId = await getOrCreateDeviceId();
      const outcome = await verifyLicense(stored.email, stored.licenseKey, deviceId);
      if (cancelled) return;
      if (outcome.ok) {
        const updated: LicenseRecord = {
          ...stored,
          payload: outcome.payload,
          signature: outcome.signature,
          lastVerifiedAt: Date.now(),
          needsAttention: false,
        };
        await saveLicense(updated);
        if (!cancelled) {
          setRecord(updated);
          setBannerVisible(false);
        }
      } else {
        // Keep the session running; lock only on the next app open.
        const updated: LicenseRecord = { ...stored, needsAttention: true };
        await saveLicense(updated);
        if (!cancelled) setBannerVisible(true);
      }
    } catch {
      // Offline / server unreachable — keep working on the stored license.
    }
  };

  if (state === 'checking') {
    return (
      <div className="gate-wrap">
        <p className="hand" style={{ fontSize: '2rem', color: 'var(--ink-soft)' }}>
          {t('app.opening')}
        </p>
      </div>
    );
  }

  if (state === 'locked') {
    return (
      <ActivationScreen
        initialEmail={record?.email}
        initialLicenseKey={record?.licenseKey}
        notice={record?.needsAttention ? t('lic.banner') : undefined}
        onActivated={(activated) => {
          setRecord(activated);
          setBannerVisible(false);
          setState('open');
        }}
      />
    );
  }

  return (
    <>
      {bannerVisible && (
        <div className="license-banner" role="status">
          {t('lic.banner')}
        </div>
      )}
      {children}
    </>
  );
}

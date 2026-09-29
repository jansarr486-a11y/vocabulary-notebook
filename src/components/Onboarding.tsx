import { useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProfiles } from '../context/ProfileContext';
import { updateProfile } from '../db/repo';
import { useI18n, type Lang } from '../i18n';
import {
  IconToday,
  IconNotebook,
  IconLibrary,
  IconReview,
  IconSpelling,
  IconProgress,
  IconAddWord,
  IconStreak,
  IconMastered,
  IconLogo,
} from './ui/icons';

/**
 * First-run welcome tour.
 *
 * Flow: Step 0 (language choice, no navigation chrome) → Steps 1–5 of tour
 * content. Shown once per profile: App mounts it when the active profile has
 * `hasSeenOnboarding === false`; finishing (or skipping) stores the flag.
 * Replay from Settings skips Step 0 and never rewrites the flag.
 * Swipe left/right also navigates on touch devices.
 */

const TOTAL_STEPS = 5;

interface OnboardingProps {
  /** Replay from Settings: language is already set, so skip Step 0. */
  replay?: boolean;
  /** Called when the tour is closed (finished or skipped). */
  onFinish: () => void;
}

export function Onboarding({ replay = false, onFinish }: OnboardingProps) {
  const { profile, refresh } = useProfiles();
  const { t, lang, setLang } = useI18n();
  const navigate = useNavigate();

  // Step 0 = language choice; tour content lives in steps 1..5.
  const [step, setStep] = useState(replay ? 1 : 0);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const finish = async () => {
    try {
      if (profile?.id != null && !replay) {
        await updateProfile(profile.id, { hasSeenOnboarding: true });
        await refresh();
      }
    } finally {
      onFinish();
      if (!replay) navigate('/'); // land on the Today dashboard
    }
  };

  const next = () => setStep((s) => Math.min(TOTAL_STEPS, s + 1));
  const back = () => setStep((s) => Math.max(1, s - 1));

  // Touch swipe between steps (disabled on Step 0).
  const onTouchStart = (e: React.TouchEvent) => {
    if (step === 0) return;
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const st = touchStart.current;
    touchStart.current = null;
    if (!st || step === 0) return;
    const dx = e.changedTouches[0].clientX - st.x;
    const dy = e.changedTouches[0].clientY - st.y;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      const rtl = lang === 'fa';
      const forward = rtl ? dx > 0 : dx < 0; // RTL swipes the other way
      if (forward) next();
      else back();
    }
  };

  const pickLang = (l: Lang) => {
    setLang(l); // persists via the existing i18n system (also flips dir + fonts)
    setStep(1);
  };

  const tabs: { key: string; icon: ReactNode }[] = [
    { key: 'today', icon: <IconToday size={22} /> },
    { key: 'notebook', icon: <IconNotebook size={22} /> },
    { key: 'library', icon: <IconLibrary size={22} /> },
    { key: 'review', icon: <IconReview size={22} /> },
    { key: 'spelling', icon: <IconSpelling size={22} /> },
    { key: 'progress', icon: <IconProgress size={22} /> },
  ];

  const cycle: { key: string; icon: ReactNode }[] = [
    { key: 'add', icon: <IconAddWord size={26} /> },
    { key: 'wait', icon: <IconStreak size={26} /> },
    { key: 'review', icon: <IconReview size={26} /> },
    { key: 'forever', icon: <IconMastered size={26} /> },
  ];

  return (
    <div className="onb-overlay" dir={lang === 'fa' ? 'rtl' : 'ltr'}>
      <div
        className="onb-card"
        role="dialog"
        aria-modal="true"
        aria-label={t('onb.welcome')}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {step > 0 && step < TOTAL_STEPS && (
          <button type="button" className="onb-skip" onClick={() => void finish()}>
            {t('onb.skip')}
          </button>
        )}

        {step === 0 && (
          <section className="onb-lang">
            <div className="onb-logo" style={{ color: 'var(--accent)' }}>
              <IconLogo size={72} />
            </div>
            <h1 className="onb-appname hand">Vocabulary Notebook</h1>
            <p className="onb-langprompt">{t('onb.langPrompt')}</p>
            <div className="onb-langopts">
              <button type="button" className="onb-langopt" onClick={() => pickLang('en')}>
                <strong>English</strong>
                <span className="onb-langsub">Start in English</span>
              </button>
              <button type="button" className="onb-langopt" lang="fa" dir="rtl" onClick={() => pickLang('fa')}>
                <strong>فارسی</strong>
                <span className="onb-langsub">شروع به فارسی</span>
              </button>
            </div>
          </section>
        )}

        {step === 1 && (
          <section className="onb-step">
            <div className="onb-logo" style={{ color: 'var(--accent)' }}>
              <IconLogo size={64} />
            </div>
            <h2 className="onb-title hand">{t('onb.welcome')}</h2>
            <p className="onb-body">{t('onb.welcome.body')}</p>
            <p className="onb-credit">{t('onb.credit')}</p>
          </section>
        )}

        {step === 2 && (
          <section className="onb-step">
            <span className="onb-doodle">📓</span>
            <h2 className="onb-title hand">{t('onb.purpose.title')}</h2>
            <p className="onb-body">{t('onb.purpose.body')}</p>
          </section>
        )}

        {step === 3 && (
          <section className="onb-step">
            <h2 className="onb-title hand">{t('onb.tabs.title')}</h2>
            <div className="onb-tabs">
              {tabs.map(({ key, icon }) => (
                <div className="onb-tab" key={key}>
                  <span className="onb-tabicon">{icon}</span>
                  <span className="onb-tabtext">
                    <strong>{t(`nav.${key}`)}</strong>
                    <span className="onb-tabdesc">{t(`onb.tab.${key}`)}</span>
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {step === 4 && (
          <section className="onb-step">
            <h2 className="onb-title hand">{t('onb.cycle.title')}</h2>
            <div className="onb-cycle">
              {cycle.map(({ key, icon }, i) => (
                <div className="onb-cyc-wrap" key={key}>
                  {i > 0 && <span className="onb-cycarrow">→</span>}
                  <div className="onb-cyc">
                    <span className="onb-cycicon">{icon}</span>
                    <span className="onb-cyclabel">{t(`onb.cycle.${key}`)}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {step === 5 && (
          <section className="onb-step">
            <span className="onb-doodle">🎉</span>
            <h2 className="onb-title hand">{t('onb.go.title')}</h2>
            <p className="onb-body">{t('onb.go.body')}</p>
          </section>
        )}

        {step > 0 && (
          <footer className="onb-nav">
            <button type="button" className="btn" onClick={back} disabled={step === 1}>
              <span className="onb-arrow">←</span> {t('onb.back')}
            </button>
            <div className="onb-dots">
              {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((i) => (
                <button
                  key={i}
                  type="button"
                  className={`onb-dot ${i === step ? 'on' : ''}`}
                  onClick={() => setStep(i)}
                  aria-label={t('onb.step', { n: i, total: TOTAL_STEPS })}
                />
              ))}
            </div>
            {step < TOTAL_STEPS ? (
              <button type="button" className="btn btn-primary" onClick={next}>
                {t('onb.next')} <span className="onb-arrow">→</span>
              </button>
            ) : (
              <button type="button" className="btn btn-primary onb-go" onClick={() => void finish()}>
                {t('onb.start')}
              </button>
            )}
          </footer>
        )}
      </div>
    </div>
  );
}

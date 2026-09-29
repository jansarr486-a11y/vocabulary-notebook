import { useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { ProfileProvider, useProfiles } from './context/ProfileContext';
import { ToastProvider, useToast } from './components/ui/ToastProvider';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Onboarding } from './components/Onboarding';
import { AppHeader } from './components/AppHeader';
import { ProfileGate } from './features/profiles/ProfileGate';
import { PinUnlock } from './features/profiles/PinUnlock';
import { Dashboard } from './features/dashboard/Dashboard';
import { Notebook } from './features/notebook/Notebook';
import { WordCard } from './features/notebook/WordCard';
import { Library } from './features/library/Library';
import { Review } from './features/review/Review';
import { Spelling } from './features/spelling/Spelling';
import { Progress } from './features/progress/Progress';
import { Settings } from './features/settings/Settings';
import { I18nProvider } from './i18n';

/** Registers the service worker; checks for updates hourly while open. */
function PwaUpdater() {
  useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (registration) {
        window.setInterval(
          () => {
            void registration.update();
          },
          60 * 60 * 1000,
        );
      }
    },
  });
  return null;
}

/** Surfaces offline-ready / new-version states as toasts. */
function PwaToasts() {
  const { toast } = useToast();
  const { offlineReady, needRefresh, updateServiceWorker } = useRegisterSW();

  useEffect(() => {
    if (needRefresh[0]) {
      toast('🔄 A new version is available', {
        actionLabel: 'Refresh',
        action: () => void updateServiceWorker(true),
        duration: 15000,
      });
    } else if (offlineReady[0]) {
      toast('✅ Ready to work offline', { duration: 4000 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needRefresh[0], offlineReady[0]]);

  return null;
}

/**
 * First-run welcome tour: shown once per profile, after creation, before the
 * first dashboard view. Finishing/skipping stores hasSeenOnboarding on the
 * profile, so it never auto-shows for that profile again. (Replay lives in
 * Settings and does not touch the flag.)
 */
function OnboardingGate() {
  const { profile } = useProfiles();
  const [done, setDone] = useState(false);
  if (done) return null;
  if (!profile || profile.hasSeenOnboarding !== false) return null;
  return <Onboarding onFinish={() => setDone(true)} />;
}

function AppRoutes() {
  const { status } = useProfiles();
  if (status === 'loading') {
    return (
      <div className="gate-wrap">
        <p className="hand" style={{ fontSize: '2rem', color: 'var(--ink-soft)' }}>
          Opening the notebook…
        </p>
      </div>
    );
  }
  if (status !== 'ready') {
    return status === 'pin' ? <PinUnlock /> : <ProfileGate />;
  }
  return (
    <ErrorBoundary>
      <OnboardingGate />
      <AppHeader />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/notebook" element={<Notebook />} />
          <Route path="/word/:id" element={<WordCard />} />
          <Route path="/library" element={<Library />} />
          <Route path="/library/:collectionId" element={<Library />} />
          <Route path="/library/:collectionId/:bookId" element={<Library />} />
          <Route path="/review" element={<Review />} />
          <Route path="/spelling" element={<Spelling />} />
          <Route path="/progress" element={<Progress />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </ErrorBoundary>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <I18nProvider>
        <ToastProvider>
          <ProfileProvider>
            <HashRouter>
              <PwaUpdater />
              <PwaToasts />
              <AppRoutes />
            </HashRouter>
          </ProfileProvider>
        </ToastProvider>
      </I18nProvider>
    </ErrorBoundary>
  );
}

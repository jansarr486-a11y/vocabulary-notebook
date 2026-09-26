import { useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { ProfileProvider, useProfiles } from './context/ProfileContext';
import { ToastProvider, useToast } from './components/ui/ToastProvider';
import { AppHeader } from './components/AppHeader';
import { ProfileGate } from './features/profiles/ProfileGate';
import { PinUnlock } from './features/profiles/PinUnlock';
import { Dashboard } from './features/dashboard/Dashboard';
import { Notebook } from './features/notebook/Notebook';
import { WordCard } from './features/notebook/WordCard';
import { Library } from './features/library/Library';
import { Review } from './features/review/Review';
import { Spelling } from './features/spelling/Spelling';
import { Settings } from './features/settings/Settings';

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
    <>
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
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <ProfileProvider>
        <HashRouter>
          <PwaUpdater />
          <PwaToasts />
          <AppRoutes />
        </HashRouter>
      </ProfileProvider>
    </ToastProvider>
  );
}

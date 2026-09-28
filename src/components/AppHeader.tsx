import { NavLink, useNavigate } from 'react-router-dom';
import { useProfiles } from '../context/ProfileContext';
import { useOnline, useObjectUrl } from '../hooks/useMisc';
import { useI18n } from '../i18n';
import { IconToday, IconNotebook, IconLibrary, IconReview, IconSpelling, IconProgress, IconSettings, IconLogo } from './ui/icons';
import type { ReactNode } from 'react';

const NAV_ITEMS: { to: string; end?: boolean; icon: ReactNode; key: string }[] = [
  { to: '/', end: true, icon: <IconToday />, key: 'nav.today' },
  { to: '/notebook', icon: <IconNotebook />, key: 'nav.notebook' },
  { to: '/library', icon: <IconLibrary />, key: 'nav.library' },
  { to: '/review', icon: <IconReview />, key: 'nav.review' },
  { to: '/spelling', icon: <IconSpelling />, key: 'nav.spelling' },
  { to: '/progress', icon: <IconProgress />, key: 'nav.progress' },
  { to: '/settings', icon: <IconSettings />, key: 'nav.settings' },
];

export function AppHeader() {
  const { profile, signOut } = useProfiles();
  const online = useOnline();
  const navigate = useNavigate();
  const { t } = useI18n();

  const initial = (profile?.name ?? '?').trim().charAt(0).toUpperCase();
  const avatarUrl = useObjectUrl(profile?.avatarBlob);

  return (
    <>
      <header className="app-header">
        <div className="app-header-inner">
          <NavLink to="/" className="app-logo">
            <IconLogo />
            <span>Vocabulary Notebook</span>
          </NavLink>
          <nav className="app-nav" aria-label={t('nav.main')}>
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                title={t(item.key)}
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              >
                {item.icon} <span className="nav-label">{t(item.key)}</span>
              </NavLink>
            ))}
            <button
              className="avatar-btn"
              style={{ background: profile?.accentColor }}
              title={`${profile?.name} — switch profile`}
              aria-label="Switch profile"
              onClick={async () => {
                await signOut();
                navigate('/');
              }}
            >
              {avatarUrl ? <img src={avatarUrl} alt="" /> : initial}
            </button>
          </nav>
        </div>
        {!online && (
          <div
            style={{
              textAlign: 'center',
              fontSize: '0.75rem',
              padding: '2px 0',
              background: 'var(--paper-deep)',
              color: 'var(--ink-soft)',
            }}
          >
            ✈️ Offline — everything still works
          </div>
        )}
      </header>
      {/* phone navigation: icon tab bar pinned to the bottom */}
      <nav className="bottom-nav" aria-label={t('nav.main')}>
        {NAV_ITEMS.filter((i) => i.to !== '/settings').map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `bottom-link ${isActive ? 'active' : ''}`}
            aria-label={t(item.key)}
          >
            {item.icon}
            <span>{t(item.key)}</span>
          </NavLink>
        ))}
      </nav>
    </>
  );
}

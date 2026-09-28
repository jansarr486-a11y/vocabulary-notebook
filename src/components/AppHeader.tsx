import { NavLink, useNavigate } from 'react-router-dom';
import { useProfiles } from '../context/ProfileContext';
import { useOnline, useObjectUrl } from '../hooks/useMisc';
import { IconToday, IconNotebook, IconLibrary, IconReview, IconSpelling, IconSettings, IconLogo } from './ui/icons';

export function AppHeader() {
  const { profile, signOut } = useProfiles();
  const online = useOnline();
  const navigate = useNavigate();

  const initial = (profile?.name ?? '?').trim().charAt(0).toUpperCase();
  const avatarUrl = useObjectUrl(profile?.avatarBlob);

  return (
    <header className="app-header">
      <div className="app-header-inner">
        <NavLink to="/" className="app-logo">
          <IconLogo />
          <span>Vocabulary Notebook</span>
        </NavLink>
        <nav className="app-nav" aria-label="Main">
          <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <IconToday /> <span className="nav-label">Today</span>
          </NavLink>
          <NavLink to="/notebook" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <IconNotebook /> <span className="nav-label">Notebook</span>
          </NavLink>
          <NavLink to="/library" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <IconLibrary /> <span className="nav-label">Library</span>
          </NavLink>
          <NavLink to="/review" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <IconReview /> <span className="nav-label">Review</span>
          </NavLink>
          <NavLink to="/spelling" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <IconSpelling /> <span className="nav-label">Spelling</span>
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <IconSettings /> <span className="nav-label">Settings</span>
          </NavLink>
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
  );
}

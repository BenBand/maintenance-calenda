import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../services/auth';
import { useTheme } from './ThemeProvider';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard' },
  { to: '/calendar', label: 'Calendar' },
  { to: '/records', label: 'Records' },
  { to: '/incidents', label: 'Incidents' },
];

export default function Navbar() {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    const handleInstalled = () => setInstallPrompt(null);

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const closeMenu = () => setMenuOpen(false);
  const installApp = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  return (
    <header className="navbar">
      <div className="navbar__inner">
        <Link className="navbar__brand" to="/" onClick={closeMenu} aria-label="Maintenance Calendar home">
          <span className="brand-mark" aria-hidden="true">MC</span>
          <span className="navbar__brand-text">Maintenance Calendar</span>
        </Link>

        <div className="navbar__tools">
          <button
            className="navbar__utility-button"
            type="button"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
          >
            <span aria-hidden="true">{theme === 'light' ? 'Dark' : 'Light'}</span>
          </button>
          {installPrompt && (
            <button className="navbar__utility-button navbar__install-button" type="button" onClick={installApp}>
              Install app
            </button>
          )}
          <button
            className="navbar__menu-button"
            type="button"
            onClick={() => setMenuOpen((current) => !current)}
            aria-controls="primary-navigation"
            aria-expanded={menuOpen}
            aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          >
            <span aria-hidden="true">{menuOpen ? 'Close' : 'Menu'}</span>
          </button>
        </div>

        <nav className={`navbar__nav${menuOpen ? ' navbar__nav--open' : ''}`} id="primary-navigation" aria-label="Primary navigation">
          {NAV_ITEMS.map((item) => {
            const isAdminRoute = item.to === '/records';
            if (isAdminRoute && user?.role !== 'admin') return null;
            const isActive = location.pathname === item.to;
            return (
              <Link
                className={`navbar__link${isActive ? ' navbar__link--active' : ''}`}
                key={item.to}
                to={item.to}
                onClick={closeMenu}
                aria-current={isActive ? 'page' : undefined}
              >
                {item.label}
              </Link>
            );
          })}
          <Link
            className={`navbar__avatar${location.pathname === '/profile' ? ' navbar__link--active' : ''}`}
            to="/profile"
            onClick={closeMenu}
            aria-label={`View profile for ${user?.username || 'user'}`}
            aria-current={location.pathname === '/profile' ? 'page' : undefined}
          >
            <span aria-hidden="true">{user?.username?.charAt(0).toUpperCase() || '?'}</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}

import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../services/auth';
import { PERMISSIONS } from '../services/permissions';
import { useNotifications } from '../services/notifications';
import NotificationBadge from './NotificationBadge';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', shortLabel: 'Home', icon: '.dk', permission: PERMISSIONS.MAINTENANCE_READ, notificationKey: null },
  { to: '/calendar', label: 'Calendar', shortLabel: 'Slots', icon: '▦', permission: PERMISSIONS.MAINTENANCE_READ, notificationKey: null },
  { to: '/assets', label: 'Assets', shortLabel: 'Assets', icon: '◧', permission: PERMISSIONS.ASSET_READ, notificationKey: null },
  { to: '/analytics', label: 'Analytics', shortLabel: 'Reports', icon: '◨', permission: PERMISSIONS.ANALYTICS_READ, notificationKey: 'notices' },
  { to: '/records', label: 'Records', shortLabel: 'Records', icon: '✓', permission: PERMISSIONS.SERVICE_READ, notificationKey: null },
  { to: '/incidents', label: 'Incidents', shortLabel: 'Issues', icon: '!', permission: PERMISSIONS.INCIDENT_READ, notificationKey: 'incidents' },
  { to: '/faq', label: 'Help', shortLabel: 'Help', icon: '?', permission: PERMISSIONS.FAQ_READ, notificationKey: null },
  { to: '/users', label: 'Users', shortLabel: 'Users', icon: '☰', permission: PERMISSIONS.USER_READ, notificationKey: null },
];

export { NAV_ITEMS };

export default function Navbar() {
  const { user, can } = useAuth();
  const location = useLocation();
  const notificationCounts = useNotifications();
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
          {NAV_ITEMS.map((item, index) => {
            if (item.permission && !can(item.permission)) return null;
            const isActive = location.pathname === item.to;
            const notificationCount = item.notificationKey ? notificationCounts[item.notificationKey] : 0;
            return (
              <Link
                className={`navbar__link${isActive ? ' navbar__link--active' : ''}`}
                key={item.to}
                to={item.to}
                onClick={closeMenu}
                aria-current={isActive ? 'page' : undefined}
              >
                {item.label}
                {notificationCount > 0 && <NotificationBadge count={notificationCount} />}
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

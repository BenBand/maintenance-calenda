import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../services/auth';
import { NAV_ITEMS } from './Navbar';

/**
 * Fixed bottom tab bar. On a phone this is the primary navigation, since a
 * technician working a job one-handed reaches the thumb zone rather than the
 * top-right menu. It collapses to the first four permitted items so the labels
 * stay legible without scrolling.
 */
const MAX_TABS = 4;

export default function BottomNav() {
  const { can } = useAuth();
  const location = useLocation();

  const items = NAV_ITEMS
    .filter((item) => !item.permission || can(item.permission))
    .slice(0, MAX_TABS);

  if (items.length === 0) return null;

  return (
    <nav className="bottom-nav" aria-label="Primary">
      {items.map((item) => {
        const isActive = location.pathname === item.to;
        return (
          <Link
            className={`bottom-nav__tab${isActive ? ' bottom-nav__tab--active' : ''}`}
            key={item.to}
            to={item.to}
            aria-current={isActive ? 'page' : undefined}
          >
            <span className="bottom-nav__icon" aria-hidden="true">{item.icon}</span>
            <span className="bottom-nav__label">{item.shortLabel || item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

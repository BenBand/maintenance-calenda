import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../services/auth';

export default function Navbar() {
  const { user } = useAuth();

  return (
    <header style={styles.navbar}>
      <div style={styles.inner}>
        <Link to="/" style={styles.brand}>
          <span style={styles.brandMark}>MC</span>
          <span>Maintenance Calendar</span>
        </Link>
        <nav style={styles.nav}>
          <Link to="/" style={styles.navLink}>Dashboard</Link>
          <Link to="/calendar" style={styles.navLink}>Calendar</Link>
          {(user?.role === 'admin' || user?.role === 'manager') && (
            <Link to="/records" style={styles.navLink}>Records</Link>
          )}
          <Link to="/profile" style={styles.avatar}>{user?.username?.charAt(0).toUpperCase()}</Link>
        </nav>
      </div>
    </header>
  );
}

const styles = {
  navbar: {
    position: 'sticky', top: 0, zIndex: 50, backgroundColor: '#fff', borderBottom: '1px solid #e5e7eb', boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
  },
  inner: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: '1200px', margin: '0 auto', padding: '0 24px', height: '64px' },
  brand: { display: 'flex', alignItems: 'center', gap: '10px', fontWeight: '700', fontSize: '18px', color: '#0f172a', textDecoration: 'none' },
  brandMark: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', borderRadius: '8px', backgroundColor: '#F97316', color: '#fff', fontSize: '11px', fontWeight: '700' },
  nav: { display: 'flex', alignItems: 'center', gap: '16px' },
  navLink: { fontSize: '14px', fontWeight: '500', color: '#374151', textDecoration: 'none', padding: '6px 10px', borderRadius: '6px' },
  avatar: { width: '36px', height: '36px', borderRadius: '50%', backgroundColor: '#F97316', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '600', fontSize: '14px', textDecoration: 'none' },
};

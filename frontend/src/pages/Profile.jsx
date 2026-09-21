import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../services/auth';

export default function Profile() {
  const { user } = useAuth();
  return (
    <div>
      <h1 style={styles.heading}>Profile</h1>
      <p style={styles.subtitle}>Your account information</p>
      <div style={styles.card}>
        <div style={styles.field}>
          <label style={styles.label}>Username</label>
          <input type="text" value={user?.username || ''} style={styles.input} readOnly />
        </div>
        <div style={styles.field}>
          <label style={styles.label}>Email</label>
          <input type="text" value={user?.email || ''} style={styles.input} readOnly />
        </div>
        <div style={styles.field}>
          <label style={styles.label}>Role</label>
          <input type="text" value={user?.role || ''} style={styles.input} readOnly />
        </div>
        <Link to="/" style={styles.link}>Back to Dashboard</Link>
      </div>
    </div>
  );
}

const styles = {
  heading: { fontSize: '28px', color: '#1f2937', fontWeight: '700', marginBottom: '8px' },
  subtitle: { color: '#6b7280', fontSize: '14px', marginBottom: '24px' },
  card: { backgroundColor: '#fff', padding: '24px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', border: '1px solid #e5e7eb', maxWidth: '400px' },
  field: { marginBottom: '16px' },
  label: { display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500', color: '#374151' },
  input: { width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', outline: 'none' },
  link: { display: 'inline-block', marginTop: '16px', fontSize: '14px', fontWeight: '500', color: '#F97316' },
};

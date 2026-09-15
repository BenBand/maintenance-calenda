import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth, apiFetch } from '../services/auth';
import Login from './Login';
import Navbar from './Navbar';

export default function ProtectedLayout({ children }) {
  const { token } = useAuth();
  if (!token) return <Login />;
  return (
    <>
      <Navbar />
      <main style={styles.main}>{children}</main>
      <div className="watermark" />
    </>
  );
}

const styles = {
  main: { minHeight: 'calc(100vh - 64px)', position: 'relative', zIndex: 1, padding: '24px', maxWidth: '1200px', margin: '0 auto' },
};

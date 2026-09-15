import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import Login from './components/Login';
import Navbar from './components/Navbar';
import { AuthProvider, useAuth } from './services/auth';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const CalendarPage = lazy(() => import('./pages/CalendarPage'));
const RecordsPage = lazy(() => import('./pages/RecordsPage'));
const Profile = lazy(() => import('./pages/Profile'));

function ProtectedLayout() {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" />;
  return (
    <>
      <Navbar />
      <main style={styles.main}>
        <Suspense fallback={<div style={styles.fallback}>Loading...</div>}>
          <Outlet />
        </Suspense>
      </main>
      <div className="watermark" />
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/records" element={<RecordsPage />} />
            <Route path="/profile" element={<Profile />} />
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
}

const styles = {
  main: { minHeight: 'calc(100vh - 64px)', position: 'relative', zIndex: 1, padding: '24px', maxWidth: '1200px', margin: '0 auto' },
  fallback: { padding: '24px', textAlign: 'center', color: '#6b7280' },
};

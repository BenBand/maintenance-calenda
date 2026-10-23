import { Suspense } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import Navbar from './Navbar';
import BottomNav from './BottomNav';
import { PageLoader } from './AsyncState';
import UpdatePrompt from './UpdatePrompt';
import OfflineBanner from './OfflineBanner';
import { useAuth } from '../services/auth';

export default function ProtectedLayout() {
  const { token, ready, sessionError, logout } = useAuth();

  if (!ready) return <PageLoader label="Checking session..." />;
  if (sessionError) {
    return (
      <main className="login-page" id="main-content" tabIndex="-1">
        <div className="watermark" aria-hidden="true" />
        <section className="login-card" aria-labelledby="session-error-title">
          <h1 className="login-title" id="session-error-title">Session problem</h1>
          <div className="alert-error" role="alert">{sessionError}</div>
          <button className="button button--primary button--wide" type="button" onClick={logout}>
            Back to sign in
          </button>
        </section>
      </main>
    );
  }
  if (!token) return <Navigate to="/login" replace />;

  return (
    <>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <Navbar />
      <OfflineBanner />
      <main className="app-main" id="main-content" tabIndex="-1">
        <Suspense fallback={<PageLoader label="Loading page..." />}>
          <Outlet />
        </Suspense>
      </main>
      <BottomNav />
      <UpdatePrompt />
      <div className="watermark" aria-hidden="true" />
    </>
  );
}

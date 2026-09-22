import { Suspense } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import Navbar from './Navbar';
import { PageLoader } from './AsyncState';
import { useAuth } from '../services/auth';

export default function ProtectedLayout() {
  const { token, ready } = useAuth();

  if (!ready) return <PageLoader label="Checking session..." />;
  if (!token) return <Navigate to="/login" replace />;

  return (
    <>
      <Navbar />
      <main className="app-main" id="main-content" tabIndex="-1">
        <Suspense fallback={<PageLoader label="Loading page..." />}>
          <Outlet />
        </Suspense>
      </main>
      <div className="watermark" aria-hidden="true" />
    </>
  );
}

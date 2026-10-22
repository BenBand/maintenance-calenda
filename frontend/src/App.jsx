import { lazy } from 'react';
import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import Login from './components/Login';
import ProtectedLayout from './components/ProtectedLayout';
import PermissionGate from './components/PermissionGate';
import LandingRoute from './components/LandingRoute';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const CalendarPage = lazy(() => import('./pages/CalendarPage'));
const RecordsPage = lazy(() => import('./pages/RecordsPage'));
const IncidentsPage = lazy(() => import('./pages/IncidentsPage'));
const UsersPage = lazy(() => import('./pages/UsersPage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const AssetsPage = lazy(() => import('./pages/AssetsPage'));
const Profile = lazy(() => import('./pages/Profile'));
const FaqPage = lazy(() => import('./pages/FaqPage'));

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<ProtectedLayout />}>
          {/* A user's home is their incident history; staff land on the
              maintenance dashboard. Without this the requester would open the
              app straight onto schedules and service records they never asked
              for. */}
          <Route path="/" element={<LandingRoute />} />
          <Route
            path="/dashboard"
            element={<PermissionGate permission="maintenance:read"><Dashboard /></PermissionGate>}
          />
          <Route
            path="/calendar"
            element={<PermissionGate permission="maintenance:read"><CalendarPage /></PermissionGate>}
          />
          <Route
            path="/records"
            element={<PermissionGate permission="service:read"><RecordsPage /></PermissionGate>}
          />
          <Route
            path="/incidents"
            element={<PermissionGate permission="incident:read"><IncidentsPage /></PermissionGate>}
          />
          <Route
            path="/assets"
            element={<PermissionGate permission="asset:read"><AssetsPage /></PermissionGate>}
          />
          <Route
            path="/analytics"
            element={<PermissionGate permission="analytics:read"><AnalyticsPage /></PermissionGate>}
          />
          <Route
            path="/users"
            element={<PermissionGate permission="user:read"><UsersPage /></PermissionGate>}
          />
          <Route
            path="/faq"
            element={<PermissionGate permission="faq:read"><FaqPage /></PermissionGate>}
          />
          <Route path="/profile" element={<Profile />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}
import NoticesPage from './pages/NoticesPage';


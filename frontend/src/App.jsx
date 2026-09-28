import { lazy } from 'react';
import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import Login from './components/Login';
import ProtectedLayout from './components/ProtectedLayout';
import PermissionGate from './components/PermissionGate';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const CalendarPage = lazy(() => import('./pages/CalendarPage'));
const RecordsPage = lazy(() => import('./pages/RecordsPage'));
const IncidentsPage = lazy(() => import('./pages/IncidentsPage'));
const UsersPage = lazy(() => import('./pages/UsersPage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const AssetsPage = lazy(() => import('./pages/AssetsPage'));
const Profile = lazy(() => import('./pages/Profile'));

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<ProtectedLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/calendar" element={<CalendarPage />} />
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
          <Route path="/profile" element={<Profile />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

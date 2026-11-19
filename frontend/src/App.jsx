import { lazy } from 'react';
import { BrowserRouter as Router, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Login from './components/Login';
import Register from './components/Register';
import ProtectedLayout from './components/ProtectedLayout';
import PermissionGate from './components/PermissionGate';
import LandingRoute from './components/LandingRoute';
import PublicReportPage from './pages/PublicReportPage';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const CalendarPage = lazy(() => import('./pages/CalendarPage'));
const RecordsPage = lazy(() => import('./pages/RecordsPage'));
const IncidentsPage = lazy(() => import('./pages/IncidentsPage'));
const UsersPage = lazy(() => import('./pages/UsersPage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const AssetsPage = lazy(() => import('./pages/AssetsPage'));
const Profile = lazy(() => import('./pages/Profile'));
const FaqPage = lazy(() => import('./pages/FaqPage'));

function App() {
  return (
    <Router>
      <Routes>
        {/* Unified sign-in page - one URL for both admins and users */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/" element={<Navigate to="/login" replace />} />

        <Route element={<ProtectedLayout />}>
          {/* Role-based home route - after login, users land based on their role */}
          <Route path="/dashboard"
            element={<PermissionGate permission="maintenance:read"><Dashboard /></PermissionGate>}
          />
          <Route path="/calendar"
            element={<PermissionGate permission="maintenance:read"><CalendarPage /></PermissionGate>}
          />
          <Route path="/records"
            element={<PermissionGate permission="service:read"><RecordsPage /></PermissionGate>}
          />
          <Route path="/incidents"
            element={<PermissionGate permission="incident:read"><IncidentsPage /></PermissionGate>}
          />
          <Route path="/assets"
            element={<PermissionGate permission="asset:read"><AssetsPage /></PermissionGate>}
          />
          <Route path="/analytics"
            element={<PermissionGate permission="analytics:read"><AnalyticsPage /></PermissionGate>}
          />
          <Route path="/users"
            element={<PermissionGate permission="user:read"><UsersPage /></PermissionGate>}
          />
          <Route path="/faq"
            element={<PermissionGate permission="faq:read"><FaqPage /></PermissionGate>}
          />
          <Route path="/profile" element={<Profile />} />
        </Route>

        {/* Public incident reporting (no auth required) */}
        <Route path="/report" element={<PublicReportPage />} />

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Router>
  );
}

export default App;


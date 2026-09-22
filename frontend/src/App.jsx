import { lazy } from 'react';
import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import Login from './components/Login';
import ProtectedLayout from './components/ProtectedLayout';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const CalendarPage = lazy(() => import('./pages/CalendarPage'));
const RecordsPage = lazy(() => import('./pages/RecordsPage'));
const IncidentsPage = lazy(() => import('./pages/IncidentsPage'));
const Profile = lazy(() => import('./pages/Profile'));

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<ProtectedLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/records" element={<RecordsPage />} />
          <Route path="/incidents" element={<IncidentsPage />} />
          <Route path="/profile" element={<Profile />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

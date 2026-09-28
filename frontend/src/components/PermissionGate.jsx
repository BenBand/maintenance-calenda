import { Navigate } from 'react-router-dom';
import { useAuth } from '../services/auth';

/**
 * Client-side route guard. This is a UX affordance only — the backend
 * enforces the same permissions via requirePermission on every route.
 */
export default function PermissionGate({ permission, children }) {
  const { ready, can } = useAuth();

  if (!ready) return null;
  if (!can(permission)) return <Navigate to="/" replace />;

  return children;
}

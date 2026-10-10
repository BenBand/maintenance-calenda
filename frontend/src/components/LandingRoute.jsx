import { Navigate } from 'react-router-dom';
import { useAuth } from '../services/auth';
import { PERMISSIONS } from '../services/permissions';

/**
 * The app root (`/`) is not a page of its own: it sends each role to the view
 * they actually use.
 *
 * A `user` is a requester. They report an issue and then follow their own
 * history, so they land on `/incidents`, which loads only the incidents they
 * filed. Staff who can read maintenance schedules land on the dashboard, which
 * is their queue overview.
 *
 * Someone who cannot do either still gets the incidents page - it is the one
 * screen every signed-in role can read - rather than a dead end.
 */
export default function LandingRoute() {
  const { can } = useAuth();

  if (can(PERMISSIONS.MAINTENANCE_READ)) return <Navigate to="/dashboard" replace />;
  return <Navigate to="/incidents" replace />;
}

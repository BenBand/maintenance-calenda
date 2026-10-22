import { useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch, readApiData } from '../services/api';
import { useApiData } from '../hooks/useApiData';
import { useAuth } from '../services/auth';
import { PERMISSIONS } from '../services/permissions';
import { ErrorState, SkeletonPage } from '../components/AsyncState';

const PROFILE_FIELDS = [
  { label: 'Username', value: (user) => user.username },
  { label: 'Email', value: (user) => user.email },
  { label: 'Role', value: (user) => user.role.charAt(0).toUpperCase() + user.role.slice(1) },
];

export default function Profile() {
  const { can, logout } = useAuth();
  const navigate = useNavigate();
  const canReadMaintenance = can(PERMISSIONS.MAINTENANCE_READ);

  const loadProfile = useCallback(async () => {
    const response = await apiFetch('/auth/me', {});
    return readApiData(response);
  }, []);

  const { data: user, loading, error, reload } = useApiData(loadProfile);

  const handleLogout = useCallback(() => {
    logout();
    navigate('/login', { replace: true });
  }, [logout, navigate]);

  if (loading && !user) return <SkeletonPage label="Loading profile..." />;
  if (error && !user) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div className="page page--narrow" aria-busy={loading}>
      <header className="page-header">
        <div>
          <h1 className="page-title">Profile</h1>
          <p className="page-subtitle">Your account information</p>
        </div>
      </header>

      {error && <div className="inline-alert" role="alert"><span>{error}</span><button className="button button--secondary button--small" type="button" onClick={reload}>Retry</button></div>}

      <div className="profile-wrapper">
        <section className="profile-card" aria-labelledby="profile-title">
          <h2 className="sr-only" id="profile-title">Account details</h2>
          <div className="profile-header">
            <div className="profile-avatar" aria-hidden="true">
              {(user?.username || 'U').charAt(0).toUpperCase()}
            </div>
            <h3 className="profile-name">{user?.username}</h3>
            <p className="profile-role">{user?.role}</p>
          </div>
          <dl className="profile-list">
            {PROFILE_FIELDS.map((field) => (
              <div className="profile-item" key={field.label}>
                <dt className="profile-label">{field.label}</dt>
                <dd className="profile-value">{field.value(user || {}) || '-'}</dd>
              </div>
            ))}
          </dl>
          <div className="profile-actions">
            <button className="button button--danger" type="button" onClick={handleLogout}>
              Log out
            </button>
            {/* A user has no dashboard to return to, so the link names the one
                screen their role actually lives in. */}
            <Link className="button button--secondary" to={canReadMaintenance ? '/dashboard' : '/incidents'}>
              {canReadMaintenance ? 'Back to Dashboard' : 'Back to My Incidents'}
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

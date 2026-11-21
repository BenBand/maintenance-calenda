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

const STAT_GROUPS = [
  {
    title: 'Reports',
    items: [
      { label: 'Total reports', key: 'total' },
      { label: 'Open', key: 'open' },
      { label: 'Resolved', key: 'resolved' },
      { label: 'Critical', key: 'critical' },
      { label: 'In this period', key: 'in_period' },
    ],
  },
  {
    title: 'Maintenance schedules',
    items: [
      { label: 'Total', key: 'total' },
      { label: 'Completed', key: 'completed' },
      { label: 'In progress', key: 'in_progress' },
      { label: 'Overdue', key: 'overdue' },
      { label: 'Due next 7 days', key: 'due_next_7_days' },
    ],
  },
  {
    title: 'Service records',
    items: [
      { label: 'Total', key: 'total' },
      { label: 'In this period', key: 'in_period' },
      { label: 'Time spent (hrs)', key: 'total_time_hours' },
    ],
  },
];

export default function Profile() {
  const { can, logout } = useAuth();
  const navigate = useNavigate();
  const canReadMaintenance = can(PERMISSIONS.MAINTENANCE_READ);

  const loadProfile = useCallback(async () => {
    const response = await apiFetch('/auth/me', {});
    return readApiData(response);
  }, []);

  const loadStats = useCallback(async () => {
    const response = await apiFetch('/analytics/user-stats', {});
    return readApiData(response);
  }, []);

  const { data: user, loading: loadingUser, error: errorUser, reload: reloadUser } = useApiData(loadProfile);
  const { data: stats, loading: loadingStats, error: errorStats, reload: reloadStats } = useApiData(loadStats);

  const handleLogout = useCallback(() => {
    logout();
    navigate('/report', { replace: true });
  }, [logout, navigate]);

  if ((loadingUser || loadingStats) && !user) return <SkeletonPage label="Loading profile..." />;
  if ((errorUser || errorStats) && !user) return <ErrorState message={errorUser || errorStats} onRetry={() => { reloadUser(); reloadStats(); }} />;

  return (
    <div className="page page--narrow" aria-busy={loading}>
      <header className="page-header">
        <div>
          <h1 className="page-title">Profile</h1>
          <p className="page-subtitle">Your account information</p>
        </div>
      </header>

      {errorUser && <div className="inline-alert" role="alert"><span>{errorUser}</span><button className="button button--secondary button--small" type="button" onClick={reloadUser}>Retry</button></div>}

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

        {stats && (
          <section className="profile-card" aria-labelledby="user-stats-title">
            <h2 className="sr-only" id="user-stats-title">Your statistics</h2>
            <header className="profile-header">
              <h3 id="user-stats-title">Your statistics</h3>
              <p className="profile-role">Your activity across the system</p>
            </header>
            <div className="stats-grid" role="list" aria-label="User activity summary">
              {STAT_GROUPS.map((group) => (
                <div key={group.title} className="stat-card">
                  <h4 className="stat-card__label" style={{ fontSize: '15px', marginBottom: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>
                    {group.title}
                  </h4>
                  <dl style={{ margin: 0, padding: 0, display: 'grid', gap: 6 }}>
                    {group.items.map((item) => {
                      let value = stats[group.title.toLowerCase()]?.[item.key];
                      if (item.key === 'total_time_hours' && value != null) value = value.toFixed(1);
                      return (
                        <div key={item.key} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-soft)', paddingBottom: 6, marginBottom: 6 }}>
                          <span className="profile-label" style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 600 }}>{item.label}</span>
                          <span className="profile-value" style={{ fontSize: '13px', color: 'var(--text)', fontWeight: 600 }}>{value != null ? value : '-'}</span>
                        </div>
                      );
                    })}
                  </dl>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

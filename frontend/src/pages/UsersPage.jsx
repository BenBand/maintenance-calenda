import { useCallback, useState } from 'react';
import { useAuth } from '../services/auth';
import { PERMISSIONS } from '../services/permissions';
import { apiFetch, readApiData } from '../services/api';
import { useApiData } from '../hooks/useApiData';
import Modal from '../components/Modal';
import { EmptyState, ErrorState, SkeletonPage } from '../components/AsyncState';

const ROLES = ['admin', 'manager', 'staff'];

const EMPTY_FORM = {
  username: '',
  email: '',
  password: '',
  role: 'staff',
  confirmPassword: '',
};

export default function UsersPage() {
  const { user, can } = useAuth();
  const canWrite = can(PERMISSIONS.USER_WRITE);
  const canDelete = can(PERMISSIONS.USER_DELETE);

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState(null);

  const loadPage = useCallback(async () => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (roleFilter) params.set('role', roleFilter);
    const query = params.toString();
    const response = await apiFetch(`/users${query ? `?${query}` : ''}`, {});
    return readApiData(response);
  }, [search, roleFilter]);

  const { data, loading, error, reload } = useApiData(loadPage);
  const users = data?.data || [];

  const openCreate = () => {
    setEditingUser(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (target) => {
    setEditingUser(target);
    setForm({
      username: target.username || '',
      email: target.email || '',
      password: '',
      role: target.role || 'staff',
      confirmPassword: '',
    });
    setFormError('');
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingUser(null);
    setFormError('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError('');

    if (!editingUser && form.password !== form.confirmPassword) {
      setFormError('Passwords do not match');
      return;
    }
    if (editingUser && form.password && form.password !== form.confirmPassword) {
      setFormError('Passwords do not match');
      return;
    }

    try {
      if (editingUser) {
        const payload = { username: form.username, email: form.email, role: form.role };
        if (form.password) payload.password = form.password;
        await apiFetch(`/users/${editingUser.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await apiFetch('/users', {
          method: 'POST',
          body: JSON.stringify({
            username: form.username,
            email: form.email,
            password: form.password,
            role: form.role,
          }),
        });
      }
      closeForm();
      await reload();
    } catch (err) {
      setFormError(err.message || 'Unable to save user');
    }
  };

  const handleDelete = async (target) => {
    if (!window.confirm(`Delete user "${target.username}"? This cannot be undone.`)) return;
    setActionError('');
    setActionLoadingId(target.id);
    try {
      await apiFetch(`/users/${target.id}`, { method: 'DELETE' });
      await reload();
    } catch (err) {
      setActionError(err.message || 'Unable to delete user');
    } finally {
      setActionLoadingId(null);
    }
  };

  if (loading && !data) return <SkeletonPage label="Loading users..." />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div className="page" aria-busy={loading}>
      <header className="page-header">
        <div>
          <h1 className="page-title">User Management</h1>
          <p className="page-subtitle">Manage accounts, roles and access</p>
        </div>
        {canWrite && (
          <button className="button button--primary" type="button" onClick={openCreate}>+ Add User</button>
        )}
      </header>

      {(error || actionError) && (
        <div className="inline-alert" role="alert">
          <span>{actionError || error}</span>
          {error && <button className="button button--secondary button--small" type="button" onClick={reload}>Retry</button>}
        </div>
      )}
      {actionLoadingId && <div className="refresh-indicator" role="status"><span className="spinner spinner--small" aria-hidden="true" />Saving...</div>}

      <div className="filters" aria-label="User filters">
        <div className="filter-group filter-group--search">
          <label className="sr-only" htmlFor="user-search">Search users</label>
          <input className="input" id="user-search" type="search" placeholder="Search users..." value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <div className="filter-group">
          <label className="sr-only" htmlFor="user-role">Role</label>
          <select className="input" id="user-role" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
            <option value="">All Roles</option>
            {ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
          </select>
        </div>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <caption className="sr-only">System users</caption>
          <thead>
            <tr>
              <th scope="col">Username</th>
              <th scope="col">Email</th>
              <th scope="col">Role</th>
              <th scope="col">Created</th>
              {(canWrite || canDelete) && <th scope="col">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {users.map((row) => {
              const isSelf = String(row.id) === String(user?.id);
              return (
                <tr key={row.id}>
                  <td>{row.username}{isSelf && <span className="badge badge--medium">you</span>}</td>
                  <td>{row.email}</td>
                  <td><span className={`badge badge--status-${row.role}`}>{row.role}</span></td>
                  <td>{row.created_at?.split('T')[0] || '-'}</td>
                  {(canWrite || canDelete) && (
                    <td>
                      <div className="table-actions">
                        {canWrite && <button className="button button--primary button--small" type="button" onClick={() => openEdit(row)} aria-label={`Edit user ${row.username}`}>Edit</button>}
                        {canDelete && !isSelf && <button className="button button--danger button--small" type="button" onClick={() => handleDelete(row)} disabled={actionLoadingId === row.id} aria-label={`Delete user ${row.username}`}>Delete</button>}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
            {users.length === 0 && (
              <tr><td colSpan={(canWrite || canDelete) ? 5 : 4}><EmptyState>No users found</EmptyState></td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <Modal title={editingUser ? `Edit User - ${editingUser.username}` : 'Add User'} onClose={closeForm}>
          <form className="form-stack" onSubmit={handleSubmit} noValidate>
            {formError && <div className="inline-alert" role="alert"><span>{formError}</span></div>}

            <div className="form-field">
              <label className="field-label" htmlFor="user-username">Username *</label>
              <input className="input" id="user-username" type="text" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} required minLength={3} maxLength={100} autoComplete="off" />
            </div>

            <div className="form-field">
              <label className="field-label" htmlFor="user-email">Email *</label>
              <input className="input" id="user-email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required maxLength={255} autoComplete="off" />
            </div>

            <div className="form-field">
              <label className="field-label" htmlFor="user-role-select">Role</label>
              <select className="input" id="user-role-select" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} disabled={Boolean(editingUser && isSelfUser(editingUser, user))}>
                {ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
              </select>
              {editingUser && isSelfUser(editingUser, user) && (
                <p className="field-hint">You cannot change your own role.</p>
              )}
            </div>

            <div className="form-field">
              <label className="field-label" htmlFor="user-password">
                {editingUser ? 'New Password' : 'Password *'}
              </label>
              <input
                className="input"
                id="user-password"
                type="password"
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                required={!editingUser}
                minLength={8}
                maxLength={255}
                autoComplete="new-password"
              />
              {editingUser && <p className="field-hint">Leave blank to keep the current password.</p>}
            </div>

            <div className="form-field">
              <label className="field-label" htmlFor="user-confirm-password">Confirm Password *</label>
              <input
                className="input"
                id="user-confirm-password"
                type="password"
                value={form.confirmPassword}
                onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })}
                required
                minLength={8}
                maxLength={255}
                autoComplete="new-password"
              />
            </div>

            <div className="form-actions">
              <button className="button button--secondary" type="button" onClick={closeForm}>Cancel</button>
              <button className="button button--primary" type="submit">
                {editingUser ? 'Save Changes' : 'Create User'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function isSelfUser(editingUser, currentUser) {
  return String(editingUser?.id) === String(currentUser?.id);
}

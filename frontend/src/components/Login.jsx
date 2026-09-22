import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../services/auth';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    if (!username.trim() || !password) {
      setError('Username and password are required');
      return;
    }
    if (username.length > 100) {
      setError('Username must be 100 characters or fewer');
      return;
    }
    if (password.length > 255) {
      setError('Password must be 255 characters or fewer');
      return;
    }

    setLoading(true);
    try {
      await login(username, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message || 'Unable to sign in');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-page" id="main-content" tabIndex="-1">
      <div className="watermark" aria-hidden="true" />
      <section className="login-card" aria-labelledby="login-title">
        <h1 className="login-title" id="login-title">Maintenance Calendar</h1>
        <p className="login-subtitle">Lusaka City Council - IT Department</p>
        {error && <div className="alert-error" role="alert">{error}</div>}
        <form className="login-form" onSubmit={handleSubmit} autoComplete="off" aria-busy={loading}>
          <div className="form-field">
            <label className="field-label" htmlFor="username">Username</label>
            <input
              className="input"
              id="username"
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
              autoComplete="username"
            />
          </div>
          <div className="form-field">
            <label className="field-label" htmlFor="password">Password</label>
            <input
              className="input"
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          <button className="button button--primary button--wide" type="submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </section>
    </main>
  );
}

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../services/auth';
import PasswordInput from '../components/PasswordInput';

export default function Register() {
  const { register, login } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    if (!fullName.trim()) {
      setError('Full name is required');
      return;
    }
    if (fullName.trim().length < 2) {
      setError('Full name must be at least 2 characters');
      return;
    }
    if (!email.trim()) {
      setError('Email is required');
      return;
    }
    if (!password) {
      setError('Create a password');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      await register({ fullName, email, password, confirmPassword });
      // Registered accounts are always the `user` role, so they land on the
      // public report page like any other non-admin user.
      navigate('/report', { replace: true });
    } catch (err) {
      setError(err.message || 'Unable to create account');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-page" id="main-content" tabIndex="-1">
      <div className="watermark" aria-hidden="true" />
      <section className="login-card" aria-labelledby="register-title">
        <h1 className="login-title" id="register-title">Create an account</h1>
        <p className="login-subtitle">Lusaka City Council - IT Department</p>
        {error && <div className="alert-error" role="alert">{error}</div>}
        <form className="login-form" onSubmit={handleSubmit} autoComplete="off" aria-busy={loading}>
          <div className="form-field">
            <label className="field-label" htmlFor="fullName">Full name</label>
            <input
              className="input"
              id="fullName"
              type="text"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              required
              autoComplete="name"
              maxLength={100}
            />
          </div>
          <div className="form-field">
            <label className="field-label" htmlFor="email">Email address</label>
            <input
              className="input"
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
              maxLength={255}
            />
          </div>
          <PasswordInput
            id="password"
            label="Create password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={8}
            maxLength={255}
            autoComplete="new-password"
            hint="At least 8 characters"
          />
          <PasswordInput
            id="confirmPassword"
            label="Confirm password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
            minLength={8}
            maxLength={255}
            autoComplete="new-password"
            hint="Type the same password again"
          />
          <button className="button button--primary button--wide" type="submit" disabled={loading}>
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>
        <p className="login-subtitle" style={{ marginTop: 16, textAlign: 'center' }}>
          Already have an account?{' '}
          <a href="/login" className="button button--secondary button--wide" style={{ textDecoration: 'none', display: 'block', textAlign: 'center' }}>
            Sign in
          </a>
        </p>
      </section>
    </main>
  );
}

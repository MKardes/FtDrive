import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/auth';
import { ApiError } from '../../api/client';

export default function Login() {
  const { user, isLoading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!isLoading && user) {
    const from = (location.state as { from?: string } | null)?.from ?? '/';
    return <Navigate to={from} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(username, password);
      const from = (location.state as { from?: string } | null)?.from ?? '/';
      navigate(from, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setError('Too many attempts. Please wait and try again.');
      } else if (err instanceof ApiError && err.status === 401) {
        setError('Incorrect username or password.');
      } else {
        setError('Sign-in failed. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-card">
      <h1>Sign in to FtDrive</h1>
      <form onSubmit={onSubmit} noValidate>
        <div className="field">
          <label className="label" htmlFor="username">
            Username
          </label>
          <input
            id="username"
            className="input"
            autoComplete="username"
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          className="btn btn--primary"
          style={{ width: '100%' }}
          disabled={submitting || !username || !password}
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

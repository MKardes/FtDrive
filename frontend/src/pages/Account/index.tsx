import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api, ApiError } from '../../api/client';
import { useAuth } from '../../app/auth';

/**
 * Account settings (T056, FR-022): change your own password. Requires the
 * current password; on success the server revokes your other sessions, so we
 * just confirm. The new password must be at least 10 characters.
 */
export default function Account() {
  const { user } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const change = useMutation({
    mutationFn: () => api.account.changePassword(current, next),
    onSuccess: () => {
      setDone(true);
      setError(null);
      setCurrent('');
      setNext('');
      setConfirm('');
    },
    onError: (err) => {
      setDone(false);
      if (err instanceof ApiError && err.status === 401) setError('Your current password is incorrect.');
      else if (err instanceof ApiError && (err.status === 400 || err.code === 'VALIDATION'))
        setError('Choose a password with at least 10 characters.');
      else setError('Could not change your password. Please try again.');
    },
  });

  const mismatch = confirm.length > 0 && next !== confirm;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);
    if (next !== confirm) {
      setError('The new passwords don’t match.');
      return;
    }
    change.mutate();
  }

  return (
    <div>
      <div className="page-header">
        <h2>Account</h2>
      </div>
      <p className="muted">Signed in as {user?.username}.</p>

      <form className="card" onSubmit={onSubmit} style={{ maxWidth: 420 }}>
        <h3 style={{ marginTop: 0 }}>Change password</h3>
        <div className="field">
          <label className="label" htmlFor="current">
            Current password
          </label>
          <input
            id="current"
            className="input"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="next">
            New password (≥ 10 characters)
          </label>
          <input
            id="next"
            className="input"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="confirm">
            Confirm new password
          </label>
          <input
            id="confirm"
            className="input"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
        {mismatch && <p className="error-text">The new passwords don’t match.</p>}
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        {done && (
          <p className="muted" role="status">
            Password changed. Your other sessions have been signed out.
          </p>
        )}
        <button
          type="submit"
          className="btn btn--primary"
          disabled={change.isPending || !current || next.length < 10 || mismatch}
        >
          {change.isPending ? 'Saving…' : 'Change password'}
        </button>
      </form>
    </div>
  );
}

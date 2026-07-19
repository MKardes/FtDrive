import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../api/client';
import { useAuth } from '../../app/auth';
import { ConfirmDialog, PromptDialog } from '../../features/nodes/dialogs';
import type { User } from '../../api/types';

type Dialog =
  | { kind: 'remove'; user: User }
  | { kind: 'reset'; user: User }
  | { kind: 'email'; user: User }
  | null;

/**
 * Owner-only user management (T055, FR-015/022): list users, provision a new
 * account, remove one (cascades their space), and reset a password. Non-owners
 * are redirected — the API is the real guard (403), this is just UX.
 */
export default function Admin() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  const usersQ = useQuery({ queryKey: ['admin', 'users'], queryFn: () => api.admin.listUsers() });
  const invalidate = () => void qc.invalidateQueries({ queryKey: ['admin', 'users'] });

  const create = useMutation({
    mutationFn: () =>
      api.admin.createUser(newUsername.trim(), newPassword, 'user', newEmail.trim() || null),
    onSuccess: () => {
      invalidate();
      setNewUsername('');
      setNewPassword('');
      setNewEmail('');
      setFormError(null);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) setFormError('That username or email is taken.');
      else if (err instanceof ApiError && (err.status === 400 || err.code === 'VALIDATION'))
        setFormError(err.message);
      else setFormError('Could not create the user.');
    },
  });

  const setEmail = useMutation({
    mutationFn: (vars: { id: string; email: string | null }) => api.admin.setEmail(vars.id, vars.email),
    onSuccess: () => {
      invalidate();
      setDialog(null);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) setEmailError('That email is already in use.');
      else setEmailError(err instanceof ApiError ? err.message : 'Could not save the email.');
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.admin.deleteUser(id),
    onSuccess: () => {
      invalidate();
      setDialog(null);
    },
  });

  const reset = useMutation({
    mutationFn: (vars: { id: string; password: string }) => api.admin.resetPassword(vars.id, vars.password),
    onSuccess: () => setDialog(null),
    onError: (err) => setResetError(err instanceof ApiError ? err.message : 'Could not reset the password.'),
  });

  if (user && user.role !== 'owner') return <Navigate to="/" replace />;

  function onCreate(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    create.mutate();
  }

  return (
    <div>
      <h2>Users</h2>

      <form className="card" onSubmit={onCreate}>
        <h3 style={{ marginTop: 0 }}>Add a user</h3>
        <div className="field">
          <label className="label" htmlFor="new-username">
            Username
          </label>
          <input
            id="new-username"
            className="input"
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="new-email">
            Email (optional — used to address shares)
          </label>
          <input
            id="new-email"
            className="input"
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="new-password">
            Temporary password (≥ 10 characters)
          </label>
          <input
            id="new-password"
            className="input"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
          />
        </div>
        {formError && (
          <p className="error-text" role="alert">
            {formError}
          </p>
        )}
        <button
          type="submit"
          className="btn btn--primary"
          disabled={create.isPending || newUsername.trim().length === 0 || newPassword.length < 10}
        >
          {create.isPending ? 'Adding…' : 'Add user'}
        </button>
      </form>

      {usersQ.isLoading && (
        <p className="muted" role="status">
          <span className="spinner" aria-hidden="true" /> Loading…
        </p>
      )}
      {usersQ.data && (
        <ul className="list">
          {usersQ.data.map((u) => (
            <li key={u.id} className="list-row">
              <span className="spacer">
                {u.username}
                <span className="muted" style={{ marginLeft: 8, fontSize: '0.8rem' }}>
                  {u.email ? `${u.email} · ` : ''}
                  {u.role}
                  {u.status === 'disabled' ? ' · disabled' : ''}
                </span>
              </span>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  setEmailError(null);
                  setDialog({ kind: 'email', user: u });
                }}
              >
                Set email
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  setResetError(null);
                  setDialog({ kind: 'reset', user: u });
                }}
              >
                Reset password
              </button>
              {u.id !== user?.id && (
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => setDialog({ kind: 'remove', user: u })}
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {dialog?.kind === 'remove' && (
        <ConfirmDialog
          title={`Remove “${dialog.user.username}”?`}
          message="This permanently deletes the user, all of their files, and their sessions. This can’t be undone."
          confirmLabel="Remove user"
          danger
          busy={remove.isPending}
          onConfirm={() => remove.mutate(dialog.user.id)}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'email' && (
        <PromptDialog
          title={`Email for “${dialog.user.username}”`}
          label="Email address (shares are addressed to it)"
          initialValue={dialog.user.email ?? ''}
          submitLabel="Save email"
          busy={setEmail.isPending}
          error={emailError}
          onSubmit={(email) => setEmail.mutate({ id: dialog.user.id, email: email.trim() || null })}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'reset' && (
        <PromptDialog
          title={`Reset password for “${dialog.user.username}”`}
          label="New password (≥ 10 characters)"
          submitLabel="Reset password"
          busy={reset.isPending}
          error={resetError}
          onSubmit={(password) => reset.mutate({ id: dialog.user.id, password })}
          onCancel={() => setDialog(null)}
        />
      )}
    </div>
  );
}

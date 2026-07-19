import { useState } from 'react';
import { api } from '../api/client';
import type { DirectoryUser, Node } from '../api/types';
import { useCreateShare, useDirectory, useNodeShares, useRevokeShare } from '../features/shares/hooks';
import { useDialogDismiss } from '../app/useDialogDismiss';
import { ExpiryControl } from './ExpiryControl';
import { Icon } from './Icon';

/** How a person is shown/addressed: email when set, username otherwise. */
function personLabel(u: { username: string; email?: string | null }): string {
  return u.email ?? u.username;
}

/**
 * Share management for one owned node (006-share-links): the "Anyone with the
 * link" grant and the per-person grants both live here. Opened from the card's
 * details (⋮) menu; the same grants are also visible in the "My shares"
 * overview (FR-006).
 */
export function ShareDialog({ node, onClose }: { node: Node; onClose: () => void }) {
  const sharesQ = useNodeShares(node.id);
  const directoryQ = useDirectory();
  const createShare = useCreateShare(node.id);
  const revokeShare = useRevokeShare(node.id);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<DirectoryUser[]>([]);
  const [personQuery, setPersonQuery] = useState('');
  const { onBackdropClick } = useDialogDismiss(onClose);

  const items = sharesQ.data?.items ?? [];
  const linkShare = items.find((s) => s.kind === 'link');
  const recipients = items.filter((s) => s.kind === 'user');
  const grantedIds = new Set(recipients.map((s) => s.recipient?.id));
  const pickedIds = new Set(picked.map((u) => u.id));
  const candidates = (directoryQ.data ?? []).filter((u) => !grantedIds.has(u.id) && !pickedIds.has(u.id));
  // Email is the addressing identity: typing filters by email first, then
  // username as the fallback for accounts without one. The directory is only
  // revealed once at least 3 characters are typed — never listed wholesale.
  const q = personQuery.trim().toLowerCase();
  const queryReady = q.length >= 3;
  const suggestions = !queryReady
    ? []
    : candidates.filter(
        (u) => (u.email ?? '').includes(q) || u.username.toLowerCase().includes(q),
      );
  const busy = createShare.isPending || revokeShare.isPending;

  function fail() {
    setError('Something went wrong. Please try again.');
  }

  function createLink() {
    setError(null);
    createShare.mutate({ kind: 'link' }, { onError: fail });
  }

  async function copyLink(token: string) {
    const url = api.shares.linkUrl(token);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be unavailable (e.g. plain-HTTP LAN dev); the visible,
      // selectable URL below remains the fallback.
      setError('Couldn’t copy automatically — select the link text and copy it.');
    }
  }

  function revoke(shareId: string) {
    setError(null);
    revokeShare.mutate(shareId, { onError: fail });
  }

  function pick(user: DirectoryUser) {
    setPicked((prev) => [...prev, user]);
    setPersonQuery('');
  }

  function unpick(id: string) {
    setPicked((prev) => prev.filter((u) => u.id !== id));
  }

  function shareWithPicked() {
    if (picked.length === 0) return;
    setError(null);
    createShare.mutate(
      { kind: 'user', recipientIds: picked.map((u) => u.id) },
      { onSuccess: () => setPicked([]), onError: fail },
    );
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onBackdropClick}>
      <div className="modal share-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <h3 title={node.name}>Share “{node.name}”</h3>
          <button type="button" className="btn btn--ghost btn--icon" aria-label="Close dialog" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>

        <section className="share-section">
          <h4>
            <Icon name="link" /> Anyone with the link
          </h4>
          {sharesQ.isLoading && (
            <p className="muted" role="status">
              <span className="spinner" aria-hidden="true" /> Loading…
            </p>
          )}
          {!sharesQ.isLoading && !linkShare && (
            <>
              <p className="muted">
                Create a link that lets anyone view and download {node.type === 'folder' ? 'this folder' : 'this file'} —
                no account needed.
              </p>
              <button type="button" className="btn btn--primary" onClick={createLink} disabled={busy}>
                {createShare.isPending ? 'Creating…' : 'Create link'}
              </button>
            </>
          )}
          {linkShare?.token && (
            <>
              <div className="share-link-row">
                <input
                  className="input share-link-row__url"
                  type="text"
                  readOnly
                  value={api.shares.linkUrl(linkShare.token)}
                  aria-label="Share link"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <button type="button" className="btn" onClick={() => void copyLink(linkShare.token as string)}>
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <div className="row-actions">
                <ExpiryControl share={linkShare} nodeId={node.id} />
                <button type="button" className="btn btn--danger" onClick={() => revoke(linkShare.id)} disabled={busy}>
                  {revokeShare.isPending ? 'Revoking…' : 'Revoke link'}
                </button>
              </div>
            </>
          )}
        </section>

        <section className="share-section">
          <h4>
            <Icon name="people" /> Specific people
          </h4>
          {recipients.length > 0 && (
            <div>
              {recipients.map((s) => (
                <div key={s.id} className="share-row">
                  <span className="share-row__who" title={s.recipient?.username}>
                    {s.recipient ? personLabel(s.recipient) : '—'}
                  </span>
                  <ExpiryControl share={s} nodeId={node.id} />
                  <button
                    type="button"
                    className="btn btn--ghost btn--icon"
                    onClick={() => revoke(s.id)}
                    disabled={busy}
                    aria-label={`Remove ${s.recipient ? personLabel(s.recipient) : 'recipient'}`}
                    title="Remove"
                  >
                    <Icon name="close" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {picked.length > 0 && (
            <div className="share-chips" aria-label="People to share with">
              {picked.map((u) => (
                <span key={u.id} className="share-chip">
                  {personLabel(u)}
                  <button
                    type="button"
                    className="share-chip__remove"
                    onClick={() => unpick(u.id)}
                    aria-label={`Don’t share with ${personLabel(u)}`}
                  >
                    <Icon name="close" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {directoryQ.isLoading && recipients.length === 0 && <p className="muted">Loading people…</p>}
          {!directoryQ.isLoading && (directoryQ.data?.length ?? 0) === 0 && recipients.length === 0 && (
            <p className="muted">No other users on this drive yet.</p>
          )}

          {(candidates.length > 0 || q.length > 0) && (
            <>
              <input
                className="input"
                type="text"
                value={personQuery}
                onChange={(e) => setPersonQuery(e.target.value)}
                placeholder="Type an email…"
                aria-label="Add people by email"
                autoComplete="off"
              />
              {suggestions.length > 0 ? (
                <div className="share-picker" role="listbox" aria-label="Matching people">
                  {suggestions.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      role="option"
                      aria-selected={false}
                      className="btn btn--ghost share-picker__option"
                      onClick={() => pick(u)}
                    >
                      {u.email ? (
                        <>
                          {u.email} <span className="muted">({u.username})</span>
                        </>
                      ) : (
                        u.username
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                queryReady && (
                  <p className="muted">No user with that email on this drive. Ask the owner to add them.</p>
                )
              )}
            </>
          )}

          {picked.length > 0 && (
            <button
              type="button"
              className="btn btn--primary"
              onClick={shareWithPicked}
              disabled={busy}
            >
              {createShare.isPending ? 'Sharing…' : `Share with ${picked.length}`}
            </button>
          )}
        </section>

        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}

        <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

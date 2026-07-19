import { useState } from 'react';
import type { Share } from '../api/types';
import { useUpdateShare } from '../features/shares/hooks';

function formatExpiry(ms: number): string {
  return new Date(ms).toLocaleString();
}

/** datetime-local value (local time, minutes precision) for an epoch-ms stamp. */
function toLocalInputValue(ms: number): string {
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
}

/**
 * Set / change / clear one share's expiration (006-share-links, FR-008).
 * Rendered wherever the share is managed — the item's Share dialog and the
 * "My shares" overview behave identically (US3 #4).
 */
export function ExpiryControl({ share, nodeId }: { share: Share; nodeId?: string }) {
  const updateShare = useUpdateShare(nodeId);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(share.expiresAt ? toLocalInputValue(share.expiresAt) : '');
  const [error, setError] = useState<string | null>(null);

  function save() {
    if (!value) return;
    const ms = new Date(value).getTime();
    if (Number.isNaN(ms) || ms <= Date.now()) {
      setError('Pick a time in the future.');
      return;
    }
    setError(null);
    updateShare.mutate(
      { shareId: share.id, expiresAt: ms },
      { onSuccess: () => setEditing(false), onError: () => setError('Couldn’t save. Try again.') },
    );
  }

  function clear() {
    setError(null);
    updateShare.mutate(
      { shareId: share.id, expiresAt: null },
      { onSuccess: () => setEditing(false), onError: () => setError('Couldn’t save. Try again.') },
    );
  }

  if (!editing) {
    return (
      <span className="expiry-control">
        <span className="muted">
          {share.expiresAt ? `Expires ${formatExpiry(share.expiresAt)}` : 'No expiry'}
        </span>
        <button type="button" className="btn btn--ghost" onClick={() => setEditing(true)}>
          Edit
        </button>
      </span>
    );
  }

  return (
    <span className="expiry-control">
      <input
        className="input expiry-control__input"
        type="datetime-local"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label="Expiration date and time"
      />
      <button type="button" className="btn" onClick={save} disabled={updateShare.isPending || !value}>
        Save
      </button>
      {share.expiresAt !== null && (
        <button type="button" className="btn btn--ghost" onClick={clear} disabled={updateShare.isPending}>
          Clear
        </button>
      )}
      <button type="button" className="btn btn--ghost" onClick={() => setEditing(false)}>
        Cancel
      </button>
      {error && <span className="error-text">{error}</span>}
    </span>
  );
}

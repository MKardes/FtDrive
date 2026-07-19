import { useState } from 'react';
import { api } from '../../api/client';
import type { ShareWithNode } from '../../api/types';
import { ExpiryControl } from '../../components/ExpiryControl';
import { useMyShares, useRevokeShare } from '../../features/shares/hooks';

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString();
}

/**
 * "My shares" overview (006-share-links, US3): every grant the caller has
 * created — item, kind, recipient, created date, expiry — with copy link,
 * expiry edit, and revoke, mirroring the item's Share dialog (FR-006).
 */
export function MySharesPanel() {
  const listQ = useMyShares();
  const revokeShare = useRevokeShare();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const items = listQ.data?.items ?? [];

  async function copy(share: ShareWithNode) {
    if (!share.token) return;
    try {
      await navigator.clipboard.writeText(api.shares.linkUrl(share.token));
      setCopiedId(share.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Clipboard unavailable — the link is still visible in the Share dialog.
    }
  }

  return (
    <div>
      {listQ.isLoading && (
        <p className="muted" role="status">
          <span className="spinner" aria-hidden="true" /> Loading…
        </p>
      )}
      {listQ.isError && (
        <p className="error-text" role="alert">
          Couldn’t load your shares. Please try again.
        </p>
      )}
      {!listQ.isLoading && !listQ.isError && items.length === 0 && (
        <div className="empty-state">
          You haven’t shared anything yet. Open a file or folder’s ⋮ menu and choose Share.
        </div>
      )}

      {items.length > 0 && (
        <div className="list">
          {items.map((share) => (
            <div key={share.id} className="list-row my-share-row">
              <span className="share-row__who" title={share.node.name}>
                {share.node.type === 'folder' ? '📁' : '📄'} {share.node.name}
              </span>
              <span className="badge">
                {share.kind === 'link'
                  ? 'Anyone with the link'
                  : `To ${share.recipient?.email ?? share.recipient?.username}`}
              </span>
              <span className="muted">{formatDate(share.createdAt)}</span>
              <ExpiryControl share={share} nodeId={share.nodeId} />
              <div className="spacer" />
              {share.kind === 'link' && share.token && (
                <button type="button" className="btn" onClick={() => void copy(share)}>
                  {copiedId === share.id ? 'Copied!' : 'Copy link'}
                </button>
              )}
              <button
                type="button"
                className="btn btn--danger"
                onClick={() => revokeShare.mutate(share.id)}
                disabled={revokeShare.isPending}
              >
                Revoke
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import { api } from '../../api/client';
import type { ShareWithNode } from '../../api/types';
import { EmptyState } from '../../components/EmptyState';
import { ExpiryControl } from '../../components/ExpiryControl';
import { Icon } from '../../components/Icon';
import { RowMenu } from '../../components/RowMenu';
import { useMyShares, useRevokeShare } from '../../features/shares/hooks';

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString();
}

/** One-line summary of a grant: who it reaches, when it was created, expiry. */
function describe(share: ShareWithNode): string {
  const via =
    share.kind === 'link'
      ? 'Anyone with the link'
      : `To ${share.recipient?.email ?? share.recipient?.username}`;
  const expiry = share.expiresAt
    ? `Expires ${new Date(share.expiresAt).toLocaleString()}`
    : 'No expiry';
  return `${via} · Created ${formatDate(share.createdAt)} · ${expiry}`;
}

/**
 * "My shares" overview (006-share-links, US3): every grant the caller has
 * created — item, kind, recipient, created date, expiry — with copy link,
 * expiry edit, and revoke, mirroring the item's Share dialog (FR-006).
 * 007 restyle: compact rows — details in the secondary line, copy as an
 * icon-only quick action, everything named behind the row's ⋮ menu.
 */
export function MySharesPanel() {
  const listQ = useMyShares();
  const revokeShare = useRevokeShare();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expiryEditId, setExpiryEditId] = useState<string | null>(null);
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
        <EmptyState
          icon="share"
          title="You haven’t shared anything yet."
          hint="Open a file or folder’s details menu and choose Share."
        />
      )}

      {items.length > 0 && (
        <div className="list">
          {items.map((share) => (
            <div key={share.id} className="list-row">
              <span className="list-row__icon">
                <Icon name={share.node.type === 'folder' ? 'folder' : 'file'} />
              </span>
              <span className="list-row__text" title={share.node.name}>
                <span className="list-row__primary">{share.node.name}</span>
                <span className="list-row__secondary">
                  <Icon name={share.kind === 'link' ? 'link' : 'person'} /> {describe(share)}
                </span>
              </span>
              <span className="list-row__actions">
                {share.kind === 'link' && share.token && (
                  <button
                    type="button"
                    className="btn btn--ghost btn--icon"
                    aria-label="Copy link"
                    title={copiedId === share.id ? 'Copied!' : 'Copy link'}
                    onClick={() => void copy(share)}
                  >
                    <Icon name={copiedId === share.id ? 'check' : 'copy'} />
                  </button>
                )}
                <RowMenu label={`More actions for ${share.node.name}`}>
                  {share.kind === 'link' && share.token && (
                    <button type="button" className="menu__item" onClick={() => void copy(share)}>
                      <Icon name="copy" /> Copy link
                    </button>
                  )}
                  <button type="button" className="menu__item" onClick={() => setExpiryEditId(share.id)}>
                    <Icon name="clock" /> Edit expiry
                  </button>
                  <div className="menu__separator" />
                  <button
                    type="button"
                    className="menu__item menu__item--danger"
                    onClick={() => revokeShare.mutate(share.id)}
                    disabled={revokeShare.isPending}
                  >
                    <Icon name="close" /> Revoke
                  </button>
                </RowMenu>
              </span>
              {expiryEditId === share.id && (
                <div className="list-row__expand">
                  <ExpiryControl
                    share={share}
                    nodeId={share.nodeId}
                    editing
                    onDone={() => setExpiryEditId(null)}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

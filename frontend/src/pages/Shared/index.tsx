import { useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import type { Node, SharedWithMeItem } from '../../api/types';
import { FileUrlProvider, type FileUrls } from '../../app/fileUrls';
import { FileGrid } from '../../components/FileGrid';
import { Preview } from '../../components/Preview';
import { useSharedChildren, useSharedWithMe } from '../../features/shares/hooks';
import { MySharesPanel } from './MyShares';

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString();
}

/**
 * "Shared" area (006-share-links): what others shared with me (US2) and what
 * I've shared ("My shares", US3). Recipient content is strictly read-only —
 * this page exposes browse/preview/download and nothing else (FR-005).
 */
export default function Shared() {
  const { shareId } = useParams();
  if (shareId) return <SharedBrowse shareId={shareId} />;
  return <SharedHome />;
}

function SharedHome() {
  const location = useLocation();
  const manage = location.pathname.endsWith('/manage');

  return (
    <div>
      <nav className="tabs" aria-label="Shared views">
        <NavLink to="/shared" end className="btn btn--ghost">
          Shared with me
        </NavLink>
        <NavLink to="/shared/manage" className="btn btn--ghost">
          My shares
        </NavLink>
      </nav>
      {manage ? <MySharesPanel /> : <SharedWithMePanel />}
    </div>
  );
}

function SharedWithMePanel() {
  const listQ = useSharedWithMe();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<SharedWithMeItem | null>(null);
  const items = listQ.data?.items ?? [];

  const previewUrls: FileUrls | null = useMemo(
    () =>
      preview
        ? {
            contentUrl: (id) => api.sharedWithMe.contentUrl(preview.shareId, id),
            thumbnailUrl: (id) => api.sharedWithMe.thumbnailUrl(preview.shareId, id),
          }
        : null,
    [preview],
  );

  function open(item: SharedWithMeItem) {
    if (item.node.type === 'folder') {
      navigate(`/shared/${item.shareId}/folder`, {
        state: { rootName: item.node.name, owner: item.owner.username },
      });
    } else {
      setPreview(item);
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
          Couldn’t load shared items. Please try again.
        </p>
      )}
      {!listQ.isLoading && !listQ.isError && items.length === 0 && (
        <div className="empty-state">Nothing has been shared with you yet.</div>
      )}

      {items.length > 0 && (
        <div className="list">
          {items.map((item) => (
            <div key={item.shareId} className="list-row">
              <button
                type="button"
                className="btn btn--ghost share-row__who"
                onClick={() => open(item)}
                title={item.node.name}
              >
                {item.node.type === 'folder' ? '📁' : '📄'} {item.node.name}
              </button>
              <span className="muted">
                Shared by {item.owner.username} · {formatDate(item.createdAt)}
              </span>
              <div className="spacer" />
              {item.node.type === 'file' && (
                <a
                  className="btn btn--ghost btn--icon"
                  href={api.sharedWithMe.contentUrl(item.shareId, item.node.id)}
                  download={item.node.name}
                  title="Download"
                >
                  ⭳
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {preview && previewUrls && (
        <FileUrlProvider urls={previewUrls}>
          <Preview node={preview.node} onClose={() => setPreview(null)} />
        </FileUrlProvider>
      )}
    </div>
  );
}

interface Crumb {
  id: string;
  name: string;
}

/** Read-only browse inside one direct share's subtree. */
function SharedBrowse({ shareId }: { shareId: string }) {
  const { nodeId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as { rootName?: string; owner?: string; crumbs?: Crumb[] };
  const crumbs = state.crumbs ?? [];
  const rootName = state.rootName ?? 'Shared folder';

  const childrenQ = useSharedChildren(shareId, nodeId);
  const items: Node[] = childrenQ.data?.pages.flatMap((p) => p.items) ?? [];
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const urls: FileUrls = useMemo(
    () => ({
      contentUrl: (id) => api.sharedWithMe.contentUrl(shareId, id),
      thumbnailUrl: (id) => api.sharedWithMe.thumbnailUrl(shareId, id),
    }),
    [shareId],
  );

  const previewNode = previewIndex !== null ? (items[previewIndex] ?? null) : null;
  const hasPrev = previewIndex !== null && previewIndex > 0;
  const hasNext = previewIndex !== null && (previewIndex < items.length - 1 || Boolean(childrenQ.hasNextPage));
  const position =
    previewIndex !== null && items.length > 1 ? { index: previewIndex + 1, total: items.length } : undefined;

  async function previewNext() {
    if (previewIndex === null) return;
    if (previewIndex < items.length - 1) {
      setPreviewIndex(previewIndex + 1);
      return;
    }
    if (childrenQ.hasNextPage) {
      await childrenQ.fetchNextPage();
      setPreviewIndex(previewIndex + 1);
    }
  }

  function openNode(node: Node) {
    if (node.type === 'folder') {
      navigate(`/shared/${shareId}/folder/${node.id}`, {
        state: { ...state, crumbs: [...crumbs, { id: node.id, name: node.name }] },
      });
    } else {
      const idx = items.findIndex((n) => n.id === node.id);
      setPreviewIndex(idx === -1 ? null : idx);
    }
  }

  function navigateCrumb(index: number) {
    if (index < 0) {
      navigate(`/shared/${shareId}/folder`, { state: { ...state, crumbs: [] } });
      return;
    }
    const sliced = crumbs.slice(0, index + 1);
    const target = sliced[sliced.length - 1];
    if (!target) return;
    navigate(`/shared/${shareId}/folder/${target.id}`, { state: { ...state, crumbs: sliced } });
  }

  return (
    <FileUrlProvider urls={urls}>
      <nav className="breadcrumb" aria-label="Shared folder path">
        <NavLink to="/shared" className="btn btn--ghost">
          Shared with me
        </NavLink>
        {' / '}
        <button type="button" className="btn btn--ghost" onClick={() => navigateCrumb(-1)}>
          {rootName}
        </button>
        {crumbs.map((c, i) => (
          <span key={c.id}>
            {' / '}
            <button type="button" className="btn btn--ghost" onClick={() => navigateCrumb(i)}>
              {c.name}
            </button>
          </span>
        ))}
      </nav>
      {state.owner && <p className="muted">Shared by {state.owner} — read-only</p>}

      {childrenQ.isLoading && (
        <p className="muted" role="status">
          <span className="spinner" aria-hidden="true" /> Loading…
        </p>
      )}
      {childrenQ.isError && (
        <div className="empty-state">
          This shared item isn’t available anymore. It may have been revoked or removed.
        </div>
      )}
      {!childrenQ.isLoading && !childrenQ.isError && items.length === 0 && (
        <div className="empty-state">This folder is empty.</div>
      )}

      {items.length > 0 && (
        <FileGrid
          nodes={items}
          onOpen={openNode}
          renderQuickAction={(node) =>
            node.type === 'file' ? (
              <a
                className="btn btn--ghost btn--icon"
                href={urls.contentUrl(node.id)}
                download={node.name}
                title="Download"
              >
                ⭳
              </a>
            ) : null
          }
        />
      )}

      {childrenQ.hasNextPage && (
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button
            type="button"
            className="btn"
            onClick={() => void childrenQ.fetchNextPage()}
            disabled={childrenQ.isFetchingNextPage}
          >
            {childrenQ.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}

      {previewNode && (
        <Preview
          node={previewNode}
          onClose={() => setPreviewIndex(null)}
          onPrev={() => setPreviewIndex((i) => (i !== null && i > 0 ? i - 1 : i))}
          onNext={() => void previewNext()}
          hasPrev={hasPrev}
          hasNext={hasNext}
          position={position}
        />
      )}
    </FileUrlProvider>
  );
}

import { useMemo, useState, Fragment } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../api/client';
import type { Node } from '../../api/types';
import { FileUrlProvider, type FileUrls } from '../../app/fileUrls';
import { EmptyState } from '../../components/EmptyState';
import { FileGrid } from '../../components/FileGrid';
import { Icon } from '../../components/Icon';
import { Logo } from '../../components/Logo';
import { Preview } from '../../components/Preview';
import { nodeIconName } from '../../components/Thumbnail';
import { usePublicChildren, usePublicShare } from '../../features/shares/hooks';

interface Crumb {
  id: string;
  name: string;
}

/**
 * Anonymous open-link page (006-share-links, US1): `/s/:token`, no session, no
 * app chrome. Renders the shared file (preview + download) or the shared
 * folder (grid with thumbnails, load-more, viewers), all through the public
 * share endpoints — the token in the URL is the only credential. Any failure
 * shows one generic "not available" state (FR-012).
 */
export default function PublicShare() {
  const { token = '' } = useParams();
  const infoQ = usePublicShare(token);
  const root = infoQ.data?.node ?? null;

  // Folder navigation within the shared subtree — plain local state, ids only
  // ever come from listings the share itself returned.
  const [crumbs, setCrumbs] = useState<Crumb[]>([]);
  const current = crumbs.length > 0 ? (crumbs[crumbs.length - 1] as Crumb) : null;
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const isFolder = root?.type === 'folder';
  const childrenQ = usePublicChildren(token, current?.id, Boolean(root) && isFolder);
  const items: Node[] = childrenQ.data?.pages.flatMap((p) => p.items) ?? [];

  const urls: FileUrls = useMemo(
    () => ({
      contentUrl: (id) => api.publicShares.contentUrl(token, id),
      thumbnailUrl: (id) => api.publicShares.thumbnailUrl(token, id),
    }),
    [token],
  );

  const previewNode =
    previewIndex !== null ? (isFolder ? (items[previewIndex] ?? null) : root) : null;
  const hasPrev = isFolder && previewIndex !== null && previewIndex > 0;
  const hasNext =
    isFolder && previewIndex !== null && (previewIndex < items.length - 1 || Boolean(childrenQ.hasNextPage));
  const position =
    isFolder && previewIndex !== null && items.length > 1
      ? { index: previewIndex + 1, total: items.length }
      : undefined;

  function openNode(node: Node) {
    if (node.type === 'folder') {
      setCrumbs((prev) => [...prev, { id: node.id, name: node.name }]);
    } else {
      const idx = items.findIndex((n) => n.id === node.id);
      setPreviewIndex(idx === -1 ? null : idx);
    }
  }

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

  function navigateCrumb(index: number) {
    setCrumbs((prev) => (index < 0 ? [] : prev.slice(0, index + 1)));
  }

  return (
    <div className="app-shell public-share">
      <header className="public-topbar">
        <Logo />
        <span className="public-share__tag">Shared with you</span>
      </header>
      <main className="app-main">
        {infoQ.isLoading && (
          <p className="muted" role="status">
            <span className="spinner" aria-hidden="true" /> Loading…
          </p>
        )}

        {infoQ.isError && (
          <div className="public-share__unavailable">
            <EmptyState
              icon="error"
              title="This link isn’t available"
              hint="It may have been turned off, expired, or never existed."
            />
          </div>
        )}

        {root && (
          <FileUrlProvider urls={urls}>
            {isFolder ? (
              <>
                <nav className="breadcrumb" aria-label="Shared folder path" style={{ padding: '14px 0 4px' }}>
                  {crumbs.length === 0 ? (
                    <span className="breadcrumb__current">{root.name || 'Shared folder'}</span>
                  ) : (
                    <button type="button" className="btn btn--ghost" onClick={() => navigateCrumb(-1)}>
                      {root.name || 'Shared folder'}
                    </button>
                  )}
                  {crumbs.map((c, i) => (
                    <Fragment key={c.id}>
                      <span className="breadcrumb__sep" aria-hidden="true">
                        <Icon name="chevron-right" />
                      </span>
                      {i === crumbs.length - 1 ? (
                        <span className="breadcrumb__current" title={c.name}>
                          {c.name}
                        </span>
                      ) : (
                        <button type="button" className="btn btn--ghost" onClick={() => navigateCrumb(i)}>
                          {c.name}
                        </button>
                      )}
                    </Fragment>
                  ))}
                </nav>

                {childrenQ.isLoading && (
                  <p className="muted" role="status">
                    <span className="spinner" aria-hidden="true" /> Loading…
                  </p>
                )}
                {childrenQ.isError && (
                  <div className="public-share__unavailable">
                    <EmptyState
                      icon="error"
                      title="This link isn’t available"
                      hint="It may have been turned off, expired, or never existed."
                    />
                  </div>
                )}
                {!childrenQ.isLoading && !childrenQ.isError && items.length === 0 && (
                  <EmptyState icon="folder" title="This folder is empty." />
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
                          <Icon name="download" />
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
              </>
            ) : (
              <div className="public-share__file">
                <span className="empty-state__icon" aria-hidden="true">
                  <Icon name={nodeIconName(root)} size={40} />
                </span>
                <h2 className="public-share__name">{root.name}</h2>
                <div className="row-actions">
                  {(root.mimeType?.startsWith('image/') || root.mimeType?.startsWith('video/')) && (
                    <button type="button" className="btn" onClick={() => setPreviewIndex(0)}>
                      <Icon name={root.mimeType?.startsWith('image/') ? 'image' : 'video'} /> Preview
                    </button>
                  )}
                  <a className="btn btn--primary" href={urls.contentUrl(root.id)} download={root.name}>
                    <Icon name="download" /> Download
                  </a>
                </div>
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
        )}
      </main>
    </div>
  );
}

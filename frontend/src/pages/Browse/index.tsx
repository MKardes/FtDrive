import { useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useChildren, useSearch } from '../../features/nodes/hooks';
import { FileGrid } from '../../components/FileGrid';
import { Breadcrumb, type Crumb } from '../../components/Breadcrumb';
import { Preview } from '../../components/Preview';
import type { Node } from '../../api/types';

export default function Browse() {
  const { folderId } = useParams();
  const fid = folderId ?? 'root';
  const navigate = useNavigate();
  const location = useLocation();
  const crumbs = ((location.state as { crumbs?: Crumb[] } | null)?.crumbs ?? []) as Crumb[];

  const [query, setQuery] = useState('');
  const [preview, setPreview] = useState<Node | null>(null);
  const searching = query.trim().length > 0;

  const childrenQ = useChildren(fid);
  const searchQ = useSearch(query);
  const active = searching ? searchQ : childrenQ;
  const items: Node[] = active.data?.pages.flatMap((p) => p.items) ?? [];

  function openNode(node: Node) {
    if (node.type === 'folder') {
      setQuery('');
      navigate(`/folder/${node.id}`, {
        state: { crumbs: [...crumbs, { id: node.id, name: node.name }] },
      });
    } else {
      setPreview(node);
    }
  }

  function navigateCrumb(index: number) {
    setQuery('');
    if (index < 0) {
      navigate('/', { state: { crumbs: [] } });
    } else {
      const sliced = crumbs.slice(0, index + 1);
      const target = sliced[sliced.length - 1];
      if (!target) {
        navigate('/', { state: { crumbs: [] } });
        return;
      }
      navigate(`/folder/${target.id}`, { state: { crumbs: sliced } });
    }
  }

  return (
    <div>
      <div className="toolbar">
        <input
          className="input"
          style={{ maxWidth: 320 }}
          type="search"
          placeholder="Search your files…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search files"
        />
        <div className="spacer" />
      </div>

      {searching ? (
        <p className="muted">Search results for “{query.trim()}”</p>
      ) : (
        <Breadcrumb crumbs={crumbs} onNavigate={navigateCrumb} />
      )}

      {active.isLoading && (
        <p className="muted" role="status">
          <span className="spinner" aria-hidden="true" /> Loading…
        </p>
      )}
      {active.isError && (
        <p className="error-text" role="alert">
          Couldn’t load this view. Please try again.
        </p>
      )}
      {!active.isLoading && !active.isError && items.length === 0 && (
        <div className="empty-state">
          {searching ? 'No matching files.' : 'This folder is empty.'}
        </div>
      )}

      {items.length > 0 && <FileGrid nodes={items} onOpen={openNode} />}

      {active.hasNextPage && (
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button
            type="button"
            className="btn"
            onClick={() => void active.fetchNextPage()}
            disabled={active.isFetchingNextPage}
          >
            {active.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}

      {preview && <Preview node={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

import { useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { ConfirmDialog } from '../../features/nodes/dialogs';
import type { TrashItem, TrashPage } from '../../api/types';

type Dialog = { kind: 'purge'; item: TrashItem } | { kind: 'empty' } | null;

function daysLeft(expiresAt: number | null): string {
  if (expiresAt === null) return '';
  const ms = expiresAt - Date.now();
  if (ms <= 0) return 'expiring soon';
  const days = Math.ceil(ms / (24 * 60 * 60 * 1000));
  return `${days} day${days === 1 ? '' : 's'} left`;
}

/**
 * Trash page (T067, FR-007/008): list deleted items, restore them to their
 * original place, permanently delete one, or empty the whole trash. The two
 * permanent actions require explicit confirmation.
 */
export default function Trash() {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<Dialog>(null);

  const trashQ = useInfiniteQuery({
    queryKey: ['trash'],
    queryFn: ({ pageParam }): Promise<TrashPage> => api.trash.list(pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items: TrashItem[] = trashQ.data?.pages.flatMap((p) => p.items) ?? [];

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['trash'] });
    void qc.invalidateQueries({ queryKey: ['children'] });
  };

  const restore = useMutation({ mutationFn: (id: string) => api.trash.restore(id), onSuccess: invalidate });
  const purge = useMutation({
    mutationFn: (id: string) => api.trash.purge(id),
    onSuccess: () => {
      invalidate();
      setDialog(null);
    },
  });
  const empty = useMutation({
    mutationFn: () => api.trash.empty(),
    onSuccess: () => {
      invalidate();
      setDialog(null);
    },
  });

  return (
    <div>
      <div className="toolbar">
        <h2 style={{ margin: 0 }}>Trash</h2>
        <div className="spacer" />
        {items.length > 0 && (
          <button type="button" className="btn btn--danger" onClick={() => setDialog({ kind: 'empty' })}>
            Empty trash
          </button>
        )}
      </div>

      {trashQ.isLoading && (
        <p className="muted" role="status">
          <span className="spinner" aria-hidden="true" /> Loading…
        </p>
      )}
      {!trashQ.isLoading && items.length === 0 && (
        <div className="empty-state">Trash is empty.</div>
      )}

      {items.length > 0 && (
        <ul className="list">
          {items.map((item) => (
            <li key={item.id} className="list-row">
              <span>{item.type === 'folder' ? '📁' : '📄'}</span>
              <span className="spacer" title={item.name}>
                {item.name}
                <span className="muted" style={{ marginLeft: 8, fontSize: '0.8rem' }}>
                  {daysLeft(item.trashedExpiresAt)}
                </span>
              </span>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => restore.mutate(item.id)}
                disabled={restore.isPending}
              >
                Restore
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setDialog({ kind: 'purge', item })}
              >
                Delete forever
              </button>
            </li>
          ))}
        </ul>
      )}

      {trashQ.hasNextPage && (
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button
            type="button"
            className="btn"
            onClick={() => void trashQ.fetchNextPage()}
            disabled={trashQ.isFetchingNextPage}
          >
            {trashQ.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}

      {dialog?.kind === 'purge' && (
        <ConfirmDialog
          title={`Permanently delete “${dialog.item.name}”?`}
          message="This can’t be undone. The file and its contents are removed from disk."
          confirmLabel="Delete forever"
          danger
          busy={purge.isPending}
          onConfirm={() => purge.mutate(dialog.item.id)}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'empty' && (
        <ConfirmDialog
          title="Empty trash?"
          message="Every item in the trash will be permanently removed. This can’t be undone."
          confirmLabel="Empty trash"
          danger
          busy={empty.isPending}
          onConfirm={() => empty.mutate()}
          onCancel={() => setDialog(null)}
        />
      )}
    </div>
  );
}

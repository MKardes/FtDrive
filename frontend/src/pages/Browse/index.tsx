import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  useChildren,
  useSearch,
  useCreateFolder,
  useRenameNode,
  useMoveNode,
  useTrashNode,
  useBulkMoveNodes,
  useBulkTrashNodes,
  type BulkResult,
} from '../../features/nodes/hooks';
import { useUploader } from '../../features/upload/hooks';
import { ConfirmDialog, PromptDialog, MoveDialog } from '../../features/nodes/dialogs';
import { FileGrid } from '../../components/FileGrid';
import { Breadcrumb, type Crumb } from '../../components/Breadcrumb';
import { Preview } from '../../components/Preview';
import { Uploader } from '../../components/Uploader';
import { DropZone } from '../../components/DropZone';
import { DownloadUrlDialog } from '../../components/DownloadUrlDialog';
import { ShareDialog } from '../../components/ShareDialog';
import { BulkResultPanel } from '../../components/BulkResultPanel';
import { api, ApiError } from '../../api/client';
import type { Node } from '../../api/types';

type Dialog =
  | { kind: 'create' }
  | { kind: 'rename'; node: Node }
  | { kind: 'move'; node: Node }
  | { kind: 'delete'; node: Node }
  | { kind: 'share'; node: Node }
  | { kind: 'download-url' }
  | { kind: 'bulk-move' }
  | { kind: 'bulk-delete' }
  | null;

function messageFor(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 409) return 'That would create a cycle or conflicts — try another name/location.';
    if (err.status === 404) return 'That item is no longer available.';
    if (err.code === 'VALIDATION' || err.status === 400) return 'That name isn’t allowed.';
  }
  return 'Something went wrong. Please try again.';
}

export default function Browse() {
  const { folderId } = useParams();
  const fid = folderId ?? 'root';
  const navigate = useNavigate();
  const location = useLocation();
  const crumbs = ((location.state as { crumbs?: Crumb[] } | null)?.crumbs ?? []) as Crumb[];

  const [query, setQuery] = useState('');
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const searching = query.trim().length > 0;

  // Bulk selection (005-actions-menu-bulk-select): lifted here, like `dialog`, since the
  // toolbar's Select toggle and bulk-action bar both live in this component.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkResult, setBulkResult] = useState<BulkResult['failed'] | null>(null);

  // `/` and `/folder/:id` render the same `Browse` instance (App.tsx), so a plain
  // route change (e.g. the top-nav "Files" link) does not remount this component
  // and would otherwise leave a stale selection behind (FR-009) — clear on any
  // folder change regardless of which UI path triggered it.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [fid]);

  const childrenQ = useChildren(fid);
  const searchQ = useSearch(query);
  const active = searching ? searchQ : childrenQ;
  const items: Node[] = active.data?.pages.flatMap((p) => p.items) ?? [];
  const selectedNodes = items.filter((n) => selectedIds.has(n.id));

  const uploader = useUploader(fid);

  const createFolder = useCreateFolder(fid);
  const renameNode = useRenameNode(fid);
  const moveNode = useMoveNode(fid);
  const trashNode = useTrashNode(fid);
  const bulkMove = useBulkMoveNodes(fid);
  const bulkTrash = useBulkTrashNodes(fid);
  const busy =
    createFolder.isPending ||
    renameNode.isPending ||
    moveNode.isPending ||
    trashNode.isPending ||
    bulkMove.isPending ||
    bulkTrash.isPending;

  // Carousel navigation over `items` (003-drag-drop-carousel-nav): derived, never stored, so it
  // can't drift from what's actually loaded (data-model.md).
  const previewNode = previewIndex !== null ? (items[previewIndex] ?? null) : null;
  const hasPrev = previewIndex !== null && previewIndex > 0;
  const hasNext = previewIndex !== null && (previewIndex < items.length - 1 || Boolean(active.hasNextPage));
  // Position-in-set indicator (004-ui-polish-viewer): omitted when there's no meaningful set
  // (a lone previewable item), same derive-don't-store approach as hasPrev/hasNext above.
  const position =
    previewIndex !== null && items.length > 1 ? { index: previewIndex + 1, total: items.length } : undefined;

  function closePreview() {
    setPreviewIndex(null);
  }
  function previewPrev() {
    setPreviewIndex((i) => (i !== null && i > 0 ? i - 1 : i));
  }
  async function previewNext() {
    if (previewIndex === null) return;
    if (previewIndex < items.length - 1) {
      setPreviewIndex(previewIndex + 1);
      return;
    }
    if (active.hasNextPage) {
      await active.fetchNextPage();
      setPreviewIndex(previewIndex + 1);
    }
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectMode() {
    setSelectMode((v) => !v);
    clearSelection();
  }

  // Selects/deselects every currently-loaded item (not further pages — matches
  // the app's existing keyset-pagination scope, same as bulk actions generally).
  const allSelected = items.length > 0 && items.every((n) => selectedIds.has(n.id));
  function toggleSelectAll() {
    setSelectedIds(allSelected ? new Set() : new Set(items.map((n) => n.id)));
  }

  function openNode(node: Node) {
    if (node.type === 'folder') {
      setQuery('');
      navigate(`/folder/${node.id}`, {
        state: { crumbs: [...crumbs, { id: node.id, name: node.name }] },
      });
    } else {
      const idx = items.findIndex((n) => n.id === node.id);
      setPreviewIndex(idx === -1 ? null : idx);
    }
  }

  function navigateCrumb(index: number) {
    setQuery('');
    if (index < 0) {
      navigate('/', { state: { crumbs: [] } });
      return;
    }
    const sliced = crumbs.slice(0, index + 1);
    const target = sliced[sliced.length - 1];
    if (!target) {
      navigate('/', { state: { crumbs: [] } });
      return;
    }
    navigate(`/folder/${target.id}`, { state: { crumbs: sliced } });
  }

  function closeDialog() {
    setDialog(null);
    setDialogError(null);
  }

  function handleCreate(name: string) {
    setDialogError(null);
    createFolder.mutate(name, { onSuccess: closeDialog, onError: (e) => setDialogError(messageFor(e)) });
  }
  function handleRename(name: string) {
    if (dialog?.kind !== 'rename') return;
    setDialogError(null);
    renameNode.mutate(
      { id: dialog.node.id, name },
      { onSuccess: closeDialog, onError: (e) => setDialogError(messageFor(e)) },
    );
  }
  function handleMove(destId: string) {
    if (dialog?.kind !== 'move') return;
    setDialogError(null);
    moveNode.mutate(
      { id: dialog.node.id, destId },
      { onSuccess: closeDialog, onError: (e) => setDialogError(messageFor(e)) },
    );
  }
  function handleDelete() {
    if (dialog?.kind !== 'delete') return;
    trashNode.mutate(dialog.node.id, { onSuccess: closeDialog, onError: (e) => setDialogError(messageFor(e)) });
  }
  function handleBulkMove(destId: string) {
    if (dialog?.kind !== 'bulk-move') return;
    bulkMove.mutate(
      { nodes: selectedNodes, destId },
      {
        onSuccess: (result) => {
          closeDialog();
          clearSelection();
          setBulkResult(result.failed.length > 0 ? result.failed : null);
        },
      },
    );
  }
  function handleBulkDelete() {
    if (dialog?.kind !== 'bulk-delete') return;
    bulkTrash.mutate(
      { nodes: selectedNodes },
      {
        onSuccess: (result) => {
          closeDialog();
          clearSelection();
          setBulkResult(result.failed.length > 0 ? result.failed : null);
        },
      },
    );
  }

  function renderQuickAction(node: Node) {
    if (node.type !== 'file') return null;
    return (
      <a className="btn btn--ghost btn--icon" href={api.files.contentUrl(node.id)} download={node.name} title="Download">
        ⭳
      </a>
    );
  }

  function renderMenuActions(node: Node) {
    return (
      <>
        <button type="button" className="btn btn--ghost" onClick={() => setDialog({ kind: 'share', node })}>
          Share
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => setDialog({ kind: 'rename', node })}>
          Rename
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => setDialog({ kind: 'move', node })}>
          Move
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => setDialog({ kind: 'delete', node })}>
          Delete
        </button>
      </>
    );
  }

  return (
    <DropZone onFiles={uploader.add} disabled={searching || dialog !== null}>
      <div className="toolbar">
        <input
          className="input"
          style={{ maxWidth: 320 }}
          type="search"
          placeholder="Search your files…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            clearSelection();
          }}
          aria-label="Search files"
        />
        <div className="spacer" />
        <button type="button" className="btn" onClick={toggleSelectMode} disabled={dialog !== null}>
          {selectMode ? 'Done selecting' : 'Select'}
        </button>
        {!searching && !selectMode && (
          <>
            <button type="button" className="btn" onClick={() => setDialog({ kind: 'create' })}>
              New folder
            </button>
            <button type="button" className="btn" onClick={() => setDialog({ kind: 'download-url' })}>
              Download from web
            </button>
            <Uploader
              items={uploader.items}
              add={uploader.add}
              retry={uploader.retry}
              dismiss={uploader.dismiss}
              clearCompleted={uploader.clearCompleted}
            />
          </>
        )}
      </div>

      {selectMode && items.length > 0 && (
        <div className="bulk-bar">
          <button type="button" className="btn btn--ghost" onClick={toggleSelectAll}>
            {allSelected ? 'Deselect all' : 'Select all'}
          </button>
          {selectedIds.size > 0 && <span className="bulk-bar__count">{selectedIds.size} selected</span>}
          <div className="spacer" />
          {selectedIds.size > 0 && (
            <>
              <button type="button" className="btn" onClick={() => setDialog({ kind: 'bulk-move' })}>
                Move
              </button>
              <button type="button" className="btn btn--danger" onClick={() => setDialog({ kind: 'bulk-delete' })}>
                Delete
              </button>
            </>
          )}
        </div>
      )}

      {bulkResult && <BulkResultPanel failed={bulkResult} onDismiss={() => setBulkResult(null)} />}

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
        <div className="empty-state">{searching ? 'No matching files.' : 'This folder is empty.'}</div>
      )}

      {items.length > 0 && (
        <FileGrid
          nodes={items}
          onOpen={openNode}
          renderQuickAction={renderQuickAction}
          renderMenuActions={renderMenuActions}
          selectMode={selectMode}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
        />
      )}

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

      {previewNode && (
        <Preview
          node={previewNode}
          onClose={closePreview}
          onPrev={previewPrev}
          onNext={() => void previewNext()}
          hasPrev={hasPrev}
          hasNext={hasNext}
          position={position}
        />
      )}

      {dialog?.kind === 'create' && (
        <PromptDialog
          title="New folder"
          label="Folder name"
          submitLabel="Create"
          busy={busy}
          error={dialogError}
          onSubmit={handleCreate}
          onCancel={closeDialog}
        />
      )}
      {dialog?.kind === 'rename' && (
        <PromptDialog
          title="Rename"
          label="New name"
          initialValue={dialog.node.name}
          busy={busy}
          error={dialogError}
          onSubmit={handleRename}
          onCancel={closeDialog}
        />
      )}
      {dialog?.kind === 'move' && (
        <MoveDialog nodes={[dialog.node]} busy={busy} error={dialogError} onMove={handleMove} onCancel={closeDialog} />
      )}
      {dialog?.kind === 'bulk-move' && (
        <MoveDialog nodes={selectedNodes} busy={busy} error={dialogError} onMove={handleBulkMove} onCancel={closeDialog} />
      )}
      {dialog?.kind === 'share' && <ShareDialog node={dialog.node} onClose={closeDialog} />}
      {dialog?.kind === 'download-url' && <DownloadUrlDialog currentFolderId={fid} onClose={closeDialog} />}
      {dialog?.kind === 'delete' && (
        <ConfirmDialog
          title={`Delete “${dialog.node.name}”?`}
          message={
            dialog.node.type === 'folder'
              ? 'This folder and everything inside it will be moved to Trash. You can restore it within the retention window.'
              : 'This file will be moved to Trash. You can restore it within the retention window.'
          }
          confirmLabel="Move to Trash"
          danger
          busy={busy}
          onConfirm={handleDelete}
          onCancel={closeDialog}
        />
      )}
      {dialog?.kind === 'bulk-delete' && (
        <ConfirmDialog
          title={`Delete ${selectedNodes.length} items?`}
          message="These items will be moved to Trash. You can restore them within the retention window."
          confirmLabel="Move to Trash"
          danger
          busy={busy}
          onConfirm={handleBulkDelete}
          onCancel={closeDialog}
        />
      )}
    </DropZone>
  );
}

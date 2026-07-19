import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
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
import { useRegisterShellActions, type ShellActions } from '../../app/shellActions';
import { ConfirmDialog, PromptDialog, MoveDialog } from '../../features/nodes/dialogs';
import { FileGrid } from '../../components/FileGrid';
import { Breadcrumb, type Crumb } from '../../components/Breadcrumb';
import { Icon } from '../../components/Icon';
import { EmptyState } from '../../components/EmptyState';
import { Preview } from '../../components/Preview';
import { Uploader, type UploaderHandle } from '../../components/Uploader';
import { UploadTray } from '../../components/UploadTray';
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

type ViewMode = 'grid' | 'list';

const VIEW_MODE_KEY = 'ftdrive:viewMode';

function readViewMode(): ViewMode {
  try {
    return localStorage.getItem(VIEW_MODE_KEY) === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}

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

  // Search moved to the top bar (007, research.md D5): the query lives in the
  // URL — `/search?q=` — instead of local state, so this page just reads it.
  const [params] = useSearchParams();
  const query = location.pathname === '/search' ? (params.get('q') ?? '') : '';
  const searching = query.trim().length > 0;

  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);

  // Grid/list presentation (007, FR-004): persisted per browser.
  const [viewMode, setViewModeState] = useState<ViewMode>(readViewMode);
  function setViewMode(mode: ViewMode) {
    setViewModeState(mode);
    try {
      localStorage.setItem(VIEW_MODE_KEY, mode);
    } catch {
      // Storage unavailable — the in-session choice still applies.
    }
  }

  // Bulk selection (005-actions-menu-bulk-select): lifted here, like `dialog`.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkResult, setBulkResult] = useState<BulkResult['failed'] | null>(null);

  // `/`, `/folder/:id` and `/search` render the same `Browse` instance, so a
  // route/query change does not remount — clear stale selection on any folder
  // or query change (FR-009 of 005).
  useEffect(() => {
    setSelectedIds(new Set());
  }, [fid, query]);

  const childrenQ = useChildren(fid);
  const searchQ = useSearch(query);
  const active = searching ? searchQ : childrenQ;
  const items: Node[] = active.data?.pages.flatMap((p) => p.items) ?? [];
  const selectedNodes = items.filter((n) => selectedIds.has(n.id));

  const uploader = useUploader(fid);
  const uploaderRef = useRef<UploaderHandle>(null);

  // Sidebar "New" menu wiring (007, research.md D6): registered while this
  // page is mounted and showing a folder — during a search there is no folder
  // to add content to, so New disables (parity with the pre-redesign toolbar,
  // which hid its creation buttons while searching).
  const shellActions = useMemo<ShellActions>(
    () => ({
      newFolder: () => setDialog({ kind: 'create' }),
      uploadFiles: () => uploaderRef.current?.open(),
      downloadFromWeb: () => setDialog({ kind: 'download-url' }),
    }),
    [],
  );
  useRegisterShellActions(searching ? null : shellActions);

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

  // Carousel navigation over `items` (003): derived, never stored.
  const previewNode = previewIndex !== null ? (items[previewIndex] ?? null) : null;
  const hasPrev = previewIndex !== null && previewIndex > 0;
  const hasNext = previewIndex !== null && (previewIndex < items.length - 1 || Boolean(active.hasNextPage));
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

  const allSelected = items.length > 0 && items.every((n) => selectedIds.has(n.id));
  function toggleSelectAll() {
    setSelectedIds(allSelected ? new Set() : new Set(items.map((n) => n.id)));
  }

  function openNode(node: Node) {
    if (node.type === 'folder') {
      navigate(`/folder/${node.id}`, {
        state: { crumbs: searching ? [{ id: node.id, name: node.name }] : [...crumbs, { id: node.id, name: node.name }] },
      });
    } else {
      const idx = items.findIndex((n) => n.id === node.id);
      setPreviewIndex(idx === -1 ? null : idx);
    }
  }

  function navigateCrumb(index: number) {
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
      <a
        className="btn btn--ghost btn--icon"
        href={api.files.contentUrl(node.id)}
        download={node.name}
        title="Download"
      >
        <Icon name="download" />
      </a>
    );
  }

  function renderMenuActions(node: Node) {
    return (
      <>
        <button type="button" className="menu__item" onClick={() => setDialog({ kind: 'share', node })}>
          <Icon name="share" /> Share
        </button>
        <button type="button" className="menu__item" onClick={() => setDialog({ kind: 'rename', node })}>
          <Icon name="edit" /> Rename
        </button>
        <button type="button" className="menu__item" onClick={() => setDialog({ kind: 'move', node })}>
          <Icon name="move" /> Move
        </button>
        <div className="menu__separator" />
        <button
          type="button"
          className="menu__item menu__item--danger"
          onClick={() => setDialog({ kind: 'delete', node })}
        >
          <Icon name="trash" /> Delete
        </button>
      </>
    );
  }

  return (
    <DropZone onFiles={uploader.add} disabled={searching || dialog !== null}>
      <div className="toolbar">
        {searching ? (
          <span className="breadcrumb__current">Search results for “{query.trim()}”</span>
        ) : (
          <Breadcrumb crumbs={crumbs} onNavigate={navigateCrumb} />
        )}
        <div className="spacer" />
        <button type="button" className="btn btn--ghost" onClick={toggleSelectMode} disabled={dialog !== null}>
          {selectMode ? 'Done selecting' : 'Select'}
        </button>
        <div className="view-toggle" role="group" aria-label="View">
          <button
            type="button"
            className="btn"
            aria-pressed={viewMode === 'grid'}
            aria-label="Grid view"
            title="Grid view"
            onClick={() => setViewMode('grid')}
          >
            <Icon name="grid" />
          </button>
          <button
            type="button"
            className="btn"
            aria-pressed={viewMode === 'list'}
            aria-label="List view"
            title="List view"
            onClick={() => setViewMode('list')}
          >
            <Icon name="list" />
          </button>
        </div>
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
                <Icon name="move" /> Move
              </button>
              <button type="button" className="btn btn--danger" onClick={() => setDialog({ kind: 'bulk-delete' })}>
                <Icon name="trash" /> Delete
              </button>
            </>
          )}
        </div>
      )}

      {bulkResult && <BulkResultPanel failed={bulkResult} onDismiss={() => setBulkResult(null)} />}

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
        <EmptyState
          icon={searching ? 'search' : 'folder'}
          title={searching ? 'No matching files.' : 'This folder is empty.'}
          hint={
            searching
              ? 'Try a different search term.'
              : 'Use the New button to create a folder or upload files — or just drop them here.'
          }
        />
      )}

      {items.length > 0 && (
        <FileGrid
          nodes={items}
          onOpen={openNode}
          view={viewMode}
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

      <Uploader ref={uploaderRef} add={uploader.add} />
      {/* Hidden while searching — parity with the pre-redesign uploader, which
          unmounted with the toolbar during a search (003/FR-006). */}
      {!searching && (
        <UploadTray
          items={uploader.items}
          retry={uploader.retry}
          dismiss={uploader.dismiss}
          clearCompleted={uploader.clearCompleted}
        />
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

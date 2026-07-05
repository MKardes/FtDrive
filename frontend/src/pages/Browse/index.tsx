import { useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  useChildren,
  useSearch,
  useCreateFolder,
  useRenameNode,
  useMoveNode,
  useTrashNode,
} from '../../features/nodes/hooks';
import { useUploader } from '../../features/upload/hooks';
import { ConfirmDialog, PromptDialog, MoveDialog } from '../../features/nodes/dialogs';
import { FileGrid } from '../../components/FileGrid';
import { Breadcrumb, type Crumb } from '../../components/Breadcrumb';
import { Preview } from '../../components/Preview';
import { Uploader } from '../../components/Uploader';
import { DropZone } from '../../components/DropZone';
import { DownloadUrlDialog } from '../../components/DownloadUrlDialog';
import { api, ApiError } from '../../api/client';
import type { Node } from '../../api/types';

type Dialog =
  | { kind: 'create' }
  | { kind: 'rename'; node: Node }
  | { kind: 'move'; node: Node }
  | { kind: 'delete'; node: Node }
  | { kind: 'download-url' }
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

  const childrenQ = useChildren(fid);
  const searchQ = useSearch(query);
  const active = searching ? searchQ : childrenQ;
  const items: Node[] = active.data?.pages.flatMap((p) => p.items) ?? [];

  const uploader = useUploader(fid);

  const createFolder = useCreateFolder(fid);
  const renameNode = useRenameNode(fid);
  const moveNode = useMoveNode(fid);
  const trashNode = useTrashNode(fid);
  const busy = createFolder.isPending || renameNode.isPending || moveNode.isPending || trashNode.isPending;

  // Carousel navigation over `items` (003-drag-drop-carousel-nav): derived, never stored, so it
  // can't drift from what's actually loaded (data-model.md).
  const previewNode = previewIndex !== null ? (items[previewIndex] ?? null) : null;
  const hasPrev = previewIndex !== null && previewIndex > 0;
  const hasNext = previewIndex !== null && (previewIndex < items.length - 1 || Boolean(active.hasNextPage));

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

  function renderActions(node: Node) {
    return (
      <>
        {node.type === 'file' && (
          <a
            className="btn btn--ghost"
            href={api.files.contentUrl(node.id)}
            download={node.name}
            onClick={(e) => e.stopPropagation()}
          >
            Download
          </a>
        )}
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
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search files"
        />
        <div className="spacer" />
        {!searching && (
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
        <FileGrid nodes={items} onOpen={openNode} renderActions={searching ? undefined : renderActions} />
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
        <MoveDialog node={dialog.node} busy={busy} error={dialogError} onMove={handleMove} onCancel={closeDialog} />
      )}
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
    </DropZone>
  );
}

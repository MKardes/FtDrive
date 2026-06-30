import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { Node } from '../../api/types';

/**
 * Organize dialogs (T066): a generic confirm (for destructive actions), a text
 * prompt (new folder / rename), and a folder picker (move). All are mobile-first
 * modals over `.modal-backdrop` and trap their click so the backdrop closes.
 */

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <p className="muted">{message}</p>
        <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className={danger ? 'btn btn--danger' : 'btn btn--primary'}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function PromptDialog({
  title,
  label,
  initialValue = '',
  submitLabel = 'Save',
  busy = false,
  error,
  onSubmit,
  onCancel,
}: {
  title: string;
  label: string;
  initialValue?: string;
  submitLabel?: string;
  busy?: boolean;
  error?: string | null;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue);

  function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed.length > 0) onSubmit(trimmed);
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <form onSubmit={submit}>
          <div className="field">
            <label className="label" htmlFor="prompt-input">
              {label}
            </label>
            <input
              id="prompt-input"
              className="input"
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
          <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn btn--primary" disabled={busy || value.trim().length === 0}>
              {busy ? 'Working…' : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Folder picker for "move": navigate the folder tree (folders only) and choose a
 * destination. The node being moved is hidden so it can't target itself; the
 * server still rejects moving a folder into its own descendant (409).
 */
export function MoveDialog({
  node,
  busy = false,
  error,
  onMove,
  onCancel,
}: {
  node: Node;
  busy?: boolean;
  error?: string | null;
  onMove: (destId: string) => void;
  onCancel: () => void;
}) {
  const [stack, setStack] = useState<Array<{ id: string; name: string }>>([]);
  const last = stack[stack.length - 1];
  const currentId = last ? last.id : 'root';

  const q = useQuery({
    queryKey: ['move-picker', currentId],
    queryFn: () => api.nodes.listChildren(currentId, undefined, 200),
  });
  const folders = (q.data?.items ?? []).filter((n) => n.type === 'folder' && n.id !== node.id);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Move “{node.name}”</h3>

        <div className="breadcrumb">
          <button type="button" className="btn btn--ghost" onClick={() => setStack([])}>
            Home
          </button>
          {stack.map((c, i) => (
            <span key={c.id}>
              {' / '}
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setStack(stack.slice(0, i + 1))}
              >
                {c.name}
              </button>
            </span>
          ))}
        </div>

        <ul className="list" style={{ maxHeight: '40vh', overflow: 'auto' }}>
          {q.isLoading && <li className="muted">Loading…</li>}
          {!q.isLoading && folders.length === 0 && <li className="muted">No sub-folders here.</li>}
          {folders.map((f) => (
            <li key={f.id} className="list-row">
              <span className="spacer">📁 {f.name}</span>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setStack([...stack, { id: f.id, name: f.name }])}
              >
                Open
              </button>
            </li>
          ))}
        </ul>

        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" onClick={() => onMove(currentId)} disabled={busy}>
            {busy ? 'Moving…' : `Move here`}
          </button>
        </div>
      </div>
    </div>
  );
}

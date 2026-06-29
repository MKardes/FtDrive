import { useRef } from 'react';
import { useUploader, keptBothNotice } from '../features/upload/hooks';

/**
 * Multi-file uploader (T046/T047, FR-004): a button that opens the system file
 * picker (or the phone camera via `capture`), shows per-file progress, and
 * offers retry on failure. Surfaces "kept both" feedback when a name collided.
 */
export function Uploader({ parentId }: { parentId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { items, add, retry, dismiss, clearCompleted } = useUploader(parentId);
  const notice = keptBothNotice(items);
  const active = items.some((it) => it.status === 'uploading');

  return (
    <div className="uploader">
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        aria-label="Choose files to upload"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) add(e.target.files);
          e.target.value = '';
        }}
      />
      <button
        type="button"
        className="btn btn--primary"
        onClick={() => inputRef.current?.click()}
      >
        Upload
      </button>

      {items.length > 0 && (
        <div className="upload-list card" role="status" aria-live="polite">
          {items.map((it) => (
            <div key={it.id} className="upload-row">
              <span className="upload-row__name" title={it.file.name}>
                {it.file.name}
              </span>
              {it.status === 'uploading' && (
                <span className="muted">{Math.round(it.progress * 100)}%</span>
              )}
              {it.status === 'done' && <span className="muted">Done</span>}
              {it.status === 'error' && (
                <>
                  <span className="error-text">{it.error}</span>
                  <button type="button" className="btn btn--ghost" onClick={() => retry(it.id)}>
                    Retry
                  </button>
                </>
              )}
              <button
                type="button"
                className="btn btn--ghost"
                aria-label={`Dismiss ${it.file.name}`}
                onClick={() => dismiss(it.id)}
              >
                ✕
              </button>
            </div>
          ))}
          {notice && <p className="muted">{notice}</p>}
          {!active && (
            <button type="button" className="btn btn--ghost" onClick={clearCompleted}>
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}

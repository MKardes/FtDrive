import { useState } from 'react';
import { keptBothNotice, type UploadItem } from '../features/upload/hooks';
import { Icon } from './Icon';

export interface UploadTrayProps {
  items: UploadItem[];
  retry: (id: string) => void;
  dismiss: (id: string) => void;
  clearCompleted: () => void;
}

/**
 * Fixed bottom-right upload progress tray (007, research.md D7): detached from
 * any toolbar button so it stays visible while the user keeps browsing.
 * Collapsible to a slim header bar so it never permanently blocks content on
 * phone-width screens (SC-004). Renders nothing while the queue is empty.
 * Same queue/rows semantics as the pre-redesign popover.
 */
export function UploadTray({ items, retry, dismiss, clearCompleted }: UploadTrayProps) {
  const [collapsed, setCollapsed] = useState(false);
  if (items.length === 0) return null;

  const notice = keptBothNotice(items);
  const active = items.filter((it) => it.status === 'uploading');
  const title =
    active.length > 0
      ? `Uploading ${active.length} ${active.length === 1 ? 'file' : 'files'}…`
      : `Uploaded ${items.length} ${items.length === 1 ? 'file' : 'files'}`;

  return (
    <div className="upload-tray" role="status" aria-live="polite">
      <div className="upload-tray__head">
        <Icon name="upload" />
        <span>{title}</span>
        <span className="spacer" />
        {!collapsed && active.length === 0 && (
          <button type="button" className="btn btn--ghost" onClick={clearCompleted}>
            Clear
          </button>
        )}
        <button
          type="button"
          className="btn btn--ghost btn--icon"
          aria-label={collapsed ? 'Expand uploads' : 'Collapse uploads'}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((v) => !v)}
        >
          <Icon name={collapsed ? 'chevron-up' : 'chevron-down'} />
        </button>
      </div>
      {!collapsed && (
        <div className="upload-tray__body">
          {items.map((it) => (
            <div key={it.id} className="upload-row">
              <Icon name="file" />
              <span className="upload-row__name" title={it.file.name}>
                {it.file.name}
              </span>
              {it.status === 'uploading' && <span className="muted">{Math.round(it.progress * 100)}%</span>}
              {it.status === 'done' && (
                <span className="muted">
                  <Icon name="check" /> Done
                </span>
              )}
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
                className="btn btn--ghost btn--icon"
                aria-label={`Dismiss ${it.file.name}`}
                onClick={() => dismiss(it.id)}
              >
                <Icon name="close" />
              </button>
            </div>
          ))}
          {notice && <p className="muted">{notice}</p>}
        </div>
      )}
    </div>
  );
}

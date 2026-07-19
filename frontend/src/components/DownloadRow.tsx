import type { Download } from '../api/types';
import { Icon } from './Icon';

const ACTIVE_STATUSES = new Set(['queued', 'examining', 'downloading']);

const STATUS_LABEL: Record<Download['status'], string> = {
  queued: 'Queued',
  examining: 'Examining…',
  downloading: 'Downloading…',
  completed: 'Completed',
  failed: 'Failed',
  canceled: 'Canceled',
};

function badgeModifier(status: Download['status']): string {
  if (ACTIVE_STATUSES.has(status)) return 'badge--active';
  if (status === 'completed') return 'badge--completed';
  if (status === 'failed') return 'badge--failed';
  return '';
}

function bytesLabel(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(1)} MB`;
}

interface Props {
  download: Download;
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  onDelete: (id: string) => void;
  cancelPending?: boolean;
  retryPending?: boolean;
  deletePending?: boolean;
}

/** One row in the Downloads panel/page: state badge, progress bar, and the actions valid for that state. */
export function DownloadRow({ download: d, onCancel, onRetry, onDelete, cancelPending, retryPending, deletePending }: Props) {
  const isActive = ACTIVE_STATUSES.has(d.status);
  const fraction = d.totalBytes && d.totalBytes > 0 ? Math.min(1, d.bytesDownloaded / d.totalBytes) : null;

  return (
    <li className="list-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
      <div className="row-actions" style={{ alignItems: 'center', flexWrap: 'nowrap' }}>
        <span className="list-row__icon">
          <Icon name="video" />
        </span>
        <span className="spacer list-row__primary" title={d.sourceUrl}>
          {d.title ?? d.sourceUrl}
        </span>
        <span className={`badge ${badgeModifier(d.status)}`}>{STATUS_LABEL[d.status]}</span>
        <span className="list-row__actions">
          {isActive && (
            <button
              type="button"
              className="btn btn--ghost btn--icon"
              aria-label="Cancel"
              title="Cancel"
              onClick={() => onCancel(d.id)}
              disabled={cancelPending}
            >
              <Icon name="close" />
            </button>
          )}
          {(d.status === 'failed' || d.status === 'canceled') && (
            <button
              type="button"
              className="btn btn--ghost btn--icon"
              aria-label="Retry"
              title="Retry"
              onClick={() => onRetry(d.id)}
              disabled={retryPending}
            >
              <Icon name="refresh" />
            </button>
          )}
          {!isActive && (
            <button
              type="button"
              className="btn btn--ghost btn--icon"
              aria-label="Remove"
              title="Remove"
              onClick={() => onDelete(d.id)}
              disabled={deletePending}
            >
              <Icon name="trash" />
            </button>
          )}
        </span>
      </div>

      {isActive && (
        <div style={{ marginTop: 8 }}>
          <div className="progress-bar">
            <div className="progress-bar__fill" style={{ width: fraction != null ? `${fraction * 100}%` : '30%' }} />
          </div>
          <span className="muted" style={{ fontSize: '0.8rem' }}>
            {bytesLabel(d.bytesDownloaded)}
            {d.totalBytes != null ? ` / ${bytesLabel(d.totalBytes)}` : ''}
          </span>
        </div>
      )}

      {d.status === 'failed' && d.errorMessage && (
        <p className="error-text" style={{ margin: '8px 0 0' }}>
          {d.errorMessage}
        </p>
      )}
      {d.status === 'completed' && d.nodePresent === false && (
        <p className="muted" style={{ margin: '8px 0 0' }}>
          The file is no longer in your drive.
        </p>
      )}

    </li>
  );
}

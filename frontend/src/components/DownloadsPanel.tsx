import {
  useCancelDownload,
  useClearDownloadHistory,
  useDeleteDownload,
  useDownloads,
  useRetryDownload,
} from '../features/downloads/hooks';
import { DownloadRow } from './DownloadRow';
import { EmptyState } from './EmptyState';

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'canceled']);

/** Downloads list: live status/progress for active jobs, plus per-user history with cancel/retry/clear (US2). */
export function DownloadsPanel() {
  const downloadsQ = useDownloads();
  const cancel = useCancelDownload();
  const retry = useRetryDownload();
  const del = useDeleteDownload();
  const clearHistory = useClearDownloadHistory();

  const items = downloadsQ.data?.items ?? [];
  const hasTerminal = items.some((d) => TERMINAL_STATUSES.has(d.status));

  return (
    <div>
      <div className="page-header">
        <h2>Downloads</h2>
        <div className="spacer" />
        {hasTerminal && (
          <button type="button" className="btn btn--ghost" onClick={() => clearHistory.mutate()} disabled={clearHistory.isPending}>
            Clear history
          </button>
        )}
      </div>

      {downloadsQ.isLoading && (
        <p className="muted" role="status">
          <span className="spinner" aria-hidden="true" /> Loading…
        </p>
      )}
      {downloadsQ.isError && (
        <p className="error-text" role="alert">
          Couldn’t load your downloads. Please try again.
        </p>
      )}
      {!downloadsQ.isLoading && !downloadsQ.isError && items.length === 0 && (
        <EmptyState
          icon="globe"
          title="No downloads yet."
          hint="Use New → Download from web in any folder to get started."
        />
      )}

      {items.length > 0 && (
        <ul className="list">
          {items.map((d) => (
            <DownloadRow
              key={d.id}
              download={d}
              onCancel={(id) => cancel.mutate(id)}
              onRetry={(id) => retry.mutate(id)}
              onDelete={(id) => del.mutate(id)}
              cancelPending={cancel.isPending}
              retryPending={retry.isPending}
              deletePending={del.isPending}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

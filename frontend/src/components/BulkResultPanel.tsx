import type { BulkResult } from '../features/nodes/hooks';
import { Icon } from './Icon';

export interface BulkResultPanelProps {
  failed: BulkResult['failed'];
  onDismiss: () => void;
}

/**
 * Per-item bulk-action failure summary (005-actions-menu-bulk-select, FR-008).
 * Renders nothing on a fully successful batch — consistent with how single-item
 * success already behaves today (no success toast anywhere in the app).
 */
export function BulkResultPanel({ failed, onDismiss }: BulkResultPanelProps) {
  if (failed.length === 0) return null;

  return (
    <div className="card bulk-result" role="alert">
      <p className="error-text">
        <Icon name="error" /> {failed.length} item{failed.length === 1 ? '' : 's'} could not be updated:
      </p>
      <ul className="list">
        {failed.map((f) => (
          <li key={f.id} className="bulk-result__item">
            <span className="bulk-result__name">{f.name}</span>
            <span className="error-text">{f.message}</span>
          </li>
        ))}
      </ul>
      <button type="button" className="btn btn--ghost" onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  );
}

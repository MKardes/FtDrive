import { useEffect } from 'react';
import { api } from '../api/client';
import type { Node } from '../api/types';
import type { PreviewNavProps } from './Preview';

/** Full-screen photo viewer (FR-003). Closes on backdrop click or Escape. */
export function PhotoViewer({
  node,
  onClose,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
}: { node: Node; onClose: () => void } & PreviewNavProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && hasPrev) onPrev?.();
      else if (e.key === 'ArrowRight' && hasNext) onNext?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onPrev, onNext, hasPrev, hasNext]);

  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-label={node.name} onClick={onClose}>
      <div className="viewer__bar">{node.name}</div>
      <button type="button" className="btn viewer__close" onClick={onClose}>
        Close
      </button>
      {hasPrev && (
        <button
          type="button"
          className="btn viewer__nav viewer__nav--prev"
          aria-label="Previous"
          onClick={(e) => {
            e.stopPropagation();
            onPrev?.();
          }}
        >
          ‹
        </button>
      )}
      {hasNext && (
        <button
          type="button"
          className="btn viewer__nav viewer__nav--next"
          aria-label="Next"
          onClick={(e) => {
            e.stopPropagation();
            onNext?.();
          }}
        >
          ›
        </button>
      )}
      <div className="viewer__content" onClick={(e) => e.stopPropagation()}>
        <img src={api.files.contentUrl(node.id)} alt={node.name} />
      </div>
    </div>
  );
}

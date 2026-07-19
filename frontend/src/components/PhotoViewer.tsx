import { useEffect } from 'react';
import { useFileUrls } from '../app/fileUrls';
import type { Node } from '../api/types';
import type { PreviewNavProps } from './Preview';
import { Icon } from './Icon';

/** Full-screen photo viewer (FR-003). Closes on backdrop click or Escape. */
export function PhotoViewer({
  node,
  onClose,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  position,
}: { node: Node; onClose: () => void } & PreviewNavProps) {
  const { contentUrl } = useFileUrls();
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
      <div className="viewer__bar">
        <span className="viewer__title">{node.name}</span>
        {position && (
          <span className="viewer__position">
            {position.index} of {position.total}
          </span>
        )}
      </div>
      <button type="button" className="btn btn--icon viewer__close" aria-label="Close" onClick={onClose}>
        <Icon name="close" />
      </button>
      {hasPrev && (
        <button
          type="button"
          className="btn btn--icon viewer__nav viewer__nav--prev"
          aria-label="Previous"
          onClick={(e) => {
            e.stopPropagation();
            onPrev?.();
          }}
        >
          <Icon name="chevron-left" />
        </button>
      )}
      {hasNext && (
        <button
          type="button"
          className="btn btn--icon viewer__nav viewer__nav--next"
          aria-label="Next"
          onClick={(e) => {
            e.stopPropagation();
            onNext?.();
          }}
        >
          <Icon name="chevron-right" />
        </button>
      )}
      <div className="viewer__content" onClick={(e) => e.stopPropagation()}>
        <img src={contentUrl(node.id)} alt={node.name} />
      </div>
    </div>
  );
}

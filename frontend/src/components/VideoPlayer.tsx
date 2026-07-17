import { useEffect } from 'react';
import { useFileUrls } from '../app/fileUrls';
import type { Node } from '../api/types';
import type { PreviewNavProps } from './Preview';

/**
 * In-browser video player (FR-003). The browser seeks via HTTP Range requests
 * against the content endpoint; no full download required. Keyed by `node.id`
 * (see Browse) so navigating to a different item remounts the `<video>`,
 * guaranteeing playback stops before the next item is shown (FR-009).
 */
export function VideoPlayer({
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
        <video key={node.id} src={contentUrl(node.id)} controls autoPlay playsInline />
      </div>
    </div>
  );
}

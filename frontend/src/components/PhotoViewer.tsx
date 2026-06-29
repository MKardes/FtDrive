import { useEffect } from 'react';
import { api } from '../api/client';
import type { Node } from '../api/types';

/** Full-screen photo viewer (FR-003). Closes on backdrop click or Escape. */
export function PhotoViewer({ node, onClose }: { node: Node; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-label={node.name} onClick={onClose}>
      <div className="viewer__bar">{node.name}</div>
      <button type="button" className="btn viewer__close" onClick={onClose}>
        Close
      </button>
      <div className="viewer__content" onClick={(e) => e.stopPropagation()}>
        <img src={api.files.contentUrl(node.id)} alt={node.name} />
      </div>
    </div>
  );
}

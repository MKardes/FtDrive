import { api } from '../api/client';
import type { Node } from '../api/types';
import { PhotoViewer } from './PhotoViewer';
import { VideoPlayer } from './VideoPlayer';

export interface PreviewNavProps {
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  /** 1-based position within the current listing (004-ui-polish-viewer); omitted when there's no meaningful set (e.g. a single result). */
  position?: { index: number; total: number };
}

/**
 * Open the right preview for a file: full-screen photo, in-browser video, or —
 * for unsupported types — a download fallback (FR-003). Nav props (003-drag-
 * drop-carousel-nav) let the caller step through a listing without closing the
 * viewer; the unsupported-type fallback below has no use for them.
 */
export function Preview({
  node,
  onClose,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  position,
}: { node: Node; onClose: () => void } & PreviewNavProps) {
  if (node.mimeType?.startsWith('image/')) {
    return (
      <PhotoViewer
        node={node}
        onClose={onClose}
        onPrev={onPrev}
        onNext={onNext}
        hasPrev={hasPrev}
        hasNext={hasNext}
        position={position}
      />
    );
  }
  if (node.mimeType?.startsWith('video/')) {
    return (
      <VideoPlayer
        node={node}
        onClose={onClose}
        onPrev={onPrev}
        onNext={onNext}
        hasPrev={hasPrev}
        hasNext={hasNext}
        position={position}
      />
    );
  }
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{node.name}</h3>
        <p className="muted">This file type can’t be previewed in the browser.</p>
        <div className="row-actions">
          <a
            className="btn btn--primary"
            href={api.files.contentUrl(node.id)}
            download={node.name}
          >
            Download
          </a>
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

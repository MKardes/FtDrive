import { api } from '../api/client';
import type { Node } from '../api/types';
import { PhotoViewer } from './PhotoViewer';
import { VideoPlayer } from './VideoPlayer';

/**
 * Open the right preview for a file: full-screen photo, in-browser video, or —
 * for unsupported types — a download fallback (FR-003).
 */
export function Preview({ node, onClose }: { node: Node; onClose: () => void }) {
  if (node.mimeType?.startsWith('image/')) {
    return <PhotoViewer node={node} onClose={onClose} />;
  }
  if (node.mimeType?.startsWith('video/')) {
    return <VideoPlayer node={node} onClose={onClose} />;
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

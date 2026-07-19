import { useFileUrls } from '../app/fileUrls';
import type { Node } from '../api/types';
import { useDialogDismiss } from '../app/useDialogDismiss';
import { PhotoViewer } from './PhotoViewer';
import { VideoPlayer } from './VideoPlayer';
import { Icon } from './Icon';
import { nodeIconName } from './Thumbnail';

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
  const { contentUrl } = useFileUrls();
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
  return <UnsupportedPreview node={node} onClose={onClose} contentUrl={contentUrl(node.id)} />;
}

/** Download fallback for non-previewable types — own component so the dismiss hook runs unconditionally. */
function UnsupportedPreview({
  node,
  onClose,
  contentUrl,
}: {
  node: Node;
  onClose: () => void;
  contentUrl: string;
}) {
  const { onBackdropClick } = useDialogDismiss(onClose);
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onBackdropClick}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <h3 title={node.name}>{node.name}</h3>
          <button type="button" className="btn btn--ghost btn--icon" aria-label="Close dialog" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <p className="muted">
          <Icon name={nodeIconName(node)} /> This file type can’t be previewed in the browser.
        </p>
        <div className="row-actions">
          <a className="btn btn--primary" href={contentUrl} download={node.name}>
            <Icon name="download" /> Download
          </a>
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

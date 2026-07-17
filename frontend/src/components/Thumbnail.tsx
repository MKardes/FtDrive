import { useEffect, useRef, useState } from 'react';
import { useFileUrls } from '../app/fileUrls';
import type { Node } from '../api/types';

function iconFor(node: Node): string {
  if (node.type === 'folder') return '📁';
  if (node.mimeType?.startsWith('image/')) return '🖼️';
  if (node.mimeType?.startsWith('video/')) return '🎞️';
  if (node.mimeType?.startsWith('audio/')) return '🎵';
  return '📄';
}

function isThumbnailable(node: Node): boolean {
  return (
    node.type === 'file' &&
    node.thumbStatus !== 'unsupported' &&
    (node.mimeType?.startsWith('image/') === true || node.mimeType?.startsWith('video/') === true)
  );
}

/**
 * Lazy thumbnail: the image is only requested once the card scrolls into view
 * (IntersectionObserver), keeping large folders fast (SC-006). Falls back to a
 * type icon for non-media or when the thumbnail can't be generated.
 */
export function Thumbnail({ node }: { node: Node }) {
  const { thumbnailUrl } = useFileUrls();
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(typeof IntersectionObserver === 'undefined');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined' || !ref.current) {
      setVisible(true);
      return;
    }
    const el = ref.current;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const showImage = visible && isThumbnailable(node) && !failed;

  return (
    <div className="file-card__thumb" ref={ref}>
      {showImage ? (
        <img
          src={thumbnailUrl(node.id)}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="file-card__icon" aria-hidden="true">
          {iconFor(node)}
        </span>
      )}
    </div>
  );
}

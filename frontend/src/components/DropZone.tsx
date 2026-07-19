import { useState, type DragEvent, type ReactNode } from 'react';
import { Icon } from './Icon';

function carriesFiles(e: DragEvent): boolean {
  return Array.from(e.dataTransfer.types).includes('Files');
}

/**
 * Wraps content with OS drag-and-drop file upload support (FR-001/002/005/006).
 * Disabled while searching or a dialog is open, matching the click-based uploader's availability.
 */
export function DropZone({
  onFiles,
  disabled,
  children,
}: {
  onFiles: (files: FileList) => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  const [active, setActive] = useState(false);

  function onDragEnter(e: DragEvent) {
    e.preventDefault();
    if (disabled || !carriesFiles(e)) return;
    setActive(true);
  }

  function onDragOver(e: DragEvent) {
    if (disabled || !carriesFiles(e)) return;
    e.preventDefault();
  }

  function onDragLeave(e: DragEvent) {
    e.preventDefault();
    setActive(false);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setActive(false);
    if (disabled || !carriesFiles(e)) return;
    if (e.dataTransfer.files.length > 0) onFiles(e.dataTransfer.files);
  }

  return (
    <div
      className={`dropzone${active ? ' dropzone--active' : ''}`}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {children}
      {active && (
        <div className="dropzone__hint" aria-hidden="true">
          <Icon name="upload" /> Drop files to upload
        </div>
      )}
    </div>
  );
}

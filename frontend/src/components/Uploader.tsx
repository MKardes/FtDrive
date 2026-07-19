import { forwardRef, useImperativeHandle, useRef } from 'react';

export interface UploaderHandle {
  /** Open the system file picker. */
  open: () => void;
}

export interface UploaderProps {
  add: (files: FileList | File[]) => void;
}

/**
 * Hidden multi-file input (007, research.md D7): the visible Upload trigger
 * moved into the sidebar's "New" menu, so this component shrank to the input
 * plus an imperative `open()`. Progress lives in `UploadTray`; the queue
 * (`useUploader`) stays owned by Browse so button and drag-and-drop uploads
 * share one list (003-drag-drop-carousel-nav).
 */
export const Uploader = forwardRef<UploaderHandle, UploaderProps>(function Uploader({ add }, ref) {
  const inputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({ open: () => inputRef.current?.click() }), []);

  return (
    <input
      ref={inputRef}
      type="file"
      multiple
      hidden
      aria-label="Choose files to upload"
      onChange={(e) => {
        if (e.target.files && e.target.files.length > 0) add(e.target.files);
        e.target.value = '';
      }}
    />
  );
});

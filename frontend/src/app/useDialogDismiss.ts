import { useEffect } from 'react';

/**
 * Shared modal dismissal (007, research.md D11, FR-011): every dialog closes on
 * Escape and on backdrop click. One hook keeps the six modals consistent; the
 * returned handler goes on the backdrop element (content stops propagation, as
 * the existing dialogs already do).
 */
export function useDialogDismiss(onClose: () => void): { onBackdropClick: () => void } {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return { onBackdropClick: onClose };
}

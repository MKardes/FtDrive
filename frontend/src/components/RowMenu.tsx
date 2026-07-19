import { useEffect, useRef, useState } from 'react';
import { measureMenuPlacement, placementClasses, type MenuPlacement } from './menuPosition';
import { Icon } from './Icon';

/**
 * Row-level details (⋮) menu for list rows (007 restyle): quick actions stay
 * icon-only in the row, and the full named actions live behind this trigger —
 * same sibling-popover recipe as the file card menu (005 precedent, research.md
 * D9): measured at open so it flips up/left rather than rendering off screen.
 */
export function RowMenu({ label, children }: { label: string; children: React.ReactNode }) {
  const [placement, setPlacement] = useState<MenuPlacement | null>(null);
  const wrapperRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (placement === null) return;
    function onDocClick(e: MouseEvent) {
      const wrapper = wrapperRef.current;
      if (wrapper && e.target instanceof globalThis.Node && !wrapper.contains(e.target)) {
        setPlacement(null);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setPlacement(null);
    }
    window.addEventListener('click', onDocClick);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('click', onDocClick);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [placement]);

  return (
    <span className="row-menu" ref={wrapperRef}>
      <button
        type="button"
        className="btn btn--ghost btn--icon"
        aria-label={label}
        title="More actions"
        aria-haspopup="menu"
        aria-expanded={placement !== null}
        onClick={(e) => {
          // Capture before setState: React nulls currentTarget after dispatch,
          // and the updater may run later (during the next render).
          const trigger = e.currentTarget;
          setPlacement((cur) =>
            cur ? null : measureMenuPlacement(trigger, { menuHeight: 200, menuWidth: 200 }),
          );
        }}
      >
        <Icon name="more-vert" />
      </button>
      {placement && (
        <div className={placementClasses('menu', placement)} onClick={() => setPlacement(null)}>
          {children}
        </div>
      )}
    </span>
  );
}

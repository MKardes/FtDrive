import { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../app/auth';
import { useShellActions } from '../app/shellActions';
import { Icon, type IconName } from './Icon';

const NAV_ITEMS: Array<{ to: string; end?: boolean; label: string; icon: IconName; ownerOnly?: boolean }> = [
  { to: '/', end: true, label: 'My Drive', icon: 'cloud' },
  { to: '/shared', label: 'Shared', icon: 'people' },
  { to: '/downloads', label: 'Downloads', icon: 'download' },
  { to: '/trash', label: 'Trash', icon: 'trash' },
  { to: '/admin', label: 'Users', icon: 'person', ownerOnly: true },
];

/**
 * App sidebar (007, research.md D4/D6): the prominent "New" creation menu and
 * the primary navigation. On narrow screens `AppLayout` renders this as an
 * off-canvas drawer (`open`). The New button is enabled only while a Browse
 * view has registered handlers — creation targets the current folder.
 */
export function Sidebar({ open, onAction }: { open: boolean; onAction?: () => void }) {
  const { user } = useAuth();
  const actions = useShellActions();
  const [newOpen, setNewOpen] = useState(false);
  const newWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!newOpen) return;
    function onDocClick(e: MouseEvent) {
      if (newWrapRef.current && e.target instanceof Node && !newWrapRef.current.contains(e.target)) {
        setNewOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setNewOpen(false);
    }
    window.addEventListener('click', onDocClick);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', onDocClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [newOpen]);

  // Losing the registered actions (navigating off Browse) closes the menu.
  useEffect(() => {
    if (!actions) setNewOpen(false);
  }, [actions]);

  function run(action: (() => void) | undefined) {
    setNewOpen(false);
    onAction?.(); // closes the mobile drawer so the triggered dialog isn't behind it
    action?.();
  }

  return (
    <aside className={`sidebar${open ? ' sidebar--open' : ''}`}>
      <div className="sidebar__new-wrap" ref={newWrapRef}>
        <button
          type="button"
          className="sidebar__new"
          disabled={!actions}
          title={actions ? undefined : 'Open My Drive to add content'}
          aria-expanded={newOpen}
          onClick={() => setNewOpen((v) => !v)}
        >
          <Icon name="plus" /> New
        </button>
        {newOpen && actions && (
          <div className="menu menu--left" role="menu" aria-label="Create new">
            <button type="button" className="menu__item" role="menuitem" onClick={() => run(actions.newFolder)}>
              <Icon name="folder" /> New folder
            </button>
            <div className="menu__separator" />
            <button type="button" className="menu__item" role="menuitem" onClick={() => run(actions.uploadFiles)}>
              <Icon name="upload" /> Upload files
            </button>
            <button
              type="button"
              className="menu__item"
              role="menuitem"
              onClick={() => run(actions.downloadFromWeb)}
            >
              <Icon name="globe" /> Download from web
            </button>
          </div>
        )}
      </div>
      <nav className="sidebar__nav" aria-label="Primary">
        {NAV_ITEMS.filter((item) => !item.ownerOnly || user?.role === 'owner').map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className="sidebar__link">
            <Icon name={item.icon} /> {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

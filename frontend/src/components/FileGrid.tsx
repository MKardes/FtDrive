import { useEffect, useRef, useState } from 'react';
import type { Node } from '../api/types';
import { measureMenuPlacement } from './menuPosition';
import { Thumbnail, nodeIconName } from './Thumbnail';
import { Icon } from './Icon';

function formatSize(bytes: number | null): string {
  if (bytes === null) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  const str = n.toFixed(n < 10 && i > 0 ? 1 : 0);
  return `${parseFloat(str)} ${units[i]}`;
}

export interface FileGridProps {
  nodes: Node[];
  onOpen: (node: Node) => void;
  /** Drive-style presentation (007, research.md D8): thumbnail grid or detail list. */
  view?: 'grid' | 'list';
  /** Always-visible per-file quick action (Download), rendered in the meta/actions area (005). */
  renderQuickAction?: (node: Node) => React.ReactNode;
  /** Rename/Move/Delete…, rendered inside the details (⋮) popover (005). */
  renderMenuActions?: (node: Node) => React.ReactNode;
  selectMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}

interface OpenMenu {
  id: string;
  up: boolean;
  alignLeft: boolean;
}

/**
 * `.file-card` stays a `div[role=button]` (005-actions-menu-bulk-select): a
 * real `<button>` cannot legally contain the nested ⋮/checkbox controls.
 * `onKeyDown` restores Enter/Space activation.
 *
 * Grid view partitions the (server-sorted, folders-first) `nodes` into a
 * compact folder-tile section and a thumbnail file-card section WITHOUT
 * reordering, so the flat `items[]` order the carousel indexes into is
 * untouched (research.md D8). List view renders the same flat order as rows.
 * The ⋮ popover measures the viewport at open and flips up / left-aligns so
 * it never renders off screen (research.md D9, FR-012).
 */
export function FileGrid({
  nodes,
  onOpen,
  view = 'grid',
  renderQuickAction,
  renderMenuActions,
  selectMode = false,
  selectedIds,
  onToggleSelect,
}: FileGridProps) {
  const [openMenu, setOpenMenu] = useState<OpenMenu | null>(null);
  const wrapperRefs = useRef(new Map<string, HTMLDivElement | null>());

  useEffect(() => {
    if (openMenu === null) return;
    function onDocClick(e: MouseEvent) {
      const wrapper = wrapperRefs.current.get(openMenu!.id);
      if (wrapper && e.target instanceof globalThis.Node && !wrapper.contains(e.target)) {
        setOpenMenu(null);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpenMenu(null);
    }
    window.addEventListener('click', onDocClick);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('click', onDocClick);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [openMenu]);

  // Turning on select mode closes any open menu (cards toggle selection then).
  useEffect(() => {
    if (selectMode) setOpenMenu(null);
  }, [selectMode]);

  function activate(node: Node) {
    if (selectMode) onToggleSelect?.(node.id);
    else onOpen(node);
  }

  function toggleMenu(node: Node, trigger: HTMLElement) {
    setOpenMenu((cur) => {
      if (cur?.id === node.id) return null;
      const placement = measureMenuPlacement(trigger, { menuHeight: 250, menuWidth: 180 });
      return { id: node.id, up: placement.up, alignLeft: placement.alignLeft };
    });
  }

  function menuTrigger(node: Node) {
    if (selectMode || !renderMenuActions) return null;
    return (
      <button
        type="button"
        className="file-card__menu-trigger"
        aria-label={`Details for ${node.name}`}
        onClick={(e) => {
          e.stopPropagation();
          toggleMenu(node, e.currentTarget);
        }}
      >
        <Icon name="more-vert" />
      </button>
    );
  }

  function checkbox(node: Node, selected: boolean) {
    if (!selectMode) return null;
    return (
      <input
        type="checkbox"
        className="file-card__checkbox"
        checked={selected}
        aria-label={`Select ${node.name}`}
        onClick={(e) => e.stopPropagation()}
        onChange={() => onToggleSelect?.(node.id)}
      />
    );
  }

  function cardMenu(node: Node) {
    if (selectMode || openMenu?.id !== node.id || !renderMenuActions) return null;
    const cls = `file-card__menu${openMenu.up ? ' file-card__menu--up' : ''}${
      openMenu.alignLeft ? ' file-card__menu--left' : ''
    }`;
    return (
      <div className={cls} onClick={() => setOpenMenu(null)}>
        {renderMenuActions(node)}
      </div>
    );
  }

  function renderTile(node: Node) {
    const selected = selectedIds?.has(node.id) ?? false;
    const isFolder = node.type === 'folder';
    return (
      <div
        key={node.id}
        className="file-card-wrapper"
        ref={(el) => {
          wrapperRefs.current.set(node.id, el);
        }}
      >
        <div
          role="button"
          tabIndex={0}
          className={`file-card${isFolder ? ' file-card--folder' : ''}${selected ? ' file-card--selected' : ''}`}
          title={node.name}
          aria-label={node.name}
          onClick={() => activate(node)}
          onKeyDown={(e) => {
            if (e.target !== e.currentTarget) return;
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              activate(node);
            }
          }}
        >
          <div className="file-card__head">
            {checkbox(node, selected)}
            {!selectMode && (
              <span className="file-card__type">
                <Icon name={nodeIconName(node)} />
              </span>
            )}
            <span className="file-card__name">{node.name}</span>
            {menuTrigger(node)}
          </div>
          {!isFolder && <Thumbnail node={node} />}
          {!isFolder && (
            <div className="file-card__meta">
              {formatSize(node.size)}
              {!selectMode && renderQuickAction && (
                <span className="file-card__quick-action" onClick={(e) => e.stopPropagation()}>
                  {renderQuickAction(node)}
                </span>
              )}
            </div>
          )}
        </div>
        {cardMenu(node)}
      </div>
    );
  }

  function renderRow(node: Node) {
    const selected = selectedIds?.has(node.id) ?? false;
    return (
      <div
        key={node.id}
        className="file-card-wrapper"
        ref={(el) => {
          wrapperRefs.current.set(node.id, el);
        }}
      >
        <div
          role="button"
          tabIndex={0}
          className={`file-card file-card--row${selected ? ' file-card--selected' : ''}`}
          title={node.name}
          aria-label={node.name}
          onClick={() => activate(node)}
          onKeyDown={(e) => {
            if (e.target !== e.currentTarget) return;
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              activate(node);
            }
          }}
        >
          {checkbox(node, selected)}
          <div className="file-card__thumb" aria-hidden="true">
            <span className="file-card__icon">
              <Icon name={nodeIconName(node)} size={20} />
            </span>
          </div>
          <span className="file-card__name">{node.name}</span>
          <span className="file-card__size">{node.type === 'folder' ? '—' : formatSize(node.size)}</span>
          <span className="file-card__row-actions" onClick={(e) => e.stopPropagation()}>
            {!selectMode && node.type === 'file' && renderQuickAction?.(node)}
            {menuTrigger(node)}
          </span>
        </div>
        {cardMenu(node)}
      </div>
    );
  }

  if (view === 'list') {
    return (
      <div className="file-list">
        <div className="file-list__head" aria-hidden="true">
          <span>Name</span>
          <span className="file-list__size">Size</span>
          <span className="file-list__actions" />
        </div>
        {nodes.map(renderRow)}
      </div>
    );
  }

  const folders = nodes.filter((n) => n.type === 'folder');
  const files = nodes.filter((n) => n.type === 'file');
  const showSectionTitles = folders.length > 0 && files.length > 0;

  return (
    <div>
      {folders.length > 0 && (
        <>
          {showSectionTitles && <h3 className="file-section-title">Folders</h3>}
          <div className="file-grid file-grid--folders">{folders.map(renderTile)}</div>
        </>
      )}
      {files.length > 0 && (
        <>
          {showSectionTitles && <h3 className="file-section-title">Files</h3>}
          <div className="file-grid">{files.map(renderTile)}</div>
        </>
      )}
    </div>
  );
}

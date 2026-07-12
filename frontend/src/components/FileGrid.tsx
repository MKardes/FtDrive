import { useEffect, useRef, useState } from 'react';
import type { Node } from '../api/types';
import { Thumbnail } from './Thumbnail';

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
  /** Always-visible per-file quick action (Download), rendered in the meta row (005). */
  renderQuickAction?: (node: Node) => React.ReactNode;
  /** Rename/Move/Delete, rendered inside the details (⋮) popover instead of always-visible (005). */
  renderMenuActions?: (node: Node) => React.ReactNode;
  selectMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}

/**
 * `.file-card` is a `div[role=button]` rather than a real `<button>` (005-actions-
 * menu-bulk-select): a `<button>` cannot legally contain the nested details-menu
 * trigger or select-mode checkbox this feature needs. `onKeyDown` restores the
 * Enter/Space activation a native button gives for free.
 */
export function FileGrid({
  nodes,
  onOpen,
  renderQuickAction,
  renderMenuActions,
  selectMode = false,
  selectedIds,
  onToggleSelect,
}: FileGridProps) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const wrapperRefs = useRef(new Map<string, HTMLDivElement | null>());

  useEffect(() => {
    if (openMenuId === null) return;
    function onDocClick(e: MouseEvent) {
      const wrapper = wrapperRefs.current.get(openMenuId as string);
      if (wrapper && e.target instanceof globalThis.Node && !wrapper.contains(e.target)) {
        setOpenMenuId(null);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpenMenuId(null);
    }
    window.addEventListener('click', onDocClick);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('click', onDocClick);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [openMenuId]);

  // Turning on select mode closes any open menu (a card responds to taps by
  // toggling selection, not opening a menu, while select mode is active).
  useEffect(() => {
    if (selectMode) setOpenMenuId(null);
  }, [selectMode]);

  function activate(node: Node) {
    if (selectMode) onToggleSelect?.(node.id);
    else onOpen(node);
  }

  return (
    <div className="file-grid">
      {nodes.map((node) => {
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
              className="file-card"
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
              {selectMode && (
                <input
                  type="checkbox"
                  className="file-card__checkbox"
                  checked={selected}
                  aria-label={`Select ${node.name}`}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => onToggleSelect?.(node.id)}
                />
              )}
              {!selectMode && renderMenuActions && (
                <button
                  type="button"
                  className="file-card__menu-trigger"
                  aria-label={`Details for ${node.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenMenuId((cur) => (cur === node.id ? null : node.id));
                  }}
                >
                  ⋮
                </button>
              )}
              <Thumbnail node={node} />
              <div className="file-card__name">{node.name}</div>
              <div className="file-card__meta">
                {node.type === 'folder' ? 'Folder' : formatSize(node.size)}
                {!selectMode && node.type === 'file' && renderQuickAction && (
                  <span className="file-card__quick-action" onClick={(e) => e.stopPropagation()}>
                    {renderQuickAction(node)}
                  </span>
                )}
              </div>
            </div>
            {!selectMode && openMenuId === node.id && renderMenuActions && (
              <div className="file-card__menu" onClick={() => setOpenMenuId(null)}>
                {renderMenuActions(node)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

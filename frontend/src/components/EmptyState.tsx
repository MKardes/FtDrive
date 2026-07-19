import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

/**
 * Shared empty-state block (007, research.md D10): icon in a soft disc, a
 * title, an optional hint, and an optional action slot — the same look on
 * every screen (folder view, trash, shared, downloads, users).
 */
export function EmptyState({
  icon = 'folder',
  title,
  hint,
  children,
}: {
  icon?: IconName;
  title: string;
  hint?: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-state__icon" aria-hidden="true">
        <Icon name={icon} size={40} />
      </span>
      <p className="empty-state__title">{title}</p>
      {hint && <p className="empty-state__hint">{hint}</p>}
      {children}
    </div>
  );
}

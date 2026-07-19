import { Fragment } from 'react';
import { Icon } from './Icon';

export interface Crumb {
  id: string;
  name: string;
}

/**
 * Folder breadcrumb (007 restyle): chevron separators, the current folder
 * emphasized as the page title, ancestors clickable. Same contract as before —
 * `onNavigate(-1)` = root ("My Drive"), `onNavigate(i)` = crumb i.
 */
export function Breadcrumb({
  crumbs,
  onNavigate,
}: {
  crumbs: Crumb[];
  onNavigate: (index: number) => void;
}) {
  const last = crumbs.length - 1;
  return (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      {crumbs.length === 0 ? (
        <span className="breadcrumb__current">My Drive</span>
      ) : (
        <button type="button" className="btn btn--ghost" onClick={() => onNavigate(-1)}>
          My Drive
        </button>
      )}
      {crumbs.map((c, i) => (
        <Fragment key={c.id}>
          <span className="breadcrumb__sep" aria-hidden="true">
            <Icon name="chevron-right" />
          </span>
          {i === last ? (
            <span className="breadcrumb__current" title={c.name}>
              {c.name}
            </span>
          ) : (
            <button type="button" className="btn btn--ghost" onClick={() => onNavigate(i)} title={c.name}>
              {c.name}
            </button>
          )}
        </Fragment>
      ))}
    </nav>
  );
}

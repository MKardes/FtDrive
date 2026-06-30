export interface Crumb {
  id: string;
  name: string;
}

/** Folder breadcrumb. `onNavigate(-1)` = Home (root); `onNavigate(i)` = crumb i. */
export function Breadcrumb({
  crumbs,
  onNavigate,
}: {
  crumbs: Crumb[];
  onNavigate: (index: number) => void;
}) {
  return (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      <button type="button" className="btn btn--ghost" onClick={() => onNavigate(-1)}>
        Home
      </button>
      {crumbs.map((c, i) => (
        <span key={c.id}>
          <span aria-hidden="true"> / </span>
          <button type="button" className="btn btn--ghost" onClick={() => onNavigate(i)}>
            {c.name}
          </button>
        </span>
      ))}
    </nav>
  );
}

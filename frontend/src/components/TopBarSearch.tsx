import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Icon } from './Icon';

interface SearchOrigin {
  from?: string;
  fromState?: unknown;
}

/**
 * Top-bar search (007, research.md D5): the query lives in the URL —
 * `/search?q=<text>` — which the `/search` route (Browse) already renders.
 * Where the user came from rides along in location.state so clearing the
 * field restores the exact previous view (folder + breadcrumb trail),
 * matching the pre-redesign behavior of clearing an inline filter.
 */
export function TopBarSearch() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const onSearchRoute = location.pathname === '/search';
  const value = onSearchRoute ? (params.get('q') ?? '') : '';

  function onChange(next: string) {
    if (next.length === 0) {
      if (onSearchRoute) {
        const origin = (location.state ?? {}) as SearchOrigin;
        navigate(origin.from ?? '/', { state: origin.fromState ?? null });
      }
      return;
    }
    const target = `/search?q=${encodeURIComponent(next)}`;
    if (onSearchRoute) {
      navigate(target, { replace: true, state: location.state });
    } else {
      navigate(target, { state: { from: location.pathname, fromState: location.state } });
    }
  }

  return (
    <div className="topbar__search">
      <div className="search">
        <Icon name="search" />
        <input
          className="search__input"
          type="search"
          placeholder="Search in FtDrive"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Search files"
        />
      </div>
    </div>
  );
}

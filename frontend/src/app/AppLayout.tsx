import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from './auth';

/** Responsive app shell: top bar with navigation + the routed page below. */
export function AppLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="app-shell">
      <header className="app-bar">
        <NavLink to="/" className="app-bar__brand" end>
          FtDrive
        </NavLink>
        <nav className="app-bar__nav" aria-label="Primary">
          <NavLink to="/" end>
            Files
          </NavLink>
          <NavLink to="/downloads">Downloads</NavLink>
          <NavLink to="/trash">Trash</NavLink>
          {user?.role === 'owner' && <NavLink to="/admin">Users</NavLink>}
          <NavLink to="/account">Account</NavLink>
        </nav>
        <div className="app-bar__user">
          <span className="app-bar__username" title={user?.username}>
            {user?.username}
          </span>
          <button type="button" className="btn btn--ghost" onClick={() => void logout()}>
            Sign out
          </button>
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}

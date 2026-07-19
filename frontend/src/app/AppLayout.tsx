import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Logo } from '../components/Logo';
import { Sidebar } from '../components/Sidebar';
import { TopBarSearch } from '../components/TopBarSearch';
import { UserMenu } from '../components/UserMenu';

/**
 * Signed-in shell (007, research.md D4): top bar (hamburger on narrow screens,
 * brand, search, user menu) over a sidebar + routed-content body. Under 900px
 * the sidebar becomes an off-canvas drawer behind a scrim that closes on
 * navigation, scrim tap, or Escape (data-model.md `drawerOpen`).
 */
export function AppLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!drawerOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setDrawerOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  return (
    <div className="app-frame">
      <header className="topbar">
        <button
          type="button"
          className="btn btn--ghost btn--icon topbar__menu"
          aria-label="Open navigation"
          onClick={() => setDrawerOpen(true)}
        >
          <Icon name="menu" />
        </button>
        <NavLink to="/" className="topbar__brand" end aria-label="FtDrive home">
          <Logo />
        </NavLink>
        <TopBarSearch />
        <UserMenu />
      </header>
      <div className="app-body">
        {drawerOpen && <div className="scrim" onClick={() => setDrawerOpen(false)} aria-hidden="true" />}
        <Sidebar open={drawerOpen} onAction={() => setDrawerOpen(false)} />
        <main className="app-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './auth';

/** Route guard: redirects unauthenticated users to /login (default deny). */
export function ProtectedRoute() {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="center-screen" role="status" aria-live="polite">
        <span className="spinner" aria-hidden="true" /> Loading…
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

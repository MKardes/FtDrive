import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth';
import { ThemeProvider } from './theme';
import { ShellActionsProvider } from './shellActions';
import { ProtectedRoute } from './ProtectedRoute';
import { AppLayout } from './AppLayout';
import Login from '../pages/Login';
import Browse from '../pages/Browse';
import Shared from '../pages/Shared';
import Trash from '../pages/Trash';
import Downloads from '../pages/Downloads';
import Account from '../pages/Account';
import Admin from '../pages/Admin';
import PublicShare from '../pages/PublicShare';

export function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <ShellActionsProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              {/* Anonymous open-link page (006): the token is the credential — no session, no app chrome. */}
              <Route path="/s/:token" element={<PublicShare />} />
              <Route element={<ProtectedRoute />}>
                <Route element={<AppLayout />}>
                  <Route index element={<Browse />} />
                  <Route path="folder/:folderId" element={<Browse />} />
                  <Route path="search" element={<Browse />} />
                  <Route path="shared" element={<Shared />} />
                  <Route path="shared/manage" element={<Shared />} />
                  <Route path="shared/:shareId/folder" element={<Shared />} />
                  <Route path="shared/:shareId/folder/:nodeId" element={<Shared />} />
                  <Route path="trash" element={<Trash />} />
                  <Route path="downloads" element={<Downloads />} />
                  <Route path="account" element={<Account />} />
                  <Route path="admin" element={<Admin />} />
                </Route>
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </ShellActionsProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth';
import { ProtectedRoute } from './ProtectedRoute';
import { AppLayout } from './AppLayout';
import Login from '../pages/Login';
import Browse from '../pages/Browse';
import Trash from '../pages/Trash';
import Account from '../pages/Account';
import Admin from '../pages/Admin';

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route index element={<Browse />} />
              <Route path="folder/:folderId" element={<Browse />} />
              <Route path="search" element={<Browse />} />
              <Route path="trash" element={<Trash />} />
              <Route path="account" element={<Account />} />
              <Route path="admin" element={<Admin />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

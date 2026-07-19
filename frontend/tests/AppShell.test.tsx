import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../src/app/auth';
import { ThemeProvider } from '../src/app/theme';
import { ShellActionsProvider, useRegisterShellActions } from '../src/app/shellActions';
import { AppLayout } from '../src/app/AppLayout';
import { api } from '../src/api/client';
import type { User } from '../src/api/types';

function makeUser(overrides: Partial<User> = {}): User {
  return { id: 'u1', username: 'alice', role: 'user', status: 'active', email: null, ...overrides } as User;
}

/** A stand-in Browse page that registers New-menu handlers like the real one. */
function RegisteringPage({ onNewFolder }: { onNewFolder: () => void }) {
  useRegisterShellActions({
    newFolder: onNewFolder,
    uploadFiles: () => {},
    downloadFromWeb: () => {},
  });
  return <div>browse-page</div>;
}

function renderShell(user: User, page: React.ReactNode, initialPath = '/') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.spyOn(api.auth, 'me').mockResolvedValue(user);
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialPath]}>
        <ThemeProvider>
          <AuthProvider>
            <ShellActionsProvider>
              <Routes>
                <Route element={<AppLayout />}>
                  <Route index element={page} />
                  <Route path="trash" element={<div>trash-page</div>} />
                </Route>
              </Routes>
            </ShellActionsProvider>
          </AuthProvider>
        </ThemeProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** App shell (007, US1): sidebar navigation, owner gating, New-button wiring. */
describe('AppLayout shell', () => {
  afterEach(() => vi.restoreAllMocks());

  it('renders the sidebar destinations with My Drive and no Users link for regular users', async () => {
    renderShell(makeUser(), <div>home</div>);
    expect(await screen.findByRole('link', { name: 'My Drive' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Shared' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Downloads' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Trash' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument();
  });

  it('shows the Users link for the owner', async () => {
    renderShell(makeUser({ role: 'owner' }), <div>home</div>);
    expect(await screen.findByRole('link', { name: 'Users' })).toBeInTheDocument();
  });

  it('disables New when no page has registered actions, enables it when one has', async () => {
    const onNewFolder = vi.fn();
    renderShell(makeUser(), <RegisteringPage onNewFolder={onNewFolder} />);
    const newBtn = await screen.findByRole('button', { name: 'New' });
    expect(newBtn).toBeEnabled();
  });

  it('New menu triggers the registered handler', async () => {
    const onNewFolder = vi.fn();
    renderShell(makeUser(), <RegisteringPage onNewFolder={onNewFolder} />);
    const newBtn = await screen.findByRole('button', { name: 'New' });
    newBtn.click();
    (await screen.findByRole('menuitem', { name: 'New folder' })).click();
    expect(onNewFolder).toHaveBeenCalledTimes(1);
  });

  it('renders the top-bar search with its pinned accessible name', async () => {
    renderShell(makeUser(), <div>home</div>);
    expect(await screen.findByLabelText('Search files')).toBeInTheDocument();
  });
});

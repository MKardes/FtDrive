import { createContext, useCallback, useContext, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../api/client';
import type { User } from '../api/types';

const ME_KEY = ['auth', 'me'] as const;

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ME_KEY,
    queryFn: async (): Promise<User | null> => {
      try {
        return await api.auth.me();
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: 60_000,
  });

  const loginMutation = useMutation({
    mutationFn: ({ username, password }: { username: string; password: string }) =>
      api.auth.login(username, password),
    onSuccess: (user) => qc.setQueryData(ME_KEY, user),
  });

  const logoutMutation = useMutation({
    mutationFn: () => api.auth.logout(),
    onSuccess: () => {
      qc.setQueryData(ME_KEY, null);
      qc.clear();
    },
  });

  const login = useCallback(
    (username: string, password: string) => loginMutation.mutateAsync({ username, password }),
    [loginMutation],
  );
  const logout = useCallback(() => logoutMutation.mutateAsync(), [logoutMutation]);

  return (
    <AuthContext.Provider value={{ user: data ?? null, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

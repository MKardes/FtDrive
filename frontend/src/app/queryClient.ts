import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '../api/client';

/** Shared TanStack Query client. Auth failures are not retried. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        if (error instanceof ApiError && (error.status === 401 || error.status === 404)) {
          return false;
        }
        return failureCount < 2;
      },
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

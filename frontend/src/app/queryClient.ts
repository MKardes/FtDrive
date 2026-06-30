import { QueryCache, QueryClient } from '@tanstack/react-query';
import { ApiError } from '../api/client';

// On any query 401 (e.g. session expired/revoked mid-use), reset the cached auth
// state to null so the route guard redirects to /login (FR-019).
const queryCache = new QueryCache({
  onError: (error) => {
    if (error instanceof ApiError && error.status === 401) {
      queryClient.setQueryData(['auth', 'me'], null);
    }
  },
});

/** Shared TanStack Query client. Auth failures are not retried. */
export const queryClient = new QueryClient({
  queryCache,
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

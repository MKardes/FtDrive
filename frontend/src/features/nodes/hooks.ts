import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { NodePage } from '../../api/types';

/** Keyset-paginated children of a folder (lazy "load more" via nextCursor). */
export function useChildren(folderId: string) {
  return useInfiniteQuery({
    queryKey: ['children', folderId],
    queryFn: ({ pageParam }): Promise<NodePage> =>
      api.nodes.listChildren(folderId, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

/** Owner-scoped name search (FR-021), paginated; disabled while the query is empty. */
export function useSearch(query: string) {
  const q = query.trim();
  return useInfiniteQuery({
    queryKey: ['search', q],
    queryFn: ({ pageParam }): Promise<NodePage> => api.nodes.search(q, pageParam as string | undefined),
    enabled: q.length > 0,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

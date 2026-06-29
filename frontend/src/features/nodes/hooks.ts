import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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

/**
 * Organize mutations (US3) scoped to the folder currently shown as `parentId`.
 * Each invalidates the affected `['children', …]` listings (and `['trash']`)
 * so the grid reflects the change without a manual reload.
 */
export function useCreateFolder(parentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.nodes.createFolder(parentId, name),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['children', parentId] }),
  });
}

export function useRenameNode(parentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; name: string }) => api.nodes.update(vars.id, { name: vars.name }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['children', parentId] }),
  });
}

export function useMoveNode(parentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; destId: string }) =>
      api.nodes.update(vars.id, { parentId: vars.destId === 'root' ? null : vars.destId }),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['children', parentId] });
      void qc.invalidateQueries({ queryKey: ['children', vars.destId] });
    },
  });
}

export function useTrashNode(parentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.nodes.trash(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['children', parentId] });
      void qc.invalidateQueries({ queryKey: ['trash'] });
    },
  });
}

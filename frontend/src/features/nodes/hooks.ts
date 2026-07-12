import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../api/client';
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

export interface BulkResult {
  succeeded: string[];
  failed: Array<{ id: string; name: string; message: string }>;
}

function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 409) return 'Would create a cycle or conflict.';
    if (err.status === 404) return 'No longer available.';
    return err.message || 'Failed.';
  }
  return 'Something went wrong.';
}

/**
 * Bulk Move/Delete (005-actions-menu-bulk-select) fire one call per selected item
 * concurrently via `Promise.allSettled` against the *same* single-item endpoints
 * `useMoveNode`/`useTrashNode` already use — no new backend surface (research.md).
 * The mutation itself never rejects: partial failure is reported in the resolved
 * `BulkResult`, which is what gives FR-008's per-item reporting "for free."
 */
export function useBulkMoveNodes(parentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      nodes,
      destId,
    }: {
      nodes: Array<{ id: string; name: string }>;
      destId: string;
    }): Promise<BulkResult> => {
      const settled = await Promise.allSettled(
        nodes.map(async (n) => {
          await api.nodes.update(n.id, { parentId: destId === 'root' ? null : destId });
          return n;
        }),
      );
      const succeeded: string[] = [];
      const failed: BulkResult['failed'] = [];
      settled.forEach((r, i) => {
        const node = nodes[i]!;
        if (r.status === 'fulfilled') succeeded.push(node.id);
        else failed.push({ id: node.id, name: node.name, message: describeError(r.reason) });
      });
      return { succeeded, failed };
    },
    onSuccess: (_result, vars) => {
      void qc.invalidateQueries({ queryKey: ['children', parentId] });
      void qc.invalidateQueries({ queryKey: ['children', vars.destId] });
    },
  });
}

export function useBulkTrashNodes(parentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ nodes }: { nodes: Array<{ id: string; name: string }> }): Promise<BulkResult> => {
      const settled = await Promise.allSettled(
        nodes.map(async (n) => {
          await api.nodes.trash(n.id);
          return n;
        }),
      );
      const succeeded: string[] = [];
      const failed: BulkResult['failed'] = [];
      settled.forEach((r, i) => {
        const node = nodes[i]!;
        if (r.status === 'fulfilled') succeeded.push(node.id);
        else failed.push({ id: node.id, name: node.name, message: describeError(r.reason) });
      });
      return { succeeded, failed };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['children', parentId] });
      void qc.invalidateQueries({ queryKey: ['trash'] });
    },
  });
}

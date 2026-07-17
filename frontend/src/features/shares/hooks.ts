import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { NodePage, ShareKind } from '../../api/types';

/**
 * Sharing hooks (006-share-links). Owner-side hooks invalidate both the
 * per-node share panel and the "My shares" overview so the two management
 * surfaces (FR-006) never disagree.
 */

const invalidateShares = (qc: ReturnType<typeof useQueryClient>, nodeId?: string) => {
  void qc.invalidateQueries({ queryKey: ['shares'] });
  if (nodeId) void qc.invalidateQueries({ queryKey: ['node-shares', nodeId] });
};

/** The caller's grants on one owned node (item Share dialog). */
export function useNodeShares(nodeId: string) {
  return useQuery({
    queryKey: ['node-shares', nodeId],
    queryFn: () => api.shares.forNode(nodeId),
  });
}

/** All of the caller's grants ("My shares" overview). */
export function useMyShares() {
  return useQuery({
    queryKey: ['shares'],
    queryFn: () => api.shares.list(),
  });
}

export function useCreateShare(nodeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { kind: ShareKind; recipientIds?: string[]; expiresAt?: number | null }) =>
      api.shares.create({ nodeId, ...input }),
    onSuccess: () => invalidateShares(qc, nodeId),
  });
}

export function useRevokeShare(nodeId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (shareId: string) => api.shares.revoke(shareId),
    onSuccess: () => {
      invalidateShares(qc, nodeId);
      void qc.invalidateQueries({ queryKey: ['shared-with-me'] });
    },
  });
}

export function useUpdateShare(nodeId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { shareId: string; expiresAt: number | null }) =>
      api.shares.update(vars.shareId, vars.expiresAt),
    onSuccess: () => invalidateShares(qc, nodeId),
  });
}

// --- Recipient side (US2) ---------------------------------------------------

/** Active users other than the caller, for the recipient picker. */
export function useDirectory() {
  return useQuery({
    queryKey: ['users-directory'],
    queryFn: () => api.users.directory(),
  });
}

/** Active direct shares naming the caller. */
export function useSharedWithMe() {
  return useQuery({
    queryKey: ['shared-with-me'],
    queryFn: () => api.sharedWithMe.list(),
  });
}

/** Keyset-paginated children of a folder inside a direct share's subtree. */
export function useSharedChildren(shareId: string, nodeId: string | undefined, enabled = true) {
  return useInfiniteQuery({
    queryKey: ['shared-with-me', shareId, 'children', nodeId ?? 'root'],
    queryFn: ({ pageParam }): Promise<NodePage> =>
      api.sharedWithMe.children(shareId, nodeId, pageParam as string | undefined),
    enabled,
    retry: false,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

// --- Anonymous open-link access (US1) --------------------------------------

/** Resolve a share token to its shared root; 404 = "not available". */
export function usePublicShare(token: string) {
  return useQuery({
    queryKey: ['public-share', token],
    queryFn: () => api.publicShares.info(token),
    retry: false,
  });
}

/** Keyset-paginated children of a folder inside an open link's subtree. */
export function usePublicChildren(token: string, nodeId: string | undefined, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ['public-share', token, 'children', nodeId ?? 'root'],
    queryFn: ({ pageParam }): Promise<NodePage> =>
      api.publicShares.children(token, nodeId, pageParam as string | undefined),
    enabled,
    retry: false,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

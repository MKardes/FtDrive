import type { FastifyInstance } from 'fastify';
import type { Services } from '../../services';
import { requireUser } from '../../auth/guard';
import { sendFileContent, sendThumbnail } from '../files/stream';

interface ShareParams {
  shareId: string;
}

interface ShareNodeParams {
  shareId: string;
  nodeId: string;
}

interface ChildrenQuery {
  nodeId?: string;
  cursor?: string;
  limit?: string;
}

/**
 * Recipient-facing share access (006-share-links, FR-004): session-
 * authenticated routes that resolve the share by id + `recipient_id = caller`
 * FIRST — pinning the owner and shared root — then serve reads strictly inside
 * that subtree. Read-only by construction (GET only, FR-005); every failure
 * mode (foreign/missing share, wrong kind, expired, trashed, out-of-subtree)
 * is the uniform 404.
 */
export function registerSharedWithMeRoutes(api: FastifyInstance, services: Services): void {
  // Active direct shares naming the caller, newest first (FR-016).
  api.get('/shared-with-me', async (request, reply) => {
    const user = requireUser(request);
    return reply.send({ items: services.shares.listSharedWith(user.id) });
  });

  // Children of a folder inside the share's subtree (keyset-paginated).
  api.get('/shared/:shareId/children', async (request, reply) => {
    const user = requireUser(request);
    const { shareId } = request.params as ShareParams;
    const query = request.query as ChildrenQuery;
    const ctx = services.shares.resolveActiveForRecipientOrThrow404(shareId, user.id);
    const folder = services.shares.resolveSubtreeNodeOrThrow404(ctx, query.nodeId);
    const page = services.shares.listChildrenInShare(ctx, folder, {
      cursor: query.cursor,
      limit: query.limit ? Number(query.limit) : undefined,
    });
    return reply.send(page);
  });

  // File bytes (Range/206 supported so <video> can seek).
  api.get('/shared/:shareId/files/:nodeId/content', async (request, reply) => {
    const user = requireUser(request);
    const { shareId, nodeId } = request.params as ShareNodeParams;
    const ctx = services.shares.resolveActiveForRecipientOrThrow404(shareId, user.id);
    const node = services.shares.resolveSubtreeNodeOrThrow404(ctx, nodeId);
    return sendFileContent(request, reply, services, ctx.share.ownerId, node);
  });

  // Thumbnails for media inside the share.
  api.get('/shared/:shareId/files/:nodeId/thumbnail', async (request, reply) => {
    const user = requireUser(request);
    const { shareId, nodeId } = request.params as ShareNodeParams;
    const ctx = services.shares.resolveActiveForRecipientOrThrow404(shareId, user.id);
    const node = services.shares.resolveSubtreeNodeOrThrow404(ctx, nodeId);
    return sendThumbnail(reply, services, ctx.share.ownerId, node);
  });
}

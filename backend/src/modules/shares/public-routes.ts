import type { FastifyInstance } from 'fastify';
import type { Services } from '../../services';
import { sendFileContent, sendThumbnail } from '../files/stream';

interface TokenParams {
  token: string;
}

interface TokenNodeParams {
  token: string;
  nodeId: string;
}

interface ChildrenQuery {
  nodeId?: string;
  cursor?: string;
  limit?: string;
}

/**
 * Anonymous open-link access (006-share-links) — the feature's single,
 * justified exception to signed-in-only access (plan.md Complexity Tracking).
 * The 256-bit token IS the credential: an owner-granted, revocable capability.
 * Every route: read-only GET, `config.public` (same mechanism as login),
 * per-IP rate-limited (FR-014), resolves the share row FIRST (pinning owner +
 * shared root), and answers every failure mode — invalid/revoked/expired
 * token, trashed item, foreign or out-of-subtree node — with the SAME uniform
 * 404 (FR-012). Nothing outside the shared subtree is reachable (FR-003).
 */
export function registerPublicShareRoutes(api: FastifyInstance, services: Services): void {
  // Budgets cap token-guessing throughput while leaving room for a legitimate
  // media-grid page (1 info + 1 children + a screenful of thumbnails).
  const publicConfig = (maxPerMinute: number) => ({
    public: true,
    rateLimit: { max: maxPerMinute, timeWindow: '1 minute' },
  });

  // Share metadata: the shared root node, its parentId nulled (research.md §11).
  api.get('/public/shares/:token', { config: publicConfig(120) }, async (request, reply) => {
    const { token } = request.params as TokenParams;
    const ctx = services.shares.resolveActiveByTokenOrThrow404(token);
    return reply.send({ node: services.shares.toSharedNodeDto(ctx, ctx.root) });
  });

  // Children of a folder inside the shared subtree (keyset-paginated).
  api.get('/public/shares/:token/children', { config: publicConfig(120) }, async (request, reply) => {
    const { token } = request.params as TokenParams;
    const query = request.query as ChildrenQuery;
    const ctx = services.shares.resolveActiveByTokenOrThrow404(token);
    const folder = services.shares.resolveSubtreeNodeOrThrow404(ctx, query.nodeId);
    const page = services.shares.listChildrenInShare(ctx, folder, {
      cursor: query.cursor,
      limit: query.limit ? Number(query.limit) : undefined,
    });
    return reply.send(page);
  });

  // File bytes (Range/206 supported so <video> can seek).
  api.get(
    '/public/shares/:token/files/:nodeId/content',
    { config: publicConfig(240) },
    async (request, reply) => {
      const { token, nodeId } = request.params as TokenNodeParams;
      const ctx = services.shares.resolveActiveByTokenOrThrow404(token);
      const node = services.shares.resolveSubtreeNodeOrThrow404(ctx, nodeId);
      return sendFileContent(request, reply, services, ctx.share.ownerId, node);
    },
  );

  // Thumbnails for media inside the share.
  api.get(
    '/public/shares/:token/files/:nodeId/thumbnail',
    { config: publicConfig(600) },
    async (request, reply) => {
      const { token, nodeId } = request.params as TokenNodeParams;
      const ctx = services.shares.resolveActiveByTokenOrThrow404(token);
      const node = services.shares.resolveSubtreeNodeOrThrow404(ctx, nodeId);
      return sendThumbnail(reply, services, ctx.share.ownerId, node);
    },
  );
}

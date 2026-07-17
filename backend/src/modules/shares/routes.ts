import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Services } from '../../services';
import { requireUser } from '../../auth/guard';
import { validationError } from '../../lib/errors';
import { toShareDto, type ShareDto } from './repository';

interface ShareParams {
  shareId: string;
}

interface NodeParams {
  id: string;
}

const CreateShareSchema = z.object({
  nodeId: z.string().min(1),
  kind: z.enum(['link', 'user']),
  recipientIds: z.array(z.string().min(1)).optional(),
  expiresAt: z.number().int().nullable().optional(),
});

const UpdateShareSchema = z.object({
  expiresAt: z.number().int().nullable(),
});

/** `expiresAt` must be in the future when set. */
function checkExpiry(expiresAt: number | null | undefined): number | null {
  if (expiresAt === undefined || expiresAt === null) return null;
  if (expiresAt <= Date.now()) throw validationError('Expiration must be in the future');
  return expiresAt;
}

/**
 * Owner share management (006-share-links, FR-001/006/007/008/009/013). Every
 * route is session-authenticated and owner-scoped: creating, listing, editing,
 * or revoking a share of a node the caller does not own yields the uniform 404.
 */
export function registerShareRoutes(api: FastifyInstance, services: Services): void {
  // Create a share: link (one grant) or direct (one grant per recipient).
  api.post('/shares', async (request, reply) => {
    const user = requireUser(request);
    const parsed = CreateShareSchema.safeParse(request.body);
    if (!parsed.success) throw validationError('nodeId and kind (link|user) are required');
    const { nodeId, kind, recipientIds } = parsed.data;
    const expiresAt = checkExpiry(parsed.data.expiresAt);

    let items: ShareDto[];
    if (kind === 'link') {
      const row = services.shares.createLinkShare(user.id, nodeId, expiresAt);
      items = [toShareDto(row)];
      request.log.info({ event: 'share.link.created', ownerId: user.id, shareId: row.id }, 'link share created');
    } else {
      const rows = services.shares.createUserShares(user.id, nodeId, recipientIds ?? [], expiresAt);
      const byNode = services.shares.listByNode(user.id, nodeId);
      items = rows.map((row) => byNode.find((s) => s.id === row.id) ?? toShareDto(row));
      request.log.info(
        { event: 'share.direct.created', ownerId: user.id, shareIds: rows.map((r) => r.id) },
        'direct shares created',
      );
    }
    return reply.code(201).send({ items });
  });

  // All of the caller's grants ("My shares").
  api.get('/shares', async (request, reply) => {
    const user = requireUser(request);
    return reply.send({ items: services.shares.listByOwner(user.id) });
  });

  // The caller's grants on one owned node (item share panel).
  api.get('/nodes/:id/shares', async (request, reply) => {
    const user = requireUser(request);
    const { id } = request.params as NodeParams;
    return reply.send({ items: services.shares.listByNode(user.id, id) });
  });

  // Set/clear a grant's expiration.
  api.patch('/shares/:shareId', async (request, reply) => {
    const user = requireUser(request);
    const { shareId } = request.params as ShareParams;
    const parsed = UpdateShareSchema.safeParse(request.body);
    if (!parsed.success) throw validationError('expiresAt (epoch ms or null) is required');
    const expiresAt = parsed.data.expiresAt === null ? null : checkExpiry(parsed.data.expiresAt);
    const row = services.shares.updateExpiry(user.id, shareId, expiresAt);
    return reply.send(toShareDto(row));
  });

  // Revoke a grant. Effective immediately for all new requests (FR-007).
  api.delete('/shares/:shareId', async (request, reply) => {
    const user = requireUser(request);
    const { shareId } = request.params as ShareParams;
    services.shares.deleteOwned(user.id, shareId);
    request.log.info({ event: 'share.revoked', ownerId: user.id, shareId }, 'share revoked');
    return reply.code(204).send();
  });
}

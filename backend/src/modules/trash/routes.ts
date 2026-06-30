import type { FastifyInstance } from 'fastify';
import type { Services } from '../../services';
import { requireUser } from '../../auth/guard';
import { validationError } from '../../lib/errors';
import { toNodeDto } from '../nodes/repository';
import type { NodeRow } from '../../db/schema';

interface NodeParams {
  id: string;
}
interface PageQuery {
  cursor?: string;
  limit?: string;
}
interface ConfirmQuery {
  confirm?: string;
}

/** A purge/empty is destructive and irreversible — require an explicit flag (FR-008). */
function requireConfirm(query: ConfirmQuery): void {
  const v = query.confirm;
  const confirmed = v === 'true' || v === '1' || v === 'yes';
  if (!confirmed) throw validationError('This action is permanent; pass confirm=true');
}

/**
 * Delete the on-disk artifacts (blob + cached thumbnail) for purged file rows.
 * DB rows are already gone; this is best-effort cleanup that never throws.
 */
async function removeArtifacts(services: Services, rows: NodeRow[]): Promise<void> {
  for (const row of rows) {
    if (row.type !== 'file') continue;
    if (row.storagePath) await services.storage.removeBlob(row.ownerId, row.storagePath);
    await services.storage.removeThumb(row.ownerId, row.id);
  }
}

/**
 * Trash routes (T063/T064, FR-007/008). `DELETE /nodes/:id` moves a live node
 * (and its subtree) to trash; `GET /trash` lists restore-roots; restore brings a
 * subtree back; purge/empty permanently remove rows + blobs + thumbs (confirm
 * required). Every operation is owner-scoped — cross-user ids return uniform 404.
 */
export function registerTrashRoutes(api: FastifyInstance, services: Services): void {
  // Move to trash (reversible).
  api.delete('/nodes/:id', async (request, reply) => {
    const user = requireUser(request);
    const { id } = request.params as NodeParams;
    const expiresAt = Date.now() + services.config.trashRetentionMs;
    services.nodes.trashSubtree(user.id, id, expiresAt);
    return reply.code(204).send();
  });

  // List trashed items (restore-roots), newest first.
  api.get('/trash', async (request, reply) => {
    const user = requireUser(request);
    const { cursor, limit } = request.query as PageQuery;
    const page = services.nodes.listTrash(user.id, {
      cursor,
      limit: limit !== undefined ? Number(limit) : undefined,
    });
    return reply.send(page);
  });

  // Restore a trashed subtree to its original location (or root).
  api.post('/trash/:id/restore', async (request, reply) => {
    const user = requireUser(request);
    const { id } = request.params as NodeParams;
    const restored = services.nodes.restoreSubtree(user.id, id);
    return reply.send(toNodeDto(restored));
  });

  // Permanently delete a single trashed item (requires confirm).
  api.delete('/trash/:id', async (request, reply) => {
    const user = requireUser(request);
    const { id } = request.params as NodeParams;
    requireConfirm(request.query as ConfirmQuery);
    const removed = services.nodes.purgeSubtree(user.id, id);
    await removeArtifacts(services, removed);
    return reply.code(204).send();
  });

  // Empty the whole trash (requires confirm).
  api.delete('/trash', async (request, reply) => {
    const user = requireUser(request);
    requireConfirm(request.query as ConfirmQuery);
    const removed = services.nodes.emptyTrash(user.id);
    await removeArtifacts(services, removed);
    return reply.code(204).send();
  });
}

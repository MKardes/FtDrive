import type { FastifyInstance } from 'fastify';
import type { Services } from '../../services';
import { requireUser } from '../../auth/guard';

interface ChildrenParams {
  id: string;
}
interface PageQuery {
  cursor?: string;
  limit?: string;
}

/**
 * Node browse routes. `GET /folders/:id/children` lists a folder's live children
 * keyset-paginated; `id=root` (or any owned folder id) resolves to that folder.
 * Create/rename/move/delete are added in User Story 3.
 */
export function registerNodeRoutes(api: FastifyInstance, services: Services): void {
  api.get('/folders/:id/children', async (request, reply) => {
    const user = requireUser(request);
    const { id } = request.params as ChildrenParams;
    const { cursor, limit } = request.query as PageQuery;

    const folder = services.nodes.resolveOwnedFolderOrThrow404(user.id, id);
    const page = services.nodes.listChildren(user.id, folder.id, {
      cursor,
      limit: limit !== undefined ? Number(limit) : undefined,
    });
    return reply.send(page);
  });
}

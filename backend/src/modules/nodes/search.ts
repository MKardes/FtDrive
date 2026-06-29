import type { FastifyInstance } from 'fastify';
import type { Services } from '../../services';
import { requireUser } from '../../auth/guard';
import { validationError } from '../../lib/errors';

interface SearchQuery {
  q?: string;
  cursor?: string;
  limit?: string;
}

/** Owner-scoped, case-insensitive substring name search (T030, FR-021). */
export function registerSearchRoutes(api: FastifyInstance, services: Services): void {
  api.get('/search', async (request, reply) => {
    const user = requireUser(request);
    const { q, cursor, limit } = request.query as SearchQuery;
    if (!q || q.trim().length === 0) throw validationError('q is required');

    const page = services.nodes.search(user.id, q, {
      cursor,
      limit: limit !== undefined ? Number(limit) : undefined,
    });
    return reply.send(page);
  });
}

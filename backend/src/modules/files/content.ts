import type { FastifyInstance } from 'fastify';
import type { Services } from '../../services';
import { requireUser } from '../../auth/guard';
import { sendFileContent } from './stream';

interface ContentParams {
  id: string;
}

/**
 * Stream file content with HTTP Range support (T031, FR-005). Ownership is
 * re-checked before any bytes are served (Principle II); the Range/206
 * mechanics live in `stream.ts` so share-scoped routes reuse them (006).
 */
export function registerFileContentRoute(api: FastifyInstance, services: Services): void {
  api.get('/files/:id/content', async (request, reply) => {
    const user = requireUser(request);
    const { id } = request.params as ContentParams;

    const node = services.nodes.getOwnedLiveNodeOrThrow404(user.id, id);
    return sendFileContent(request, reply, services, user.id, node);
  });
}

import type { FastifyInstance } from 'fastify';
import type { Services } from '../../services';
import { requireUser } from '../../auth/guard';
import { sendThumbnail } from './stream';

interface ThumbParams {
  id: string;
}

/**
 * Serve a file's cached thumbnail/poster (T033). Ownership is checked first, so
 * thumbnails never leak another user's media (Principle II); the ensure/stream
 * mechanics live in `stream.ts` so share-scoped routes reuse them (006).
 */
export function registerFileThumbnailRoute(api: FastifyInstance, services: Services): void {
  api.get('/files/:id/thumbnail', async (request, reply) => {
    const user = requireUser(request);
    const { id } = request.params as ThumbParams;

    const node = services.nodes.getOwnedLiveNodeOrThrow404(user.id, id);
    return sendThumbnail(reply, services, user.id, node);
  });
}

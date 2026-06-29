import { createReadStream } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import type { Services } from '../../services';
import { requireUser } from '../../auth/guard';
import { notFound } from '../../lib/errors';

interface ThumbParams {
  id: string;
}

/**
 * Serve a file's cached thumbnail/poster (T033). Ownership is checked first, so
 * thumbnails never leak another user's media (Principle II). Generated on demand
 * via the media layer; an unsupported/undecodable file yields a uniform 404 and
 * the client falls back to a generic icon.
 */
export function registerFileThumbnailRoute(api: FastifyInstance, services: Services): void {
  api.get('/files/:id/thumbnail', async (request, reply) => {
    const user = requireUser(request);
    const { id } = request.params as ThumbParams;

    const node = services.nodes.getOwnedLiveNodeOrThrow404(user.id, id);
    if (node.type !== 'file') throw notFound();

    const status = await services.media.ensureThumbnail(user.id, node);
    services.nodes.setThumbStatus(user.id, node.id, status === 'ready' ? 'ready' : 'unsupported');

    if (status !== 'ready') throw notFound();

    reply.header('Content-Type', 'image/jpeg');
    reply.header('Cache-Control', 'private, max-age=86400');
    return reply.send(createReadStream(services.media.thumbPath(user.id, node.id)));
  });
}

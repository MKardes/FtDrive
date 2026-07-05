import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Services } from '../../services';
import { requireUser } from '../../auth/guard';
import { validationError } from '../../lib/errors';
import { DrmProtectedError, SourceInaccessibleError } from './extractor';

interface DownloadParams {
  id: string;
}
interface ListQuery {
  cursor?: string;
  limit?: string;
  status?: 'active' | 'terminal';
}

const ExamineSchema = z.object({ url: z.string() });
const CreateSchema = z.object({
  url: z.string(),
  destinationFolderId: z.union([z.string(), z.null()]).optional(),
  formatId: z.union([z.string(), z.null()]).optional(),
});

/**
 * Download-from-web routes (contracts/openapi.yaml). All endpoints sit under
 * the existing `/api` default-deny guard; every accessor is owner-scoped via
 * `DownloadService`, which yields a uniform 404 for non-owned/non-existent ids
 * (Principle II). Domain exceptions from the extractor are mapped to the HTTP
 * codes the contract specifies (422 for DRM/inaccessible content, 503 when
 * the feature is disabled or the tool is unavailable).
 */
export function registerDownloadRoutes(api: FastifyInstance, services: Services): void {
  api.post('/downloads/examine', async (request, reply) => {
    requireUser(request);
    const parsed = ExamineSchema.safeParse(request.body);
    if (!parsed.success) throw validationError('A url is required');

    try {
      const result = await services.downloads.examineUrl(parsed.data.url);
      return reply.send(result);
    } catch (err) {
      if (err instanceof DrmProtectedError || err instanceof SourceInaccessibleError) {
        return reply.code(422).send({ error: { code: 'SOURCE_INACCESSIBLE', message: err.message } });
      }
      throw err;
    }
  });

  api.get('/downloads', async (request, reply) => {
    const user = requireUser(request);
    const { cursor, limit, status } = request.query as ListQuery;
    const page = services.downloads.listDownloads(user.id, {
      cursor,
      limit: limit !== undefined ? Number(limit) : undefined,
      status,
    });
    return reply.send(page);
  });

  api.post('/downloads', async (request, reply) => {
    const user = requireUser(request);
    const parsed = CreateSchema.safeParse(request.body);
    if (!parsed.success) throw validationError('A url is required');

    const created = await services.downloads.createDownload(user.id, parsed.data);
    return reply.code(201).send(created);
  });

  api.delete('/downloads', async (request, reply) => {
    const user = requireUser(request);
    services.downloads.clearHistory(user.id);
    return reply.code(204).send();
  });

  api.get('/downloads/:id', async (request, reply) => {
    const user = requireUser(request);
    const { id } = request.params as DownloadParams;
    const dto = services.downloads.getDownload(user.id, id);
    return reply.send(dto);
  });

  api.delete('/downloads/:id', async (request, reply) => {
    const user = requireUser(request);
    const { id } = request.params as DownloadParams;
    services.downloads.deleteOne(user.id, id);
    return reply.code(204).send();
  });

  api.post('/downloads/:id/cancel', async (request, reply) => {
    const user = requireUser(request);
    const { id } = request.params as DownloadParams;
    const dto = services.downloads.cancelDownload(user.id, id);
    return reply.send(dto);
  });

  api.post('/downloads/:id/retry', async (request, reply) => {
    const user = requireUser(request);
    const { id } = request.params as DownloadParams;
    const dto = await services.downloads.retryDownload(user.id, id);
    return reply.send(dto);
  });
}

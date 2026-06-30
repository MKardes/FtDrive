import type { FastifyInstance } from 'fastify';
import type { Services } from '../../services';
import { requireUser } from '../../auth/guard';
import { notFound } from '../../lib/errors';

interface ContentParams {
  id: string;
}

interface ParsedRange {
  start: number;
  end: number;
}

/** Parse a single-range `Range: bytes=...` header; null if absent/unsatisfiable. */
function parseRange(header: string | undefined, size: number): ParsedRange | 'invalid' | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return 'invalid';
  const [, startStr, endStr] = match;
  if (startStr === '' && endStr === '') return 'invalid';

  let start: number;
  let end: number;
  if (startStr === '') {
    // suffix range: last N bytes
    const suffix = Number(endStr);
    if (suffix <= 0) return 'invalid';
    start = Math.max(size - suffix, 0);
    end = size - 1;
  } else {
    start = Number(startStr);
    end = endStr === '' ? size - 1 : Number(endStr);
  }
  if (Number.isNaN(start) || Number.isNaN(end)) return 'invalid';
  if (start > end || start >= size) return 'invalid';
  if (end >= size) end = size - 1;
  return { start, end };
}

/**
 * Stream file content with HTTP Range support (T031, FR-005). Range requests
 * return 206 with `Content-Range` so `<video>` can seek; full requests return
 * 200. Ownership is re-checked before any bytes are served (Principle II).
 */
export function registerFileContentRoute(api: FastifyInstance, services: Services): void {
  api.get('/files/:id/content', async (request, reply) => {
    const user = requireUser(request);
    const { id } = request.params as ContentParams;

    const node = services.nodes.getOwnedLiveNodeOrThrow404(user.id, id);
    if (node.type !== 'file' || !node.storagePath) throw notFound();

    const { size } = await services.storage.statBlob(user.id, node.storagePath);
    const contentType = node.mimeType ?? 'application/octet-stream';

    reply.header('Accept-Ranges', 'bytes');
    reply.header('Content-Type', contentType);
    reply.header(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(node.name)}"`,
    );
    reply.header('Cache-Control', 'private, max-age=0, must-revalidate');

    const range = parseRange(request.headers.range, size);

    if (range === 'invalid') {
      reply.header('Content-Range', `bytes */${size}`);
      return reply.code(416).send();
    }

    if (range) {
      const length = range.end - range.start + 1;
      reply.code(206);
      reply.header('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
      reply.header('Content-Length', length);
      return reply.send(services.storage.openBlobStream(user.id, node.storagePath, range));
    }

    reply.header('Content-Length', size);
    return reply.send(services.storage.openBlobStream(user.id, node.storagePath));
  });
}

import { createReadStream } from 'node:fs';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Services } from '../../services';
import type { NodeRow } from '../../db/schema';
import { notFound } from '../../lib/errors';

/**
 * Owner-agnostic file streaming helpers (006-share-links, research.md §7).
 * Extracted from the owner content/thumbnail routes so the share-scoped routes
 * (recipient + anonymous link) reuse the exact same Range/206 and thumbnail
 * behavior. AUTHORIZATION IS THE CALLER'S JOB: these helpers stream for
 * whatever `(ownerId, node)` pair they are handed — every route must have
 * proven access (owner-scoped or share-scoped) before calling them.
 */

interface ParsedRange {
  start: number;
  end: number;
}

/** Parse a single-range `Range: bytes=...` header; null if absent/unsatisfiable. */
export function parseRange(header: string | undefined, size: number): ParsedRange | 'invalid' | null {
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
 * Stream a file node's content with HTTP Range support (FR-005 of feature 001).
 * Range requests return 206 with `Content-Range` so `<video>` can seek; full
 * requests return 200.
 */
export async function sendFileContent(
  request: FastifyRequest,
  reply: FastifyReply,
  services: Services,
  ownerId: string,
  node: NodeRow,
): Promise<unknown> {
  if (node.type !== 'file' || !node.storagePath) throw notFound();

  const { size } = await services.storage.statBlob(ownerId, node.storagePath);
  const contentType = node.mimeType ?? 'application/octet-stream';

  reply.header('Accept-Ranges', 'bytes');
  reply.header('Content-Type', contentType);
  reply.header('Content-Disposition', `inline; filename="${encodeURIComponent(node.name)}"`);
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
    return reply.send(services.storage.openBlobStream(ownerId, node.storagePath, range));
  }

  reply.header('Content-Length', size);
  return reply.send(services.storage.openBlobStream(ownerId, node.storagePath));
}

/**
 * Ensure + stream a file node's cached thumbnail (JPEG). An unsupported or
 * undecodable file yields the uniform 404 and the client falls back to an icon.
 */
export async function sendThumbnail(
  reply: FastifyReply,
  services: Services,
  ownerId: string,
  node: NodeRow,
): Promise<unknown> {
  if (node.type !== 'file') throw notFound();

  const status = await services.media.ensureThumbnail(ownerId, node);
  services.nodes.setThumbStatus(ownerId, node.id, status === 'ready' ? 'ready' : 'unsupported');

  if (status !== 'ready') throw notFound();

  reply.header('Content-Type', 'image/jpeg');
  reply.header('Cache-Control', 'private, max-age=86400');
  return reply.send(createReadStream(services.media.thumbPath(ownerId, node.id)));
}

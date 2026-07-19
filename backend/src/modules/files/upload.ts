import type { FastifyInstance } from 'fastify';
import type { Services } from '../../services';
import { requireUser } from '../../auth/guard';
import { payloadTooLarge, validationError } from '../../lib/errors';
import { toNodeDto } from '../nodes/repository';
import { sanitizeUploadName } from '../nodes/names';
import { isImageMime, isVideoMime } from '../../media/index';
import type { NodeRow } from '../../db/schema';

/**
 * Upload a file (T044/T045, FR-004/013/014). The body is `multipart/form-data`
 * with a `parentId` field and a `file` part. The file is streamed to a temp
 * file, fsynced, then atomically renamed into the blob store and committed to
 * the DB — an interrupted upload leaves no partial/corrupt blob (FR-014). Name
 * collisions keep both via suffixing (FR-013); oversize uploads return 413.
 *
 * On commit, a thumbnail/poster is generated for image/video files so the grid
 * shows media immediately; the `thumb_status` lifecycle is
 * `pending → ready | unsupported`. Generation degrades gracefully and never
 * fails the upload.
 */
export function registerFileUploadRoute(api: FastifyInstance, services: Services): void {
  api.post('/files', async (request, reply) => {
    const user = requireUser(request);

    let parentIdRaw: string | undefined;
    let created: NodeRow | undefined;

    // Parts arrive in form order; our clients send `parentId` before `file`.
    for await (const part of request.parts()) {
      if (part.type === 'field') {
        if (part.fieldname === 'parentId') parentIdRaw = String(part.value);
        continue;
      }

      // A file part. Ignore extras and any part after the first accepted file.
      if (part.fieldname !== 'file' || created) {
        part.file.resume();
        continue;
      }

      // Destination must be an owned, live folder (root when omitted). A
      // non-owned/missing parent yields a uniform 404 (Principle II).
      const parent = services.nodes.resolveOwnedFolderOrThrow404(
        user.id,
        parentIdRaw && parentIdRaw.length > 0 ? parentIdRaw : 'root',
      );

      const { tmpPath, size } = await services.storage.writeStreamToTemp(user.id, part.file);

      // @fastify/multipart truncates at `MAX_UPLOAD_BYTES`; reject oversize.
      if (part.file.truncated) {
        await services.storage.discardTemp(tmpPath);
        throw payloadTooLarge('File exceeds the maximum upload size');
      }

      const name = services.nodes.resolveAvailableName(
        user.id,
        parent.id,
        sanitizeUploadName(part.filename),
      );
      const mimeType = part.mimetype && part.mimetype.length > 0 ? part.mimetype : null;
      const isMedia = isImageMime(mimeType) || isVideoMime(mimeType);

      let node: NodeRow;
      try {
        const { storagePath } = await services.storage.commitTemp(user.id, tmpPath);
        node = services.nodes.insertFileNode({
          ownerId: user.id,
          parentId: parent.id,
          name,
          size,
          mimeType,
          storagePath,
          thumbStatus: isMedia ? 'pending' : 'none',
        });
      } catch (err) {
        await services.storage.discardTemp(tmpPath);
        throw err;
      }

      // Generate the thumbnail/poster inline so the response reflects the final
      // status; unsupported/undecodable media degrades to a generic icon.
      if (isMedia) {
        const status = await services.media.ensureThumbnail(user.id, node);
        const thumbStatus = status === 'unavailable' ? 'pending' : status;
        services.nodes.setThumbStatus(user.id, node.id, thumbStatus);
        node = { ...node, thumbStatus };
      }

      created = node;
    }

    if (!created) throw validationError('No file provided');
    return reply.code(201).send(toNodeDto(created));
  });
}

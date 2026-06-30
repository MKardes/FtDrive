import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Services } from '../../services';
import { requireUser } from '../../auth/guard';
import { validationError } from '../../lib/errors';
import { normalizeName } from './names';
import { toNodeDto } from './repository';

interface ChildrenParams {
  id: string;
}
interface NodeParams {
  id: string;
}
interface PageQuery {
  cursor?: string;
  limit?: string;
}

const CreateFolderSchema = z.object({
  parentId: z.union([z.string(), z.null()]).optional(),
  name: z.string(),
});

// At least one of name/parentId must be present; parentId may be null (→ root).
const UpdateNodeSchema = z
  .object({
    name: z.string().optional(),
    parentId: z.union([z.string(), z.null()]).optional(),
  })
  .refine((v) => v.name !== undefined || v.parentId !== undefined, {
    message: 'Provide a new name and/or parentId',
  });

/**
 * Node routes. `GET /folders/:id/children` lists a folder's live children
 * keyset-paginated (`id=root` → the user's root). `POST /folders` creates a
 * folder and `PATCH /nodes/:id` renames and/or moves a node — both isolation-
 * and collision-safe. Trash/restore live in the trash module.
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

  // Create a folder (T061, FR-006). Name collisions keep both (FR-013).
  api.post('/folders', async (request, reply) => {
    const user = requireUser(request);
    const parsed = CreateFolderSchema.safeParse(request.body);
    if (!parsed.success) throw validationError('parentId and name are required');

    const parent = services.nodes.resolveOwnedFolderOrThrow404(
      user.id,
      parsed.data.parentId ?? 'root',
    );
    const name = services.nodes.resolveAvailableName(
      user.id,
      parent.id,
      normalizeName(parsed.data.name),
    );
    const node = services.nodes.insertFolderNode({ ownerId: user.id, parentId: parent.id, name });
    return reply.code(201).send(toNodeDto(node));
  });

  // Rename and/or move a node (T062, FR-006). Cycle → 409; collision keep-both.
  api.patch('/nodes/:id', async (request, reply) => {
    const user = requireUser(request);
    const { id } = request.params as NodeParams;
    const parsed = UpdateNodeSchema.safeParse(request.body);
    if (!parsed.success) throw validationError('Provide a new name and/or parentId');

    const changes: { name?: string; parentId?: string | null } = {};
    if (parsed.data.name !== undefined) changes.name = normalizeName(parsed.data.name);
    if (parsed.data.parentId !== undefined) changes.parentId = parsed.data.parentId;

    const updated = services.nodes.renameMove(user.id, id, changes);
    return reply.send(toNodeDto(updated));
  });
}

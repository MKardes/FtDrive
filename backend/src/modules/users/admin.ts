import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Services } from '../../services';
import { requireOwner } from '../../auth/roles';
import { conflict, notFound, validationError } from '../../lib/errors';
import { toPublicUser } from './service';

interface UserParams {
  id: string;
}

const CreateUserSchema = z.object({
  username: z.string(),
  password: z.string(),
  role: z.enum(['owner', 'user']).optional(),
});

const ResetPasswordSchema = z.object({
  newPassword: z.string(),
});

/**
 * Owner-only admin routes (T053, FR-015/022). Provision/list/remove users and
 * reset passwords. Removing a user cascades their nodes + sessions (FK) and
 * deletes their on-disk root; a password reset revokes all of that user's
 * sessions. Non-owners get 403 via {@link requireOwner}.
 */
export function registerAdminRoutes(api: FastifyInstance, services: Services): void {
  api.get('/admin/users', async (request, reply) => {
    requireOwner(request);
    return reply.send(services.users.list().map(toPublicUser));
  });

  api.post('/admin/users', async (request, reply) => {
    requireOwner(request);
    const parsed = CreateUserSchema.safeParse(request.body);
    if (!parsed.success) throw validationError('username and password are required');
    const user = await services.users.createUser(parsed.data);
    return reply.code(201).send(toPublicUser(user));
  });

  api.delete('/admin/users/:id', async (request, reply) => {
    const owner = requireOwner(request);
    const { id } = request.params as UserParams;
    const target = services.users.getById(id);
    if (!target) throw notFound();
    // Guard against the owner removing their own account (self-lockout).
    if (target.id === owner.id) throw conflict('You cannot remove your own account');
    await services.users.deleteUser(id);
    return reply.code(204).send();
  });

  api.post('/admin/users/:id/password-reset', async (request, reply) => {
    requireOwner(request);
    const { id } = request.params as UserParams;
    const parsed = ResetPasswordSchema.safeParse(request.body);
    if (!parsed.success) throw validationError('newPassword is required');
    const target = services.users.getById(id);
    if (!target) throw notFound();
    await services.users.setPassword(id, parsed.data.newPassword);
    // Revoke the user's sessions so the old credential stops working everywhere.
    services.sessions.revokeAllForUser(id);
    return reply.code(204).send();
  });
}

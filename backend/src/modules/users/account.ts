import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Services } from '../../services';
import { requireUser } from '../../auth/guard';
import { unauthorized, validationError } from '../../lib/errors';
import { verifyPassword } from '../../auth/password';

const ChangePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string(),
});

/**
 * Self-service account routes (T054, FR-022). Changing your password requires
 * the current password and, on success, revokes every OTHER session so a stolen
 * cookie elsewhere is invalidated while the current session stays signed in.
 */
export function registerAccountRoutes(api: FastifyInstance, services: Services): void {
  api.post('/account/password', async (request, reply) => {
    const user = requireUser(request);
    const parsed = ChangePasswordSchema.safeParse(request.body);
    if (!parsed.success) throw validationError('currentPassword and newPassword are required');

    const row = services.users.getById(user.id);
    if (!row) throw unauthorized();

    const ok = await verifyPassword(row.passwordHash, parsed.data.currentPassword);
    if (!ok) throw unauthorized('Current password is incorrect');

    // Enforces the minimum-length policy (≥10); throws 400 on a weak password.
    await services.users.setPassword(user.id, parsed.data.newPassword);

    if (request.sessionId) {
      services.sessions.revokeOthersForUser(user.id, request.sessionId);
    }
    request.log.info({ event: 'account.password.changed', userId: user.id }, 'password changed');
    return reply.code(204).send();
  });
}

import type { FastifyInstance } from 'fastify';
import type { Services } from '../../services';
import { requireUser } from '../../auth/guard';

/**
 * Minimal user directory for the share recipient picker (006-share-links,
 * research.md §8): any signed-in user gets `{id, username}` of ACTIVE accounts
 * other than their own — usernames only, never roles, status, or anything
 * about anyone's content (spec assumption; Principle II untouched).
 */
export function registerUserDirectoryRoute(api: FastifyInstance, services: Services): void {
  api.get('/users', async (request, reply) => {
    const user = requireUser(request);
    return reply.send(services.shares.listDirectory(user.id));
  });
}

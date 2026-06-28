import type { FastifyInstance, FastifyRequest } from 'fastify';
import { unauthorized } from '../lib/errors';
import type { AuthUser, SessionService } from './sessions';

/** Name of the signed session cookie (matches the OpenAPI contract). */
export const SESSION_COOKIE = 'ftdrive_session';

/**
 * Global default-deny auth guard (Principle I). Registered as a preHandler on
 * the API scope: every route is denied unless it is explicitly marked
 * `config.public` (only `POST /auth/login`) or carries a valid session.
 */
export function registerAuthGuard(app: FastifyInstance, sessions: SessionService): void {
  app.addHook('preHandler', async (request) => {
    if (request.routeOptions.config?.public) return;

    const raw = request.cookies?.[SESSION_COOKIE];
    if (!raw) throw unauthorized();

    const unsigned = request.unsignCookie(raw);
    if (!unsigned.valid || !unsigned.value) throw unauthorized();

    const result = sessions.validate(unsigned.value);
    if (!result) throw unauthorized();

    request.user = result.user;
    request.sessionId = result.sessionId;
  });
}

/** Narrowing helper: return the authenticated user or throw 401. */
export function requireUser(request: FastifyRequest): AuthUser {
  if (!request.user) throw unauthorized();
  return request.user;
}

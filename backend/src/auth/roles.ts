import type { FastifyRequest } from 'fastify';
import { forbidden } from '../lib/errors';
import { requireUser } from './guard';
import type { AuthUser } from './sessions';

/**
 * Owner-role authorization (T052, FR-015). Admin endpoints are owner-only: a
 * non-owner authenticated user is rejected with 403 (distinct from the 401 an
 * unauthenticated request gets). Returns the owner user for convenience.
 */
export function requireOwner(request: FastifyRequest): AuthUser {
  const user = requireUser(request);
  if (user.role !== 'owner') throw forbidden('Owner role required');
  return user;
}

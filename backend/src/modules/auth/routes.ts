import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { Services } from '../../services';
import { SESSION_COOKIE } from '../../auth/guard';
import { getDummyHash, verifyPassword } from '../../auth/password';
import { accountKey, ipKey } from '../../auth/throttle';
import { unauthorized, tooManyRequests, validationError } from '../../lib/errors';
import { toPublicUser } from '../users/service';

const LoginSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(1024),
});

function setSessionCookie(reply: FastifyReply, services: Services, sessionId: string): void {
  reply.setCookie(SESSION_COOKIE, sessionId, {
    signed: true,
    httpOnly: true,
    secure: services.config.isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(services.config.sessionTtlMs / 1000),
  });
}

/** Auth routes (T028): login (public, throttled), logout, me. */
export function registerAuthRoutes(api: FastifyInstance, services: Services): void {
  api.post(
    '/auth/login',
    {
      config: {
        public: true,
        rateLimit: { max: 20, timeWindow: '1 minute' },
      },
    },
    async (request, reply) => {
      const parsed = LoginSchema.safeParse(request.body);
      if (!parsed.success) throw validationError('username and password are required');
      const { username, password } = parsed.data;

      const keys = [accountKey(username), ipKey(request.ip)];

      // Persisted progressive throttle (FR-020) — uniform 429 when blocked.
      const throttle = services.throttle.check(keys);
      if (throttle.blocked) {
        reply.header('retry-after', Math.ceil(throttle.retryAfterMs / 1000));
        throw tooManyRequests('Too many attempts. Try again later.');
      }

      const user = services.users.getByUsername(username);

      // Always perform a verify (real or dummy) to equalize timing — no account
      // enumeration via response time (research §7).
      const hash = user?.passwordHash ?? (await getDummyHash());
      const passwordOk = await verifyPassword(hash, password);

      if (!user || !passwordOk || user.status !== 'active') {
        services.throttle.registerFailure(keys);
        // Uniform 401 for wrong password, unknown user, AND disabled account.
        throw unauthorized('Invalid credentials');
      }

      services.throttle.clear([accountKey(username)]);
      const session = services.sessions.create({
        userId: user.id,
        userAgent: request.headers['user-agent'] ?? null,
        ip: request.ip,
      });
      setSessionCookie(reply, services, session.id);
      return reply.code(200).send(toPublicUser(user));
    },
  );

  api.post('/auth/logout', async (request, reply) => {
    if (request.sessionId) services.sessions.revoke(request.sessionId);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return reply.code(204).send();
  });

  api.get('/auth/me', async (request, reply) => {
    if (!request.user) throw unauthorized();
    return reply.send(request.user);
  });
}

import 'fastify';
import type { AuthUser } from '../auth/sessions';

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
    sessionId?: string;
  }
  // Per-route config: mark a route as public to bypass the default-deny guard.
  interface FastifyContextConfig {
    public?: boolean;
  }
}

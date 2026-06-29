import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import type { AppConfig } from './config/index';
import { buildLoggerOptions } from './lib/logger';
import { registerErrorHandler, registerNotFoundHandler } from './middleware/error-handler';
import { registerAuthGuard } from './auth/guard';
import { createServices, type Services } from './services';
import { registerAuthRoutes } from './modules/auth/routes';
import { registerNodeRoutes } from './modules/nodes/routes';
import { registerSearchRoutes } from './modules/nodes/search';
import { registerFileContentRoute } from './modules/files/content';
import { registerFileThumbnailRoute } from './modules/files/thumbnail';
import { registerFileUploadRoute } from './modules/files/upload';
import { registerTrashRoutes } from './modules/trash/routes';
import { registerAdminRoutes } from './modules/users/admin';
import { registerAccountRoutes } from './modules/users/account';

export interface BuildAppResult {
  app: FastifyInstance;
  services: Services;
}

/**
 * Fastify app factory (T020): registers cookie/rate-limit/multipart, the global
 * error handler, the default-deny auth guard, and the API routes under `/api`.
 * Returns the built app plus its services so tests can reach the DB/storage.
 */
export async function buildApp(config: AppConfig): Promise<BuildAppResult> {
  const services = createServices(config);

  const app = Fastify({
    logger: buildLoggerOptions(config),
    trustProxy: config.trustProxy,
    bodyLimit: 1024 * 1024, // JSON bodies; uploads use multipart limits below.
  });

  app.addHook('onClose', async () => {
    services.dbHandle.close();
  });

  // Security headers on every response (T071). Conservative + SPA-safe; a strict
  // Content-Security-Policy is best layered at the TLS-terminating proxy (docs).
  app.addHook('onSend', async (_req, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Content-Security-Policy', "frame-ancestors 'none'");
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('X-DNS-Prefetch-Control', 'off');
    reply.header('Cross-Origin-Opener-Policy', 'same-origin');
    return payload;
  });

  await app.register(cookie, { secret: config.sessionSecret });
  await app.register(rateLimit, { global: false });
  await app.register(multipart, {
    limits: {
      fileSize: config.maxUploadBytes,
      files: 20,
      fields: 10,
    },
  });

  registerErrorHandler(app);

  // All business routes live under /api behind the default-deny guard.
  await app.register(
    async (api) => {
      registerAuthGuard(api, services.sessions);
      api.get('/health', { config: { public: true } }, async () => ({ status: 'ok' }));
      await registerApiRoutes(api, services);
    },
    { prefix: '/api' },
  );

  // Single-deployable: serve the built SPA + client-side routing fallback (T070).
  // Skipped in tests and when no build is present (dev uses the Vite proxy).
  const webRoot = resolveWebRoot(config);
  if (webRoot) {
    await app.register(fastifyStatic, { root: webRoot, wildcard: false });
    registerNotFoundHandler(app, { spaIndexFile: 'index.html' });
  } else {
    registerNotFoundHandler(app);
  }

  await app.ready();
  return { app, services };
}

/** Resolve the built SPA directory, or null to skip static serving (dev/test). */
function resolveWebRoot(config: AppConfig): string | null {
  if (config.nodeEnv === 'test') return null;
  const dir = process.env.WEB_ROOT
    ? resolve(process.env.WEB_ROOT)
    : resolve(import.meta.dirname, '../../frontend/dist');
  return existsSync(dir) ? dir : null;
}

/**
 * Mount domain route modules. Populated phase-by-phase as user stories land.
 */
async function registerApiRoutes(api: FastifyInstance, services: Services): Promise<void> {
  // User Story 1 — browse, preview, search.
  registerAuthRoutes(api, services);
  registerNodeRoutes(api, services);
  registerSearchRoutes(api, services);
  registerFileContentRoute(api, services);
  registerFileThumbnailRoute(api, services);

  // User Story 2 — upload + download.
  registerFileUploadRoute(api, services);

  // User Story 4 — multi-user privacy (owner admin + self account).
  registerAdminRoutes(api, services);
  registerAccountRoutes(api, services);

  // User Story 3 — organize + trash/restore.
  registerTrashRoutes(api, services);
}

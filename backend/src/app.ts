import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import type { AppConfig } from './config/index';
import { buildLoggerOptions } from './lib/logger';
import { registerErrorHandler } from './middleware/error-handler';
import { registerAuthGuard } from './auth/guard';
import { createServices, type Services } from './services';
import { registerAuthRoutes } from './modules/auth/routes';
import { registerNodeRoutes } from './modules/nodes/routes';
import { registerSearchRoutes } from './modules/nodes/search';
import { registerFileContentRoute } from './modules/files/content';
import { registerFileThumbnailRoute } from './modules/files/thumbnail';

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

  await app.ready();
  return { app, services };
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
  // Later phases add: upload, trash, admin, account.
}

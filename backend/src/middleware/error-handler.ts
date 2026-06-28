import type { FastifyError, FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { isAppError } from '../lib/errors';

/**
 * Global error + not-found handlers. Every error response uses the uniform
 * `{ error: { code, message } }` shape. Non-owned/missing resources surface as
 * 404 NOT_FOUND (thrown as AppError at the data layer); unexpected errors are
 * logged server-side and returned generically so nothing leaks (Principle II).
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setNotFoundHandler((_req, reply) => {
    reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Not found' } });
  });

  app.setErrorHandler((err: FastifyError, req, reply) => {
    if (isAppError(err)) {
      reply.code(err.statusCode).send({ error: { code: err.code, message: err.message } });
      return;
    }

    if (err instanceof ZodError || err.validation) {
      reply.code(400).send({ error: { code: 'VALIDATION', message: 'Invalid input' } });
      return;
    }

    if (err.statusCode === 413 || err.code === 'FST_REQ_FILE_TOO_LARGE') {
      reply.code(413).send({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Payload too large' } });
      return;
    }

    if (err.statusCode === 429 || err.code === 'FST_ERR_RATE_LIMIT') {
      reply.code(429).send({ error: { code: 'TOO_MANY_REQUESTS', message: 'Too many requests' } });
      return;
    }

    // Client errors with an explicit 4xx status pass through generically.
    if (typeof err.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 500) {
      reply.code(err.statusCode).send({ error: { code: 'BAD_REQUEST', message: 'Bad request' } });
      return;
    }

    req.log.error({ err }, 'unhandled error');
    reply.code(500).send({ error: { code: 'INTERNAL', message: 'Internal server error' } });
  });
}

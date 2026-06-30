import type { PinoLoggerOptions } from 'fastify/types/logger';
import type { AppConfig } from '../config/index';

/**
 * Structured logging options (research §16). Never logs secrets, credentials,
 * cookies, or file contents — sensitive headers are redacted.
 */
export function buildLoggerOptions(config: AppConfig): PinoLoggerOptions | boolean {
  if (config.nodeEnv === 'test') return false;

  const base: PinoLoggerOptions = {
    level: config.isProduction ? 'info' : 'debug',
    redact: {
      paths: [
        'req.headers.cookie',
        'req.headers.authorization',
        'res.headers["set-cookie"]',
      ],
      remove: true,
    },
    serializers: {
      req(req: { method?: string; url?: string; ip?: string }) {
        return { method: req.method, url: req.url, ip: req.ip };
      },
    },
  };

  if (!config.isProduction) {
    return {
      ...base,
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
      },
    };
  }
  return base;
}

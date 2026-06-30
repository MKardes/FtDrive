import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../../src/app';
import type { AppConfig } from '../../src/config/index';
import type { Services } from '../../src/services';
import type { NodeRow, UserRow } from '../../src/db/schema';
import { SESSION_COOKIE } from '../../src/auth/guard';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface TestApp {
  app: FastifyInstance;
  services: Services;
  config: AppConfig;
  dir: string;
  cleanup: () => Promise<void>;
}

function makeTestConfig(dir: string, overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    nodeEnv: 'test',
    isProduction: false,
    host: '127.0.0.1',
    port: 0,
    dataRoot: dir,
    databasePath: join(dir, 'test.db'),
    sessionSecret: 'test-session-secret-which-is-definitely-long-enough',
    trustProxy: false,
    maxUploadBytes: 50 * 1024 * 1024,
    trashRetentionMs: 30 * DAY_MS,
    sessionTtlMs: 30 * DAY_MS,
    ownerBootstrap: {},
    ...overrides,
  };
}

/** Build an isolated Fastify app on a temp data dir + temp SQLite file. */
export async function buildTestApp(overrides: Partial<AppConfig> = {}): Promise<TestApp> {
  const dir = mkdtempSync(join(tmpdir(), 'ftdrive-test-'));
  const config = makeTestConfig(dir, overrides);
  const { app, services } = await buildApp(config);
  return {
    app,
    services,
    config,
    dir,
    cleanup: async () => {
      await app.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export async function seedUser(
  services: Services,
  username: string,
  password: string,
  role: 'owner' | 'user' = 'user',
): Promise<UserRow> {
  return services.users.createUser({ username, password, role });
}

/** Build a signed session cookie header for a user, bypassing the login route. */
export function sessionCookieFor(app: FastifyInstance, services: Services, userId: string): string {
  const { id } = services.sessions.create({ userId });
  const signed = app.signCookie(id);
  return `${SESSION_COOKIE}=${signed}`;
}

/** Log in via the API and return the Set-Cookie value to reuse on later requests. */
export async function loginCookie(
  app: FastifyInstance,
  username: string,
  password: string,
): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username, password },
  });
  const setCookie = res.headers['set-cookie'];
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (!raw) throw new Error(`login failed: ${res.statusCode} ${res.body}`);
  return raw.split(';')[0] as string;
}

/** Seed a file node with real bytes on disk (atomic write through Storage). */
export async function seedFile(
  services: Services,
  ownerId: string,
  parentId: string,
  name: string,
  content: Buffer,
  mimeType = 'application/octet-stream',
): Promise<NodeRow> {
  const { tmpPath, size } = await services.storage.writeStreamToTemp(ownerId, Readable.from(content));
  const { storagePath } = await services.storage.commitTemp(ownerId, tmpPath);
  return services.nodes.insertFileNode({
    ownerId,
    parentId,
    name,
    size,
    mimeType,
    storagePath,
    thumbStatus: 'none',
  });
}

/** The id of a user's root folder. */
export function rootId(services: Services, ownerId: string): string {
  return services.nodes.ensureRootNode(ownerId).id;
}

/**
 * Upload a file through the real `POST /api/files` route by building a
 * multipart/form-data body (fields before the file part, as the route expects).
 * Returns the raw inject response so callers can assert status + JSON.
 */
export function uploadFile(
  app: FastifyInstance,
  cookie: string,
  parentId: string,
  filename: string,
  buffer: Buffer,
  mimeType = 'application/octet-stream',
): Promise<LightMyRequestResponse> {
  const boundary = `----ftdrive${Math.random().toString(16).slice(2)}`;
  const head = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="parentId"\r\n\r\n${parentId}\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
      `Content-Type: ${mimeType}\r\n\r\n`,
    'utf8',
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  const payload = Buffer.concat([head, buffer, tail]);
  const opts: InjectOptions = {
    method: 'POST',
    url: '/api/files',
    headers: { cookie, 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload,
  };
  return app.inject(opts);
}

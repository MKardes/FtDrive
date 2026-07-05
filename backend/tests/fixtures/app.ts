import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../../src/app';
import type { AppConfig } from '../../src/config/index';
import type { Services, ServiceOverrides } from '../../src/services';
import type { NodeRow, UserRow } from '../../src/db/schema';
import { SESSION_COOKIE } from '../../src/auth/guard';
import type { BrowserProbeLike, BrowserProbeResult } from '../../src/modules/downloads/browser-probe';
import type { UrlGuardConfig } from '../../src/lib/url-guard';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A fake `yt-dlp` used by tests in place of the real binary (research.md §11 —
 * external tools are faked at the process boundary). It is a small executable
 * Node script implementing just the argument contract `extractor.ts` relies on;
 * see its header comment for the exact behavior it fakes.
 */
export const FAKE_YT_DLP_PATH = join(import.meta.dirname, 'fake-yt-dlp.mjs');

/**
 * A fake headless-browser fallback (research.md §11 — never launch a real
 * browser against a real address in tests). Defaults to "found nothing";
 * tests that specifically exercise the FR-019 fallback path can construct one
 * with `discoveredUrls` pre-seeded.
 */
export class FakeBrowserProbe implements BrowserProbeLike {
  constructor(private readonly discoveredUrls: string[] = []) {}
  discover(_url: string, _config: UrlGuardConfig, _timeoutMs: number): Promise<BrowserProbeResult> {
    return Promise.resolve({ discoveredUrls: this.discoveredUrls });
  }
}

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
    downloadsEnabled: true,
    ytDlpPath: FAKE_YT_DLP_PATH,
    downloadMaxConcurrencyPerUser: 5,
    downloadMaxBytes: 20 * 1024 * 1024 * 1024,
    downloadMaxDurationMs: 6 * 60 * 60 * 1000,
    downloadExamineTimeoutMs: 5_000,
    userStorageQuotaBytes: 0,
    downloadAllowPrivateAddresses: false,
    ...overrides,
  };
}

/** Build an isolated Fastify app on a temp data dir + temp SQLite file. */
export async function buildTestApp(
  overrides: Partial<AppConfig> = {},
  serviceOverrides: ServiceOverrides = {},
): Promise<TestApp> {
  const dir = mkdtempSync(join(tmpdir(), 'ftdrive-test-'));
  const config = makeTestConfig(dir, overrides);
  const { app, services } = await buildApp(config, { browserProbe: new FakeBrowserProbe(), ...serviceOverrides });
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

/** Poll `GET /downloads/:id` until it reaches a terminal state (test-only convenience). */
export async function pollUntilTerminal(
  app: FastifyInstance,
  cookie: string,
  id: string,
  timeoutMs = 10_000,
): Promise<{ status: string; [k: string]: unknown }> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await app.inject({ method: 'GET', url: `/api/downloads/${id}`, headers: { cookie } });
    const body = res.json() as { status: string; [k: string]: unknown };
    if (['completed', 'failed', 'canceled'].includes(body.status)) return body;
    if (Date.now() > deadline) {
      throw new Error(`download ${id} did not reach a terminal state in time (last: ${body.status})`);
    }
    await new Promise((r) => setTimeout(r, 50));
  }
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

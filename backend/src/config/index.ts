import { existsSync } from 'node:fs';
import { resolve, isAbsolute, join } from 'node:path';
import { z } from 'zod';

/**
 * Environment configuration, validated fail-fast at startup (research §14).
 * Secrets come only from the environment — never hard-coded or committed.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

const boolFromEnv = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())));

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATA_ROOT: z.string().default('./data'),
  DATABASE_PATH: z.string().optional(),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  TRUST_PROXY: boolFromEnv.default(false),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(5 * 1024 * 1024 * 1024),
  TRASH_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
  // Optional one-time owner bootstrap inputs (used by create-owner CLI).
  OWNER_BOOTSTRAP_USERNAME: z.string().optional(),
  OWNER_BOOTSTRAP_PASSWORD: z.string().optional(),

  // Download-from-web feature (002-url-video-download; research.md §10).
  DOWNLOADS_ENABLED: boolFromEnv.default(true),
  YT_DLP_PATH: z.string().default('yt-dlp'),
  DOWNLOAD_MAX_CONCURRENCY_PER_USER: z.coerce.number().int().positive().default(5),
  DOWNLOAD_MAX_BYTES: z.coerce.number().int().positive().default(20 * 1024 * 1024 * 1024),
  DOWNLOAD_MAX_DURATION_MS: z.coerce.number().int().positive().default(6 * 60 * 60 * 1000),
  DOWNLOAD_EXAMINE_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  USER_STORAGE_QUOTA_BYTES: z.coerce.number().int().nonnegative().default(0),
  DOWNLOAD_ALLOW_PRIVATE_ADDRESSES: boolFromEnv.default(false),
  // Embed-based movie sites (008-movie-site-downloads; research.md R8).
  DOWNLOAD_MAX_SOURCES: z.coerce.number().int().positive().default(5),
  DOWNLOAD_PLAYBACK_WAIT_MS: z.coerce.number().int().positive().default(8_000),
});

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  isProduction: boolean;
  host: string;
  port: number;
  dataRoot: string;
  databasePath: string;
  sessionSecret: string;
  trustProxy: boolean;
  maxUploadBytes: number;
  trashRetentionMs: number;
  sessionTtlMs: number;
  ownerBootstrap: { username?: string; password?: string };
  downloadsEnabled: boolean;
  ytDlpPath: string;
  downloadMaxConcurrencyPerUser: number;
  downloadMaxBytes: number;
  downloadMaxDurationMs: number;
  downloadExamineTimeoutMs: number;
  userStorageQuotaBytes: number;
  downloadAllowPrivateAddresses: boolean;
  downloadMaxSources: number;
  downloadPlaybackWaitMs: number;
}

/** Load and validate config from the process environment (and optional .env file). */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  maybeLoadDotEnv();

  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new Error(`Invalid configuration:\n${issues.join('\n')}`);
  }
  const e = parsed.data;

  const dataRoot = resolve(e.DATA_ROOT);
  const databasePath = e.DATABASE_PATH
    ? resolve(e.DATABASE_PATH)
    : join(dataRoot, 'ftdrive.db');

  return {
    nodeEnv: e.NODE_ENV,
    isProduction: e.NODE_ENV === 'production',
    host: e.HOST,
    port: e.PORT,
    dataRoot,
    databasePath: isAbsolute(databasePath) ? databasePath : resolve(databasePath),
    sessionSecret: e.SESSION_SECRET,
    trustProxy: e.TRUST_PROXY,
    maxUploadBytes: e.MAX_UPLOAD_BYTES,
    trashRetentionMs: e.TRASH_RETENTION_DAYS * DAY_MS,
    sessionTtlMs: e.SESSION_TTL_DAYS * DAY_MS,
    ownerBootstrap: {
      username: e.OWNER_BOOTSTRAP_USERNAME,
      password: e.OWNER_BOOTSTRAP_PASSWORD,
    },
    downloadsEnabled: e.DOWNLOADS_ENABLED,
    ytDlpPath: e.YT_DLP_PATH,
    downloadMaxConcurrencyPerUser: e.DOWNLOAD_MAX_CONCURRENCY_PER_USER,
    downloadMaxBytes: e.DOWNLOAD_MAX_BYTES,
    downloadMaxDurationMs: e.DOWNLOAD_MAX_DURATION_MS,
    downloadExamineTimeoutMs: e.DOWNLOAD_EXAMINE_TIMEOUT_MS,
    userStorageQuotaBytes: e.USER_STORAGE_QUOTA_BYTES,
    downloadAllowPrivateAddresses: e.DOWNLOAD_ALLOW_PRIVATE_ADDRESSES,
    downloadMaxSources: e.DOWNLOAD_MAX_SOURCES,
    downloadPlaybackWaitMs: e.DOWNLOAD_PLAYBACK_WAIT_MS,
  };
}

let dotEnvLoaded = false;
function maybeLoadDotEnv(): void {
  if (dotEnvLoaded) return;
  dotEnvLoaded = true;
  const path = resolve(process.cwd(), '.env');
  if (!existsSync(path)) return;
  try {
    // Node >= 20.12 / 22: load KEY=VALUE pairs without overriding already-set vars.
    process.loadEnvFile(path);
  } catch {
    // Ignore — environment may already be fully provided.
  }
}

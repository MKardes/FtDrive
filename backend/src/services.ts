import type { AppConfig } from './config/index';
import { createDb, type DbHandle, type DrizzleDb } from './db/client';
import { runMigrations } from './db/migrate';
import { SessionService } from './auth/sessions';
import { LoginThrottle } from './auth/throttle';
import { Storage } from './storage/index';
import { MediaService } from './media/index';
import pino from 'pino';
import { NodeRepository } from './modules/nodes/repository';
import { UserService } from './modules/users/service';
import { BrowserProbe, type BrowserProbeLike } from './modules/downloads/browser-probe';
import { Extractor } from './modules/downloads/extractor';
import { DownloadPipeline } from './modules/downloads/pipeline';
import { DownloadRepository } from './modules/downloads/repository';
import { DownloadService } from './modules/downloads/service';
import { DownloadWorkerPool } from './modules/downloads/worker';

/**
 * Application service container. Built once per running app (or per test
 * instance) and threaded explicitly into route registrars — no global state, so
 * tests get fully isolated instances.
 */
export interface Services {
  config: AppConfig;
  dbHandle: DbHandle;
  db: DrizzleDb;
  sessions: SessionService;
  throttle: LoginThrottle;
  storage: Storage;
  media: MediaService;
  nodes: NodeRepository;
  users: UserService;
  downloads: DownloadService;
  downloadWorker: DownloadWorkerPool;
}

/**
 * Test-only injection point: swap the real headless-Chromium fallback for a
 * fake (research.md §11 — external tools/browser/network are faked at the
 * process boundary in tests, never a real browser hitting a real address).
 */
export interface ServiceOverrides {
  browserProbe?: BrowserProbeLike;
}

export function createServices(config: AppConfig, overrides: ServiceOverrides = {}): Services {
  const dbHandle = createDb(config.databasePath);
  runMigrations(dbHandle.sqlite);
  const db = dbHandle.db;

  const storage = new Storage(config.dataRoot);
  const media = new MediaService(storage);
  const nodes = new NodeRepository(db);

  // Background logger for the download worker (it starts before/independent of
  // any HTTP request, so it can't reuse Fastify's per-request `app.log`).
  const backgroundLog = pino({ level: config.nodeEnv === 'test' ? 'silent' : config.isProduction ? 'info' : 'debug' });

  const downloadRepository = new DownloadRepository(db);
  // Startup reconciliation (research.md §3): any row left `examining`/`downloading` from a
  // crash is re-queued (its scratch temp is an orphan the existing temp sweep collects) or,
  // once retries are exhausted, failed as retryable. Runs once, here, so both production boot
  // and every test's `createServices` call get a consistent starting state.
  const RECONCILE_MAX_ATTEMPTS = 3;
  const reconciled = downloadRepository.reconcileInFlight(RECONCILE_MAX_ATTEMPTS);
  if (reconciled.requeued > 0 || reconciled.failed > 0) {
    backgroundLog.info({ event: 'downloads.reconciled', ...reconciled }, 'reconciled in-flight downloads at startup');
  }

  const extractor = new Extractor(config.ytDlpPath);
  const pipeline = new DownloadPipeline({
    extractor,
    browserProbe: overrides.browserProbe ?? new BrowserProbe(),
    storage,
    nodes,
    media,
    downloads: downloadRepository,
    config,
    log: backgroundLog,
  });
  const downloadWorker = new DownloadWorkerPool({
    repository: downloadRepository,
    pipeline,
    config,
    log: backgroundLog,
  });

  return {
    config,
    dbHandle,
    db,
    sessions: new SessionService(db, config.sessionTtlMs),
    throttle: new LoginThrottle(db),
    storage,
    media,
    nodes,
    users: new UserService(db, storage),
    downloads: new DownloadService({
      repository: downloadRepository,
      pipeline,
      extractor,
      nodes,
      worker: downloadWorker,
      config,
    }),
    downloadWorker,
  };
}

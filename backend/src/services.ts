import type { AppConfig } from './config/index';
import { createDb, type DbHandle, type DrizzleDb } from './db/client';
import { runMigrations } from './db/migrate';
import { SessionService } from './auth/sessions';
import { LoginThrottle } from './auth/throttle';
import { Storage } from './storage/index';
import { NodeRepository } from './modules/nodes/repository';
import { UserService } from './modules/users/service';

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
  nodes: NodeRepository;
  users: UserService;
}

export function createServices(config: AppConfig): Services {
  const dbHandle = createDb(config.databasePath);
  runMigrations(dbHandle.sqlite);
  const db = dbHandle.db;

  const storage = new Storage(config.dataRoot);
  return {
    config,
    dbHandle,
    db,
    sessions: new SessionService(db, config.sessionTtlMs),
    throttle: new LoginThrottle(db),
    storage,
    nodes: new NodeRepository(db),
    users: new UserService(db, storage),
  };
}

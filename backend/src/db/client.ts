import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

export type DrizzleDb = BetterSQLite3Database<typeof schema>;

export interface DbHandle {
  sqlite: Database.Database;
  db: DrizzleDb;
  close: () => void;
}

/**
 * Open the SQLite connection in WAL mode with foreign keys enforced
 * (research §4). WAL improves concurrent reads while a write proceeds.
 */
export function createDb(databasePath: string): DbHandle {
  if (databasePath !== ':memory:') {
    mkdirSync(dirname(databasePath), { recursive: true });
  }
  const sqlite = new Database(databasePath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.pragma('synchronous = NORMAL');

  const db = drizzle(sqlite, { schema });
  return {
    sqlite,
    db,
    close: () => sqlite.close(),
  };
}

import type Database from 'better-sqlite3';
import { migrations } from './migrations/index';

/**
 * Idempotent migration runner. Applies any migrations not yet recorded in the
 * `_migrations` table, each within a transaction. Safe to run repeatedly and on
 * every startup.
 */
export function runMigrations(sqlite: Database.Database): { applied: string[] } {
  sqlite.exec(
    `CREATE TABLE IF NOT EXISTS _migrations (id TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)`,
  );
  const has = sqlite.prepare<[string], { id: string }>('SELECT id FROM _migrations WHERE id = ?');
  const record = sqlite.prepare('INSERT INTO _migrations (id, applied_at) VALUES (?, ?)');

  const applied: string[] = [];
  for (const mig of migrations) {
    if (has.get(mig.id)) continue;
    const tx = sqlite.transaction(() => {
      for (const stmt of mig.statements) sqlite.exec(stmt);
      record.run(mig.id, Date.now());
    });
    tx();
    applied.push(mig.id);
  }
  return { applied };
}

/** CLI entrypoint: `npm run db:migrate`. */
async function main(): Promise<void> {
  const { loadConfig } = await import('../config/index');
  const { createDb } = await import('./client');
  const config = loadConfig();
  const handle = createDb(config.databasePath);
  try {
    const { applied } = runMigrations(handle.sqlite);
    if (applied.length === 0) {
      // eslint-disable-next-line no-console
      console.log('Database is up to date. No migrations applied.');
    } else {
      // eslint-disable-next-line no-console
      console.log(`Applied migrations: ${applied.join(', ')}`);
    }
  } finally {
    handle.close();
  }
}

// Run only when invoked directly (not when imported by the app).
if (process.argv[1] && /migrate(\.[cm]?[jt]s)?$/.test(process.argv[1])) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
}

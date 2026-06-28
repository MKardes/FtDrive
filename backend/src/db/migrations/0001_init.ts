import type { Migration } from './index';

/**
 * Initial schema (data-model.md). Hand-authored SQL kept in TypeScript so it is
 * bundle-safe (no external .sql file to locate at runtime) and data-preserving:
 * each migration is applied once and recorded in `_migrations`.
 */
export const m0001_init: Migration = {
  id: '0001_init',
  statements: [
    `CREATE TABLE users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      username_lower TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      status TEXT NOT NULL DEFAULT 'active',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE UNIQUE INDEX users_username_lower_unique ON users(username_lower)`,

    `CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      revoked_at INTEGER,
      user_agent TEXT,
      ip TEXT
    )`,
    `CREATE INDEX sessions_user_id_idx ON sessions(user_id)`,

    `CREATE TABLE nodes (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      parent_id TEXT REFERENCES nodes(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      size INTEGER,
      mime_type TEXT,
      storage_path TEXT,
      thumb_status TEXT NOT NULL DEFAULT 'none',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      trashed_at INTEGER,
      trashed_expires_at INTEGER,
      original_parent_id TEXT
    )`,
    `CREATE INDEX nodes_owner_parent_idx ON nodes(owner_id, parent_id)`,
    `CREATE INDEX nodes_owner_name_idx ON nodes(owner_id, name)`,
    `CREATE INDEX nodes_trashed_at_idx ON nodes(trashed_at)`,
    `CREATE UNIQUE INDEX nodes_owner_parent_name_live_unique
       ON nodes(owner_id, parent_id, name) WHERE trashed_at IS NULL`,

    `CREATE TABLE login_throttle (
      key TEXT PRIMARY KEY,
      failed_count INTEGER NOT NULL DEFAULT 0,
      first_failed_at INTEGER NOT NULL,
      blocked_until INTEGER
    )`,
  ],
};

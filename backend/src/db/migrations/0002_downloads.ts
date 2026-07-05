import type { Migration } from './index';

/**
 * Download-from-web feature (data-model.md). Append-only, data-preserving: adds
 * the `downloads` table only, no change to existing tables.
 */
export const m0002_downloads: Migration = {
  id: '0002_downloads',
  statements: [
    `CREATE TABLE downloads (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      source_url TEXT NOT NULL,
      destination_parent_id TEXT,
      selection TEXT,
      title TEXT,
      status TEXT NOT NULL DEFAULT 'queued',
      bytes_downloaded INTEGER NOT NULL DEFAULT 0,
      total_bytes INTEGER,
      node_id TEXT,
      error_code TEXT,
      error_message TEXT,
      attempt INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      started_at INTEGER,
      finished_at INTEGER
    )`,
    `CREATE INDEX downloads_owner_created_idx ON downloads(owner_id, created_at)`,
    `CREATE INDEX downloads_owner_status_idx ON downloads(owner_id, status)`,
    `CREATE INDEX downloads_status_created_idx ON downloads(status, created_at)`,
  ],
};

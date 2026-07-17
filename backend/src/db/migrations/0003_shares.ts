import type { Migration } from './index';

/**
 * Sharing feature (006-share-links; data-model.md). Append-only, data-preserving:
 * adds the `shares` table only, no change to existing tables. One row per grant;
 * revoke deletes the row, so revoked and never-existed are indistinguishable.
 */
export const m0003_shares: Migration = {
  id: '0003_shares',
  statements: [
    `CREATE TABLE shares (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      token TEXT,
      recipient_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER
    )`,
    `CREATE UNIQUE INDEX shares_token_unique ON shares(token)`,
    `CREATE UNIQUE INDEX shares_link_node_unique ON shares(node_id) WHERE kind = 'link'`,
    `CREATE UNIQUE INDEX shares_user_node_recipient_unique ON shares(node_id, recipient_id) WHERE kind = 'user'`,
    `CREATE INDEX shares_owner_idx ON shares(owner_id, created_at)`,
    `CREATE INDEX shares_recipient_idx ON shares(recipient_id)`,
    `CREATE INDEX shares_node_idx ON shares(node_id)`,
    `CREATE INDEX shares_expires_idx ON shares(expires_at)`,
  ],
};

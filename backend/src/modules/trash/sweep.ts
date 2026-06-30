import type { Services } from '../../services';

/**
 * Retention sweep (T065, FR-008/SC-009): permanently remove every trashed node
 * whose `trashed_expires_at` has passed, along with its blob + cached thumbnail.
 * System-level (all users) — invoked on startup and on a periodic timer. Returns
 * the number of nodes removed so the caller can log it.
 */
export async function runRetentionSweep(services: Services, now = Date.now()): Promise<number> {
  const expired = services.nodes.collectExpiredTrash(now);
  if (expired.length === 0) return 0;

  services.nodes.deleteByIds(expired.map((r) => r.id));

  // Best-effort on-disk cleanup after the rows are gone.
  for (const row of expired) {
    if (row.type !== 'file') continue;
    if (row.storagePath) await services.storage.removeBlob(row.ownerId, row.storagePath);
    await services.storage.removeThumb(row.ownerId, row.id);
  }
  return expired.length;
}

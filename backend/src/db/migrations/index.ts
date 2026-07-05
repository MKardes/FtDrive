import { m0001_init } from './0001_init';
import { m0002_downloads } from './0002_downloads';

export interface Migration {
  /** Stable ordered id, e.g. `0001_init`. */
  id: string;
  /** SQL statements applied in order within a single transaction. */
  statements: string[];
}

/** Ordered list of all migrations. Append new migrations; never edit applied ones. */
export const migrations: Migration[] = [m0001_init, m0002_downloads];

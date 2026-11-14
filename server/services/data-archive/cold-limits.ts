/**
 * B-DISK-FILE-TIERING amendment 4, increment 3b — the cold transfer limits, read from `data_lifecycle` by every caller
 * of `uploadColdFile` (the rotator, the memory-proof script, the context bridge's cold fallback). Never a literal
 * (plan r4 A-4): a missing, non-numeric or non-positive value refuses, exactly as the rotator's `reqNum` does — the
 * rows are seeded in the same migration that ships this module, so an absent row is a deploy fault, and it pages
 * (archival-health reads a started run with no DONE line as `incomplete`).
 */
import type pg from 'pg';
import type { ColdTransferLimits } from './storage-client.js';

export const COLD_LIMIT_KEYS = {
  setupMs: 'cold_upload_setup_ms',
  minBytesPerSec: 'cold_body_min_bytes_per_s',
} as const;

/** From a `data_lifecycle` constant map (the rotator already holds one). Throws naming the key. */
export function coldLimitsFromMap(map: Map<string, unknown>, who: string): ColdTransferLimits {
  const num = (key: string): number => {
    const v = map.get(key);
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
      throw new Error(`[${who}] missing or invalid numeric data_lifecycle.${key}`);
    }
    return v;
  };
  return { setupMs: num(COLD_LIMIT_KEYS.setupMs), minBytesPerSec: num(COLD_LIMIT_KEYS.minBytesPerSec) };
}

/** For a caller that holds only a client: reads the two rows and applies the same refusal. */
export async function loadColdLimits(client: pg.Client | pg.PoolClient, who: string): Promise<ColdTransferLimits> {
  const r = await client.query(
    `SELECT constant_name, value FROM module_constants
      WHERE module_name = 'data_lifecycle' AND constant_name = ANY($1::text[])`,
    [Object.values(COLD_LIMIT_KEYS)],
  );
  const map = new Map<string, unknown>();
  for (const row of r.rows) map.set(row.constant_name, row.value);
  return coldLimitsFromMap(map, who);
}

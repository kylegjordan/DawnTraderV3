/**
 * B-NAMES.1 (#298 xStock half, 2026-06-15) — one-time backfill of curated xStock
 * display names.
 *
 * Updates xstock_spot_universe rows whose `name` is still a TICKER-ECHO
 * (name == base ticker, e.g. PALL→'PALL') to the vetted name from
 * CURATED_XSTOCK_NAMES (shared/asset-classes.ts — the single source of truth).
 *
 * SURGICAL + IDEMPOTENT: the `WHERE name = split_part(symbol,'/',1)` guard only
 * overwrites ticker-echoes, never a real name; re-running after a row already
 * carries its curated name is a no-op (zero rows matched). Going forward the
 * daily discovery cron re-applies the same map via the discoverer fallback
 * chain, so this script is only needed to fix the rows that predate the fix.
 *
 * Run: `npm run b-names-1-backfill` (tsx). No build required.
 */
import 'dotenv/config';
import { db } from '../server/db.js';
import { sql } from 'drizzle-orm';
import { CURATED_XSTOCK_NAMES } from '../shared/asset-classes.js';

async function main(): Promise<void> {
  let updated = 0;
  for (const [pair, name] of Object.entries(CURATED_XSTOCK_NAMES)) {
    const res: any = await db.execute(sql`
      UPDATE xstock_spot_universe
      SET name = ${name}, updated_at = now()
      WHERE symbol = ${pair} AND name = split_part(symbol, '/', 1)
      RETURNING symbol
    `);
    const rows: any[] = res?.rows ?? res ?? [];
    if (Array.isArray(rows) && rows.length > 0) {
      updated += rows.length;
      console.log(`[B-NAMES.1] ${pair} -> "${name}"`);
    }
  }
  console.log(`[B-NAMES.1] backfill done — ${updated} ticker-echo row(s) updated to curated names`);
  process.exit(0);
}

main().catch((e) => {
  console.error('[B-NAMES.1] backfill failed:', e instanceof Error ? `${e.message}\n${e.stack}` : e);
  process.exit(1);
});

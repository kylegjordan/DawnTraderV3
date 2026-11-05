/**
 * R6a / C4 (B-XSTOCK-BAR-AVAILABILITY Step 9 re-run plan r4-r5, Langston-ruled): at the moment the
 * writer sees a statement timeout, record what every backend was doing — so the stall basis can be read
 * from the log instead of a snapshot taken by hand hours later.
 *
 * Best-effort and bounded, by construction:
 *   - a FRESH connection, never the pool (the pool is the suspect);
 *   - connect timeout 3 s, statement timeout 2 s on that connection;
 *   - fire-and-forget from the caller (`void`), with at most one snapshot per 60 s;
 *   - a FAILED capture holds the floor for 10 s only (Langston Step 4, attack 1): the database that stalls
 *     the writer is the one most likely to fail the 3 s connect, and a failure that consumed the full
 *     minute would leave the instrument mute through that stall having measured nothing;
 *   - a capture skipped by the floor writes ONE line saying so, so a stall with no snapshot line can be
 *     told apart from a stall that never asked for one;
 *   - every failure goes to `console.error`; nothing throws to the writer.
 * Reach, measured 2026-11-05 (re-derived by Langston): the app role holds `pg_read_all_stats`, so other
 * roles' client backends show query text and wait events; background processes show a wait event and no
 * query, which is their normal state. An autovacuum worker's visibility is expected, unproven.
 */
import pg from 'pg';

export const XSTOCK_SNAPSHOT_CONNECT_TIMEOUT_MS = 3_000;
export const XSTOCK_SNAPSHOT_STATEMENT_TIMEOUT_MS = 2_000;
export const XSTOCK_SNAPSHOT_MIN_INTERVAL_MS = 60_000;
export const XSTOCK_SNAPSHOT_RETRY_AFTER_FAILURE_MS = 10_000;

/** The earliest time the next capture may run. Set to +60 s when an attempt starts (so two concurrent
 *  timeouts take one snapshot), and pulled back to +10 s when that attempt fails. */
let nextAllowedAt = 0;
let lastAttemptAt: number | null = null;

type ClientFactory = () => Pick<pg.Client, 'connect' | 'query' | 'end'>;

const defaultFactory: ClientFactory = () => new pg.Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: XSTOCK_SNAPSHOT_CONNECT_TIMEOUT_MS,
  statement_timeout: XSTOCK_SNAPSHOT_STATEMENT_TIMEOUT_MS,
  query_timeout: XSTOCK_SNAPSHOT_STATEMENT_TIMEOUT_MS + 500,
  application_name: 'dawntrader_xstock_snapshot',
});

const SNAPSHOT_SQL = `
  SELECT pid, usename, application_name, backend_type, state, wait_event_type, wait_event,
         round(extract(epoch FROM (now() - xact_start)) * 1000)::bigint AS xact_age_ms,
         round(extract(epoch FROM (now() - state_change)) * 1000)::bigint AS state_age_ms,
         left(translate(query, E'\\n\\t', '  '), 160) AS query_head
  FROM pg_stat_activity
  WHERE pid <> pg_backend_pid() AND datname = current_database()
  ORDER BY xact_start NULLS LAST
  LIMIT 60`;

/**
 * Take one snapshot and write it to stderr. Returns whether a snapshot line was written (for tests).
 * Call it with `void` from the writer; it never throws.
 */
export async function captureXstockDbSnapshot(
  reason: string,
  factory: ClientFactory = defaultFactory,
  now: number = Date.now(),
): Promise<boolean> {
  if (now < nextAllowedAt) {
    console.error(`[B-XSTOCK-BAR-AVAILABILITY][DB_SNAPSHOT] skipped (${reason}): rate floor, `
      + `${lastAttemptAt === null ? 'no prior attempt' : `${now - lastAttemptAt} ms since the last attempt`}, `
      + `next allowed in ${nextAllowedAt - now} ms`);
    return false;
  }
  lastAttemptAt = now;
  nextAllowedAt = now + XSTOCK_SNAPSHOT_MIN_INTERVAL_MS;
  let client: ReturnType<ClientFactory> | null = null;
  try {
    client = factory();
    await client.connect();
    const result = await client.query(SNAPSHOT_SQL);
    console.error(`[B-XSTOCK-BAR-AVAILABILITY][DB_SNAPSHOT] ${JSON.stringify({
      reason,
      takenAt: new Date(now).toISOString(),
      backends: result.rows,
    })}`);
    return true;
  } catch (error) {
    // A failed capture does not consume the minute: allow a retry after 10 s.
    nextAllowedAt = now + XSTOCK_SNAPSHOT_RETRY_AFTER_FAILURE_MS;
    console.error(`[B-XSTOCK-BAR-AVAILABILITY][DB_SNAPSHOT] not taken (${reason}):`,
      error instanceof Error ? error.message : error);
    return false;
  } finally {
    if (client) {
      try { await client.end(); } catch { /* a closing failure never reaches the writer */ }
    }
  }
}

/** Test seam. */
export function __resetXstockSnapshotForTests(): void {
  nextAllowedAt = 0;
  lastAttemptAt = null;
}

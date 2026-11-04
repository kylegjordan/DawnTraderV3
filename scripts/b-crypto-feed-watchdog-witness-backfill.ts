/**
 * B-CRYPTO-FEED-WATCHDOG (#1232, P8) — ONE-OFF: stamp WHEN each past close's ticker witness was captured.
 *
 * Population: every closed_trades row (any mode) with asset_class = 'crypto_spot', a stored witness
 * (exit_ticker_bid AND exit_ticker_ask NOT NULL), closed on/after 2026-08-27 (#911, when the witness was wired),
 * and exit_ticker_age_basis still NULL (so a re-run touches nothing it already wrote — idempotent).
 * Match: the newest crypto_spot_ticker_snap row for the same symbol with bid = exit_ticker_bid AND ask =
 * exit_ticker_ask AND captured_at <= closed_at (bounded to 45 days before the close).
 *   ⛔ EXACT numeric equality, never rounded (Langston Step-2 record item): the trade columns are numeric(20,10),
 *   the recorder's numeric(20,8); 8 → 10 is a lossless widening and Postgres `numeric =` compares values.
 * Writes ONLY exit_ticker_captured_at and exit_ticker_age_basis: `backfill_matched` with the time, or
 * `underivable` with NULL — never a guess. Read-only on the recorder table.
 * RUN BEFORE 2026-11-20 (pre-audit A8: the October recorder partition is tiered to warm from 2026-12-01).
 *
 * Usage (staging, as deploy, from the app directory):
 *   npx tsx scripts/b-crypto-feed-watchdog-witness-backfill.ts            # DRY RUN: counts + the stale list, writes nothing
 *   npx tsx scripts/b-crypto-feed-watchdog-witness-backfill.ts --apply    # one transaction
 */
import 'dotenv/config';
import pg from 'pg';

/** The witness-age ceiling the close gate uses (close_fill_contract.witness_max_age_ms, crypto); flagged = older, or underivable. */
const STALE_FLAG_MS = 21_600_000;

const MATCH_CTE = `
WITH pop AS (
  SELECT id, symbol, closed_at, exit_ticker_bid, exit_ticker_ask
  FROM closed_trades
  WHERE asset_class = 'crypto_spot'
    AND exit_ticker_bid IS NOT NULL AND exit_ticker_ask IS NOT NULL
    AND closed_at >= '2026-08-27'
    AND exit_ticker_age_basis IS NULL
),
m AS (
  SELECT pop.id, pop.symbol, pop.closed_at,
    (SELECT max(s.captured_at) FROM crypto_spot_ticker_snap s
      WHERE s.symbol = pop.symbol
        AND s.bid = pop.exit_ticker_bid AND s.ask = pop.exit_ticker_ask
        AND s.captured_at <= pop.closed_at
        AND s.captured_at >= pop.closed_at - interval '45 days') AS captured_at
  FROM pop
)`;

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("SET statement_timeout = '900s'");
    const summary = await client.query(`${MATCH_CTE}
      SELECT count(*)::int AS population,
        count(captured_at)::int AS matched,
        (count(*) - count(captured_at))::int AS underivable,
        count(*) FILTER (WHERE captured_at IS NOT NULL AND closed_at - captured_at > make_interval(secs => $1 / 1000.0))::int AS older_than_ceiling
      FROM m`, [STALE_FLAG_MS]);
    console.log('[B-CRYPTO-FEED-WATCHDOG][BACKFILL] summary', JSON.stringify(summary.rows[0]));
    const stale = await client.query(`${MATCH_CTE}
      SELECT id, symbol, closed_at, captured_at, round(EXTRACT(EPOCH FROM closed_at - captured_at)::numeric / 3600, 2) AS age_h
      FROM m WHERE captured_at IS NULL OR closed_at - captured_at > make_interval(secs => $1 / 1000.0)
      ORDER BY closed_at`, [STALE_FLAG_MS]);
    console.log(`[B-CRYPTO-FEED-WATCHDOG][BACKFILL] flagged (older than ${STALE_FLAG_MS / 3_600_000} h, or underivable): ${stale.rowCount}`);
    for (const r of stale.rows) {
      console.log(`  ${r.id} ${r.symbol} closed=${new Date(r.closed_at).toISOString()} witness=${r.captured_at ? new Date(r.captured_at).toISOString() : 'UNDERIVABLE'} age_h=${r.age_h ?? '-'}`);
    }
    if (!apply) {
      console.log('[B-CRYPTO-FEED-WATCHDOG][BACKFILL] DRY RUN — nothing written. Re-run with --apply.');
      return;
    }
    await client.query('BEGIN');
    const upd = await client.query(`${MATCH_CTE}
      UPDATE closed_trades ct
         SET exit_ticker_captured_at = m.captured_at,
             exit_ticker_age_basis = CASE WHEN m.captured_at IS NULL THEN 'underivable' ELSE 'backfill_matched' END
        FROM m
       WHERE ct.id = m.id AND ct.exit_ticker_age_basis IS NULL`);
    await client.query('COMMIT');
    console.log(`[B-CRYPTO-FEED-WATCHDOG][BACKFILL] APPLIED — ${upd.rowCount} rows stamped`);
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* not in a transaction */ }
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('[B-CRYPTO-FEED-WATCHDOG][BACKFILL] FAILED:', err);
  process.exit(1);
});

/**
 * B-BALANCE-TRUTH / #618 — fence: the JS-side "ghost trade" guard must stay REDUNDANT
 * against the shared SQL predicate, so the display aggregates and the list readers keep
 * answering over the SAME population.
 *
 * WHAT THIS FENCES. Four call sites in `routes.ts` read closed trades through
 * `getClosedTrades()` and then filter the result AGAIN in JavaScript, keeping only rows with
 * `exit_price > 0` and a non-empty `close_reason` (the Phase 8.8.3-B3 ghost-trade exclusion).
 * The Step-C aggregates (`getRealizedPnlTotal`, `getRealizedPnlSince`, `getDailyRealizedPnlSince`,
 * `getRecentClosedPnls`) carry NO such clause — they share three predicates only: `closed_at IS
 * NOT NULL`, the window, and `close_reason IS DISTINCT FROM 'never_filled'`.
 *
 * Converting a site from the list reader to an aggregate is therefore population-neutral ONLY
 * while the ghost clause is redundant. MEASURED over the whole table on 2026-08-21: all 86 rows
 * the ghost clause would drop ARE the `never_filled` rows the SQL already excludes, and ZERO
 * survive that exclusion. So the clause is redundant TODAY — empirically, not structurally.
 *
 * ★ WHY A FENCE AND NOT A COMMENT. "Redundant today" decays silently. A future close path that
 * writes `closed_at` without an `exit_price` (a cancel, a liquidation, a partial-fill unwind)
 * creates a row the aggregates COUNT and the surviving JS filters DROP — two figures on one page
 * disagreeing, with no error anywhere. That is the same invisible-divergence class as #618 itself.
 * This fence fails the moment such a row appears, and names it.
 *
 * ★ THE POSITIVE CONTROL IS THE POINT (rule 29(b) — prove the instrument before its silence is
 * evidence). The main assertion is an expected ZERO, and a zero from a broken query is
 * indistinguishable from a zero from clean data. So the same ghost clause is run a second time
 * WITHOUT the `never_filled` exclusion, where it MUST return rows. If the control returns 0 the
 * instrument is wrong, not the data, and the fence says so instead of passing.
 *
 * READ-ONLY: two SELECTs, no seeding.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '../../db.js';
import { sql } from 'drizzle-orm';

const TAG = 'B-BALANCE-TRUTH-GHOST-REDUNDANCY-FENCE';
// CI provisions Postgres and migrates before this suite, so an unreachable DB there is a real
// regression and hard-fails. Locally it reports SKIPPED — never PASSED, which is #704's shape.
const IS_CI = !!process.env.CI;
let dbReachable = true;

beforeAll(async () => {
  try {
    await db.execute(sql`SELECT 1`);
  } catch (err) {
    if (IS_CI) {
      throw new Error(
        `[${TAG}] Postgres unreachable in CI — this fence asserts an expected ZERO, so without a ` +
        `database a green result would be a false all-clear. Original: ${err instanceof Error ? err.message : err}`,
      );
    }
    dbReachable = false;
    console.warn(`[${TAG}] Postgres unreachable — DB legs will report as SKIPPED (not passed).`);
  }
});

// The ghost clause exactly as the surviving routes.ts call sites express it in JS.
const GHOST = sql`(exit_price IS NULL OR exit_price::numeric <= 0
                   OR close_reason IS NULL OR btrim(close_reason) = '')`;

describe(TAG, () => {
  // ctx.skip() and NOT it.skipIf(): skipIf evaluates at COLLECTION time, before beforeAll has
  // probed the database, so it would read the initial `true` and run anyway.
  it('POSITIVE CONTROL: the ghost clause fires on rows that exist (else the zero below is meaningless)', async (ctx) => {
    if (!dbReachable) ctx.skip();
    const res: any = await db.execute(sql`
      SELECT count(*)::int AS n FROM closed_trades
       WHERE closed_at IS NOT NULL AND ${GHOST}`);
    const n = Number((res.rows ?? res)[0]?.n ?? 0);
    expect(
      n,
      `[${TAG}] the ghost clause matched NOTHING anywhere in closed_trades. That makes the ` +
      `redundancy assertion vacuous — it would pass against a broken query just as happily as ` +
      `against clean data. Fix the instrument before trusting its silence.`,
    ).toBeGreaterThan(0);
  });

  it('is REDUNDANT: no row survives the never_filled exclusion and still looks like a ghost', async (ctx) => {
    if (!dbReachable) ctx.skip();
    const res: any = await db.execute(sql`
      SELECT count(*)::int AS n FROM closed_trades
       WHERE closed_at IS NOT NULL
         AND close_reason IS DISTINCT FROM 'never_filled'
         AND ${GHOST}`);
    const n = Number((res.rows ?? res)[0]?.n ?? 0);
    expect(
      n,
      `[${TAG}] ${n} closed trade(s) are NOT never_filled, DO have a close time, and yet carry no ` +
      `usable exit price or close reason. The ghost guard is no longer redundant: the Step-C SQL ` +
      `aggregates now COUNT these rows while the surviving JS filters in routes.ts DROP them, so ` +
      `two figures on the same page disagree with no error raised. Either fold the ghost clause ` +
      `into the shared predicate family-wide and re-measure every converted site, or fix the close ` +
      `path that produced a closed row with no exit price. Do NOT relax this fence.`,
    ).toBe(0);
  });
});

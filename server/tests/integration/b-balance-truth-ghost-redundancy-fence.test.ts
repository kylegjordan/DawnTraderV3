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
 * indistinguishable from a zero from clean data. So the clause is ALSO run over a synthetic
 * rowset built to contain exactly three ghosts; if it does not find three, the predicate is
 * wrong and the fence says so instead of passing.
 * ⚠️ The control deliberately does NOT source its rows from `closed_trades`. The first version
 * did, which made it a claim about the database's POPULATION rather than about the predicate —
 * it passed on staging (86 matching rows) and failed in CI, whose freshly-migrated table is
 * empty. An empty table is not a broken instrument, and conflating the two makes the fence
 * unrunnable exactly where it is supposed to run.
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
// ★ THE SINGLE EXPRESSION OF THE CLAUSE, and it is INTERPOLATED INTO BOTH QUERIES BELOW --
// Langston Step-4 condition, 2026-08-21. The first version declared this const and then inlined
// a copy of the predicate into each test, so the file held THREE expressions of one clause and
// the one that read as the source of truth was dead. Editing it would have changed nothing while
// looking like it changed everything, and both assertions would have gone on testing the old
// clause silently. That is the exact divergence class this fence exists to catch, reproduced
// inside the fence. Unqualified column names resolve against the synthetic VALUES alias and
// against closed_trades alike, so one expression genuinely serves both.
const GHOST = sql`(exit_price IS NULL OR exit_price::numeric <= 0
                   OR close_reason IS NULL OR btrim(close_reason) = '')`;

describe(TAG, () => {
  // ctx.skip() and NOT it.skipIf(): skipIf evaluates at COLLECTION time, before beforeAll has
  // probed the database, so it would read the initial `true` and run anyway.
  // ★ THE POSITIVE CONTROL RUNS AGAINST A SYNTHETIC ROWSET, NOT AGAINST AMBIENT TABLE DATA,
  // and the first version of this fence got that wrong and CI caught it (run 32427686111).
  // Sourcing the control from `closed_trades` made it a claim about THIS DATABASE'S POPULATION:
  // it passed against staging's 86 matching rows and FAILED against CI's freshly-migrated empty
  // table, where the clause can match nothing because there is nothing to match. An empty table
  // is not a broken instrument. Proving the clause on rows constructed HERE separates the two
  // questions cleanly -- "does the predicate classify correctly?" (asked of synthetic rows, true
  // on every database) from "does any real row trip it?" (asked of the table, below).
  it('POSITIVE CONTROL: the ghost clause classifies known rows correctly (proves the instrument, no writes)', async (ctx) => {
    if (!dbReachable) ctx.skip();
    // Four rows built to exercise each limb: a clean trade, a null exit price, a zero exit
    // price, and a blank close reason. Exactly three are ghosts.
    const res: any = await db.execute(sql`
      SELECT count(*)::int AS n FROM (VALUES
        ('100.5'::numeric, 'take_profit'),
        (NULL::numeric,    'take_profit'),
        ('0'::numeric,     'stop_loss'),
        ('100.5'::numeric, '   ')
      ) AS t(exit_price, close_reason)
      WHERE ${GHOST}`);
    const n = Number((res.rows ?? res)[0]?.n ?? 0);
    expect(
      n,
      `[${TAG}] the ghost clause misclassified a synthetic rowset built to contain exactly 3 ` +
      `ghosts and 1 clean trade. The predicate itself is wrong, so nothing below can be trusted.`,
    ).toBe(3);
  });

  it('is REDUNDANT: no real row survives the never_filled exclusion and still looks like a ghost', async (ctx) => {
    if (!dbReachable) ctx.skip();
    // Population is NAMED, not implied (rule 29): the total row count is reported alongside the
    // ghost count, so a zero read against an empty table is legible as "nothing to examine"
    // rather than as "examined everything and found nothing wrong". CI's test database is
    // legitimately empty; staging's is not. The predicate's correctness does not depend on
    // either -- the synthetic control above establishes that independently.
    const res: any = await db.execute(sql`
      SELECT
        count(*) FILTER (
          WHERE closed_at IS NOT NULL
            AND close_reason IS DISTINCT FROM 'never_filled'
            AND ${GHOST}
        )::int AS ghosts,
        count(*)::int AS total
      FROM closed_trades`);
    const row = (res.rows ?? res)[0] ?? {};
    const ghosts = Number(row.ghosts ?? 0);
    const total = Number(row.total ?? 0);
    expect(
      ghosts,
      `[${TAG}] ${ghosts} of ${total} closed trade(s) are NOT never_filled, DO have a close time, ` +
      `and yet carry no usable exit price or close reason. The ghost guard is no longer redundant: ` +
      `the Step-C SQL aggregates now COUNT these rows while the surviving JS filters in routes.ts ` +
      `DROP them, so two figures on the same page disagree with no error raised. Either fold the ` +
      `ghost clause into the shared predicate family-wide and re-measure every converted site, or ` +
      `fix the close path that produced a closed row with no exit price. Do NOT relax this fence.`,
    ).toBe(0);
    console.log(`[${TAG}] examined ${total} row(s) in closed_trades; ${ghosts} genuine ghost(s).`);
  });
});

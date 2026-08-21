/**
 * B-BALANCE-TRUTH / #618 — fence: `pnl` and `net_pnl` must keep agreeing, because six readers
 * express the profit basis as `netPnl ?? pnl` and the rest of the system sums `pnl`.
 *
 * WHY THIS EXISTS. Langston's Step-4 condition 2 held that the profit basis must not move on
 * some sites and not others, or the kill-switch ratio becomes incoherent. Six readers express it
 * as `netPnl ?? pnl`; everything else sums `pnl`. While the two columns agree, that split is
 * harmless. This fence is what makes "while" checkable.
 *
 * *** RETRACTED, AND THE RETRACTION IS THE MOST USEFUL THING IN THIS FILE. An earlier version of
 * this comment claimed the two columns are equal "BY CONSTRUCTION", citing the schema line
 * `netPnl: decimal("net_pnl", ...).default("0"), // gross_pnl - total_cost`. THAT IS A COMMENT,
 * NOT A MECHANISM. `generatedAlwaysAs` appears nowhere in the tree; nothing computes one column
 * from the other. `createClosedTrade` (storage.ts:3087) normalizes the symbol and passes
 * everything else straight through. Equality is a PROPERTY OF THE WRITERS, and they are not
 * symmetric: the engine's open-insert writes NEITHER column and equality is established later by
 * the close update, while the stranded-clear writer (routes.ts:12975) writes `pnl` only and lets
 * `net_pnl` fall to its '0' default. The honest citation is routes.ts:12854 --
 * `pnl: netPnl.toString()` -- the SAME variable, so THAT writer cannot diverge. Cite the writer,
 * never the schema comment. (Langston, 2026-08-21.)
 *
 * *** AND THE FIRST VERSION OF THIS FENCE ASSERTED AN UNREADABLE ZERO. It counted disagreements
 * over `closed_at IS NOT NULL AND close_reason IS DISTINCT FROM 'never_filled'` and got 0 -- but
 * MEASURED over the whole table, 90 of 581 rows disagree, and EVERY ONE of them is excluded by
 * that very predicate: 86 are `never_filled`, and the other 4 have `close_reason IS NULL` with
 * `closed_at` also NULL. The population could not contain a disagreeing row, so the zero was
 * STRUCTURALLY GUARANTEED rather than measured clean. A zero from a population that cannot hold a
 * one is not evidence. Both fixes below follow from that:
 *   (a) the control now exercises the FULL query -- population predicate AND comparison -- so it
 *       proves the population would ADMIT an in-scope disagreement, not merely that `IS DISTINCT
 *       FROM` works; and
 *   (b) the assertion reports the excluded rows alongside the included ones, so a reader can see
 *       what the zero is a zero OVER.
 *
 * READ-ONLY: two SELECTs, no seeding.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '../../db.js';
import { sql } from 'drizzle-orm';

const TAG = 'B-BALANCE-TRUTH-PNL-BASIS-FENCE';
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

// The single expression of "these two disagree", interpolated into BOTH queries below.
const DISAGREE = sql`(pnl IS DISTINCT FROM net_pnl)`;
// The population any real reader actually sums. Stated ONCE and shared, so the control below
// exercises the SAME filter the assertion does -- a control that skips the population predicate
// is what made the previous version vacuous.
const IN_SCOPE = sql`(closed_at IS NOT NULL AND close_reason IS DISTINCT FROM 'never_filled')`;

describe(TAG, () => {
  // ctx.skip() and NOT it.skipIf(): skipIf evaluates at COLLECTION time, before beforeAll has
  // probed the database, so it would read the initial `true` and run anyway.
  it('POSITIVE CONTROL: the FULL query (population + comparison) catches an in-scope disagreement', async (ctx) => {
    if (!dbReachable) ctx.skip();
    // Five synthetic rows. Only ONE is both in-scope and disagreeing, and the other four are the
    // shapes that must NOT be counted: an in-scope agreement, a never_filled disagreement, a
    // null-close_reason disagreement with no close time, and an out-of-scope agreement. If the
    // query returns anything other than exactly 1, either the comparison or the population filter
    // is wrong -- and the previous version of this fence could not have told the difference.
    const res: any = await db.execute(sql`
      SELECT count(*)::int AS n FROM (VALUES
        (now(),      'take_profit',   '10.00'::numeric, '9.99'::numeric),   -- in scope, DISAGREES  <- the only hit
        (now(),      'take_profit',   '10.00'::numeric, '10.00'::numeric),  -- in scope, agrees
        (now(),      'never_filled',  NULL::numeric,    '0.00'::numeric),   -- disagrees, excluded by close_reason
        (NULL::timestamptz, NULL,     NULL::numeric,    '0.00'::numeric),   -- disagrees, excluded by closed_at
        (NULL::timestamptz, 'manual', '5.00'::numeric,  '5.00'::numeric)    -- out of scope, agrees
      ) AS t(closed_at, close_reason, pnl, net_pnl)
      WHERE ${IN_SCOPE} AND ${DISAGREE}`);
    const n = Number((res.rows ?? res)[0]?.n ?? 0);
    expect(
      n,
      `[${TAG}] the full query returned ${n} over a synthetic set built to contain EXACTLY ONE ` +
      `in-scope disagreement. Either the comparison or the population filter is wrong, and the ` +
      `zero asserted below would be meaningless.`,
    ).toBe(1);
  });

  it('no row that any reader sums has pnl <> net_pnl (zero reported against what it excludes)', async (ctx) => {
    if (!dbReachable) ctx.skip();
    const res: any = await db.execute(sql`
      SELECT count(*) FILTER (WHERE ${IN_SCOPE} AND ${DISAGREE})::int AS in_scope_disagreeing,
             count(*) FILTER (WHERE ${IN_SCOPE})::int                 AS in_scope_total,
             count(*) FILTER (WHERE ${DISAGREE})::int                 AS disagreeing_anywhere,
             count(*)::int                                            AS table_total
        FROM closed_trades`);
    const r = (res.rows ?? res)[0] ?? {};
    const bad = Number(r.in_scope_disagreeing ?? 0);
    const scope = Number(r.in_scope_total ?? 0);
    const anywhere = Number(r.disagreeing_anywhere ?? 0);
    const total = Number(r.table_total ?? 0);
    // The zero is reported WITH what it excludes, so nobody has to re-derive whether it is
    // readable. `disagreeing_anywhere` is expected to be non-zero and is NOT a failure: those
    // rows are never_filled or have no close time, and no reader sums them.
    console.log(`[${TAG}] in-scope ${scope}/${total} rows; ${bad} in-scope disagreement(s); ` +
                `${anywhere} disagreement(s) anywhere in the table (excluded by design).`);
    expect(
      bad,
      `[${TAG}] ${bad} of ${scope} in-scope closed trade(s) have pnl <> net_pnl (${anywhere} of ` +
      `${total} disagree table-wide, most of which are excluded by design). The six readers ` +
      `expressing the basis as \`netPnl ?? pnl\` have now DIVERGED from every reader that sums ` +
      `\`pnl\` -- including the kill-switch denominator. Nothing throws; two figures on one page ` +
      `simply disagree. Either move the basis on ALL sites in ONE batch (Langston's condition 2) ` +
      `or fix the writer that let the two columns drift. Do NOT relax this fence.`,
    ).toBe(0);
  });
});

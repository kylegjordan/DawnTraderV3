/**
 * B-BALANCE-TRUTH / #618 — fence: `pnl` and `net_pnl` must keep agreeing, because six readers
 * express the profit basis as `netPnl ?? pnl` and the rest of the system sums `pnl`.
 *
 * WHY THIS EXISTS. Langston's Step-4 condition 2 held that the basis must not move on some sites
 * and not others, or the kill-switch ratio becomes incoherent. Settling that question turned out
 * to need the schema, not the data: `net_pnl` is DECLARED (shared/schema.ts) as
 * `gross_pnl − total_cost`, and `total_cost` as `entry_fee + exit_fee + entry_slippage +
 * exit_slippage`. `pnl` carries the same value. So the two are equal BY CONSTRUCTION rather than
 * by coincidence — both are the after-all-costs figure — and `netPnl ?? pnl` is a distinction
 * with no difference.
 *
 * ★ BUT A CONSTRUCTION CAN CHANGE, AND THAT IS THE WHOLE POINT OF FENCING IT. If a future close
 * path writes one column and not the other, or starts deriving them differently, the six
 * `netPnl ?? pnl` readers silently diverge from every `pnl` reader — including the kill-switch
 * denominator. Nothing would throw. Two figures on one page would simply disagree. "Equal today"
 * with no assertion is exactly how the redundant ghost-trade guard got into four call sites and
 * stayed there unexamined.
 *
 * ⚠️ THIS FENCE EXISTS BECAUSE I GOT THE COLUMN WRONG ONCE ALREADY. I first tested the cost
 * identity against `total_fee` — fees only, no slippage — and reported a 184-row "broken fee era"
 * that does not exist (#735, WITHDRAWN same day). Against `total_cost`, the column the value is
 * actually derived from, all rows reconcile exactly. The lesson is in the assertion below: it
 * names the columns it compares and the population it compares them over, so a future reader can
 * see WHICH identity is being asserted rather than inferring it.
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
// Declared once and USED — a const that reads as the source of truth while each test inlines its
// own copy is the divergence this batch exists to delete (Langston, on this fence's sibling).
const DISAGREE = sql`(pnl IS DISTINCT FROM net_pnl)`;

describe(TAG, () => {
  // ctx.skip() and NOT it.skipIf(): skipIf evaluates at COLLECTION time, before beforeAll has
  // probed the database, so it would read the initial `true` and run anyway.
  it('POSITIVE CONTROL: the comparison detects a known disagreement (proves the instrument, no writes)', async (ctx) => {
    if (!dbReachable) ctx.skip();
    // Four synthetic rows: two agreeing, one differing by a cent, one where net is absent.
    // Exactly two disagree. Sourced HERE and not from closed_trades on purpose — a control drawn
    // from the table is a claim about THIS DATABASE'S POPULATION, not about the comparison, and
    // that mistake made this fence's sibling pass on staging and fail on CI's empty table.
    const res: any = await db.execute(sql`
      SELECT count(*)::int AS n FROM (VALUES
        ('10.00'::numeric, '10.00'::numeric),
        ('-4.25'::numeric, '-4.25'::numeric),
        ('10.00'::numeric, '9.99'::numeric),
        ('10.00'::numeric, NULL::numeric)
      ) AS t(pnl, net_pnl)
      WHERE ${DISAGREE}`);
    const n = Number((res.rows ?? res)[0]?.n ?? 0);
    expect(
      n,
      `[${TAG}] the comparison misclassified a synthetic rowset built to contain exactly 2 ` +
      `disagreements. The predicate itself is wrong, so the zero below means nothing.`,
    ).toBe(2);
  });

  it('the two profit columns agree on every closed trade', async (ctx) => {
    if (!dbReachable) ctx.skip();
    // Population NAMED alongside the count (rule 29): a zero against an empty table is legible as
    // "nothing to examine" rather than "examined everything and found nothing wrong".
    const res: any = await db.execute(sql`
      SELECT count(*) FILTER (WHERE ${DISAGREE})::int AS disagreeing,
             count(*)::int AS total
        FROM closed_trades
       WHERE closed_at IS NOT NULL AND close_reason IS DISTINCT FROM 'never_filled'`);
    const row = (res.rows ?? res)[0] ?? {};
    const disagreeing = Number(row.disagreeing ?? 0);
    const total = Number(row.total ?? 0);
    expect(
      disagreeing,
      `[${TAG}] ${disagreeing} of ${total} closed trade(s) have pnl <> net_pnl. The six readers ` +
      `expressing the basis as \`netPnl ?? pnl\` (routes.ts balance-curve + analytics, and four in ` +
      `dashboard-metrics.ts) have now DIVERGED from every reader that sums \`pnl\` — including the ` +
      `kill-switch denominator. Nothing throws; two figures on the same page simply disagree. ` +
      `Either move the basis on ALL sites in ONE batch (Langston's condition 2) or fix the close ` +
      `path that wrote the two columns differently. Do NOT relax this fence.`,
    ).toBe(0);
    console.log(`[${TAG}] examined ${total} closed trade(s); ${disagreeing} disagreement(s).`);
  });
});

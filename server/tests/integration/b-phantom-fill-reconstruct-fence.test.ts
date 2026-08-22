/**
 * B-PHANTOM-FILL-RECONSTRUCT (#507 follow-on) — fence: the reconstruction must ADD a reading,
 * never REPLACE one, and the two places that express "the honest P&L" must not drift apart.
 *
 * WHY THIS EXISTS. Kyle's decision was two-sided, and the two sides pull against each other:
 * "flag and remove from our accounts, but we don't delete these trades" AND "we can replace the
 * phantom exits with real market prices if we have them". The only shape satisfying both is a
 * reconstruction written BESIDE the original, with every money figure preferring it. That leaves
 * two things a future edit can silently break, and this file is what makes them checkable:
 *
 *   (1) SOMETHING REWRITES THE ORIGINAL IN PLACE. Langston's condition: "rewriting buries the
 *       distinction between recorded and reconstructed, and if a better reconstruction lands
 *       later you have to un-rewrite." An in-place rewrite leaves NO error and NO failing test —
 *       the row simply reads better than it was.
 *   (2) THE TWO EXPRESSIONS DRIFT. `DatabaseStorage.HONEST_PNL` (SQL) and `honestNetPnl()` (JS)
 *       compute the same quantity for different callers. "The same number derived two ways in
 *       two places" is the exact failure this whole arc documents, so it is fenced, not trusted.
 *
 * ★ THE OVERWRITE LEG IS INDIRECT ON PURPOSE, AND THAT IS THE INTERESTING PART. There is no
 * before-snapshot to diff against, so "was `pnl` overwritten?" is not directly observable after
 * the fact. What IS observable is a relation the recorded columns satisfy and a rewritten one
 * would not: `gross_pnl - total_cost = pnl`, which held on 478/478 rows when measured against
 * the correct column. The reconstruction is computed from the BID and is a DIFFERENT number, so
 * if it were ever written into `pnl`, the relation would break on exactly the flagged rows. The
 * fence therefore tests the relation, not the intent — and says so, because a reader who thinks
 * this directly proves "no overwrite" would over-trust it.
 *
 * NEGATIVE CONTROL, kept because it is what made the original detector a measurement rather than
 * a number: a maker exit fills at its own resting limit and NEVER reads the order book, so no
 * maker row may ever be flagged. If one ever is, the detector has stopped measuring the book.
 *
 * READ-ONLY: SELECTs and one static file read. No seeding, no writes.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { db } from '../../db.js';
import { sql } from 'drizzle-orm';
import { honestNetPnl } from '../../services/dashboard-metrics.js';

const TAG = 'B-PHANTOM-FILL-RECONSTRUCT-FENCE';
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
        `[${TAG}] Postgres unreachable in CI — the legs below assert expected ZEROs, so without a ` +
        `database a green result would be a false all-clear. Original: ${err instanceof Error ? err.message : err}`,
      );
    }
    dbReachable = false;
    console.warn(`[${TAG}] Postgres unreachable — DB legs will report as SKIPPED (not passed).`);
  }
});

describe(TAG, () => {
  // ------------------------------------------------------------- pure legs (run everywhere)

  it('the JS helper PREFERS the reconstruction, FALLS BACK to what was recorded, and never NaNs', () => {
    // Preference is the entire behaviour: a flagged row with a reconstruction must not report its
    // recorded figure, and an unflagged row must not report a reconstruction it does not have.
    expect(honestNetPnl({ reconstructedNetPnl: '1.50', netPnl: '9.99', pnl: '9.99' })).toBe(1.5);
    expect(honestNetPnl({ netPnl: '9.99', pnl: '4.00' })).toBe(9.99);
    expect(honestNetPnl({ pnl: '4.00' })).toBe(4);
    // A flagged-but-unreconstructable row (no contemporaneous market data) keeps its recorded
    // figure and stays flagged. NULL must fall THROUGH, while a reconstruction of 0.00 is a real
    // measurement and must NOT be confused with "no reconstruction" — these two cases are the
    // reason the helper uses `??` and not `||`.
    expect(honestNetPnl({ reconstructedNetPnl: null, pnl: '4.00' })).toBe(4);
    expect(honestNetPnl({ reconstructedNetPnl: '0', pnl: '4.00' })).toBe(0);
    // Garbage never propagates a NaN into a money total.
    expect(honestNetPnl({ pnl: 'not-a-number' })).toBe(0);
    expect(honestNetPnl({})).toBe(0);
  });

  it('the MIGRATION never assigns to a recorded column (static read of the file itself)', () => {
    // POSITIVE CONTROL FIRST, because this leg asserts that a pattern does NOT appear — and a
    // pattern that matches nothing anywhere would pass for the wrong reason. The lookbehind is
    // the whole subtlety: it must catch `SET pnl =` while NOT catching the migration's own
    // legitimate `reconstructed_net_pnl =`, and those two strings differ by one character.
    const probe = (col: string, text: string) => new RegExp(`(?<![a-z_])${col}\\s*=`, 'i').test(text);
    expect(probe('pnl', 'SET pnl = 1'), 'the check cannot see a real overwrite').toBe(true);
    expect(probe('exit_price', 'SET exit_price=cand.bid'), 'whitespace-free assignment missed').toBe(true);
    expect(probe('pnl', 'SET reconstructed_net_pnl = 1'), 'the check false-fires on the ALLOWED column').toBe(false);
    expect(probe('exit_price', 'SET reconstructed_exit_price = 1'), 'false-fires on reconstructed_exit_price').toBe(false);

    const path = join(process.cwd(), 'drizzle/migrations/2026-08-23-b-phantom-fill-reconstruct.sql');
    expect(existsSync(path), `[${TAG}] migration not found at ${path}`).toBe(true);
    const sqlText = readFileSync(path, 'utf8')
      .split('\n').filter(l => !l.trim().startsWith('--')).join('\n');  // the prose names them
    for (const col of ['exit_price', 'pnl', 'net_pnl', 'gross_pnl', 'total_cost']) {
      // An assignment in a SET list is the only way this file could rewrite a recorded value.
      // The lookbehind keeps `reconstructed_net_pnl =` and `reconstructed_exit_price =` out.
      const assign = new RegExp(`(?<![a-z_])${col}\\s*=`, 'i');
      expect(
        assign.test(sqlText),
        `[${TAG}] the migration assigns to \`${col}\`. The reconstruction must be written BESIDE ` +
        `the recorded value, never over it — both readings stay visible forever.`,
      ).toBe(false);
    }
  });

  // ------------------------------------------------------------------------- DB legs

  it('POSITIVE CONTROL: the drift check would CATCH a SQL/JS disagreement', async (ctx) => {
    if (!dbReachable) ctx.skip();
    // Synthetic rows carrying a deliberate disagreement, run through the SAME comparison the
    // assertion below uses. Without this, a zero could mean "they agree" or "the query matched
    // nothing", and those are not the same result.
    const res: any = await db.execute(sql`
      SELECT count(*)::int AS n FROM (VALUES
        ('1.50'::numeric, '9.99'::numeric, 1.50::float8),
        ('1.50'::numeric, '9.99'::numeric, 9.99::float8),
        (NULL::numeric,   '4.00'::numeric, 4.00::float8)
      ) AS t(reconstructed_net_pnl, pnl, js)
      WHERE abs(COALESCE(reconstructed_net_pnl, pnl) - js) > 0.0000001`);
    const n = Number((res.rows ?? res)[0]?.n ?? 0);
    expect(n, `[${TAG}] the comparison found ${n} of a built-in 1 disagreement`).toBe(1);
  });

  it('SQL and JS agree on every flagged row (zero reported against the population it is over)', async (ctx) => {
    if (!dbReachable) ctx.skip();
    const res: any = await db.execute(sql`
      SELECT id, reconstructed_net_pnl, net_pnl, pnl,
             COALESCE(reconstructed_net_pnl, pnl)::float8 AS sql_honest
        FROM closed_trades WHERE phantom_fill_suspect`);
    const rows: any[] = res.rows ?? res;
    const mismatched = rows.filter(r =>
      Math.abs(honestNetPnl({
        reconstructedNetPnl: r.reconstructed_net_pnl, netPnl: r.net_pnl, pnl: r.pnl,
      }) - Number(r.sql_honest)) > 0.0000001);
    expect(
      mismatched.length,
      `[${TAG}] ${mismatched.length} of ${rows.length} flagged rows disagree between ` +
      `DatabaseStorage.HONEST_PNL and honestNetPnl(). First: ${JSON.stringify(mismatched[0] ?? null)}. ` +
      `(A zero over ZERO flagged rows is not evidence — the population count is printed so a ` +
      `reader can see what the zero is a zero OVER.)`,
    ).toBe(0);
    console.log(`[${TAG}] SQL/JS agreement checked over ${rows.length} flagged rows`);
  });

  it('the recorded columns still satisfy gross - cost = pnl on flagged rows (nothing rewrote them)', async (ctx) => {
    if (!dbReachable) ctx.skip();
    const res: any = await db.execute(sql`
      SELECT count(*) FILTER (WHERE phantom_fill_suspect
               AND abs((gross_pnl::numeric - COALESCE(total_cost,0)::numeric) - pnl::numeric) > 0.01)::int AS broken,
             count(*) FILTER (WHERE phantom_fill_suspect)::int AS flagged,
             count(*) FILTER (WHERE phantom_fill_suspect AND reconstructed_net_pnl IS NOT NULL)::int AS reconstructed,
             count(*) FILTER (WHERE phantom_fill_suspect AND exit_fee_mode = 'maker')::int AS maker_flagged
        FROM closed_trades WHERE gross_pnl IS NOT NULL AND pnl IS NOT NULL`);
    const r = (res.rows ?? res)[0] ?? {};
    expect(
      Number(r.broken ?? 0),
      `[${TAG}] ${r.broken} of ${r.flagged} flagged rows no longer satisfy gross - cost = pnl. ` +
      `Something wrote a reconstructed value over a recorded one.`,
    ).toBe(0);
    // NEGATIVE CONTROL — the leg that makes the flag a measurement rather than a number.
    expect(
      Number(r.maker_flagged ?? 0),
      `[${TAG}] ${r.maker_flagged} MAKER exits are flagged. A maker fill happens at its own resting ` +
      `limit and never touches the order book, so it cannot carry a ghost-level price. If this is ` +
      `non-zero the detector has stopped measuring the book.`,
    ).toBe(0);
    console.log(`[${TAG}] flagged=${r.flagged} reconstructed=${r.reconstructed} maker_flagged=${r.maker_flagged}`);
  });
});

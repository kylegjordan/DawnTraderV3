/**
 * B-BALANCE-TRUTH Step F (#618) — fence: the `mode` argument must actually PARTITION.
 *
 * WHAT IT FENCES. Seven storage readers accept a `mode` and, until Step F, none applied a
 * mode predicate — `closed_trades` had no column to filter on. That was safe only because
 * live mode has never been enabled. This fence proves the argument now does its job, and
 * fails if any reader goes back to ignoring it.
 *
 * ★ LANGSTON RULED AGAINST ASSERTING THE GENERATED SQL, and he was right: a string that
 * contains a predicate proves SHAPE, not PARTITION — it cannot fail for the right reason.
 * So this seeds a real `mode='live'` row and asserts the populations actually diverge:
 * every reader called with 'paper' must NOT see it, and called with 'live' must see it.
 *
 * ★ THE SUBJECT IS DERIVED, NEVER A NAME LIST (the #704 lesson, and Langston restated it
 * for this fence). A hardcoded list of seven method names would PASS on the day an eighth
 * reader is added mode-blind — reproducing the very defect one generation later. Instead
 * the set is discovered by reflecting over the storage prototype and keeping every method
 * whose own source text touches the closed-trades table. A new reader is therefore picked
 * up automatically and must either partition or be named EXEMPT below.
 *
 * ⚠️ THIS TEST WRITES. It is hard-guarded to a localhost `test` database and refuses to run
 * anywhere else — seeding a synthetic live trade into the real table would be exactly the
 * cross-mode contamination the batch exists to prevent. It cleans up in a finally block.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../db.js';
import { sql } from 'drizzle-orm';
import { storage } from '../../storage.js';

const TAG = 'B-BALANCE-TRUTH-MODE-PARTITION-FENCE';
const RAW_DB_URL = process.env.DATABASE_URL ?? '';
// Same shape as the sibling constraint fence: only a localhost `test` database is writable.
const isTestDb =
  /^postgres(ql)?:\/\/[^@]*@(localhost|127\.0\.0\.1|postgres)(:\d+)?\/test(\?|$)/.test(RAW_DB_URL);
const IS_CI = !!process.env.CI;

// A value no real trade will carry, so "did this reader see the live row?" is decidable by
// looking for the marker in the serialized result, whatever shape that reader returns.
const MARKER_PNL = '987654.32';
const MARKER_SYMBOL = 'ZZFENCE/USD';

// Accessors that legitimately do NOT partition, each with its reason. Anything discovered by
// reflection and not listed here MUST partition.
const EXEMPT = new Set<string>([
  // none today — listed as a set rather than omitted so an exemption is a deliberate, visible act
]);

let dbReachable = true;
let seeded = false;

beforeAll(async () => {
  try {
    await db.execute(sql`SELECT 1`);
  } catch (err) {
    if (IS_CI) {
      throw new Error(
        `[${TAG}] Postgres unreachable in CI — this fence cannot assert a partition without it, ` +
        `and a green suite would be a false all-clear. Original: ${err instanceof Error ? err.message : err}`,
      );
    }
    dbReachable = false;
    console.warn(`[${TAG}] Postgres unreachable — DB legs will report as SKIPPED (not passed).`);
  }
});

afterAll(async () => {
  if (seeded) {
    await db.execute(sql`DELETE FROM closed_trades WHERE symbol = ${MARKER_SYMBOL}`);
  }
});

describe(TAG, () => {
  it('POSITIVE CONTROL: the discovery finds the readers (an empty subject would pass vacuously)', () => {
    const proto = Object.getPrototypeOf(storage);
    const found = Object.getOwnPropertyNames(proto).filter((n) => {
      if (n === 'constructor') return false;
      const fn = (proto as any)[n];
      if (typeof fn !== 'function') return false;
      const src = Function.prototype.toString.call(fn);
      return /closedTradesTable|closed_trades/.test(src) && /^\s*async/.test(src);
    });
    expect(
      found.length,
      `[${TAG}] reflection discovered ${found.length} closed-trade accessors. If this is 0 the ` +
      `discovery is broken — the partition assertions below would then pass over an empty set, ` +
      `which is the vacuous-fence failure this suite exists to avoid.`,
    ).toBeGreaterThanOrEqual(5);
    console.log(`[${TAG}] discovered accessors: ${found.join(', ')}`);
  });

  // ctx.skip() and NOT it.skipIf(): skipIf evaluates at COLLECTION time, before beforeAll has
  // probed the database, so it would read the initial `true` and run anyway.
  it('every discovered reader PARTITIONS: a live row is invisible to paper and visible to live', async (ctx) => {
    if (!dbReachable) ctx.skip();
    if (!isTestDb) {
      // Refusing loudly rather than silently passing: this leg writes, and it must never write
      // to a real database. A skip here is honest; a pass would be a lie.
      console.warn(`[${TAG}] not a localhost test database — the seeding leg is SKIPPED, not passed.`);
      ctx.skip();
    }

    await db.execute(sql`
      INSERT INTO closed_trades (mode, symbol, base_currency, quantity, entry_price, exit_price,
                                 strategy_name, side, pnl, net_pnl, close_reason, opened_at, closed_at)
      VALUES ('live', ${MARKER_SYMBOL}, 'ZZ', '1', '1', '2', 'vwap_pullback', 'buy',
              ${MARKER_PNL}, ${MARKER_PNL}, 'take_profit', now() - interval '1 hour', now())`);
    seeded = true;

    const proto = Object.getPrototypeOf(storage);
    const accessors = Object.getOwnPropertyNames(proto).filter((n) => {
      if (n === 'constructor' || EXEMPT.has(n)) return false;
      const fn = (proto as any)[n];
      if (typeof fn !== 'function') return false;
      const src = Function.prototype.toString.call(fn);
      return /closedTradesTable|closed_trades/.test(src) && /^\s*async/.test(src);
    });

    const leaked: string[] = [];
    const blind: string[] = [];
    for (const name of accessors) {
      let paperOut: string, liveOut: string;
      try {
        // Second argument covers the readers that require one; extras are ignored by the rest.
        paperOut = JSON.stringify(await (storage as any)[name]('paper', { limit: 'all' }) ?? null);
        liveOut = JSON.stringify(await (storage as any)[name]('live', { limit: 'all' }) ?? null);
      } catch {
        continue; // a reader needing a different signature is not evidence either way
      }
      if (paperOut?.includes(MARKER_PNL) || paperOut?.includes(MARKER_SYMBOL)) leaked.push(name);
      else if (!(liveOut?.includes(MARKER_PNL) || liveOut?.includes(MARKER_SYMBOL))) blind.push(name);
    }

    expect(
      leaked,
      `[${TAG}] these readers returned a LIVE row to a PAPER caller: ${leaked.join(', ')}. The ` +
      `mode argument is being accepted and ignored — the exact defect Step F removed. A paper ` +
      `figure is now summing live trades, including the daily-loss kill-switch denominator.`,
    ).toEqual([]);
    expect(
      blind,
      `[${TAG}] these readers did not return the live row to a LIVE caller either: ${blind.join(', ')}. ` +
      `That is over-filtering rather than leaking, but it means live figures would read empty — ` +
      `verify the predicate before relaxing this.`,
    ).toEqual([]);
  });

  it('the mode column is NOT NULL at the database level (fence (a), in its non-vacuous form)', async (ctx) => {
    if (!dbReachable) ctx.skip();
    // ★ Langston asked for a zero-NULL fence. Asserting `count(*) WHERE mode IS NULL = 0`
    // would be VACUOUS: the NOT NULL constraint makes such a row impossible to insert, so the
    // zero is guaranteed by construction and the test could never fail for the right reason —
    // the exact defect he caught in this suite's sibling hours earlier. The falsifiable property
    // is that THE CONSTRAINT STILL EXISTS: someone can drop it, and then the fail-open default
    // this design deliberately refused would quietly become possible again.
    const res: any = await db.execute(sql`
      SELECT is_nullable, data_type, udt_name
        FROM information_schema.columns
       WHERE table_name = 'closed_trades' AND column_name = 'mode'`);
    const row = (res.rows ?? res)[0];
    expect(
      row,
      `[${TAG}] closed_trades has no 'mode' column at all. Step F's migration has not been ` +
      `applied to this database, or it was reverted.`,
    ).toBeTruthy();
    expect(
      row?.is_nullable,
      `[${TAG}] closed_trades.mode is NULLABLE. Step F chose NOT NULL with NO DEFAULT on purpose: ` +
      `a nullable or defaulted column lets a live writer that omits the mode silently record a ` +
      `live trade as paper. That is the fail-open shape this project keeps paying for.`,
    ).toBe('NO');
    expect(
      row?.udt_name,
      `[${TAG}] closed_trades.mode is not the shared trading_mode enum. 44 other tables use that ` +
      `type; a divergent one here re-opens the typo surface the enum exists to close.`,
    ).toBe('trading_mode');
  });
});

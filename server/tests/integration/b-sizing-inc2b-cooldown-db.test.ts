/**
 * B-SIZING-DEC-RESTORE increment 2b (#1093) — THE COOLDOWN'S READ IS EXACT, ON REAL POSTGRES.
 * ⚠️ The file name predates increment 2e, which WITHDREW 2b's position-% floor; the cooldown fix and 2e's never_filled
 * pin live here and the name is KEPT on purpose — `storage.ts` cites this exact path, and a rename breaks citations.
 *
 * `storage.getLastClosedAtForSymbol` replaces the Closed Trades search box's SUBSTRING filter for the symbol cooldown.
 * Rows are seeded for look-alike symbols (one name inside another) and for a symbol present in BOTH classes (DASH/USD
 * is the Dash coin and DoorDash on staging, measured 2026-09-29). Each assertion pins the exact close TIME returned
 * (Langston condition 4), so a pass cannot come from an unrelated row.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../db.js';
import { sql } from 'drizzle-orm';
import { storage } from '../../storage.js';

const RAW_DB_URL = process.env.DATABASE_URL ?? '';
const isTestDb =
  /^postgres(ql)?:\/\/[^@]*@(localhost|127\.0\.0\.1|postgres)(:\d+)?\/test(\?|$)/.test(RAW_DB_URL);
const IS_CI = !!process.env.CI;
const TAG = 'B-SIZING-INC2B-COOLDOWN-DB';
// Test-only symbols: 'ZQC/USD' is a substring of 'LZQC/USD'; 'ZQDASH/USD' exists in both classes.
const SHORT = 'ZQC/USD';
const LONG = 'LZQC/USD';
const BOTH = 'ZQDASH/USD';
const NF = 'ZQNF/USD'; // 2e Pe3: a never-filled maker
const NOEXIT = 'ZQNX/USD'; // its control: a close with no exit price and an ordinary reason
let dbReachable = true;

const T0 = new Date('2026-09-29T10:00:00.000Z'); // SHORT's own close (xStock)
const T1 = new Date('2026-09-29T10:03:00.000Z'); // LONG's close — NEWER, and a substring match for SHORT
const T2 = new Date('2026-09-29T11:00:00.000Z'); // BOTH, crypto
const T3 = new Date('2026-09-29T11:04:00.000Z'); // BOTH, xStock — newer
const T4 = new Date('2026-09-29T12:00:00.000Z'); // NF's never_filled drop; NOEXIT's reasonless close

async function seed(symbol: string, assetClass: string, closedAt: Date) {
  await db.execute(sql`
    INSERT INTO closed_trades (mode, symbol, base_currency, quantity, entry_price, exit_price, strategy_name, side,
                               pnl, net_pnl, close_reason, opened_at, closed_at, asset_class)
    VALUES ('paper', ${symbol}, 'ZZ', '1', '1', '2', 'vwap_pullback', 'buy', '0', '0', 'take_profit',
            ${new Date(closedAt.getTime() - 3_600_000)}, ${closedAt}, ${assetClass})`);
}

beforeAll(async () => {
  try {
    await db.execute(sql`SELECT 1`);
  } catch (err) {
    if (IS_CI) {
      throw new Error(`[${TAG}] Postgres unreachable in CI — the exact match cannot be proved without it. `
        + `Original: ${err instanceof Error ? err.message : err}`);
    }
    dbReachable = false;
    console.warn(`[${TAG}] Postgres unreachable — DB legs will report as SKIPPED (not passed).`);
    return;
  }
  if (!isTestDb) return;
  await db.execute(sql`DELETE FROM closed_trades WHERE symbol IN (${SHORT}, ${LONG}, ${BOTH}, ${NF}, ${NOEXIT})`);
  await seed(SHORT, 'xstock_spot', T0);
  await seed(LONG, 'crypto_spot', T1);
  await seed(BOTH, 'crypto_spot', T2);
  await seed(BOTH, 'xstock_spot', T3);
  // A dropped, never-filled maker: no exit price, close_reason 'never_filled' (what _dropUnfilledMaker writes).
  for (const [sym, reason] of [[NF, 'never_filled'], [NOEXIT, 'take_profit']] as const) {
    await db.execute(sql`
      INSERT INTO closed_trades (mode, symbol, base_currency, quantity, entry_price, exit_price, strategy_name, side,
                                 pnl, net_pnl, close_reason, opened_at, closed_at, asset_class)
      VALUES ('paper', ${sym}, 'ZZ', '1', '1', NULL, 'vwap_pullback', 'buy', '0', '0', ${reason},
              ${new Date(T4.getTime() - 3_600_000)}, ${T4}, 'crypto_spot')`);
  }
});

afterAll(async () => {
  if (!dbReachable || !isTestDb) return;
  await db.execute(sql`DELETE FROM closed_trades WHERE symbol IN (${SHORT}, ${LONG}, ${BOTH}, ${NF}, ${NOEXIT})`);
});

describe('#1093 — getLastClosedAtForSymbol is exact', () => {
  it('in CI this runs against the test database (not skipped)', () => {
    if (IS_CI) expect(isTestDb && dbReachable).toBe(true);
  });

  // MUTATION: put the substring match back (LIKE '%sym%') and this returns T1 (LONG's newer close).
  it('a newer close of a look-alike symbol is NOT returned — the symbol\'s own close is', async (ctx) => {
    if (!dbReachable || !isTestDb) ctx.skip();
    const got = await storage.getLastClosedAtForSymbol('paper', SHORT, 'xstock_spot');
    expect(got?.getTime()).toBe(T0.getTime());
  });

  it('CONTROL — the look-alike\'s own read returns its own close', async (ctx) => {
    if (!dbReachable || !isTestDb) ctx.skip();
    const got = await storage.getLastClosedAtForSymbol('paper', LONG, 'crypto_spot');
    expect(got?.getTime()).toBe(T1.getTime());
  });

  // MUTATION: drop the asset_class predicate and the crypto read returns T3 (the newer xStock close).
  it('a symbol in both classes: each class reads only its own close', async (ctx) => {
    if (!dbReachable || !isTestDb) ctx.skip();
    expect((await storage.getLastClosedAtForSymbol('paper', BOTH, 'crypto_spot'))?.getTime()).toBe(T2.getTime());
    expect((await storage.getLastClosedAtForSymbol('paper', BOTH, 'xstock_spot'))?.getTime()).toBe(T3.getTime());
  });

  it('no class given ⇒ any class, newest first (stricter, never looser)', async (ctx) => {
    if (!dbReachable || !isTestDb) ctx.skip();
    expect((await storage.getLastClosedAtForSymbol('paper', BOTH, null))?.getTime()).toBe(T3.getTime());
  });

  it('a symbol with no closes returns null, and the other mode sees nothing', async (ctx) => {
    if (!dbReachable || !isTestDb) ctx.skip();
    expect(await storage.getLastClosedAtForSymbol('paper', 'ZQNONE/USD', null)).toBeNull();
    expect(await storage.getLastClosedAtForSymbol('live', SHORT, 'xstock_spot')).toBeNull();
  });
});

// B-SIZING-DEC-RESTORE 2e Pe3 — Kyle 2026-09-30: an order that never fills STARTS the cooldown, as it does today.
// DECIDED, pinned here at the object it lives in (`storage.getLastClosedAtForSymbol`'s predicate), not the closed-list
// clause. MUTATION: drop the `close_reason = 'never_filled'` arm and the first test returns null.
describe('2e Pe3 — a never-filled maker starts the symbol cooldown (decided, Kyle 2026-09-30)', () => {
  it('a never_filled row with no exit price IS the last close for the cooldown', async (ctx) => {
    if (!dbReachable || !isTestDb) ctx.skip();
    expect((await storage.getLastClosedAtForSymbol('paper', NF, 'crypto_spot'))?.getTime()).toBe(T4.getTime());
  });

  it('CONTROL — a row with no exit price and an ordinary reason does NOT count (the arm is what admits never_filled)', async (ctx) => {
    if (!dbReachable || !isTestDb) ctx.skip();
    expect(await storage.getLastClosedAtForSymbol('paper', NOEXIT, 'crypto_spot')).toBeNull();
  });
});

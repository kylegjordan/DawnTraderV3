/**
 * B-KILLSWITCH-WINDOW / #618 — regression fence for the daily-loss kill switch's 24h total.
 *
 * THE DEFECT THIS FENCES. `compute24hSnapshot` reached its 24h realized total through
 * `storage.getClosedTrades(mode, {closedOnly:true})`, which returns at most `limit || 100`
 * rows ordered by `openedAt DESC`, and then filtered those rows by `closedAt`. It bounded
 * its set by OPEN time while asking a question in CLOSE time — so a position held across
 * more than 100 subsequent opens was silently absent from the loss total at the moment it
 * closed. Direction is the unsafe one: it UNDER-COUNTS losses, so the switch trips LATER
 * than configured. Measured on live data: worst-case rank-at-close 215 against a cap of 100;
 * 3 rows invisible at their close, all three losses.
 *
 * ★ WHY THIS IS AN INTEGRATION TEST AND NOT A UNIT TEST (Langston Step-4 condition 1a).
 * The claim under test is a property of the REAL reader — `getClosedTrades`'s own `limit`
 * default and its `desc(openedAt)` ordering — and of a REAL SQL aggregate. A mocked `db`
 * would only prove that MY IMITATION of a cap is capped. So both readers run against real
 * Postgres here, and the revert-assertion calls the genuine `storage.getClosedTrades` plus
 * the genuine JS-sum shape the code used before the fix.
 *
 * WHAT IT ASSERTS
 *   1. MUTATION HALF (the one that matters): the OLD path MISSES a long-held row that closed
 *      inside the window; the NEW path INCLUDES it. If someone reverts `getRealizedPnlSince`
 *      back to `getClosedTrades`, assertion 1b fails.
 *   2. POPULATION PARITY (Langston condition 1b): the fix's own comment claims "only the row
 *      bound is removed". That was an untested assertion. Here a `never_filled` row and a
 *      `closedAt IS NULL` row are seeded INSIDE the window and both readers must exclude
 *      both — i.e. when the cap is not binding, the two agree exactly.
 *   3. EMPTY WINDOW returns 0, not NaN (Langston condition 1c — `COALESCE` is fenced).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../db.js';
import { closedTradesTable } from '../../../shared/schema.js';
import { inArray, sql } from 'drizzle-orm';
import { storage } from '../../storage.js';

// Same skip discipline as b72-dbs-routing-guards-consistency: this suite exercises a real
// round-trip and mocking would defeat its purpose. CI provides Postgres + `npm run db:migrate`.
//
// ⚠️ THIS SUITE WRITES, AND WHAT IT WRITES WOULD BE DANGEROUS AGAINST A LIVE DB: it INSERTS a
// −500 row stamped as closed seconds ago. On a live database the daily-loss evaluator would
// read that on the next close — ~22% of a ~$2,250 portfolio, past the 20% paper kill — and
// trip the kill switch, flattening every open position. Hence the two guards below.
// ★ HOW THIS GUARD ACTUALLY BEHAVES — MEASURED, after I twice described it wrongly.
// `vitest.config.ts:10` INJECTS `DATABASE_URL='postgresql://test:test@localhost:5432/test'`
// into every run. So under vitest the URL is ALWAYS the test URL and this check ALWAYS
// passes — it can never be pointed at staging THROUGH vitest, which is the real protection.
// The URL check below is therefore belt-and-braces for a direct/non-vitest invocation, NOT
// the load-bearing guard I first claimed it was.
// The second half is the one that matters locally: a developer machine has the test URL but
// usually NO Postgres on 5432. A throwing `beforeAll` fails the FILE while vitest reports its
// unrun tests as "skipped" — a shape that reads exactly like a clean skip and is not one.
// (That is precisely how I misread this run.) So reachability is PROBED and the suite skips
// itself when the database is absent, rather than failing the suite for everyone without one.
const RAW_DB_URL = process.env.DATABASE_URL ?? '';
const isTestDb =
  /^postgres(ql)?:\/\/[^@]*@(localhost|127\.0\.0\.1|postgres)(:\d+)?\/test(\?|$)/.test(RAW_DB_URL);
// ★ Langston item 4: NO `RAW_DB_URL &&` conjunct. An UNSET DATABASE_URL previously
// skipped in silence — the exact failure this warning exists to prevent, left open on
// one branch by my own guard.
if (!isTestDb) {
  // Loud, because a silent skip here looks identical to a pass.
  console.warn(
    `[B-KILLSWITCH-WINDOW-FENCE] REFUSING TO SEED: DATABASE_URL is not a local test database. ` +
    `This suite seeds a large synthetic loss; against a live DB the evaluator could read it ` +
    `and trip the kill switch. Skipped.`,
  );
}
const d = isTestDb ? describe : describe.skip;
/** Set false by beforeAll when Postgres is not reachable; every `it` then skips itself. */
let dbReachable = true;

const TAG = 'B-KILLSWITCH-WINDOW-FENCE';
const ids: string[] = [];
/** ★ Langston item 3: the tagged rows, so assertions test MEMBERSHIP of a known row rather than
 *  arithmetic on a global aggregate. `getRealizedPnlSince` cannot be tag-scoped, so every absolute
 *  threshold on its return value silently includes migration seed data and anything a parallel test
 *  file inserts. His worked example: ONE pre-existing −200 in-window row, displaced out of legacy's
 *  top-100 by our own 120 fillers, shrinks the delta from 500 to 300 and turns this fence RED
 *  against a CORRECT fix. Deltas against a pre-seed baseline are immune to both. */
let victimId = '';
let neverFilledId = '';
let stillOpenId = '';
let baseNew = 0;   // getRealizedPnlSince BEFORE seeding
let baseLegacy = 0; // the legacy path BEFORE seeding
const now = Date.now();
const WINDOW_START = new Date(now - 24 * 60 * 60 * 1000);

/** The pre-fix code path, reproduced EXACTLY as it stood, calling the REAL reader. */
async function legacyPath(windowStart: Date): Promise<number> {
  const trades = await storage.getClosedTrades('paper', { closedOnly: true });
  return trades
    .map((t: any) => ({ closedAt: t.closedAt, pnl: t.pnl }))
    .filter((t) => t.closedAt && new Date(t.closedAt) >= windowStart)
    .reduce((sum, t) => sum + (parseFloat(String(t.pnl ?? '0')) || 0), 0);
}

function row(overrides: Record<string, unknown>) {
  const id = `${TAG}-${ids.length}-${now}`;
  ids.push(id);
  return {
    id,
    symbol: 'FENCE/USD',
    baseCurrency: 'FENCE',
    strategyName: 'strong_bull_trend' as const,
    side: 'buy',
    quantity: '1.00000000',
    entryPrice: '100.00000000',
    ...overrides,
  };
}

d('B-KILLSWITCH-WINDOW (#618): the 24h loss total is bounded by TIME, not by row count', () => {
  beforeAll(async () => {
    if (!isTestDb) return;
    // Probe reachability FIRST. If Postgres is absent (the normal developer laptop), skip the
    // suite instead of throwing — an unhandled throw here fails the file while its tests
    // report as "skipped", which is indistinguishable from a clean skip at a glance.
    try {
      await db.execute(sql`SELECT 1`);
    } catch {
      dbReachable = false;
      console.warn('[B-KILLSWITCH-WINDOW-FENCE] Postgres unreachable — suite skipped (CI provides it).');
      return;
    }

    // Baselines BEFORE any seeding — every assertion below is a DELTA against these.
    baseNew = (await storage.getRealizedPnlSince('paper', WINDOW_START)).realizedPnl;
    baseLegacy = await legacyPath(WINDOW_START);

    // The victim: opened FIRST (so it sorts LAST under `desc(openedAt)`), closed INSIDE the
    // window. This is the long-held position the cap hides.
    const victim = row({
      openedAt: new Date(now - 40 * 24 * 3600_000),
      closedAt: new Date(now - 60_000),
      pnl: '-500.00',
      closeReason: 'stop_hit',
    });
    victimId = victim.id;
    await db.insert(closedTradesTable).values(victim as any);

    // 120 rows opened AFTER the victim (> the 100 cap), each closed inside the window with a
    // known 0 P&L so they cannot themselves change either sum.
    for (let i = 0; i < 120; i++) {
      await db.insert(closedTradesTable).values(row({
        openedAt: new Date(now - (30 * 24 * 3600_000) + i * 60_000),
        closedAt: new Date(now - 30_000),
        pnl: '0.00',
        closeReason: 'target_hit',
      }) as any);
    }

    // Population controls, both INSIDE the window: excluded by BOTH readers or parity is false.
    const nf = row({
      openedAt: new Date(now - 3600_000),
      closedAt: new Date(now - 60_000),
      pnl: '-999.00',
      closeReason: 'never_filled', // excluded by the P19-B7.2c typed guard
    });
    neverFilledId = nf.id;
    await db.insert(closedTradesTable).values(nf as any);
    const so = row({
      openedAt: new Date(now - 3600_000),
      closedAt: null, // still open — excluded by `closedAt IS NOT NULL`
      pnl: '-999.00',
      closeReason: 'target_hit',
    });
    stillOpenId = so.id;
    await db.insert(closedTradesTable).values(so as any);
  });

  afterAll(async () => {
    if (!isTestDb || !dbReachable) return;
    if (ids.length) await db.delete(closedTradesTable).where(inArray(closedTradesTable.id, ids));
  });

  it('1a. the OLD path MISSES the victim — membership, not arithmetic on a global sum', async (ctx) => {
    if (!dbReachable) return ctx.skip();
    const rows = await storage.getClosedTrades('paper', { closedOnly: true });
    // ★ THE PRIMARY ASSERTION IS MEMBERSHIP (Langston item 3): the victim is simply NOT among the
    // rows the capped reader returns. This is true regardless of what else is in the database.
    expect(rows.some((t: any) => t.id === victimId)).toBe(false);
    // Secondary: the legacy DELTA is ~0 — it saw the 120 zero-P&L fillers and not the −500.
    const legacyDelta = (await legacyPath(WINDOW_START)) - baseLegacy;
    expect(Math.abs(legacyDelta)).toBeLessThan(0.01);
  });

  it('1b. MUTATION FENCE: the NEW path COUNTS the victim — reverting to getClosedTrades fails here', async (ctx) => {
    if (!dbReachable) return ctx.skip();
    const newDelta = (await storage.getRealizedPnlSince('paper', WINDOW_START)).realizedPnl - baseNew;
    // The victim (−500) plus 120 fillers at 0.00 — and NOTHING else, because the two −999 controls
    // must be excluded. A delta of exactly −500 proves inclusion of the victim AND exclusion of both
    // controls in one number.
    expect(newDelta).toBeCloseTo(-500, 2);
    // And the two readers must DISAGREE by the hidden loss. Delta-based, so a pre-existing in-window
    // row cannot shrink it (his −200 counter-example).
    const legacyDelta = (await legacyPath(WINDOW_START)) - baseLegacy;
    expect(Math.abs(newDelta - legacyDelta)).toBeGreaterThanOrEqual(499.99);
  });

  it('2. POPULATION PARITY: never_filled and still-open rows are excluded by BOTH readers', async (ctx) => {
    if (!dbReachable) return ctx.skip();
    // NEW reader: proven by the delta above being −500 and not −1,499 or −2,498. Restated here as
    // its own assertion so the parity claim fails on its own terms rather than as a side effect.
    const newDelta = (await storage.getRealizedPnlSince('paper', WINDOW_START)).realizedPnl - baseNew;
    expect(newDelta).toBeGreaterThan(-999); // either control admitted would push it past this
    // LEGACY reader: membership, by id.
    const rows = await storage.getClosedTrades('paper', { closedOnly: true });
    expect(rows.some((t: any) => t.id === neverFilledId)).toBe(false);
    expect(rows.some((t: any) => t.id === stillOpenId)).toBe(false);
  });

  it('3. an empty window returns 0, not NaN (COALESCE is load-bearing)', async (ctx) => {
    if (!dbReachable) return ctx.skip();
    const far = new Date(now + 365 * 24 * 3600_000); // nothing can have closed after this
    const { realizedPnl, tradeCount } = await storage.getRealizedPnlSince('paper', far);
    // A future `since` genuinely admits NO row, so these absolutes are safe here — unlike the
    // in-window assertions above, nothing pre-existing can satisfy `closed_at >= now + 1 year`.
    expect(realizedPnl).toBe(0);
    expect(Number.isNaN(realizedPnl)).toBe(false);
    expect(tradeCount).toBe(0);
  });
});

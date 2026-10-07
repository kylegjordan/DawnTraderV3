/**
 * B-LOSS-WINDOW-OPERATOR-CLOSES (row 183b, #1154) — the two DATABASE predicates, ON REAL POSTGRES, each inside a
 * transaction that is ROLLED BACK (Langston Step-2 r2 BLOCKER: the anchor ledger is production state — `mode` is
 * paper|live only, so a committed seed row would move the live divergence cooldown and the live kill-switch window for
 * the test's duration; uncommitted rows are invisible to every other session). After each, the seeded rows are asserted
 * ABSENT by their own keys (a whole-table count would race the other test files writing in parallel).
 *
 * (c) `selectLastAnchorAt` with the operator reasons skips a LATER `auto_divergence`; without reasons it does not
 *     (the control — the divergence cooldown's population is unchanged).
 *     MUTATION: drop the `reason` predicate → the filtered read returns the automatic event → fails.
 * (d) `closeOpenTradesForHardReset(tx, 'paper')` closes a paper open row and leaves a live open row open.
 *     MUTATION: no mode predicate, or the parameter on both sides of eq() → the live row closes → fails.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '../../db.js';
import { sql } from 'drizzle-orm';
import { closedTradesTable, portfolioAnchorEvents } from '@shared/schema';
import { selectLastAnchorAt, OPERATOR_REBASE_REASONS } from '../../services/portfolio-anchor-service.js';
import { closeOpenTradesForHardReset } from '../../storage.js';

const RAW_DB_URL = process.env.DATABASE_URL ?? '';
const isTestDb =
  /^postgres(ql)?:\/\/[^@]*@(localhost|127\.0\.0\.1|postgres)(:\d+)?\/test(\?|$)/.test(RAW_DB_URL);
const IS_CI = !!process.env.CI;
const TAG = 'B-LOSS-WINDOW-DB';
let dbReachable = true;

const rows = (r: any): any[] => (r?.rows ?? r) as any[];
class Rollback extends Error {}

/** Runs `body` inside a transaction and always rolls it back; returns what `body` returned. */
async function inRolledBackTx<T>(body: (tx: any) => Promise<T>): Promise<T> {
  let out: T | undefined;
  try {
    await db.transaction(async (tx) => {
      out = await body(tx);
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
  return out as T;
}

beforeAll(async () => {
  try {
    await db.execute(sql`SELECT 1`);
  } catch (err) {
    if (IS_CI) {
      throw new Error(`[${TAG}] Postgres unreachable in CI — the predicates cannot be proved without it. `
        + `Original: ${err instanceof Error ? err.message : err}`);
    }
    dbReachable = false;
    console.warn(`[${TAG}] Postgres unreachable — DB legs will report as SKIPPED (not passed).`);
  }
});

describe('B-LOSS-WINDOW-OPERATOR-CLOSES — database predicates', () => {
  it('in CI this runs against the test database (not skipped)', () => {
    if (IS_CI) expect(isTestDb && dbReachable).toBe(true);
  });

  it('(c) the operator read skips a later auto_divergence; the default read does not', async (ctx) => {
    if (!dbReachable || !isTestDb) ctx.skip();
    // Future instants, so they are the newest rows whatever the test database already holds.
    const t1 = new Date(Date.now() + 10 * 86_400_000);
    const t2 = new Date(t1.getTime() + 3_600_000);
    const got = await inRolledBackTx(async (tx) => {
      await tx.insert(portfolioAnchorEvents).values([
        { mode: 'paper', anchorVersion: 9_000_001, newBalance: '820.00', reason: 'measurement_override', note: `${TAG} seed — rolled back`, occurredAt: t1 },
        { mode: 'paper', anchorVersion: 9_000_002, newBalance: '820.00', reason: 'auto_divergence', occurredAt: t2 },
      ]);
      return {
        operator: await selectLastAnchorAt(tx, 'paper', OPERATOR_REBASE_REASONS),
        all: await selectLastAnchorAt(tx, 'paper'),
      };
    });
    console.log(`[${TAG}] MEASURED (c): operator=${got.operator?.toISOString()} all=${got.all?.toISOString()}`);
    expect(got.operator?.getTime()).toBe(t1.getTime());
    expect(got.all?.getTime()).toBe(t2.getTime()); // control: the default population still sees every reason
    const left = rows(await db.execute(sql`SELECT count(*)::int AS n FROM portfolio_anchor_events WHERE mode = 'paper' AND anchor_version IN (9000001, 9000002)`))[0].n;
    expect(Number(left)).toBe(0); // rolled back: nothing reached the ledger
  });

  it('(d) a paper hard reset closes the paper open row and leaves the live open row open', async (ctx) => {
    if (!dbReachable || !isTestDb) ctx.skip();
    const stamp = Date.now();
    const paperId = `${TAG}-paper-${stamp}`;
    const liveId = `${TAG}-live-${stamp}`;
    const base = { symbol: 'FENCE/USD', baseCurrency: 'FENCE', strategyName: 'strong_bull_trend' as const, side: 'buy', quantity: '1.00000000', entryPrice: '100.00000000', openedAt: new Date() }; // opened_at is NOT NULL, no default
    const got = await inRolledBackTx(async (tx) => {
      await tx.insert(closedTradesTable).values([
        { id: paperId, mode: 'paper', ...base } as any,
        { id: liveId, mode: 'live', ...base } as any,
      ]);
      const closed = await closeOpenTradesForHardReset(tx, 'paper');
      const live = rows(await tx.execute(sql`SELECT closed_at, close_reason FROM closed_trades WHERE id = ${liveId}`))[0];
      return { closedIds: closed.map((r: any) => r.id), live };
    });
    console.log(`[${TAG}] MEASURED (d): closed ${got.closedIds.length} paper row(s); live closed_at=${got.live?.closed_at ?? null}`);
    expect(got.closedIds).toContain(paperId);
    expect(got.closedIds).not.toContain(liveId);
    expect(got.live?.closed_at ?? null).toBeNull();
    const left = rows(await db.execute(sql`SELECT count(*)::int AS n FROM closed_trades WHERE id IN (${paperId}, ${liveId})`))[0].n;
    expect(Number(left)).toBe(0); // rolled back: neither seed row exists, and no real open row was closed
  });
});

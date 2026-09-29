/**
 * B-SIZING-DEC-RESTORE increment 1, AGAINST A REAL DATABASE: P7 (#1088, PRE_AUDIT §13 F9 + F15) a kill-switch
 * trip is saved and writes only its own columns; P5 the range CHECKs refuse a mistyped sizing %; P6 a guardrails
 * save and its audit rows commit together or not at all. (One file: every leg writes the same paper row, and
 * separate files would run in parallel against it.)
 *
 * The defect lived in the SQL a helper chose to write: `upsertGuardrailsV2`'s UPDATE writes a
 * hand-maintained field list that never carried the three kill-switch columns, so a trip stopped the
 * engine but `kill_switch_tripped` stayed false. A mocked storage cannot see that — the existing
 * daily-loss suite mocks `tripKillSwitch` itself — so this drives the REAL `guardrailPolicy` and the
 * REAL `storage` against Postgres, mocking only the side effects that stop engines and broadcast.
 *
 * WRITES: the `guardrails_v2` row for mode='paper' on the `test` database only. If the row existed it
 * is snapshotted and restored; if not, it is created and deleted. In CI an unreachable database FAILS
 * the file (a skip must never read as a pass, #704); locally the DB legs report SKIPPED at run time.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

vi.mock('../../services/active-filter-pool.js', () => ({ activeFilterPool: { enforcePassiveModeIfStopped: () => {} } }));
vi.mock('../../services/active-engine-service.js', () => ({ stopActiveEngine: async () => {} }));
vi.mock('../../services/trading-state-sync.js', () => ({ tradingStateSync: { broadcastUserUpdate: async () => {} } }));
vi.mock('../../services/daily-loss-budget.js', () => ({ resetDailyLossBudgetState: () => {} }));
vi.mock('../../services/context-bridge', () => ({ contextBridge: { broadcast: () => {} } }));

import { db } from '../../db.js';
import { sql } from 'drizzle-orm';
import { storage } from '../../storage.js';
import { guardrailPolicy } from '../../services/guardrail-policy.js';
import { buildGuardrailAuditEntries } from '../../services/guardrail-audit.js';

const RAW_DB_URL = process.env.DATABASE_URL ?? '';
const isTestDb =
  /^postgres(ql)?:\/\/[^@]*@(localhost|127\.0\.0\.1|postgres)(:\d+)?\/test(\?|$)/.test(RAW_DB_URL);
const IS_CI = !!process.env.CI;
const TAG = 'B-SIZING-INC1-GUARDRAILS-DB';
const TEST_ACTOR = 'b-sizing-inc1-test';
let dbReachable = true;
let snapshot: Record<string, unknown> | null = null;

type KsRow = { kill_switch_tripped: boolean; kill_switch_reason: string | null; kill_switch_tripped_at: Date | null; max_position_percent_pct: string };
async function paperRow(): Promise<KsRow | undefined> {
  const res: any = await db.execute(sql`
    SELECT kill_switch_tripped, kill_switch_reason, kill_switch_tripped_at, max_position_percent_pct::text AS max_position_percent_pct
      FROM guardrails_v2 WHERE mode = 'paper'`);
  const rows = res?.rows ?? res;
  return Array.isArray(rows) ? rows[0] : undefined;
}

beforeAll(async () => {
  try {
    await db.execute(sql`SELECT 1`);
  } catch (err) {
    if (IS_CI) {
      throw new Error(`[${TAG}] Postgres unreachable in CI — the persistence cannot be proved without it, and a green `
        + `suite would be a false all-clear. Original: ${err instanceof Error ? err.message : err}`);
    }
    dbReachable = false;
    console.warn(`[${TAG}] Postgres unreachable — DB legs will report as SKIPPED (not passed).`);
    return;
  }
  if (!isTestDb) return;
  const res: any = await db.execute(sql`SELECT * FROM guardrails_v2 WHERE mode = 'paper'`);
  const rows = res?.rows ?? res;
  snapshot = Array.isArray(rows) && rows[0] ? rows[0] : null;
  if (!snapshot) await db.execute(sql`INSERT INTO guardrails_v2 (mode) VALUES ('paper')`);
  vi.spyOn(storage, 'updateSystemContext').mockResolvedValue({} as any);
});

afterAll(async () => {
  if (!dbReachable || !isTestDb) return;
  await db.execute(sql`DELETE FROM audit_log WHERE changed_by = ${TEST_ACTOR}`);
  if (snapshot) {
    const s = snapshot as any;
    await db.execute(sql`UPDATE guardrails_v2 SET
        kill_switch_tripped = ${s.kill_switch_tripped}, kill_switch_reason = ${s.kill_switch_reason},
        kill_switch_tripped_at = ${s.kill_switch_tripped_at}, max_position_percent_pct = ${s.max_position_percent_pct},
        max_total_exposure_pct = ${s.max_total_exposure_pct}
      WHERE mode = 'paper'`);
  } else {
    await db.execute(sql`DELETE FROM guardrails_v2 WHERE mode = 'paper'`);
  }
});

describe(TAG, () => {
  it('the persistence is only proved on the test database (guard on the guard)', () => {
    if (IS_CI) expect(isTestDb).toBe(true);
  });

  // CONTROL — the instrument reads the row, and a reset state reads false with no reason and no time.
  it('CONTROL — after a reset the row reads not-tripped, no reason, no time', async (ctx) => {
    if (!dbReachable || !isTestDb) ctx.skip();
    await guardrailPolicy.resetKillSwitch('paper');
    const r = await paperRow();
    expect(r).toBeDefined();
    expect(r!.kill_switch_tripped).toBe(false);
    expect(r!.kill_switch_reason).toBeNull();
    expect(r!.kill_switch_tripped_at).toBeNull();
  });

  // MUTATION: route tripKillSwitch back through `upsertGuardrailsV2` and this fails — the flag stays false.
  it('a trip SAVES all three kill-switch columns', async (ctx) => {
    if (!dbReachable || !isTestDb) ctx.skip();
    await guardrailPolicy.tripKillSwitch('paper', 'P7 test trip', 21, 20);
    const r = await paperRow();
    expect(r!.kill_switch_tripped).toBe(true);
    expect(r!.kill_switch_reason).toBe('P7 test trip');
    expect(r!.kill_switch_tripped_at).not.toBeNull();
    expect(await guardrailPolicy.isKillSwitchTripped('paper')).toBe(true);
  });

  // MUTATION: route resetKillSwitch back through `upsertGuardrailsV2` and this fails — a tripped row is stranded.
  it('a reset CLEARS all three kill-switch columns', async (ctx) => {
    if (!dbReachable || !isTestDb) ctx.skip();
    await guardrailPolicy.tripKillSwitch('paper', 'P7 test trip before reset', 21, 20);
    await guardrailPolicy.resetKillSwitch('paper');
    const r = await paperRow();
    expect(r!.kill_switch_tripped).toBe(false);
    expect(r!.kill_switch_reason).toBeNull();
    expect(r!.kill_switch_tripped_at).toBeNull();
  });

  // F9 — the lost update. A guardrail saved AFTER the old code's read was reverted by the trip's full-row
  // write. MUTATION: restore the read + `upsertGuardrailsV2` path and this fails — the stale 20.00 lands.
  it('a trip does NOT revert a guardrail saved after a stale read', async (ctx) => {
    if (!dbReachable || !isTestDb) ctx.skip();
    await guardrailPolicy.resetKillSwitch('paper');
    await db.execute(sql`UPDATE guardrails_v2 SET max_position_percent_pct = 7.00 WHERE mode = 'paper'`);
    const real = await storage.getGuardrailsV2({ mode: 'paper' });
    const stale = { ...(real as any), maxPositionPercentPct: '20.00' };
    const readSpy = vi.spyOn(storage, 'getGuardrailsV2').mockResolvedValue(stale as any);
    try {
      await guardrailPolicy.tripKillSwitch('paper', 'P7 lost-update probe', 21, 20);
    } finally {
      readSpy.mockRestore();
    }
    const r = await paperRow();
    expect(Number(r!.max_position_percent_pct)).toBe(7);
    expect(r!.kill_switch_tripped).toBe(true);
    await guardrailPolicy.resetKillSwitch('paper');
  });
  // P5 — the database's own refusal (migration 2026-09-29-b-sizing-p5-guardrail-pct-range.sql).
  // CONTROL: an in-range value is accepted, so the refusals below are the CHECK's doing.
  it('CONTROL — the CHECKs accept 5 and 100', async (ctx) => {
    if (!dbReachable || !isTestDb) ctx.skip();
    await db.execute(sql`UPDATE guardrails_v2 SET max_position_percent_pct = 5.00, max_total_exposure_pct = 100.00 WHERE mode = 'paper'`);
    expect(Number((await paperRow())!.max_position_percent_pct)).toBe(5);
  });

  // Increment 2b: the edges of the new position range are accepted — 1 and 100.
  it('CONTROL (2b) — the position CHECK accepts its edges, 1 and 100', async (ctx) => {
    if (!dbReachable || !isTestDb) ctx.skip();
    await db.execute(sql`UPDATE guardrails_v2 SET max_position_percent_pct = 1.00 WHERE mode = 'paper'`);
    expect(Number((await paperRow())!.max_position_percent_pct)).toBe(1);
    await db.execute(sql`UPDATE guardrails_v2 SET max_position_percent_pct = 100.00 WHERE mode = 'paper'`);
    expect(Number((await paperRow())!.max_position_percent_pct)).toBe(100);
  });

  // MUTATION: drop the migrations' constraints and these fail — the bad value saves. Increment 2b replaced the
  // position constraint's floor (> 0 → >= 1, 2026-09-29-b-sizing-inc2b-position-pct-floor.sql): 0 and 0.99 are below
  // it, 100.01 and 500 above the ceiling; exposure keeps increment 1's > 0.
  for (const [col, v] of [['max_position_percent_pct', 0], ['max_position_percent_pct', 0.99], ['max_position_percent_pct', 100.01], ['max_position_percent_pct', 500], ['max_total_exposure_pct', 0]] as const) {
    it(`the database refuses ${col} = ${v}`, async (ctx) => {
      if (!dbReachable || !isTestDb) ctx.skip(); // run-time skip: it.each hands no test context
      await expect(db.execute(sql.raw(`UPDATE guardrails_v2 SET ${col} = ${v} WHERE mode = 'paper'`))).rejects.toThrow();
    });
  }

  // P6 — the save and its audit rows are ONE transaction.
  // CONTROL: with no audit rows the write lands, so a failed write below is the audit row's doing.
  it('CONTROL — a guardrails write with no audit rows lands', async (ctx) => {
    if (!dbReachable || !isTestDb) ctx.skip();
    await storage.upsertGuardrailsV2WithAudit({ mode: 'paper', maxPositionPercentPct: '6.00' } as any, () => []);
    expect(Number((await paperRow())!.max_position_percent_pct)).toBe(6);
  });

  // MUTATION: write the audit rows outside the transaction (the old route) and this fails — 8.00 lands unrecorded.
  // The audit row is made to fail on a constraint the database ALWAYS enforces: `field` is varchar(100).
  // (A first version used an unknown `changed_by` user; CI showed the test database does not enforce that
  // foreign key, so the insert succeeded and the leg failed for the wrong reason.)
  it('a failing audit row rolls the guardrails write back', async (ctx) => {
    if (!dbReachable || !isTestDb) ctx.skip();
    const badAudit = [{ entityType: 'guardrails', field: 'x'.repeat(150), oldValue: '6.00', newValue: '8.00',
      changedBy: TEST_ACTOR, tradingMode: 'paper' }] as any;
    await expect(storage.upsertGuardrailsV2WithAudit({ mode: 'paper', maxPositionPercentPct: '8.00' } as any, () => badAudit)).rejects.toThrow();
    expect(Number((await paperRow())!.max_position_percent_pct)).toBe(6);
  });
  // FINDING-2 — the OTHER direction: a valid audit row is WRITTEN, in the save's transaction, and it
  // records what the column STORED (numeric(5,2) turns a sent 6.555 into 6.56 — FINDING-1).
  // MUTATION: delete `tx.insert(auditLog)` from upsertGuardrailsV2WithAudit and this fails (no row).
  it('a valid audit row is written with the stored value, beside the save', async (ctx) => {
    if (!dbReachable || !isTestDb) ctx.skip();
    await db.execute(sql`DELETE FROM audit_log WHERE changed_by = ${TEST_ACTOR}`);
    const before = await storage.getGuardrailsV2({ mode: 'paper' });
    const saved = await storage.upsertGuardrailsV2WithAudit({ mode: 'paper', maxPositionPercentPct: '6.555' } as any, (written) =>
      buildGuardrailAuditEntries(before as any, written as any, ['maxPositionPercentPct'], TEST_ACTOR, 'paper'));
    expect(Number(saved.maxPositionPercentPct)).toBe(6.56);
    const res: any = await db.execute(sql`
      SELECT field, old_value, new_value FROM audit_log WHERE changed_by = ${TEST_ACTOR}`);
    const rows = res?.rows ?? res;
    expect(rows).toHaveLength(1);
    expect(rows[0].field).toBe('maxPositionPercentPct');
    expect(rows[0].old_value).toBe('6.00');
    expect(rows[0].new_value).toBe('6.56');
  });
});

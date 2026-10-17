/**
 * B-RTB-QUEUED-STATUS-SWEEP (#1204, SPRINT_TO_LIVE_PLAN row 59g) — the RTB queue reads only the two statuses a writer
 * produces ('active', 'reconfirmed'); the never-firing promotion clean-up, the always-empty expired-status clean-up and the
 * callerless updateRtbSignal are gone; the column has no default; the three writer-less columns are dropped.
 * Scope `Scope Files/B_RTB_QUEUED_STATUS_SWEEP_SCOPE.md`, audit `..._PRE_AUDIT.md` (Langston-approved).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const calls = vi.hoisted(() => ({ statuses: [] as string[], onPromotion: 0 }));
vi.mock('../../db.js', () => ({ db: {} }));
vi.mock('../../storage', () => ({
  storage: {
    getRtbSignals: vi.fn(async (f: { status?: string }) => { calls.statuses.push(String(f.status)); return []; }),
  },
}));
vi.mock('../../lib/event-bus', () => ({
  eventBus: { onPromotion: () => { calls.onPromotion++; }, on: vi.fn(), emit: vi.fn() },
}));
vi.mock('../../services/central-clock', () => ({
  centralClock: { subscribe: vi.fn(), unsubscribe: vi.fn(), start: vi.fn(), getTickNumber: () => 0, getIsRunning: () => false },
}));

import { readyToBuyService } from '../../core/rtb/ready_to_buy_service';
import { tclWatchdog } from '../../core/rtb/tcl_watchdog';

const ROOT = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

beforeEach(() => { calls.statuses = []; });

describe('the queue reads only the statuses a writer produces', () => {
  it('getQueuedSignals asks for active and reconfirmed, nothing else', async () => {
    await readyToBuyService.getQueuedSignals('paper' as any);
    expect([...calls.statuses].sort()).toEqual(['active', 'reconfirmed']);
  });
  it('the TCL pool count asks for active and reconfirmed, nothing else', async () => {
    await (tclWatchdog as any).getLivePoolCount('paper');
    expect([...calls.statuses].sort()).toEqual(['active', 'reconfirmed']);
  });
  it('constructing the service registers no PROMOTION listener (the clean-up that never fired is gone)', () => {
    expect(calls.onPromotion).toBe(0);
  });
});

describe('migration part 2 — the contraction, shipped after the code that stops naming the columns', () => {
  it('drops exactly the three writer-less columns, touches no index or default, and is registered after part 1', () => {
    const m = read('drizzle/migrations/2026-10-17-b-rtb-queued-status-sweep-part2.sql');
    for (const col of ['promoted_at', 'promoted_trade_id', 'expired_at']) expect(m).toMatch(new RegExp(`DROP COLUMN IF EXISTS ${col};`));
    expect(m.match(/DROP COLUMN/g)).toHaveLength(3);
    // statements only — the header comment may name either word (Langston, Step 8 record item)
    expect(m.split(/\r?\n/).filter((l) => !l.trim().startsWith('--')).join('\n')).not.toMatch(/INDEX|DEFAULT/);
    const manifest = read('drizzle/migrations/MANIFEST.txt').split(/\r?\n/);
    expect(manifest.indexOf('2026-10-17-b-rtb-queued-status-sweep-part2.sql')).toBeGreaterThan(manifest.indexOf('2026-10-17-b-rtb-queued-status-sweep.sql'));
    const rb = read('drizzle/migrations/2026-10-17-b-rtb-queued-status-sweep-part2-rollback.sql');
    for (const col of ['promoted_at', 'promoted_trade_id', 'expired_at']) expect(rb).toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS ${col}`));
  });
});

describe('fences — the deleted names and the retired status', () => {
  const rts = read('server/core/rtb/ready_to_buy_service.ts');
  it('the dead promotion clean-up, its lookup and the expired-status clean-up are gone', () => {
    expect(rts).not.toMatch(/registerPromotionHandler|promotionHandlerRegistered|async removeSignalBySymbol|async cleanupExpiredSignals/);
    expect(rts).not.toMatch(/status:\s*'queued'/);
    for (const f of ['server/services/active-execution-engine.ts', 'server/startup/trading-bootstrap.ts', 'server/routes.ts']) {
      expect(read(f), f).not.toMatch(/cleanupExpiredSignals\s*\(/);
    }
  });
  it('updateRtbSignal is gone from storage (its only production caller was the deleted lookup)', () => {
    expect(read('server/storage.ts')).not.toMatch(/updateRtbSignal\s*\(/);
  });
  it("no reader asks for 'queued' on the queue table", () => {
    expect(read('server/core/rtb/tcl_watchdog.ts')).not.toMatch(/status:\s*'queued'/); // a comment may name the retired label
    expect(read('server/routes.ts')).not.toMatch(/IN \('queued'/);
    expect(read('server/routes.ts')).not.toMatch(/\buiStatus\b/);
    expect(read('client/src/components/trading/ready-to-buy-table.tsx')).not.toMatch(/\|\| 'queued'/);
  });
  it('the status column has no default and the three writer-less columns are gone from the schema', () => {
    const schema = read('shared/schema.ts');
    const start = schema.indexOf('export const rtbSignals = pgTable(');
    const rtb = schema.slice(start, schema.indexOf('export const ', start + 10)); // this table only (rtb_shadow_pairings keeps its own promoted_trade_id)
    expect(rtb).toMatch(/status: rtbSignalStatusEnum\("status"\)\.notNull\(\),/);
    expect(rtb).not.toMatch(/\("promoted_at"|\("expired_at"|\("promoted_trade_id"/);
  });
  it('part 1 of the migration drops ONLY the default (expand/contract — the column drops ship in part 2, Langston Step 4)', () => {
    const m = read('drizzle/migrations/2026-10-17-b-rtb-queued-status-sweep.sql');
    expect(m).toMatch(/ALTER COLUMN status DROP DEFAULT/);
    expect(m).not.toMatch(/DROP COLUMN/); // a contraction must not commit while the old build still serves
    expect(m).not.toMatch(/CREATE (UNIQUE )?INDEX|DROP INDEX/i); // the #1006 index is not touched
    expect(read('drizzle/migrations/MANIFEST.txt')).toMatch(/^2026-10-17-b-rtb-queued-status-sweep\.sql$/m);
    expect(read('drizzle/migrations/2026-10-17-b-rtb-queued-status-sweep-rollback.sql')).toMatch(/SET DEFAULT 'queued'/);
  });
});

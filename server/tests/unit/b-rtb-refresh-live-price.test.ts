/**
 * B-RTB-REFRESH-LIVE-PRICE (sprint row 59e; `#1168` frozen-levels half, `#1189` = Coltrane's [C1]; Kyle's directive 3).
 *
 * The RTB refresh fetched the price and threw it away (`rtb-refresh-service.ts`, since `7a029f390`). Now it reads the live ASK
 * through the exit's own contract, dispatched on the row's persisted class, and RETIRES a queued signal whose ask is at or
 * through its own stop or target — crypto on the first pass, xStock on the second consecutive. A signal the refresh rejected
 * can no longer be opened: its latch is held through the delete, and the promotion claim returns an outcome the engine honours.
 *
 * Fixtures are the six rows of the pre-audit's read 1 (`B_RTB_REFRESH_LIVE_PRICE_PRE_AUDIT.md` §1.1, staging 2026-10-12 07:37Z).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ── module mocks (the queue service is imported for real) ───────────────────────────────────────────────────────────────
vi.mock('../../db.js', () => ({
  db: {
    select: () => ({ from: () => ({ where: async () => [] }) }),
    insert: () => ({ values: () => ({ onConflictDoUpdate: async () => undefined }) }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
    execute: async () => ({ rows: [] }),
  },
}));

const store: { rows: any[]; deletes: string[][]; updates: any[]; deleteGate: Promise<void> | null; deleteThrows: boolean; deleteZero: boolean; updatedRow: any[] } = {
  rows: [], deletes: [], updates: [], deleteGate: null, deleteThrows: false, deleteZero: false, updatedRow: [],
};
vi.mock('../../storage.js', () => ({
  storage: {
    hasActivePair: async () => false,
    // filters by status like the real query — `getQueuedSignals` reads each status separately and concatenates
    getRtbSignals: async (f: any) => store.rows.filter((r) => !f?.status || r.status === f.status),
    getRtbSignalById: async (id: string) => store.rows.find((r) => r.id === id) ?? null,
    getSystemContext: async () => ({ isEngineActive: true, activeAssetClasses: { crypto_spot: true, xstock_spot: true } }),
    upsertRtbSignal: async (d: any) => ({ id: 'x', ...d }),
    deleteRtbSignalsByIds: async (ids: string[]) => {
      if (store.deleteGate) await store.deleteGate;
      store.deletes.push([...ids]);
      store.rows = store.rows.filter((r) => !ids.includes(r.id));
      return ids.length;
    },
    deleteRtbSignals: async ({ id }: { id: string }) => {
      if (store.deleteThrows) throw new Error('delete failed (test)');
      if (store.deleteZero) return 0; // a no-match: the real query returns 0 rows and does not throw
      store.deletes.push([id]);
      store.rows = store.rows.filter((r) => r.id !== id);
      return 1;
    },
    updateRtbSignalsBatch: async (u: any[]) => { store.updates.push(...u); return u.length; },
    updateRtbSignal: async (id: string, u: any) => { store.updatedRow.push({ id, u }); return null; },
  },
}));
vi.mock('../../services/context-bridge', () => ({ contextBridge: { broadcast: async () => undefined } }));
const archived: any[] = [];
vi.mock('../../services/data-archive/signal-eval-archiver.js', () => ({ archiveSignalEval: (row: any) => { archived.push(row); } }));

import { readyToBuyService } from '../../core/rtb/ready_to_buy_service.js';
import { signalQualityEvaluator } from '../../core/filters/signal_quality_evaluator';
import { decideRetirement, type RetirementAsk } from '../../core/rtb/rtb-price-retirement.js';

const ROOT = process.cwd();
const src = (p: string) => readFileSync(join(ROOT, p), 'utf-8').replace(/\r\n/g, '\n');
const RTB = 'server/core/rtb/ready_to_buy_service.ts';
const RRS = 'server/services/rtb-refresh-service.ts';
const AEE = 'server/services/active-execution-engine.ts';
const ASK = 'server/services/rtb-retirement-ask.ts';

const ok = (ask: number, bid = ask * 0.999): RetirementAsk => ({ ok: true, ask, bid, ageMs: 500, basis: 'test', readAtMs: Date.now(), ceilingMs: 2_000 });

// ── 1. the decision (pure) — read 1's six rows ─────────────────────────────────────────────────────────────────────────
describe('1. decideRetirement — the six would-retire rows of read 1, and the rest', () => {
  const crypto = (ask: number, stop: number, target: number | null) =>
    decideRetirement({ assetClass: 'crypto_spot', ask: ok(ask), stopPrice: stop, targetPrice: target, prior: null }).decision;
  it('DOT ×2 and ONDO — past target ⇒ retired on the first pass (crypto)', () => {
    expect(crypto(1.2768, 0.9878, 1.0758)).toMatchObject({ action: 'retire', reason: 'ask_at_or_through_target', passes: 1 });
    expect(crypto(1.2768, 1.0497, 1.1443)).toMatchObject({ action: 'retire', reason: 'ask_at_or_through_target' });
    expect(crypto(0.51639, 0.43144, 0.49186)).toMatchObject({ action: 'retire', reason: 'ask_at_or_through_target' });
  });
  it('SENT — past stop ⇒ retired on the first pass (crypto)', () => {
    expect(crypto(0.021223, 0.022529, 0.02902)).toMatchObject({ action: 'retire', reason: 'ask_at_or_through_stop' });
  });
  it('SKHY, SNDK — past stop, xStock ⇒ HELD on the first pass, retired on the second consecutive', () => {
    for (const [ask, stop, tgt] of [[167.95, 169.14, 172.8], [1564.59, 1575.72, 1600.8]]) {
      const p1 = decideRetirement({ assetClass: 'xstock_spot', ask: ok(ask), stopPrice: stop, targetPrice: tgt, prior: null });
      expect(p1.decision).toMatchObject({ action: 'hold_breach', reason: 'ask_at_or_through_stop', passes: 1 });
      const p2 = decideRetirement({ assetClass: 'xstock_spot', ask: ok(ask), stopPrice: stop, targetPrice: tgt, prior: p1.nextBreach });
      expect(p2.decision).toMatchObject({ action: 'retire', reason: 'ask_at_or_through_stop', passes: 2 });
      expect(p2.nextBreach).toBeNull();
    }
  });
  it('a signal strictly inside its levels ⇒ inside, streak cleared', () => {
    const r = decideRetirement({ assetClass: 'xstock_spot', ask: ok(170), stopPrice: 169.14, targetPrice: 172.8, prior: { reason: 'ask_at_or_through_stop', passes: 1 } });
    expect(r.decision).toEqual({ action: 'inside' });
    expect(r.nextBreach).toBeNull();
  });
  it('⛔ an unpriced pass is no decision AND resets the streak (C6, the conservative direction)', () => {
    const r = decideRetirement({ assetClass: 'xstock_spot', ask: { ok: false, reason: 'xstock_stale' }, stopPrice: 169.14, targetPrice: 172.8, prior: { reason: 'ask_at_or_through_stop', passes: 1 } });
    expect(r.decision).toEqual({ action: 'unpriced', reason: 'xstock_stale' });
    expect(r.nextBreach).toBeNull();
  });
  it('a refusal on the OTHER level restarts the count at 1', () => {
    const r = decideRetirement({ assetClass: 'xstock_spot', ask: ok(173), stopPrice: 169.14, targetPrice: 172.8, prior: { reason: 'ask_at_or_through_stop', passes: 1 } });
    expect(r.decision).toMatchObject({ action: 'hold_breach', reason: 'ask_at_or_through_target', passes: 1 });
  });
  it('⛔ Step-4 CONDITION 1: an ask fresh when READ but past its ceiling when DECIDED ⇒ unpriced (ask_expired), never a retirement', () => {
    const t0 = 1_800_000_000_000;
    const ask: RetirementAsk = { ok: true, ask: 1.2768, bid: 1.2767, ageMs: 1_400, basis: 'test', readAtMs: t0, ceilingMs: 2_000 };
    const late = decideRetirement({ assetClass: 'crypto_spot', ask, stopPrice: 0.9878, targetPrice: 1.0758, prior: null, nowMs: t0 + 700 });
    expect(late.decision).toEqual({ action: 'unpriced', reason: 'ask_expired' });
    const inTime = decideRetirement({ assetClass: 'crypto_spot', ask, stopPrice: 0.9878, targetPrice: 1.0758, prior: null, nowMs: t0 + 500 });
    expect(inTime.decision).toMatchObject({ action: 'retire' });
  });
  it('a class with no rule, a non-finite stop, a null target ⇒ never a false retirement', () => {
    expect(decideRetirement({ assetClass: 'crypto_perp', ask: ok(1), stopPrice: 2, targetPrice: 3, prior: null }).decision).toEqual({ action: 'unpriced', reason: 'class_unsupported' });
    expect(decideRetirement({ assetClass: null, ask: ok(1), stopPrice: 2, targetPrice: 3, prior: null }).decision).toEqual({ action: 'unpriced', reason: 'class_unsupported' });
    expect(decideRetirement({ assetClass: 'crypto_spot', ask: ok(1), stopPrice: Number.NaN, targetPrice: 3, prior: null }).decision).toEqual({ action: 'unpriced', reason: 'stop_not_finite' });
    expect(crypto(5, 2, null)).toEqual({ action: 'inside' }); // no target ⇒ the target arm cannot fire
  });
});

// ── 2. the refresh — retirement, the latch held through the delete ([C1](a)), the map cleaned ──────────────────────────
function row(id: string, symbol: string, cls: string, entry: number, stop: number, target: number | null) {
  return {
    id, mode: 'paper', signalId: `sig-${id}`, symbol, strategy: 'pivot_shift', entryPrice: String(entry), stopPrice: String(stop),
    targetPrice: target === null ? null : String(target), confidence: '0.8', assetClass: cls, status: 'reconfirmed',
    queuedAt: new Date('2026-10-08T17:45:35Z'), metadata: { assetClass: cls },
  };
}
const keyOf = (r: any) => `paper:${r.symbol}:${r.strategy}`;

describe('2. refreshAndRank — the price check inside the refresh', () => {
  beforeEach(() => {
    store.rows = []; store.deletes = []; store.updates = []; store.deleteGate = null; store.deleteThrows = false; store.deleteZero = false; store.updatedRow = [];
    archived.length = 0;
    vi.spyOn(readyToBuyService as any, 'acquireRefreshedInputs').mockResolvedValue({
      decayPenalty: 0, refreshedFinalScore: 0.6, refreshedRegimeWeight: 0.6, currentVol: 0.02, refreshedMT: null,
      netExpectedEdge: 0.01, currentSpread: 0.001, geometryRefreshed: false,
    });
    vi.spyOn(signalQualityEvaluator, 'evaluate').mockResolvedValue({ passed: true, failures: [], reason: undefined } as any);
  });

  it('DOT past its target is retired: deleted, archived (rtb-refresh / rtb_price), not reconfirmed; an inside signal is reconfirmed', async () => {
    const dot = row('r-dot', 'DOT/USD', 'crypto_spot', 1.0208, 0.9878, 1.0758);
    const btc = row('r-btc', 'BTC/USD', 'crypto_spot', 100, 95, 110);
    store.rows = [dot, btc];
    const asks = new Map<string, RetirementAsk>([[keyOf(dot), ok(1.2768)], [keyOf(btc), ok(101)]]);
    await readyToBuyService.refreshAndRank('paper' as any, new Set([keyOf(dot), keyOf(btc)]), asks);
    expect(store.deletes.flat()).toEqual(['r-dot']);
    expect(store.updates.map((u) => u.id)).toEqual(['r-btc']);
    await new Promise((r) => setTimeout(r, 0));
    const ret = archived.find((a) => a.rejectStage === 'rtb_price');
    expect(ret).toMatchObject({ source: 'rtb-refresh', symbol: 'DOT/USD', assetClass: 'crypto_spot' });
    expect(ret.gateDecision).toMatchObject({ reason: 'ask_at_or_through_target', ask: 1.2768, rtbQueueId: 'r-dot' });
  });

  it('⛔ the SQE never sees a retired signal (the price check runs first)', async () => {
    const sent = row('r-sent', 'SENT/USD', 'crypto_spot', 0.024693, 0.022529, 0.02902);
    store.rows = [sent];
    const ev = vi.spyOn(signalQualityEvaluator, 'evaluate');
    ev.mockClear();
    await readyToBuyService.refreshAndRank('paper' as any, new Set([keyOf(sent)]), new Map([[keyOf(sent), ok(0.021223)]]));
    expect(ev).not.toHaveBeenCalled();
    expect(store.deletes.flat()).toEqual(['r-sent']);
  });

  it('an xStock past its stop survives the FIRST pass (reconfirmed) and is retired on the SECOND', async () => {
    const skhy = row('r-skhy', 'SKHY/USD', 'xstock_spot', 170.36, 169.14, 172.8);
    store.rows = [skhy];
    const asks = new Map([[keyOf(skhy), ok(167.95)]]);
    await readyToBuyService.refreshAndRank('paper' as any, new Set([keyOf(skhy)]), asks);
    expect(store.deletes.flat()).toEqual([]);
    await readyToBuyService.refreshAndRank('paper' as any, new Set([keyOf(skhy)]), asks);
    expect(store.deletes.flat()).toEqual(['r-skhy']);
  });

  it('no ask supplied, or a refused ask ⇒ no price decision — the signal goes to the SQE as before', async () => {
    const a = row('r-a', 'AAA/USD', 'crypto_spot', 1, 0.9, 1.2);
    const b = row('r-b', 'BBB/USD', 'crypto_spot', 1, 0.9, 1.2);
    store.rows = [a, b];
    await readyToBuyService.refreshAndRank('paper' as any, new Set([keyOf(a), keyOf(b)]), new Map([[keyOf(b), { ok: false, reason: 'crypto_stale_book_stale_book' }]]));
    expect(store.deletes.flat()).toEqual([]);
    expect(store.updates.map((u) => u.id).sort()).toEqual(['r-a', 'r-b']);
  });

  it('⛔ [C1](a): a retired signal stays UNSELECTABLE until its delete has run, then its refresh state is gone', async () => {
    const dot = row('r-dot2', 'DOT/USD', 'crypto_spot', 1.0208, 0.9878, 1.0758);
    const btc = row('r-btc2', 'BTC/USD', 'crypto_spot', 100, 95, 110);
    store.rows = [dot, btc];
    let release!: () => void;
    store.deleteGate = new Promise<void>((r) => { release = r; });
    const run = readyToBuyService.refreshAndRank('paper' as any, new Set([keyOf(dot), keyOf(btc)]),
      new Map([[keyOf(dot), ok(1.2768)], [keyOf(btc), ok(101)]]));
    await new Promise((r) => setTimeout(r, 20)); // the chunks have finished; the delete is pending
    expect(readyToBuyService.isSignalRefreshing('paper' as any, 'sig-r-dot2')).toBe(true);   // held — promotion skips it
    expect(readyToBuyService.isSignalRefreshing('paper' as any, 'sig-r-btc2')).toBe(false);  // released as before
    release();
    await run;
    expect(readyToBuyService.isSignalRefreshing('paper' as any, 'sig-r-dot2')).toBe(false);
    expect((readyToBuyService as any).signalRefreshStates.has('paper:sig-r-dot2')).toBe(false); // the map entry went with it
  });
});

// ── 3. the promotion claim ([C1](b) + C7) ──────────────────────────────────────────────────────────────────────────────
describe('3. promoteSignal — a claim with an outcome', () => {
  beforeEach(() => { store.rows = []; store.deletes = []; store.deleteThrows = false; store.deleteZero = false; store.updatedRow = []; });
  it("'deleted' when the row is there and nothing is refreshing it", async () => {
    store.rows = [row('p1', 'BTC/USD', 'crypto_spot', 100, 95, 110)];
    expect(await readyToBuyService.promoteSignal('p1')).toBe('deleted');
    expect(store.deletes.flat()).toEqual(['p1']);
  });
  it("'missing' when a refresh deleted it after selection — the engine must not open it", async () => {
    expect(await readyToBuyService.promoteSignal('gone')).toBe('missing');
  });
  it("⛔ Step-4 CONDITION 2: a delete that removed ZERO rows ⇒ 'missing', never 'deleted'", async () => {
    store.rows = [row('p4', 'ADA/USD', 'crypto_spot', 100, 95, 110)];
    store.deleteZero = true;
    expect(await readyToBuyService.promoteSignal('p4')).toBe('missing');
  });
  it("'refreshing' when a refresh pass holds its latch — not deleted, still queued", async () => {
    store.rows = [row('p2', 'ETH/USD', 'crypto_spot', 100, 95, 110)];
    (readyToBuyService as any).getSignalRefreshState('paper', 'sig-p2').isRefreshing = true;
    expect(await readyToBuyService.promoteSignal('p2')).toBe('refreshing');
    expect(store.deletes.flat()).toEqual([]);
    (readyToBuyService as any).getSignalRefreshState('paper', 'sig-p2').isRefreshing = false;
  });
  it("⛔ C7: a delete that throws ⇒ 'delete_failed', and NOTHING is written (no 'promoted' mark, which was invisible and permanent)", async () => {
    store.rows = [row('p3', 'SOL/USD', 'crypto_spot', 100, 95, 110)];
    store.deleteThrows = true;
    expect(await readyToBuyService.promoteSignal('p3')).toBe('delete_failed');
    expect(store.updatedRow).toEqual([]);
    expect(store.rows.map((r) => r.id)).toEqual(['p3']);
  });
});

// ── 3b. the shadow's own rate limit (Step-4 CONDITION 3) ──────────────────────────────────────────────────────────────
describe('3b. the shadow row — hourly, plus a verdict change no sooner than 10 minutes after the last row', () => {
  it('a signal flipping across its floor every pass writes ONE row per 10 minutes, carrying the flip count', () => {
    archived.length = 0;
    const st: any = { priceBreach: null, lastShadowAtMs: null, lastShadowWouldRefuse: null, shadowFlipsSinceRow: 0, rrFloor: { value: 2.0, unresolved: false } };
    const sig: any = row('s1', 'ONDO/USD', 'crypto_spot', 1.0, 0.9, 1.2); // RR at plan = 2.0, exactly on the floor
    let now = 1_800_000_000_000;
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => now);
    const shadow = (askPx: number) => (readyToBuyService as any)._maybeArchivePriceShadow('paper', sig, 'crypto_spot',
      { ok: true, ask: askPx, bid: askPx * 0.999, ageMs: 100, basis: 't', readAtMs: now, ceilingMs: 2_000 }, 0.9, 1.2, st, { action: 'inside' });
    shadow(0.999);                       // first ever ⇒ a row (rr just above the floor)
    for (let i = 0; i < 20; i++) { now += 15_000; shadow(i % 2 ? 0.999 : 1.001); } // 20 flips across the floor in 5 minutes
    expect(archived.length).toBe(0);     // the archive is fire-and-forget; let it settle below
    return new Promise<void>((res) => setTimeout(() => {
      expect(archived.filter((a) => a.rejectStage === 'rtb_price_shadow').length).toBe(1);
      now += 600_000; shadow(1.001);     // past the change interval, on a flip ⇒ one row carrying the count
      setTimeout(() => {
        const rows = archived.filter((a) => a.rejectStage === 'rtb_price_shadow');
        expect(rows.length).toBe(2);
        expect(rows[1].gateDecision.sample).toBe('verdict_change');
        expect(rows[1].gateDecision.flipsSinceLastRow).toBeGreaterThanOrEqual(20);
        spy.mockRestore();
        res();
      }, 5);
    }, 5));
  });
});

// ── 4. source fences ───────────────────────────────────────────────────────────────────────────────────────────────────
describe('4. fences on the wiring', () => {
  it('the refresh service hands the asks in and runs the refresh whenever the bucket has signals; cyclesRun keeps its old gate (C9)', () => {
    const s = src(RRS);
    expect(s).toMatch(/await readyToBuyService\.refreshAndRank\(mode, bucketKeysAtIndex, asks\);/);
    const callAt = s.indexOf('await readyToBuyService.refreshAndRank(mode, bucketKeysAtIndex, asks);');
    const gateAt = s.indexOf('if (validPrices.size > 0) {');
    expect(gateAt).toBeGreaterThan(callAt);                              // the call is no longer inside the mark-cache gate
    expect(s.slice(gateAt, gateAt + 200)).toMatch(/recordActiveRtbRefresh\(mode, cls, \{ cyclesRun: 1 \}\)/);
    expect(s).toMatch(/readRetirementAsk\(\s*\{ symbol: s\.symbol, assetClass: s\.assetClass \?\? null/);
  });
  it('the refresh decides on price BEFORE the SQE evaluation, and retires through the delete path', () => {
    const s = src(RTB);
    const dec = s.indexOf('const _rp = decideRetirement(');
    const sqe = s.indexOf('await signalQualityEvaluator.evaluate(sqeInput, { gateShadowMode: true })');
    expect(dec).toBeGreaterThan(0);
    expect(sqe).toBeGreaterThan(dec);
  });
  it('the decision dispatches on the ROW class, never the symbol-resolved SQE class (Step-4 record 1)', () => {
    const s = src(RTB);
    expect(s).toMatch(/const _rpClass = asValidAssetClass\(signal\.assetClass\);\n\s*const _rp = decideRetirement\(\{ assetClass: _rpClass,/);
  });
  it('⛔ [C1](a): the finally releases the latch ONLY for a signal not being deleted', () => {
    expect(src(RTB)).toMatch(/if \(!bulkDeletes\.includes\(signal\.id\)\) _refreshState\.isRefreshing = false;/);
  });
  it('⛔ [C1](b): the engine opens only on a deleted claim, and the dead second promoteSignal call is gone', () => {
    const s = src(AEE);
    expect(s).toMatch(/const _claim = await readyToBuyService\.promoteSignal\(signal\.id\);\n\s*if \(_claim !== 'deleted'\) \{/);
    expect(s).not.toMatch(/promoteSignal\(signal\.id, tradeResult\.tradeId\)/);
    expect(s).not.toMatch(/promoteSignal\(signal\.id, 'pending'\)/);
  });
  it('⛔ C1/C5/C6: the ask contract dispatches on the persisted class, uses the EXIT policy, and has no fallback price', () => {
    const s = src(ASK);
    expect(s).toMatch(/const cls = asValidAssetClass\(signal\.assetClass\);/);
    expect(s).not.toMatch(/safeResolveAssetClass|resolveAssetClass\(/);                  // never from the symbol (C5)
    expect(s).toMatch(/maxAgeMs: EXIT_TRIGGER_MAX_AGE_MS,\s*\n\s*maxSpreadFraction: EXIT_TRIGGER_MAX_SPREAD_FRACTION/);
    expect(s).not.toMatch(/ENTRY_LEG_NO_SPREAD_CEILING|ENTRY_FILL_TOUCH_MAX_AGE_MS/);      // not the entry policy
    expect(s).not.toMatch(/getTickerWitness|getCachedPrice|\.price \?\?|getDepthSnapshot/); // no fail-open or mark fallback
    expect(s).toMatch(/if \(yardstick\.median === null\) return \{ ok: false/);            // C6: no yardstick ⇒ keep
  });
  it('C8: the two exit constants live in crypto-touch.ts (pure) and the engine imports them back; one readers object', () => {
    const ct = src('server/core/trading/crypto-touch.ts');
    expect(ct).toMatch(/export const EXIT_TRIGGER_MAX_AGE_MS = 2_000;/);
    expect(ct).toMatch(/export const EXIT_TRIGGER_MAX_SPREAD_FRACTION = 0\.02;/);
    expect(ct).toMatch(/f = 0\.10/);                                                       // the derivation travelled with it
    expect(ct.match(/^import /gm)?.length).toBe(1);                                        // still pure
    const aee = src(AEE);
    expect(aee).not.toMatch(/^const EXIT_TRIGGER_MAX_(AGE_MS|SPREAD_FRACTION)/m);
    expect(aee).toMatch(/import \{ CRYPTO_TOUCH_READERS \} from '\.\/execution\/crypto-touch-readers\.js';/);
    expect(src('server/services/vts-runner.ts')).not.toMatch(/const VTS_CRYPTO_TOUCH_READERS: CryptoTouchReaders = \{/);
  });
  it('item 11: the schema declares the three-column unique index the upsert targets', () => {
    expect(src('shared/schema.ts')).toMatch(/uniqueIndex\("rtb_signals_symbol_strategy_idx"\)\.on\(table\.mode, table\.symbol, table\.strategy\),/);
  });
  it('rule 18: the two zero-caller methods are gone', () => {
    const s = src(RTB);
    expect(s).not.toMatch(/purgeInactiveClassSignals|async hasPair\(/);
  });
});

/**
 * `3n.q3` B-VTS-NO-DECISION-VALVE — a VTS max-hold exit with no usable sell side closes with NO price.
 * Plan: `Claude Comms and Packages/Scope Files/B_VTS_NO_DECISION_VALVE_PRE_AUDIT.md` (Step 2 approved, C4-C7).
 *
 * Behavioural where the code can be driven (the resolver, the counters, the shadow outcome math, the unpriced close itself
 * with its archive write, Map delete, soft-close and BOTH cooldown keys); source fences where the runner's 6,000-line loop
 * cannot be driven in a unit test (what the unpriced close never calls, the weekend skip's placement, the alert reason).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const h = vi.hoisted(() => ({
  archive: vi.fn(),
  markClosed: vi.fn(async (_id: string) => {}),
}));
vi.mock('../../services/data-archive/exit-decision-archiver.js', async (orig) => ({
  ...(await orig<typeof import('../../services/data-archive/exit-decision-archiver.js')>()),
  archiveExitDecision: (i: unknown) => h.archive(i),
}));
vi.mock('../../services/vts-trade-persistence.js', async (orig) => ({
  ...(await orig<typeof import('../../services/vts-trade-persistence.js')>()),
  markOpenTradeClosed: (id: string) => h.markClosed(id),
}));

import { resolveVtsBookedExitPrice } from '../../core/trading/vts-exit-booking.js';
import {
  countersFor, countUnpricedArm, formatVtsExitCounters, newVtsExitCounters, resetVtsExitCounters, anyVtsExitCount,
} from '../../core/trading/vts-exit-counters.js';
import {
  closeVtsTradeUnpriced, computeShadowOutcomeMath, getOpenVirtualTradesMap, getVtsRecentCloseAt,
} from '../../services/vts-runner.js';

const VTS = readFileSync(join(process.cwd(), 'server/services/vts-runner.ts'), 'utf-8').replace(/\r\n/g, '\n');
const body = (fn: string): string => {
  const a = VTS.indexOf(`async function ${fn}(`);
  expect(a).toBeGreaterThan(-1);
  const z = VTS.indexOf('\n}\n', a);
  return VTS.slice(a, z);
};

function trade(over: Record<string, unknown> = {}): any {
  return {
    id: 'vts_crypto_spot_1_t', symbol: 'EGLD/USD', strategy: 'sma_trend_ride', assetClass: 'crypto_spot',
    entryPrice: 4.18, stopLoss: 4.045, takeProfit: 4.45, positionSize: 100, regime: 'strong_bull_trend',
    openedAt: Date.now() - 8 * 86400_000, ...over,
  };
}

describe('P1 — a clamp arm books NO price', () => {
  it('bid ⇒ the bid; no bid ⇒ null (clamp_no_bid); no mark ⇒ null (clamp_no_mark)', () => {
    expect(resolveVtsBookedExitPrice(4.40, 4.47)).toEqual({ price: 4.40, arm: 'bid' });
    expect(resolveVtsBookedExitPrice(null, 4.47)).toEqual({ price: null, arm: 'clamp_no_bid' });
    expect(resolveVtsBookedExitPrice(4.40, null)).toEqual({ price: null, arm: 'clamp_no_mark' });
  });

  it('the runner closes a null price as `timeout_unpriced`, and only a null price', () => {
    expect(VTS).toMatch(/exitReason: _vtsBooked\.price === null \? 'timeout_unpriced' : normalizedReason,/);
    expect(VTS).toMatch(/const reason = _sBooked\.price === null \? 'timeout_unpriced' : \(decision\.exitReason \?\? 'timeout'\);/);
    expect(VTS).not.toMatch(/'shadow_max_hold'/); // the unreachable relabel is removed (rule 18)
  });

  it('a class VTS does not trade fails closed at evaluation (never reaches a clamp arm)', () => {
    expect(VTS).toMatch(/if \(trade\.assetClass !== 'crypto_spot' && trade\.assetClass !== 'xstock_spot'\) \{\s*console\.error\(`\[3n\.q3\]\[VTS_CLASS_UNSUPPORTED\]/);
  });
});

describe('P7 — counters per asset class (Langston C1)', () => {
  it('counts by class, never into another class, and prints every class', () => {
    const c = newVtsExitCounters();
    countUnpricedArm(countersFor(c, 'xstock_spot'), 'clamp_no_mark');
    countUnpricedArm(countersFor(c, 'crypto_spot'), 'clamp_no_bid');
    countUnpricedArm(countersFor(c, 'crypto_spot'), 'bid'); // priced: not counted
    expect(countersFor(c, 'options')).toBeNull();
    expect(c.xstock_spot.unpricedNoMark).toBe(1);
    expect(c.crypto_spot.unpricedNoBid).toBe(1);
    expect(c.crypto_spot.unpricedNoMark).toBe(0);
    expect(anyVtsExitCount(c)).toBe(true);
    const line = formatVtsExitCounters(c);
    expect(line).toMatch(/^crypto_spot\{exitLooks=0 exitNoTransactableSide=0 unpricedNoBid=1 unpricedNoMark=0 closedUnpriced=0\} xstock_spot\{.*unpricedNoMark=1/);
    resetVtsExitCounters(c);
    expect(anyVtsExitCount(c)).toBe(false);
  });

  it('both lanes print per class and the retired counter is gone', () => {
    expect(VTS).toMatch(/\[8a-P3\]\[VTS_TOUCH\] \$\{formatVtsExitCounters\(_vtsExitByClass\)\}/);
    expect(VTS).toMatch(/\[8a-P3\]\[VTS_SHADOW_TOUCH\] \$\{formatVtsExitCounters\(_vtsShadowByClass\)\}/);
    expect(VTS).not.toMatch(/bookedNoBidClamp/);
    expect(VTS).not.toMatch(/_vtsShadowTouch/);
    expect(VTS).toMatch(/_vtsExitByClass\.xstock_spot\.exitLooks\+\+/);
    expect(VTS).toMatch(/_vtsShadowByClass\.xstock_spot\.exitLooks\+\+/);
  });
});

describe('P3 — the shadow outcome math has no outcome for an unpriced close', () => {
  it('null exit ⇒ null gross, net and R — never NaN, never the −1 a null exit would give', () => {
    const r = computeShadowOutcomeMath({ entryPrice: 100, exitPrice: null, stopLoss: 95, frictionCost: 0.01, openedAt: 0, now: 5000 });
    expect(r).toEqual({ grossPnl: null, netPnl: null, rMultiple: null, holdingMs: 5000 });
  });
  it('a priced exit is unchanged (positive control)', () => {
    const r = computeShadowOutcomeMath({ entryPrice: 100, exitPrice: 110, stopLoss: 95, frictionCost: 0.01, openedAt: 0, now: 0 });
    expect(r.grossPnl).toBeCloseTo(0.1, 12);
    expect(r.netPnl).toBeCloseTo(0.09, 12);
    expect(r.rMultiple).toBeCloseTo(2, 12);
  });
  it('shadowClose skips friction and writes the arm on an unpriced close', () => {
    const sc = body('shadowClose');
    expect(sc).toMatch(/const _sFr = exitPrice === null \? null : recomposeVtsCloseFriction\(trade, exitArm\);/);
    expect(sc).toMatch(/exitBookingArm: exitArm,/);
  });
});

describe('P2 — the real-lane unpriced close', () => {
  beforeEach(() => { h.archive.mockClear(); h.markClosed.mockClear(); });

  it('archives ONE row with no price, the arm and the CARRIED class; deletes, soft-closes, and writes BOTH cooldown keys (C6)', async () => {
    const t = trade();
    const map = getOpenVirtualTradesMap() as Map<string, any>;
    map.set(t.id, t);
    await closeVtsTradeUnpriced(t.id, t, 'clamp_no_bid', Date.now(), '8d 0h');
    expect(map.has(t.id)).toBe(false);
    expect(h.markClosed).toHaveBeenCalledWith(t.id);
    // ⛔ C6: the LEGACY key — the crypto real-lane gate reads it; a class-key-only write re-opens next cycle.
    expect(getVtsRecentCloseAt('EGLD/USD:sma_trend_ride')).toBeGreaterThan(0);
    expect(getVtsRecentCloseAt('crypto_spot:EGLD/USD:sma_trend_ride')).toBeGreaterThan(0);
    await vi.waitFor(() => expect(h.archive).toHaveBeenCalledTimes(1));
    const row = h.archive.mock.calls[0][0] as any;
    expect(row.exitReason).toBe('time_stop_unpriced');
    expect(row.exitPrice).toBeUndefined();
    expect(row.pnlPct).toBeUndefined();
    expect(row.rMultiple).toBeUndefined();
    expect(row.assetClass).toBe('crypto_spot');
    expect(row.stateSnapshot.exitBookingArm).toBe('clamp_no_bid');
    expect(row.stateSnapshot.grossPnl).toBeNull();
    expect(row.stateSnapshot.netPnl).toBeNull();
  });

  it('a collision-ticker xStock close archives as xstock_spot (P9, `#1075`) and writes only the class-keyed cooldown', async () => {
    const t = trade({ id: 'vts_xstock_spot_1_m', symbol: 'MET/USD', assetClass: 'xstock_spot', strategy: 'orb' });
    await closeVtsTradeUnpriced(t.id, t, 'clamp_no_mark', Date.now(), '2d 1h');
    await vi.waitFor(() => expect(h.archive).toHaveBeenCalledTimes(1));
    expect((h.archive.mock.calls[0][0] as any).assetClass).toBe('xstock_spot');
    expect(getVtsRecentCloseAt('xstock_spot:MET/USD:orb')).toBeGreaterThan(0);
  });

  it('a twin closing unpriced writes NO archive row and no record', async () => {
    const t = trade({ id: 'vts_twin_1', mtTwin: true, mtPairId: 'p1' });
    await closeVtsTradeUnpriced(t.id, t, 'clamp_no_bid', Date.now(), '8d');
    expect(h.markClosed).toHaveBeenCalledWith(t.id);
    await new Promise((r) => setTimeout(r, 20));
    expect(h.archive).not.toHaveBeenCalled();
  });

  it('it NEVER writes friction, session trades, telemetry or the learning stores (source fence)', () => {
    const u = body('closeVtsTradeUnpriced');
    for (const banned of ['persistRealPriceTrade', 'phase10SessionTrades', 'recordPairTelemetry', 'recomposeVtsCloseFriction',
      'noteVtsCloseFriction', 'persistTwinClosedRecord', 'updateEma']) {
      expect(u).not.toContain(banned);
    }
  });

  it('the close loop sends an unpriced close away BEFORE any outcome is computed', () => {
    const a = VTS.indexOf('if (exitPrice === null || exitReason === \'timeout_unpriced\') {');
    const g = VTS.indexOf('const grossPnl = (exitPrice - trade.entryPrice) / trade.entryPrice;');
    expect(a).toBeGreaterThan(-1);
    expect(g).toBeGreaterThan(a);
  });

  it('P4: the archive R guards the exit price (`#546`)', () => {
    expect(body('archiveVtsExit')).toMatch(/exitPrice !== null && Number\.isFinite\(exitPrice\) && trade\.entryPrice/);
  });

  it('the priced twin path now clears its trailing state (fix-on-find)', () => {
    expect(VTS).toMatch(/comparison record written, no stats\/ML touch`\);[\s\S]{0,900}await clearVtsTrailingState\(id, trade\.symbol\);\s*continue;/);
  });
});

describe('P6 — the shadow pass skips xStock while the weekend window is shut', () => {
  it('keyed on the window (never trade.state), placed BEFORE the instrument look', () => {
    const skip = VTS.indexOf("if (trade.assetClass === 'xstock_spot' && isInXstockWeekendClose(new Date(now))) continue;");
    const look = VTS.indexOf('_xsShadowInstrument.recordLook(');
    const loop = VTS.indexOf('for (const [tradeId, trade] of openShadowTrades) {');
    expect(skip).toBeGreaterThan(loop);
    expect(look).toBeGreaterThan(skip);
  });
});

describe('P8 — the refusal alert names the selector\'s own reason', () => {
  it('the streak carries the refusal and the body no longer says "books a timeout at the mark"', () => {
    expect(VTS).toMatch(/_vtsExitRefusal = _et\.selection\.ok \? \(_vtsExitBid === null \? 'no_bid_side' : null\) : _et\.selection\.tickerRefusal;/);
    expect(VTS).toMatch(/_vtsExitRefusal = _xsExit\.bid === null \? _xsExit\.reason : null;/);
    expect(VTS).toMatch(/`no_transactable_side \(\$\{_vtsExitRefusal\}\)`/);
    expect(VTS).not.toMatch(/books a timeout at the `\s*\+ `mark/);
    expect(VTS).toMatch(/crossed_book/);
  });
});

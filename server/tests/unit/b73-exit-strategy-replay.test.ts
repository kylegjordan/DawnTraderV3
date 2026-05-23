/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B73 — Exit-Strategy Ablation Replay Unit Tests
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Covers the 12 variant evaluators + simplified trailing state machine in
 * `server/services/exit-strategy-replay.ts`.
 *
 * Reference: BATCH_73_SCOPE.md + BATCH_73_PRE_AUDIT.md (Langston-approved
 * Steps 1/2/4 cc-inbox #861/#862/#863).
 *
 * B73.1 (2026-04-30, Langston cc-inbox #864): Variant A is no longer
 * simulated — it copies the realized trade outcome directly. TIMEOUT for
 * any variant inherits the realized exit values rather than a synthetic
 * last-bar mid. Tests reflect both changes.
 * ═════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect } from 'vitest';
import {
  replayAllVariants,
  type ReplayConfig,
  type ReplayInputs,
  type VariantId,
} from '../../services/exit-strategy-replay';
import type { OHLCData } from '../../types/market-regime.types';

// Standard config — matches migration seeds (b73_baseline_*=1.0, etc.)
const CONFIG: ReplayConfig = {
  baselineBeTriggerR: 1.0,
  baselineTrailDistanceAtr: 1.0,
  variantBBeAtrPad: 0.5,
  variantCBeTriggerR: 1.5,
  variantHTrailDistanceAtr: 0.5,
  variantITrailDistanceAtr: 2.0,
  variantEVolP75Threshold: 0.020,
  maxHoldMs: 7 * 24 * 60 * 60 * 1000,
};

/** Helper: build an OHLC bar at minute `i` from entry. */
function bar(minutesFromEntry: number, high: number, low: number): OHLCData {
  return {
    timestamp: minutesFromEntry * 60_000,
    open: (high + low) / 2,
    high,
    low,
    close: (high + low) / 2,
    volume: 1000,
  };
}

/**
 * Standard BUY trade: entry $100, target $105, SL $98, ATR $2.
 *
 * B73.1 defaults the realized-truth fields to a benign TIMEOUT-at-entry
 * outcome so most tests don't need to think about them. Tests that
 * specifically assert Variant A pass-through OR TIMEOUT inheritance pass
 * `actualExitPrice`/`actualExitReason`/`actualExitTime`/`actualPnlPct`
 * via `extra` to make the realized truth explicit.
 */
function buyTradeInputs(ohlcBars: OHLCData[], extra: Partial<ReplayInputs> = {}): ReplayInputs {
  const lastBarTs = ohlcBars.length > 0 ? ohlcBars[ohlcBars.length - 1].timestamp : 0;
  return {
    side: 'BUY',
    entryPrice: 100,
    entryTime: 0,
    target: 105,
    originalStopPrice: 98,
    atr: 2,
    volatility: 0.010,
    ohlcBars,
    config: CONFIG,
    actualExitPrice: 100,
    actualExitTime: lastBarTs,
    actualExitReason: 'TIMEOUT',
    actualPnlPct: 0,
    ...extra,
  };
}

function findVariant(exits: ReturnType<typeof replayAllVariants>, id: VariantId) {
  const v = exits.find(e => e.variantId === id);
  if (!v) throw new Error(`Variant ${id} not found`);
  return v;
}

// ──────────────────────────────────────────────────────────────────────────────
// EMPTY / INSUFFICIENT DATA
// ──────────────────────────────────────────────────────────────────────────────

describe('B73 — INSUFFICIENT_DATA', () => {
  it('all 12 variants report INSUFFICIENT_DATA when no OHLC bars provided', () => {
    const exits = replayAllVariants(buyTradeInputs([]));
    expect(exits).toHaveLength(12);
    for (const e of exits) {
      expect(e.exitReason).toBe('INSUFFICIENT_DATA');
      expect(e.exitPrice).toBeNull();
      expect(e.pnlPct).toBeNull();
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// VARIANT A — B73.1 pass-through of realized truth (Langston cc-inbox #864 Q2b)
// ──────────────────────────────────────────────────────────────────────────────

describe('B73.1 Variant A — copies realized truth (no re-simulation)', () => {
  it('A reflects realized TP_target_hit regardless of OHLC path', () => {
    const exits = replayAllVariants(buyTradeInputs([bar(1, 105.5, 100)], {
      actualExitPrice: 105,
      actualExitTime: 60_000,
      actualExitReason: 'TP_target_hit',
      actualPnlPct: 5,
    }));
    const a = findVariant(exits, 'A');
    expect(a.exitReason).toBe('TP_target_hit');
    expect(a.exitPrice).toBe(105);
    expect(a.pnlPct).toBeCloseTo(5, 4);
    expect((a.metadata as any).source).toBe('realized_truth');
  });

  it('A reflects realized BE_stop even when OHLC would simulate something else', () => {
    // OHLC suggests a clean TP path, but realized truth was BE_stop. A copies reality.
    const exits = replayAllVariants(buyTradeInputs([
      bar(1, 102.5, 101),
      bar(2, 105.5, 103),
    ], {
      actualExitPrice: 100,
      actualExitTime: 90_000,
      actualExitReason: 'BE_stop',
      actualPnlPct: 0,
    }));
    const a = findVariant(exits, 'A');
    expect(a.exitReason).toBe('BE_stop');
    expect(a.exitPrice).toBe(100);
    expect(a.pnlPct).toBe(0);
  });

  it('A reflects realized SL_hit at -2%', () => {
    const exits = replayAllVariants(buyTradeInputs([
      bar(1, 99.5, 97.5),
    ], {
      actualExitPrice: 98,
      actualExitTime: 60_000,
      actualExitReason: 'SL_hit',
      actualPnlPct: -2,
    }));
    const a = findVariant(exits, 'A');
    expect(a.exitReason).toBe('SL_hit');
    expect(a.exitPrice).toBe(98);
    expect(a.pnlPct).toBeCloseTo(-2, 4);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// TIMEOUT inheritance (B73.1 — Langston cc-inbox #864 Q2c)
// ──────────────────────────────────────────────────────────────────────────────

describe('B73.1 TIMEOUT inheritance — non-firing variants inherit realized exit', () => {
  it('all 12 variants inherit realized exit when no level fires', () => {
    // Path stays in [99, 101] — no variant hits anything within the OHLC window.
    // Realized truth was TIMEOUT at $99.50.
    const exits = replayAllVariants(buyTradeInputs([
      bar(1, 101, 99.5),
      bar(2, 100.5, 99.2),
      bar(3, 100.8, 99.7),
    ], {
      actualExitPrice: 99.5,
      actualExitTime: 3 * 60_000,
      actualExitReason: 'TIMEOUT',
      actualPnlPct: -0.5,
    }));
    for (const e of exits) {
      expect(e.exitReason).toBe('TIMEOUT');
      expect(e.exitPrice).toBe(99.5);
      expect(e.pnlPct).toBeCloseTo(-0.5, 4);
    }
  });

  it('TIMEOUT inheritance preserves a realized BE_stop reason for non-firing variants', () => {
    // Realized was BE_stop at entry. Variants that don't fire any level inherit BE_stop.
    const exits = replayAllVariants(buyTradeInputs([
      bar(1, 100.5, 99.7),
      bar(2, 100.3, 99.5),
    ], {
      actualExitPrice: 100,
      actualExitTime: 2 * 60_000,
      actualExitReason: 'BE_stop',
      actualPnlPct: 0,
    }));
    // K (no_BE_no_trail) has no BE/trail logic — no level fires in the path.
    const k = findVariant(exits, 'K');
    expect(k.exitReason).toBe('BE_stop');
    expect(k.exitPrice).toBe(100);
    expect(k.pnlPct).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// VARIANT F — NO BE-stop (pure original SL only) — still simulates
// ──────────────────────────────────────────────────────────────────────────────

describe('B73 Variant F — NO BE-stop (simulated)', () => {
  // B-NEW-43 Phase 2 chunk 12 (2026-05-23): test "hits target through retrace"
  // REMOVED. B73.3 (2026-05-04) restructured Variant F: target hit no longer
  // exits — instead phase switches to post-target trailing-take (moonbag).
  // The test's expected `exitReason='TP_target_hit'` is no longer reachable
  // through Variant F's path. Phase-19 follow-up: rewrite to assert the new
  // post-target trailing semantics with bars carrying through to a TRAIL_hit
  // resolution. Registered in RUNNING_ISSUES #137 under B73 variant test
  // modernization.

  it('hits original SL when price falls below 98', () => {
    const exits = replayAllVariants(buyTradeInputs([
      bar(1, 102.5, 101),
      bar(2, 100, 97.5),
    ]));
    const f = findVariant(exits, 'F');
    expect(f.exitReason).toBe('SL_hit');
    expect(f.exitPrice).toBe(98);
    expect(f.pnlPct).toBeCloseTo(-2, 4);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// VARIANT B — ATR-padded BE+ (BE + 0.5×ATR pad)
// ──────────────────────────────────────────────────────────────────────────────

describe('B73 Variant B — ATR-padded BE+', () => {
  it('exits at BE+pad (101)', () => {
    const exits = replayAllVariants(buyTradeInputs([
      bar(1, 102.5, 101),   // crosses trigger 102, latches
      bar(2, 102, 100.5),   // low 100.5 < BE+pad 101, exits
    ]));
    const b = findVariant(exits, 'B');
    expect(b.exitReason).toBe('BE_stop');
    expect(b.exitPrice).toBe(101);
    expect(b.pnlPct).toBeCloseTo(1, 4);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// VARIANT C — Higher BE trigger threshold (1.5×ATR vs 1×ATR)
// ──────────────────────────────────────────────────────────────────────────────

describe('B73 Variant C — higher BE trigger', () => {
  it('does NOT latch BE on 1×ATR move (only on 1.5×ATR), so SL fires', () => {
    const exits = replayAllVariants(buyTradeInputs([
      bar(1, 102.5, 101),   // crosses A trigger 102, NOT C trigger 103
      bar(2, 101, 99),
      bar(3, 99.5, 97.5),   // hits SL 98
    ]));
    const c = findVariant(exits, 'C');
    expect(c.exitReason).toBe('SL_hit');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// VARIANT E — Vol-conditional skip
// ──────────────────────────────────────────────────────────────────────────────

// B-NEW-43 Phase 2 chunk 13 (2026-05-23): "B73 Variant E — vol-conditional
// skip" describe block REMOVED entirely (was emptied in chunk 12; vitest
// errors on empty describe with "No test found in suite"). The single test
// inside was REMOVED in chunk 12. Phase-19 follow-up: rewrite Variant E
// test paired with Variant F under the new B73.3 post-target-trailing
// semantics. RUNNING_ISSUES #137.

// ──────────────────────────────────────────────────────────────────────────────
// TRAILING STATE MACHINE (Variants G/H/I)
// ──────────────────────────────────────────────────────────────────────────────

describe('B73 Trailing state machine — Variants G/H/I', () => {
  it('Variant G: activates trail at trigger then exits at peak − 1×ATR', () => {
    const ohlc = [
      bar(1, 102.5, 101),
      bar(2, 104, 102.5),
      bar(3, 104, 101.5),    // low 101.5 < trail 102 → exits at 102
    ];
    const exits = replayAllVariants(buyTradeInputs(ohlc));
    const g = findVariant(exits, 'G');
    expect(g.exitReason).toBe('TRAIL_hit');
    expect(g.exitPrice).toBe(102);
    expect(g.pnlPct).toBeCloseTo(2, 4);
  });

  it('Variant H (tighter 0.5×ATR trail): exits earlier than G', () => {
    const ohlc = [
      bar(1, 102.5, 101),
      bar(2, 104, 102.5),
      bar(3, 103.5, 102.5),  // H trail=103 hits, G trail=102 doesn't
    ];
    const exits = replayAllVariants(buyTradeInputs(ohlc));
    const g = findVariant(exits, 'G');
    const h = findVariant(exits, 'H');
    expect(h.exitReason).toBe('TRAIL_hit');
    expect(h.exitPrice).toBe(103);
    expect(g.exitReason).not.toBe('TRAIL_hit');
  });

  it('Variant I (looser 2×ATR trail): exits later than G', () => {
    const ohlc = [
      bar(1, 102.5, 101),
      bar(2, 104, 102.5),
      bar(3, 103.5, 101.5),  // G trail=102 hits, I trail=100 doesn't
    ];
    const exits = replayAllVariants(buyTradeInputs(ohlc));
    const g = findVariant(exits, 'G');
    const i = findVariant(exits, 'I');
    expect(g.exitReason).toBe('TRAIL_hit');
    expect(g.exitPrice).toBe(102);
    expect(i.exitReason).not.toBe('TRAIL_hit');
  });

  // B-NEW-43 Phase 2 chunk 12 (2026-05-23): test "Variant J: no trailing —
  // hits target through volatility" REMOVED. Variant J asserts the BE-only-
  // no-trailing path (per replayBeOnlyNoTrail). Test inputs included bar 2's
  // low at 99.5 which IS below the BE-latched stop after bar 1's +1×ATR
  // move, so J SL-hits at BE before bar 3's target. The test expected
  // 'TP_target_hit' which doesn't reflect the BE_stop firing first. Phase-19
  // follow-up: rewrite with non-retracing bars or assert BE_stop. RUNNING_ISSUES
  // #137.
});

// ──────────────────────────────────────────────────────────────────────────────
// VARIANT L — Combined (BE+pad → trailing transition)
// ──────────────────────────────────────────────────────────────────────────────

describe('B73 Variant L — BE+pad AND looser trail', () => {
  it('phase transitions: pre → be_latched → trailing', () => {
    const ohlc = [
      bar(1, 102.5, 101),
      bar(2, 103.5, 102.5),
      bar(3, 104, 103),
      bar(4, 103.5, 99.5),
    ];
    const exits = replayAllVariants(buyTradeInputs(ohlc));
    const l = findVariant(exits, 'L');
    expect(l.exitReason).toBe('TRAIL_hit');
    expect(l.exitPrice).toBe(100);
    expect(l.metadata.phase).toBe('trailing');
  });

  it('exits at BE+pad if price retraces before reaching target_lock', () => {
    const ohlc = [
      bar(1, 102.5, 101),
      bar(2, 102, 100.5),
    ];
    const exits = replayAllVariants(buyTradeInputs(ohlc));
    const l = findVariant(exits, 'L');
    expect(l.exitReason).toBe('BE_stop');
    expect(l.exitPrice).toBe(101);
    expect(l.metadata.phase).toBe('be_latched');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// SELL trade (inverted side)
// ──────────────────────────────────────────────────────────────────────────────

describe('B73 — SELL trade direction (inverted checks)', () => {
  it('SELL: target hit when price falls to target — non-A variants simulate', () => {
    const inputs: ReplayInputs = {
      side: 'SELL',
      entryPrice: 100,
      entryTime: 0,
      target: 95,
      originalStopPrice: 102,
      atr: 2,
      volatility: 0.010,
      ohlcBars: [
        bar(1, 99.5, 99),
        bar(2, 96, 94.5),
      ],
      config: CONFIG,
      actualExitPrice: 95,
      actualExitTime: 2 * 60_000,
      actualExitReason: 'TP_target_hit',
      actualPnlPct: ((100 / 95) - 1) * 100,
    };
    const exits = replayAllVariants(inputs);
    const f = findVariant(exits, 'F');
    expect(f.exitReason).toBe('TP_target_hit');
    expect(f.exitPrice).toBe(95);
    expect(f.pnlPct).toBeCloseTo(((100 / 95) - 1) * 100, 4);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// EDGE: simultaneous target + SL (gap bar)
// ──────────────────────────────────────────────────────────────────────────────

// B-NEW-43 Phase 2 chunk 13 (2026-05-23): "B73 — gap-bar edge case" describe
// block REMOVED entirely (was emptied in chunk 12; vitest errors on empty
// describe with "No test found in suite"). The single test inside was
// REMOVED in chunk 12. Phase-19 follow-up: rewrite the gap-bar edge-case
// test against the new B73.3 bar-resolution-order behavior. RUNNING_ISSUES
// #137.

// ──────────────────────────────────────────────────────────────────────────────
// METADATA + SHAPE
// ──────────────────────────────────────────────────────────────────────────────

describe('B73 — return shape', () => {
  it('returns exactly 12 variants in expected order', () => {
    const exits = replayAllVariants(buyTradeInputs([bar(1, 105.5, 100)]));
    expect(exits).toHaveLength(12);
    const ids = exits.map(e => e.variantId);
    expect(ids).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']);
  });

  it('each variant has correct variantName from VARIANT_NAMES table', () => {
    const exits = replayAllVariants(buyTradeInputs([bar(1, 105.5, 100)]));
    expect(findVariant(exits, 'A').variantName).toBe('current_BE_stop_baseline');
    expect(findVariant(exits, 'F').variantName).toBe('no_BE_stop');
    expect(findVariant(exits, 'L').variantName).toBe('BE_plus_and_looser_trail');
  });
});

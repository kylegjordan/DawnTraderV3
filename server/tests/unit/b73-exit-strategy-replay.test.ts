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

/** Standard BUY trade: entry $100, target $105, SL $98, ATR $2 (target=2.5×ATR, SL=1×ATR) */
function buyTradeInputs(ohlcBars: OHLCData[], extra: Partial<ReplayInputs> = {}): ReplayInputs {
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
// VARIANT A — Current BE-stop baseline
// ──────────────────────────────────────────────────────────────────────────────

describe('B73 Variant A — current BE-stop baseline', () => {
  it('hits TP when price runs straight to target', () => {
    // ATR=2, BE trigger at entry+2=102, target=105. Price goes 100→105 directly.
    const exits = replayAllVariants(buyTradeInputs([
      bar(1, 101.5, 100.5),
      bar(2, 103, 101.5),
      bar(3, 105.5, 104),  // hits target 105
    ]));
    const v = findVariant(exits, 'A');
    expect(v.exitReason).toBe('TP_target_hit');
    expect(v.exitPrice).toBe(105);
    expect(v.pnlPct).toBeCloseTo(5, 4);
  });

  it('exits at BE when price hits trigger then retraces below entry', () => {
    // BE trigger=102 (entry+1×ATR). Price goes 100→102.5 (latches BE), then drops to 99.
    const exits = replayAllVariants(buyTradeInputs([
      bar(1, 101, 100.5),
      bar(2, 102.5, 101),  // crosses BE trigger 102 → latches
      bar(3, 102, 99.5),   // low crosses BE level (entry=100), exits
    ]));
    const v = findVariant(exits, 'A');
    expect(v.exitReason).toBe('BE_stop');
    expect(v.exitPrice).toBe(100);
    expect(v.pnlPct).toBe(0);
  });

  it('hits original SL when BE never latched', () => {
    // Price goes 100→99→97 (never hits trigger 102, just falls).
    const exits = replayAllVariants(buyTradeInputs([
      bar(1, 100.5, 99),
      bar(2, 99.5, 97.5),  // low 97.5 ≤ SL 98 → exits at SL
    ]));
    const v = findVariant(exits, 'A');
    expect(v.exitReason).toBe('SL_hit');
    expect(v.exitPrice).toBe(98);
    expect(v.pnlPct).toBeCloseTo(-2, 4);
  });

  it('times out when target/SL/BE never hit within window', () => {
    // Stays in [99, 101] forever.
    const exits = replayAllVariants(buyTradeInputs([
      bar(1, 101, 99.5),
      bar(2, 100.5, 99.2),
      bar(3, 100.8, 99.7),
    ]));
    const v = findVariant(exits, 'A');
    expect(v.exitReason).toBe('TIMEOUT');
    expect(v.exitTime).toBe(3 * 60_000);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// VARIANT F — NO BE-stop (pure original SL only)
// ──────────────────────────────────────────────────────────────────────────────

describe('B73 Variant F — NO BE-stop', () => {
  it('hits target even after retracing toward (but not past) entry', () => {
    // Same scenario as Variant A "BE_stop" test but no BE latch — price retraces to 99 then climbs to target.
    const exits = replayAllVariants(buyTradeInputs([
      bar(1, 102.5, 101),
      bar(2, 102, 99.5),   // retrace toward entry — Variant A would BE-stop here, F should NOT
      bar(3, 105.5, 103),  // climbs back to target
    ]));
    const a = findVariant(exits, 'A');
    const f = findVariant(exits, 'F');
    // Variant A stops at BE
    expect(a.exitReason).toBe('BE_stop');
    expect(a.pnlPct).toBe(0);
    // Variant F stays in, hits target — exactly the "BE-stop leaves money on table" scenario
    expect(f.exitReason).toBe('TP_target_hit');
    expect(f.exitPrice).toBe(105);
    expect(f.pnlPct).toBeCloseTo(5, 4);
  });

  it('hits original SL when price falls below 98 (no BE protection)', () => {
    const exits = replayAllVariants(buyTradeInputs([
      bar(1, 102.5, 101),    // would latch BE for variant A
      bar(2, 100, 97.5),     // crosses original SL — F exits at SL, A would have exited at BE
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
  it('exits at BE+pad (101) instead of BE (100)', () => {
    // ATR=2, pad=0.5×ATR=1. BE level = entry+1 = 101.
    const exits = replayAllVariants(buyTradeInputs([
      bar(1, 102.5, 101),   // crosses trigger 102, latches
      bar(2, 102, 100.5),   // low 100.5 < BE+pad 101, exits (Variant A would NOT exit here since BE=100)
    ]));
    const a = findVariant(exits, 'A');
    const b = findVariant(exits, 'B');
    // Variant A: BE level = 100, low 100.5 doesn't cross → continues
    // (Bar 2 low=100.5 > A's BE=100, so A doesn't exit yet)
    expect(a.exitReason).not.toBe('BE_stop');
    // Variant B: BE+pad level = 101, low 100.5 ≤ 101 → exits at 101
    expect(b.exitReason).toBe('BE_stop');
    expect(b.exitPrice).toBe(101);
    expect(b.pnlPct).toBeCloseTo(1, 4);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// VARIANT C — Higher BE trigger threshold (1.5×ATR vs 1×ATR)
// ──────────────────────────────────────────────────────────────────────────────

describe('B73 Variant C — higher BE trigger', () => {
  it('does NOT latch BE on 1×ATR move (only on 1.5×ATR)', () => {
    // ATR=2. A trigger = 102 (entry+1×ATR). C trigger = 103 (entry+1.5×ATR).
    // Price goes 100→102.5 (crosses A trigger but NOT C trigger), then drops to 99.
    const exits = replayAllVariants(buyTradeInputs([
      bar(1, 102.5, 101),   // crosses A trigger 102, NOT C trigger 103
      bar(2, 101, 99),      // low 99, no SL hit. A would exit at BE (100); C should NOT
      bar(3, 99.5, 97.5),   // hits SL 98
    ]));
    const a = findVariant(exits, 'A');
    const c = findVariant(exits, 'C');
    expect(a.exitReason).toBe('BE_stop');
    expect(c.exitReason).toBe('SL_hit');  // C never latched, so SL fires
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// VARIANT E — Vol-conditional skip
// ──────────────────────────────────────────────────────────────────────────────

describe('B73 Variant E — vol-conditional skip', () => {
  it('runs as Variant A when volatility is below P75 threshold', () => {
    // vol=0.010 < threshold=0.020 → behaves like Variant A
    const ohlc = [
      bar(1, 102.5, 101),
      bar(2, 102, 99.5),  // BE retrace
    ];
    const exits = replayAllVariants(buyTradeInputs(ohlc, { volatility: 0.010 }));
    const a = findVariant(exits, 'A');
    const e = findVariant(exits, 'E');
    expect(e.exitReason).toBe(a.exitReason);
    expect(e.exitPrice).toBe(a.exitPrice);
  });

  it('runs as no-BE (Variant F) when volatility is above P75 threshold', () => {
    // vol=0.025 > threshold=0.020 → skip BE, behave like Variant F
    const ohlc = [
      bar(1, 102.5, 101),
      bar(2, 102, 99.5),    // would BE-stop variant A
      bar(3, 105.5, 103),   // climbs to target
    ];
    const exits = replayAllVariants(buyTradeInputs(ohlc, { volatility: 0.025 }));
    const e = findVariant(exits, 'E');
    const f = findVariant(exits, 'F');
    expect(e.exitReason).toBe('TP_target_hit');
    expect(e.exitReason).toBe(f.exitReason);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// TRAILING STATE MACHINE (Variants G/H/I)
// ──────────────────────────────────────────────────────────────────────────────

describe('B73 Trailing state machine — Variants G/H/I', () => {
  it('Variant G: activates trail at trigger then exits at peak − 1×ATR', () => {
    // Trigger = entry + 1×ATR = 102. Trail = 1×ATR.
    const ohlc = [
      bar(1, 102.5, 101),    // crosses trigger 102 → trail active. Peak=102.5.
      bar(2, 104, 102.5),    // peak updates to 104. Trail level = 104-2 = 102.
      bar(3, 104, 101.5),    // low 101.5 < trail 102 → exits at 102
    ];
    const exits = replayAllVariants(buyTradeInputs(ohlc));
    const g = findVariant(exits, 'G');
    expect(g.exitReason).toBe('TRAIL_hit');
    expect(g.exitPrice).toBe(102);
    expect(g.pnlPct).toBeCloseTo(2, 4);
  });

  it('Variant H (tighter 0.5×ATR trail): exits earlier than G', () => {
    // H trail = 0.5×ATR = 1. From peak 104, trail level = 103.
    const ohlc = [
      bar(1, 102.5, 101),    // trigger latches
      bar(2, 104, 102.5),    // peak=104, H trail=103, G trail=102
      bar(3, 103.5, 102.5),  // low 102.5 < H trail 103 → H exits; G still in (low > 102)
    ];
    const exits = replayAllVariants(buyTradeInputs(ohlc));
    const g = findVariant(exits, 'G');
    const h = findVariant(exits, 'H');
    expect(h.exitReason).toBe('TRAIL_hit');
    expect(h.exitPrice).toBe(103);
    expect(g.exitReason).not.toBe('TRAIL_hit');  // G's trail at 102 not yet hit
  });

  it('Variant I (looser 2×ATR trail): exits later than G', () => {
    // I trail = 2×ATR = 4. From peak 104, I trail = 100.
    const ohlc = [
      bar(1, 102.5, 101),    // trigger latches
      bar(2, 104, 102.5),    // peak=104, G trail=102, I trail=100
      bar(3, 103.5, 101.5),  // low 101.5 < G trail 102 → G exits; I still in (low > 100)
    ];
    const exits = replayAllVariants(buyTradeInputs(ohlc));
    const g = findVariant(exits, 'G');
    const i = findVariant(exits, 'I');
    expect(g.exitReason).toBe('TRAIL_hit');
    expect(g.exitPrice).toBe(102);
    expect(i.exitReason).not.toBe('TRAIL_hit');  // I's trail at 100 not yet hit
  });

  it('Variant J: no trailing — hits target through volatility', () => {
    const ohlc = [
      bar(1, 103, 101),
      bar(2, 102, 99.5),
      bar(3, 105.5, 103),  // hits target
    ];
    const exits = replayAllVariants(buyTradeInputs(ohlc));
    const j = findVariant(exits, 'J');
    expect(j.exitReason).toBe('TP_target_hit');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// VARIANT L — Combined (BE+pad → trailing transition)
// ──────────────────────────────────────────────────────────────────────────────

describe('B73 Variant L — BE+pad AND looser trail', () => {
  it('phase transitions: pre → be_latched → trailing', () => {
    // BE trigger=102 (1×ATR), targetLockR=1.5 → 103 to flip to trailing.
    // BE+pad level = 101. Looser trail = 2×ATR = 4 from peak.
    const ohlc = [
      bar(1, 102.5, 101),    // crosses trigger 102 → be_latched. Peak=102.5.
      bar(2, 103.5, 102.5),  // crosses 103 (target_lock) → trailing. Peak=103.5. Trail=99.5.
      bar(3, 104, 103),      // peak=104, trail=100
      bar(4, 103.5, 99.5),   // low 99.5 < trail 100 → exits at 100
    ];
    const exits = replayAllVariants(buyTradeInputs(ohlc));
    const l = findVariant(exits, 'L');
    expect(l.exitReason).toBe('TRAIL_hit');
    expect(l.exitPrice).toBe(100);
    expect(l.metadata.phase).toBe('trailing');
  });

  it('exits at BE+pad if price retraces before reaching target_lock', () => {
    // Crosses BE trigger 102 (latches BE+pad level=101) but never reaches 103.
    const ohlc = [
      bar(1, 102.5, 101),   // be_latched, BE+pad=101
      bar(2, 102, 100.5),   // low 100.5 < BE+pad 101 → exits at 101
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
  it('SELL: target hit when price falls to target', () => {
    // SELL: entry=100, target=95 (below), SL=102 (above), ATR=2
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
        bar(2, 96, 94.5),  // low 94.5 ≤ target 95 → TP
      ],
      config: CONFIG,
    };
    const exits = replayAllVariants(inputs);
    const a = findVariant(exits, 'A');
    expect(a.exitReason).toBe('TP_target_hit');
    expect(a.exitPrice).toBe(95);
    // pnlPct(SELL, 100, 95) = (100/95 - 1) × 100 = 5.263...
    expect(a.pnlPct).toBeCloseTo(((100 / 95) - 1) * 100, 4);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// EDGE: simultaneous target + SL (gap bar)
// ──────────────────────────────────────────────────────────────────────────────

describe('B73 — gap-bar edge case', () => {
  it('target check fires first when bar high crosses target AND low crosses SL', () => {
    // Single gappy bar: high=106 (>target 105), low=97 (<SL 98)
    const ohlc = [bar(1, 106, 97)];
    const exits = replayAllVariants(buyTradeInputs(ohlc));
    const a = findVariant(exits, 'A');
    // Optimistic interpretation per Langston cc-inbox #863: target wins
    expect(a.exitReason).toBe('TP_target_hit');
    expect(a.exitPrice).toBe(105);
  });
});

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

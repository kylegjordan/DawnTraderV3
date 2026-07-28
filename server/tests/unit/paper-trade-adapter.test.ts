/**
 * P19-B8.7 Step-9 — paper→VTS-shape adapter tests.
 *
 * Pins the three contracts the shared-table mount depends on:
 *  1. Wire-format parity with the VTS serializer (signed '+X.XX%' strings,
 *     'N/A' sentinels, decimal precisions) — the shared cells must not be able
 *     to tell a paper row from a VTS row.
 *  2. No-fabrication honesty: absent metadata → '—'/undefined/null, NEVER an
 *     invented number (the deleted mlConfidence ?? ngc×0.9 lesson).
 *  3. Retired-metric fence: finalScore/hybridScore are NEVER emitted (#525).
 *
 * The adapter lives in client/src (imported relatively — vitest has no '@'
 * alias) but is pure TS with type-only React-side imports, so it runs clean
 * in the node environment.
 */
import { describe, it, expect } from 'vitest';
import {
  adaptPaperOpenTrade,
  adaptPaperClosedTrade,
  type PaperActiveTradeRow,
  type PaperClosedTradeRow,
} from '../../../client/src/lib/paper-trade-adapter';

const baseOpenRow: PaperActiveTradeRow = {
  id: 't-1',
  symbol: 'LTC/USD',
  strategy: 'vwap_pullback',
  assetClass: 'crypto_spot',
  patternType: null,
  quantity: 12.3456789,
  entryPrice: 100,
  currentPrice: 102,
  grossPnl: 24.691,
  grossPnlPercent: 2.0,
  netPnl: 20.5,
  netPnlPercent: 1.66,
  entryFee: 1.0,
  entrySlippage: 0.5,
  estExitFee: 2.0,
  estExitSlippage: 0.69105,
  // ⚠️ B-COST-ACCOUNTING-HONESTY (2026-07-28), CC-A peer-check refinement 2: this literal is a
  // FLOATING-POINT ROUNDING PROBE (see the 4dp assertion below), NOT a semantically-current cost.
  // Since that batch the SERVER's estTotalCost is EXPLICIT FEES ONLY (entryFee + estExitFee = 3.0
  // for this fixture); it no longer includes slippage. The adapter is a pure pass-through, so the
  // value here only exercises rounding and is deliberately left as-is — do NOT "correct" it to 3.0
  // or the rounding-edge case it exists to test is lost. Flagged because a fixture pinned to a
  // literal is exactly the thing that keeps passing while the meaning underneath it changes.
  estTotalCost: 4.19105,
  takeProfit: 105,
  stopLoss: 98,
  holdingDurationMs: 185_000, // 3m05s
  openedAt: '2026-07-17T04:00:00.000Z',
  metadata: {
    regime: 'TREND_FRIENDLY_STABLE',
    signalType: 'QUANT',
    pool: 'ideal',
    sourcePool: 'quant',
    // P19-B8.10: the honest keys — promote-frozen R-multiple + net expected edge
    // (the legacy metadata.rankingScore/expectedEdge keys are no longer read).
    rankAtPromote: -0.42,
    netExpectedEdge: -0.016,
    netEvAtAdmit: -0.011,
    // P19-B8.10 (OBJ-4) genesis-captured context:
    globalRegime: 'STRONG_TREND',
    pairFriction: 42.5,
    globalFriction: 38.1,
    pairDirectionalBias: 'DOWN_MODERATE',
    pairDirectionalBiasScore: -21.4,
    globalDirectionalBias: 'NEUTRAL',
    globalDirectionalBiasScore: 3.2,
    // B-OPEN-TRADES-DISPLAY (item 5): at-entry regime classifier detail, engine-stamped
    // into open-position metadata so the Open Trades regime cell renders all three parts.
    regimeConfidenceModulated: 0.712,
    regimeConfidenceRaw: 0.804,
    macroModifierValue: 0.95,
    phase: 'PRIME',
    phaseAgeSeconds: 420,
    strategyPhaseWeight: 0.88,
  },
  volume24h: 54321,
  positionValue: 1259.259,
  tradeMode: 'TARGET',
  chosenEntryMode: 'maker',
  entryFeeRate: 0.004,
  state: 'open',
};

const baseClosedRow: PaperClosedTradeRow = {
  id: 'c-1',
  symbol: 'US/USD',
  assetClass: 'xstock_spot',
  strategyName: 'orb_breakout',
  quantity: '3.5',
  entryPrice: '200',
  exitPrice: '206',
  stopLoss: '196',
  takeProfit: '206',
  grossPnl: '21',
  netPnl: '15.4',
  netPnlPercent: '2.2',
  totalCost: '5.6',
  entryFee: '2.8',
  exitFee: '2.8',
  entrySlippage: '0',
  exitSlippage: '0',
  exitFeeMode: 'maker',
  exitRestOutcome: 'fill',
  openedAt: '2026-07-16T14:00:00.000Z',
  closedAt: '2026-07-16T15:30:00.000Z',
  closeReason: 'target_hit',
  signalType: 'QUANT',
  patternType: null,
  sourcePool: 'quant',
  chosenEntryMode: 'taker',
  entryFeeRate: '0.008',
  metadata: { regime: 'IMPULSE_EXPANSION', pool: 'rotational' },
};

describe('adaptPaperOpenTrade — VTS wire-format parity', () => {
  it('formats distances exactly like the VTS serializer (signed target, unsigned stop)', () => {
    const t = adaptPaperOpenTrade(baseOpenRow);
    // (105-102)/102*100 = 2.9412 → '+2.94%'; (98-102)/102*100 = -3.9216 → '-3.92%'
    expect(t.distanceToTarget).toBe('+2.94%');
    expect(t.distanceToStop).toBe('-3.92%');
  });

  it('emits N/A when target/stop are zero, like VTS', () => {
    const t = adaptPaperOpenTrade({ ...baseOpenRow, takeProfit: 0, stopLoss: 0 });
    expect(t.distanceToTarget).toBe('N/A');
    expect(t.distanceToStop).toBe('N/A');
  });

  it('signs the percent strings and applies VTS decimal precisions', () => {
    const t = adaptPaperOpenTrade(baseOpenRow);
    expect(t.grossProfitPercent).toBe('+2.00%');
    expect(t.netProfitPercent).toBe('+1.66%');
    expect(t.dollarValue).toBe(1259.26);   // 2dp
    expect(t.quantity).toBe(12.345679);    // 6dp
    // 4dp — (4.19105).toFixed(4) = '4.1910' (the double sits just under the
    // midpoint), same parseFloat(toFixed(4)) path the VTS serializer runs.
    expect(t.costs).toBe(4.191);
  });

  it('maps DIRECT + metadata-sourced fields', () => {
    const t = adaptPaperOpenTrade(baseOpenRow);
    expect(t.symbol).toBe('LTC/USD');
    expect(t.assetClass).toBe('crypto_spot');
    expect(t.regime).toBe('TREND_FRIENDLY_STABLE');
    expect(t.pool).toBe('IDEAL'); // uppercased like VTS
    expect(t.sourcePool).toBe('quant');
    expect(t.target).toBe(105);
    expect(t.exitPrice).toBeNull();
    expect(t.durationOpenMinutes).toBe(3);
    expect(t.chosenEntryMode).toBe('maker');
    expect(t.entryFeeRate).toBe(0.004);
    expect(t.state).toBe('open');
    expect(t.tradeMode).toBe('TARGET');
    expect(t.entryLiquidityValue).toBe(54321);
    expect(t.entryLiquidityKind).toBe('volume_qty');
  });

  it('B-OPEN-TRADES-DISPLAY (item 5): maps the at-entry regime confidence + phase from metadata', () => {
    const t = adaptPaperOpenTrade(baseOpenRow);
    expect(t.regimeConfidenceModulated).toBe(0.712);
    expect(t.regimeConfidenceRaw).toBe(0.804);
    expect(t.macroModifierValue).toBe(0.95);
    expect(t.phase).toBe('PRIME');
    expect(t.phaseAgeSeconds).toBe(420);
    expect(t.strategyPhaseWeight).toBe(0.88);
  });

  it('passes the cost 5-col breakdown through (split renders only when present)', () => {
    const t = adaptPaperOpenTrade(baseOpenRow);
    expect(t.costEntryFee).toBe(1.0);
    expect(t.costEntrySlippage).toBe(0.5);
    expect(t.costExitFee).toBe(2.0);
    expect(t.costExitSlippage).toBe(0.69105);
    const bare = adaptPaperOpenTrade({ ...baseOpenRow, entryFee: undefined, entrySlippage: undefined, estExitFee: undefined, estExitSlippage: undefined });
    expect(bare.costEntryFee).toBeNull();
    expect(bare.costExitSlippage).toBeNull();
  });
});

describe('adaptPaperOpenTrade — no-fabrication honesty', () => {
  it('renders em-dash strings / undefined numbers when metadata is absent — never invents', () => {
    const t = adaptPaperOpenTrade({ ...baseOpenRow, metadata: null });
    expect(t.regime).toBe('—');
    expect(t.signalType).toBe('—');
    expect(t.pool).toBe('—');
    expect(t.sourcePool).toBeUndefined();
    expect(t.rankingScore).toBeUndefined();
    expect(t.expectedEdge).toBeUndefined();
    expect(t.regimeWeight).toBeUndefined();
    // B-OPEN-TRADES-DISPLAY (item 5): absent regime detail → null, never fabricated.
    expect(t.regimeConfidenceModulated).toBeNull();
    expect(t.phase).toBeNull();
    expect(t.macroModifierValue).toBeNull();
    expect(t.strategyPhaseWeight).toBeNull();
  });

  it('emits null (not 0) for absent entry-liquidity and un-captured global/pair context', () => {
    // P19-B8.10: rows opened BEFORE the genesis capture landed carry none of the
    // context keys — the cells must stay null (no backfill, no fabrication).
    const t = adaptPaperOpenTrade({
      ...baseOpenRow,
      volume24h: 0,
      metadata: { regime: 'TREND_FRIENDLY_STABLE', signalType: 'QUANT' },
    });
    expect(t.entryLiquidityValue).toBeNull();
    expect(t.entryLiquidityKind).toBeNull();
    expect(t.globalRegime).toBeNull();
    expect(t.pairFriction).toBeNull();
    expect(t.globalFriction).toBeNull();
    expect(t.pairDirectionalBiasScore).toBeNull();
  });

  it('maps the P19-B8.10 honest keys: Promote R, net-edge fallback chain, genesis context', () => {
    const t = adaptPaperOpenTrade(baseOpenRow);
    expect(t.rankingScore).toBe(-0.42);           // rankAtPromote, NOT legacy rankingScore
    expect(t.expectedEdge).toBe(-0.016);          // netExpectedEdge preferred...
    const atAdmitOnly = adaptPaperOpenTrade({
      ...baseOpenRow,
      metadata: { ...(baseOpenRow.metadata as Record<string, unknown>), netExpectedEdge: undefined },
    });
    expect(atAdmitOnly.expectedEdge).toBe(-0.011); // ...netEvAtAdmit as the at-genesis fallback
    expect(t.globalRegime).toBe('STRONG_TREND');
    expect(t.pairFriction).toBe(42.5);
    expect(t.globalFriction).toBe(38.1);
    expect(t.pairDirectionalBias).toBe('DOWN_MODERATE');
    expect(t.pairDirectionalBiasScore).toBe(-21.4);
    expect(t.globalDirectionalBias).toBe('NEUTRAL');
    expect(t.globalDirectionalBiasScore).toBe(3.2);
    // legacy metadata.rankingScore alone must NOT feed the cell anymore
    const legacyOnly = adaptPaperOpenTrade({
      ...baseOpenRow,
      metadata: { rankingScore: 0.42, expectedEdge: 0.031 },
    });
    expect(legacyOnly.rankingScore).toBeUndefined();
    expect(legacyOnly.expectedEdge).toBeUndefined();
  });

  it('NEVER emits the retired finalScore/hybridScore (#525 fence)', () => {
    const t = adaptPaperOpenTrade(baseOpenRow) as Record<string, unknown>;
    expect('finalScore' in t).toBe(false);
    expect('hybridScore' in t).toBe(false);
  });
});

describe('adaptPaperClosedTrade — decimal-string rows', () => {
  it('parses drizzle decimal strings and computes derived fields', () => {
    const t = adaptPaperClosedTrade(baseClosedRow);
    expect(t.strategy).toBe('orb_breakout');
    expect(t.quantity).toBe(3.5);
    expect(t.entryPrice).toBe(200);
    expect(t.exitPrice).toBe(206);
    expect(t.dollarValue).toBe(700); // 3.5 × 200
    // gross% = 21/700*100 = 3.00
    expect(t.grossProfitPercent).toBe('+3.00%');
    expect(t.netProfitPercent).toBe('+2.20%');
    expect(t.costs).toBe(5.6);
    expect(t.durationMinutes).toBe(90);
    expect(t.entryTime).toBe('2026-07-16T14:00:00.000Z');
    expect(t.exitTime).toBe('2026-07-16T15:30:00.000Z');
    expect(t.entryFeeRate).toBe(0.008);
  });

  it('uppercases closeReason so the shared result badge/label maps hit directly', () => {
    expect(adaptPaperClosedTrade(baseClosedRow).resultType).toBe('TARGET_HIT');
    expect(
      adaptPaperClosedTrade({ ...baseClosedRow, closeReason: 'trailing_stop_hit' }).resultType,
    ).toBe('TRAILING_STOP_HIT');
    expect(adaptPaperClosedTrade({ ...baseClosedRow, closeReason: null }).resultType).toBe('UNKNOWN');
  });

  it('carries the realized cost breakdown + B8.6 maker-exit cohort stamps', () => {
    const t = adaptPaperClosedTrade(baseClosedRow);
    expect(t.costEntryFee).toBe(2.8);
    expect(t.costExitFee).toBe(2.8);
    expect(t.costEntrySlippage).toBe(0);
    expect(t.costExitSlippage).toBe(0);
    expect(t.exitFeeMode).toBe('maker');
    expect(t.exitRestOutcome).toBe('fill');
  });

  it('marks never_filled rows visible-but-excluded, like VTS (B7.2c)', () => {
    expect(adaptPaperClosedTrade(baseClosedRow).countsInAggregates).toBe(true);
    expect(
      adaptPaperClosedTrade({ ...baseClosedRow, closeReason: 'never_filled' }).countsInAggregates,
    ).toBe(false);
  });

  it('never coerces missing numerics to fabricated values or emits retired metrics', () => {
    const t = adaptPaperClosedTrade({
      ...baseClosedRow,
      grossPnl: null,
      netPnl: null,
      metadata: null,
    }) as Record<string, unknown>;
    expect(t.grossProfitPercent).toBe('—');
    // Null P/L → NaN, which the cells isFinite-guard to an em-dash — never $0.00
    // beside a '—%' (Langston Step-4 note 2).
    expect(Number.isNaN(t.grossProfitValue)).toBe(true);
    expect(Number.isNaN(t.netProfitValue)).toBe(true);
    expect(t.regime).toBe('—');
    expect('finalScore' in t).toBe(false);
    expect('hybridScore' in t).toBe(false);
    expect(t.rankingScore).toBeUndefined();
  });
});

/**
 * BATCH_80 (2026-05-13) — TEC per-trade keying unit tests
 *
 * Resolves RUNNING_ISSUES #105: TEC trailingStates Map was keyed by symbol,
 * causing concurrent trades on the same symbol (different strategies / lanes)
 * to share one engine state. After B80, the Map is keyed by tradeId.
 *
 * Test coverage (9 tests per BATCH_80_SCOPE rev2 §4.7, Langston-approved):
 *  1. Multi-trade-per-symbol decision isolation — 3 trades, 3 different stops
 *  2. Persistence per-trade independence on restart
 *  3. VTS single-trade-per-symbol regression (pre-B80 behavior preserved)
 *  4. Paper single-trade-per-symbol regression (same)
 *  5. BE-latch boolean isolation — trade A latches, trade B's flag stays false
 *  6. Moonbag concurrency counter math 0→1→2→1
 *  7. TEC config TTL consistency within cycle (B79.TEC invariant preserved)
 *  8. 3-trade rehydrate independence with Option C+ seed
 *  9. Negative: 4th trade on a 3-already-open symbol doesn't poison existing states
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// DB mock so primeTECConfig can resolve module_constants
const mockRows = { current: [] as any[] };
vi.mock('../../db.js', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: async () => mockRows.current,
      }),
    }),
  },
}));
vi.mock('../../core/math/cost-model.js', () => ({
  getCachedCostMetrics: () => ({ fee: 0, slippage: 0, spread: 0, takerFee: 0, totalCost: 0 }),
  computeNetBreakeven: (entry: number) => entry,
  computeNetTargetFloor: (target: number) => target,
  computeTotalRoundTripCost: () => 0,
}));
vi.mock('../../storage.js', () => ({
  storage: {
    getPaperSimOpenPositions: async () => [],
    updatePaperSimOpenPosition: async () => undefined,
  },
}));
vi.mock('../../services/trade-safety.js', () => ({
  persistTrailingStates: () => undefined,
}));

import {
  initializeTrailingState,
  updatePosition,
  getTrailingState,
  clearTrailingState,
  exportAllStates,
  importStates,
  getDiagnostics,
  primeTECConfig,
  _testClearEngineConfigCache,
  getConcurrentMoonbagCount,
  type TrailingState,
} from '../../services/trailing-exit-controller.js';
import { clearModuleConstantsCache } from '../../services/module-constants-service.js';

const wildcardBase = {
  moduleName: 'trailing_exit',
  exchange: '*',
  assetClass: '*',
  strategy: '*',
  regime: '*',
  updatedAt: new Date(),
  updatedBy: 'test',
};

function seedTECRowsForB80() {
  mockRows.current = [
    { ...wildcardBase, assetClass: 'crypto_spot', constantName: 'break_even_enabled', value: true },
    { ...wildcardBase, assetClass: 'crypto_perp', constantName: 'break_even_enabled', value: false },
    { ...wildcardBase, assetClass: 'xstock_spot', constantName: 'break_even_enabled', value: true },
    { ...wildcardBase, assetClass: 'xstock_perp', constantName: 'break_even_enabled', value: false },
    { ...wildcardBase, constantName: 'break_even_trigger_r', value: 1.0 },
    { ...wildcardBase, constantName: 'target_lock_r', value: 1.5 },
    { ...wildcardBase, constantName: 'trail_distance_atr_multiplier', value: 1.0 },
    { ...wildcardBase, constantName: 'persistence_debounce_ms', value: 5000 },
    { ...wildcardBase, constantName: 'moonbag_qualifying_strategies', value: ['strong_bull_trend', 'sma_trend_ride', 'vwap_pullback', 'breakout'] },
    { ...wildcardBase, constantName: 'moonbag_qualifying_source_pools', value: { vwap_pullback: ['quant-strong_trend'] } },
    { ...wildcardBase, constantName: 'moonbag_max_duration_ms', value: 14400000 },
    { ...wildcardBase, constantName: 'moonbag_cap_mode', value: 'reserved_slots' },
    { ...wildcardBase, constantName: 'moonbag_reserved_slots', value: 1 },
  ];
}

function clearAllStatesForSymbol(symbol: string) {
  // Brute clear — iterate the Map via exportAllStates and clear by tradeId.
  // Tests that explicitly want a clean slate can call this with the symbol
  // they touched.
  for (const s of exportAllStates()) {
    if (s.symbol === symbol) {
      clearTrailingState(s.tradeId);
    }
  }
}

describe('BATCH_80 — TEC per-trade keying', () => {
  beforeEach(async () => {
    clearModuleConstantsCache();
    seedTECRowsForB80();
    _testClearEngineConfigCache();
    await primeTECConfig();
    // Clean slate — clear all known test symbols.
    for (const s of exportAllStates()) {
      clearTrailingState(s.tradeId);
    }
  });

  // ─── Test 1: Multi-trade-per-symbol decision isolation ───────────────────
  it('Test 1: three concurrent trades on FET/USD each get their OWN stop trigger', () => {
    // Open 3 trades on the same symbol with different stops/entries.
    const t1 = initializeTrailingState('vts_crypto_spot_111_aaa', 'FET/USD', 0.24, 0.27, 0.22, 50, 0.3, 0.01);
    const t2 = initializeTrailingState('vts_crypto_spot_222_bbb', 'FET/USD', 0.235, 0.265, 0.215, 50, 0.3, 0.01);
    const t3 = initializeTrailingState('vts_crypto_spot_333_ccc', 'FET/USD', 0.23, 0.26, 0.21, 50, 0.3, 0.01);

    // All three Map entries should exist independently.
    expect(getTrailingState('vts_crypto_spot_111_aaa')?.currentStopPrice).toBe(0.22);
    expect(getTrailingState('vts_crypto_spot_222_bbb')?.currentStopPrice).toBe(0.215);
    expect(getTrailingState('vts_crypto_spot_333_ccc')?.currentStopPrice).toBe(0.21);

    // Engine state for each tradeId carries its own symbol/entry/target.
    expect(t1.symbol).toBe('FET/USD');
    expect(t2.symbol).toBe('FET/USD');
    expect(t3.symbol).toBe('FET/USD');
    expect(t1.entryPrice).toBe(0.24);
    expect(t2.entryPrice).toBe(0.235);
    expect(t3.entryPrice).toBe(0.23);
  });

  // ─── Test 2: Persistence per-trade independence ──────────────────────────
  it('Test 2: exportAllStates + importStates preserves all 3 same-symbol trades independently', () => {
    initializeTrailingState('vts_crypto_spot_111', 'BTC/USD', 50000, 55000, 48000, 50, 0.3, 500);
    initializeTrailingState('vts_crypto_spot_222', 'BTC/USD', 50100, 55100, 48100, 50, 0.3, 500);
    initializeTrailingState('vts_crypto_spot_333', 'BTC/USD', 50200, 55200, 48200, 50, 0.3, 500);

    const exported = exportAllStates();
    expect(exported.length).toBe(3);

    // Wipe in-memory + reimport.
    clearTrailingState('vts_crypto_spot_111');
    clearTrailingState('vts_crypto_spot_222');
    clearTrailingState('vts_crypto_spot_333');
    expect(exportAllStates().length).toBe(0);

    importStates(exported);
    expect(exportAllStates().length).toBe(3);
    expect(getTrailingState('vts_crypto_spot_111')?.currentStopPrice).toBe(48000);
    expect(getTrailingState('vts_crypto_spot_222')?.currentStopPrice).toBe(48100);
    expect(getTrailingState('vts_crypto_spot_333')?.currentStopPrice).toBe(48200);
  });

  // ─── Test 3: VTS single-trade-per-symbol regression preserved ────────────
  it('Test 3: single VTS trade behaves unchanged from pre-B80', () => {
    initializeTrailingState('vts_crypto_spot_solo', 'SOL/USD', 100, 110, 95, 50, 0.3, 2);
    expect(getTrailingState('vts_crypto_spot_solo')?.tradeMode).toBe('TARGET');
    expect(getTrailingState('vts_crypto_spot_solo')?.currentStopPrice).toBe(95);
    expect(getTrailingState('vts_crypto_spot_solo')?.targetLatched).toBe(false);
  });

  // ─── Test 4: Paper single-position-per-symbol regression preserved ───────
  it('Test 4: single paper position behaves unchanged from pre-B80', () => {
    initializeTrailingState('paper_uuid_4444', 'ETH/USD', 3000, 3300, 2850, 50, 0.3, 50);
    expect(getTrailingState('paper_uuid_4444')?.symbol).toBe('ETH/USD');
    expect(getTrailingState('paper_uuid_4444')?.tradeMode).toBe('TARGET');
  });

  // ─── Test 5: BE-latch boolean isolation ──────────────────────────────────
  it('Test 5: BE-latch on trade A does NOT flip trade B`s breakEvenLatched flag', () => {
    // Two same-symbol trades.
    initializeTrailingState('vts_crypto_spot_A', 'ADA/USD', 0.50, 0.55, 0.475, 50, 0.3, 0.02);
    initializeTrailingState('vts_crypto_spot_B', 'ADA/USD', 0.50, 0.55, 0.475, 50, 0.3, 0.02);

    // Tick trade A above 1×ATR gain (0.50 + 0.02 = 0.52).
    updatePosition({
      tradeId: 'vts_crypto_spot_A',
      symbol: 'ADA/USD',
      entryPrice: 0.50,
      targetPrice: 0.55,
      currentPrice: 0.525,
      currentStopPrice: 0.475,
      DI: 50,
      VolNoise: 0.3,
      ATR: 0.02,
      assetClass: 'crypto_spot',
      callerMode: 'vts',
    });

    // Trade A should have breakEvenLatched=true. Trade B untouched.
    expect(getTrailingState('vts_crypto_spot_A')?.breakEvenLatched).toBe(true);
    expect(getTrailingState('vts_crypto_spot_B')?.breakEvenLatched).toBe(false);
  });

  // ─── Test 6: Moonbag concurrency counter math ────────────────────────────
  it('Test 6: moonbag counter increments per trade (0→1→2) and decrements on close (→1)', () => {
    // Counter starts at 0.
    expect(getConcurrentMoonbagCount('vts')).toBe(0);

    // Open 2 same-symbol vwap_pullback trades that qualify for moonbag.
    initializeTrailingState('vts_crypto_spot_M1', 'DOGE/USD', 0.10, 0.11, 0.095, 50, 0.3, 0.005);
    initializeTrailingState('vts_crypto_spot_M2', 'DOGE/USD', 0.10, 0.11, 0.095, 50, 0.3, 0.005);

    // Tick trade M1 to target — should latch into TRAILING_TAKE → counter=1.
    updatePosition({
      tradeId: 'vts_crypto_spot_M1',
      symbol: 'DOGE/USD',
      entryPrice: 0.10,
      targetPrice: 0.11,
      currentPrice: 0.115,
      currentStopPrice: 0.095,
      DI: 50,
      VolNoise: 0.3,
      ATR: 0.005,
      assetClass: 'crypto_spot',
      strategy: 'vwap_pullback',
      sourcePool: 'quant-strong_trend',
      callerMode: 'vts',
      moonbagQualified: true,
      moonbagAllowed: true,
    });
    expect(getConcurrentMoonbagCount('vts')).toBe(1);

    // Tick trade M2 to target — counter goes to 2.
    updatePosition({
      tradeId: 'vts_crypto_spot_M2',
      symbol: 'DOGE/USD',
      entryPrice: 0.10,
      targetPrice: 0.11,
      currentPrice: 0.115,
      currentStopPrice: 0.095,
      DI: 50,
      VolNoise: 0.3,
      ATR: 0.005,
      assetClass: 'crypto_spot',
      strategy: 'vwap_pullback',
      sourcePool: 'quant-strong_trend',
      callerMode: 'vts',
      moonbagQualified: true,
      moonbagAllowed: true,
    });
    expect(getConcurrentMoonbagCount('vts')).toBe(2);

    // Close trade M1 → counter back to 1 (NOT 0 — per-trade keying).
    clearTrailingState('vts_crypto_spot_M1');
    expect(getConcurrentMoonbagCount('vts')).toBe(1);
  });

  // ─── Test 7: TEC config TTL consistency within cycle ─────────────────────
  it('Test 7: config snapshot is consistent across same-symbol trades in one cycle', () => {
    initializeTrailingState('vts_crypto_spot_C1', 'LINK/USD', 15, 16.5, 14.25, 50, 0.3, 0.5);
    initializeTrailingState('vts_crypto_spot_C2', 'LINK/USD', 15, 16.5, 14.25, 50, 0.3, 0.5);

    // Both updates in same "cycle" — config snapshot should be identical.
    // We can't directly assert the snapshot equality, but we CAN assert that
    // the BE-trigger threshold (1.0×ATR) fires identically on both.
    const u1 = updatePosition({
      tradeId: 'vts_crypto_spot_C1',
      symbol: 'LINK/USD',
      entryPrice: 15,
      targetPrice: 16.5,
      currentPrice: 15.6, // gain=0.6, exactly 1.2×ATR (above 1.0×ATR BE threshold)
      currentStopPrice: 14.25,
      DI: 50,
      VolNoise: 0.3,
      ATR: 0.5,
      assetClass: 'crypto_spot',
      callerMode: 'vts',
    });
    const u2 = updatePosition({
      tradeId: 'vts_crypto_spot_C2',
      symbol: 'LINK/USD',
      entryPrice: 15,
      targetPrice: 16.5,
      currentPrice: 15.6,
      currentStopPrice: 14.25,
      DI: 50,
      VolNoise: 0.3,
      ATR: 0.5,
      assetClass: 'crypto_spot',
      callerMode: 'vts',
    });

    // Both should latch BE (config snapshot is consistent).
    expect(u1.breakEvenLatched).toBe(true);
    expect(u2.breakEvenLatched).toBe(true);
  });

  // ─── Test 8: 3-trade rehydrate independence with Option C+ seed ──────────
  it('Test 8: rehydrate via Option C+ seed preserves per-trade tradeMode and ladderRung', () => {
    // Simulate post-restart: TEC engine is empty. vts-runner is iterating
    // its open-trade Map and calling updatePosition with seed for each
    // tradeId — engine initializes per-trade state from seed.
    const u1 = updatePosition({
      tradeId: 'vts_crypto_spot_R1',
      symbol: 'MATIC/USD',
      entryPrice: 1.00,
      targetPrice: 1.10,
      currentPrice: 1.05,
      currentStopPrice: 0.95,
      DI: 50,
      VolNoise: 0.3,
      ATR: 0.05,
      assetClass: 'crypto_spot',
      callerMode: 'vts',
      seed: { tradeMode: 'TARGET', ladderRung: 0, originalStopPrice: 0.95 },
    });
    const u2 = updatePosition({
      tradeId: 'vts_crypto_spot_R2',
      symbol: 'MATIC/USD',
      entryPrice: 1.00,
      targetPrice: 1.10,
      currentPrice: 1.20, // already above target
      currentStopPrice: 1.05,
      DI: 50,
      VolNoise: 0.3,
      ATR: 0.05,
      assetClass: 'crypto_spot',
      callerMode: 'vts',
      seed: { tradeMode: 'TRAILING_TAKE', ladderRung: 2, originalStopPrice: 0.95 },
    });
    const u3 = updatePosition({
      tradeId: 'vts_crypto_spot_R3',
      symbol: 'MATIC/USD',
      entryPrice: 1.00,
      targetPrice: 1.10,
      currentPrice: 1.07,
      currentStopPrice: 0.97,
      DI: 50,
      VolNoise: 0.3,
      ATR: 0.05,
      assetClass: 'crypto_spot',
      callerMode: 'vts',
      seed: { tradeMode: 'TARGET', ladderRung: 0, originalStopPrice: 0.95 },
    });

    const s1 = getTrailingState('vts_crypto_spot_R1');
    const s2 = getTrailingState('vts_crypto_spot_R2');
    const s3 = getTrailingState('vts_crypto_spot_R3');

    expect(s1?.tradeMode).toBe('TARGET');
    expect(s1?.ladderRung).toBe(0);
    expect(s1?.originalStopPrice).toBe(0.95);

    expect(s2?.tradeMode).toBe('TRAILING_TAKE');
    expect(s2?.ladderRung).toBeGreaterThanOrEqual(2); // may have laddered further
    expect(s2?.originalStopPrice).toBe(0.95);

    expect(s3?.tradeMode).toBe('TARGET');
    expect(s3?.ladderRung).toBe(0);
  });

  // ─── Test 8b: seed coercion for TRAILING_TAKE with null/0 ladderRung ─────
  // Per Langston Phase 1 code review: if caller seeds tradeMode='TRAILING_TAKE'
  // but ladderRung is null/undefined/0 (timing-window case at deploy), engine
  // MUST coerce rung=1 + targetLatched=true to preserve mode-rung invariant.
  // Without coercion, the resulting state would have mode=TRAILING_TAKE but
  // targetLatched=false, silently losing ladder trailing logic.
  it('Test 8b: TRAILING_TAKE seed with null/0 ladderRung coerces to rung=1 + targetLatched=true', () => {
    // Case 1: ladderRung explicitly 0, tradeMode TRAILING_TAKE.
    updatePosition({
      tradeId: 'vts_crypto_spot_R8b1',
      symbol: 'UNI/USD',
      entryPrice: 5.00,
      targetPrice: 5.50,
      currentPrice: 5.40,
      currentStopPrice: 4.75,
      DI: 50,
      VolNoise: 0.3,
      ATR: 0.25,
      assetClass: 'crypto_spot',
      callerMode: 'vts',
      seed: { tradeMode: 'TRAILING_TAKE', ladderRung: 0, originalStopPrice: 4.75 },
    });
    const s1 = getTrailingState('vts_crypto_spot_R8b1');
    expect(s1?.tradeMode).toBe('TRAILING_TAKE');
    expect(s1?.ladderRung).toBeGreaterThanOrEqual(1);
    expect(s1?.targetLatched).toBe(true);

    // Case 2: ladderRung undefined, tradeMode TRAILING_TAKE.
    updatePosition({
      tradeId: 'vts_crypto_spot_R8b2',
      symbol: 'UNI/USD',
      entryPrice: 5.00,
      targetPrice: 5.50,
      currentPrice: 5.40,
      currentStopPrice: 4.75,
      DI: 50,
      VolNoise: 0.3,
      ATR: 0.25,
      assetClass: 'crypto_spot',
      callerMode: 'vts',
      seed: { tradeMode: 'TRAILING_TAKE', originalStopPrice: 4.75 }, // ladderRung omitted
    });
    const s2 = getTrailingState('vts_crypto_spot_R8b2');
    expect(s2?.tradeMode).toBe('TRAILING_TAKE');
    expect(s2?.ladderRung).toBeGreaterThanOrEqual(1);
    expect(s2?.targetLatched).toBe(true);

    // Case 3 (no regression): explicit ladderRung > 1 preserved.
    updatePosition({
      tradeId: 'vts_crypto_spot_R8b3',
      symbol: 'UNI/USD',
      entryPrice: 5.00,
      targetPrice: 5.50,
      currentPrice: 5.60,
      currentStopPrice: 5.25,
      DI: 50,
      VolNoise: 0.3,
      ATR: 0.25,
      assetClass: 'crypto_spot',
      callerMode: 'vts',
      seed: { tradeMode: 'TRAILING_TAKE', ladderRung: 3, originalStopPrice: 4.75 },
    });
    const s3 = getTrailingState('vts_crypto_spot_R8b3');
    expect(s3?.tradeMode).toBe('TRAILING_TAKE');
    expect(s3?.ladderRung).toBeGreaterThanOrEqual(3);
    expect(s3?.targetLatched).toBe(true);

    // Case 4 (no regression): TARGET mode preserves rung=0, targetLatched=false.
    updatePosition({
      tradeId: 'vts_crypto_spot_R8b4',
      symbol: 'UNI/USD',
      entryPrice: 5.00,
      targetPrice: 5.50,
      currentPrice: 5.10,
      currentStopPrice: 4.75,
      DI: 50,
      VolNoise: 0.3,
      ATR: 0.25,
      assetClass: 'crypto_spot',
      callerMode: 'vts',
      seed: { tradeMode: 'TARGET', ladderRung: 0, originalStopPrice: 4.75 },
    });
    const s4 = getTrailingState('vts_crypto_spot_R8b4');
    expect(s4?.tradeMode).toBe('TARGET');
    expect(s4?.ladderRung).toBe(0);
    expect(s4?.targetLatched).toBe(false);
  });

  // ─── Test 9: 4th trade on a 3-already-open symbol doesn't poison existing ───
  it('Test 9: opening a 4th trade on a 3-already-open symbol leaves existing states unchanged', () => {
    initializeTrailingState('vts_crypto_spot_X1', 'AVAX/USD', 30, 33, 28.5, 50, 0.3, 1);
    initializeTrailingState('vts_crypto_spot_X2', 'AVAX/USD', 30.5, 33.5, 29, 50, 0.3, 1);
    initializeTrailingState('vts_crypto_spot_X3', 'AVAX/USD', 31, 34, 29.5, 50, 0.3, 1);

    // Snapshot the 3 existing stops.
    const s1Before = getTrailingState('vts_crypto_spot_X1')?.currentStopPrice;
    const s2Before = getTrailingState('vts_crypto_spot_X2')?.currentStopPrice;
    const s3Before = getTrailingState('vts_crypto_spot_X3')?.currentStopPrice;

    // Open a 4th trade with a completely different stop.
    initializeTrailingState('vts_crypto_spot_X4', 'AVAX/USD', 32, 35, 30, 50, 0.3, 1);

    // Existing 3 states should be UNCHANGED.
    expect(getTrailingState('vts_crypto_spot_X1')?.currentStopPrice).toBe(s1Before);
    expect(getTrailingState('vts_crypto_spot_X2')?.currentStopPrice).toBe(s2Before);
    expect(getTrailingState('vts_crypto_spot_X3')?.currentStopPrice).toBe(s3Before);

    // New 4th state is independent.
    expect(getTrailingState('vts_crypto_spot_X4')?.currentStopPrice).toBe(30);
    expect(getDiagnostics().activeCount).toBeGreaterThanOrEqual(4);
  });
});

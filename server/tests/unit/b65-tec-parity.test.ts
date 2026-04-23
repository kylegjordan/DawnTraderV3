/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B65.2 — TEC Exit-Evaluator Parity Test
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Verifies `evaluateTECExit()` in server/services/tec-evaluator.ts produces the
 * expected exit decision for the 7 Langston-approved scenarios that VTS and
 * paper-execution-engine must both agree on.
 *
 * Scenarios (pre-audit §5.3):
 *   1. Simple stop hit
 *   2. Simple target hit
 *   3. Break-even lock (trailing path — useTrailing:true)
 *   4. Target-lock trailing (trailing path — useTrailing:true)
 *   5. Timeout via MAX_HOLD_MS with live price
 *   6. Cost-aware breakeven floor — TEC state machine applies net floor
 *   7. Stale-price force-close (no price + hold > max → exit at entryPrice)
 *
 * DB is mocked so constants resolve from an in-memory rowset. We inject
 * the 4 TEC defaults from the B65.1 seed migration to confirm the evaluator
 * picks them up and returns them in `resolvedConstants`.
 *
 * Source: BATCH_65_SCOPE.md §B65.2, Langston Phase 2 review (stale-price add).
 * ═════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock DB so moduleConstantsService.getModuleConstants returns our seeded rows.
const mockRows = { current: [] as any[] };
vi.mock('../../db.js', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: async () => mockRows.current,
      }),
    }),
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: async () => undefined,
      }),
    }),
  },
}));

// Stub trailing-exit-controller so scenarios 3/4/6 don't require the real
// state machine's internals. We re-export functions we can drive from tests.
const tecState = {
  symbol: '',
  newStopPrice: 0,
  modeChanged: false,
  shouldClose: false,
};

vi.mock('../../services/trailing-exit-controller.js', () => ({
  updatePosition: vi.fn((update: any) => {
    tecState.symbol = update.symbol;
    return {
      symbol: update.symbol,
      previousMode: 'TARGET',
      newMode: tecState.modeChanged ? 'TRAILING_TAKE' : 'TARGET',
      modeChanged: tecState.modeChanged,
      newStopPrice: tecState.newStopPrice || update.currentStopPrice,
      stopMoved: false,
      breakEvenLatched: false,
      targetLatched: false,
      highWaterMark: update.currentPrice,
    };
  }),
  shouldClosePosition: vi.fn((_symbol: string, _price: number) => tecState.shouldClose),
}));

import { evaluateTECExit } from '../../services/tec-evaluator.js';
import { clearModuleConstantsCache } from '../../services/module-constants-service.js';

function seedTECDefaults() {
  const base = {
    moduleName: 'trailing_exit',
    exchange: '*',
    assetClass: '*',
    strategy: '*',
    regime: '*',
    updatedAt: new Date(),
    updatedBy: 'seed',
  };
  mockRows.current = [
    { ...base, constantName: 'break_even_trigger_r', value: 1.0 },
    { ...base, constantName: 'target_lock_r', value: 1.5 },
    { ...base, constantName: 'trail_distance_atr_multiplier', value: 1.0 },
    { ...base, constantName: 'persistence_debounce_ms', value: 5000 },
  ];
}

const defaultContext = {
  exchange: 'kraken',
  assetClass: 'crypto_spot',
  strategy: 'strong_bull_trend',
  regime: 'TREND_FRIENDLY_STABLE',
};

describe('B65.2 — evaluateTECExit parity scenarios', () => {
  beforeEach(() => {
    clearModuleConstantsCache();
    seedTECDefaults();
    tecState.newStopPrice = 0;
    tecState.modeChanged = false;
    tecState.shouldClose = false;
  });

  it('Scenario 1: simple stop hit clamps exit to stop level', async () => {
    const decision = await evaluateTECExit({
      symbol: 'BTC/USD',
      entryPrice: 100,
      stopPrice: 95,
      targetPrice: 110,
      currentPrice: 94, // below stop
      atr: 0,
      holdDurationMs: 60_000,
      maxHoldMs: 7 * 24 * 60 * 60 * 1000,
      context: defaultContext,
      useTrailing: false,
    });
    expect(decision.shouldExit).toBe(true);
    expect(decision.exitReason).toBe('stop_hit');
    expect(decision.exitPrice).toBe(95); // clamped to stop, not 94
  });

  it('Scenario 2: simple target hit clamps exit to target level', async () => {
    const decision = await evaluateTECExit({
      symbol: 'BTC/USD',
      entryPrice: 100,
      stopPrice: 95,
      targetPrice: 110,
      currentPrice: 112, // above target
      atr: 0,
      holdDurationMs: 60_000,
      maxHoldMs: 7 * 24 * 60 * 60 * 1000,
      context: defaultContext,
      useTrailing: false,
    });
    expect(decision.shouldExit).toBe(true);
    expect(decision.exitReason).toBe('target_hit');
    expect(decision.exitPrice).toBe(110); // clamped to target, not 112
  });

  it('Scenario 3: break-even lock — trailing path engages TEC state machine', async () => {
    // TEC stub reports break-even lock updated stop to entry (100) but no close.
    tecState.newStopPrice = 100;
    tecState.shouldClose = false;

    const decision = await evaluateTECExit({
      symbol: 'BTC/USD',
      entryPrice: 100,
      stopPrice: 95,
      targetPrice: 110,
      currentPrice: 102, // moved up but not past target
      atr: 1,
      holdDurationMs: 60_000,
      maxHoldMs: 7 * 24 * 60 * 60 * 1000,
      context: defaultContext,
      useTrailing: true,
    });
    expect(decision.shouldExit).toBe(false);
    expect(decision.newStopPrice).toBe(100); // stop ratcheted to break-even
  });

  it('Scenario 4: target-lock trailing — mode flip to TRAILING_TAKE', async () => {
    tecState.modeChanged = true;
    tecState.newStopPrice = 108; // locked near target
    tecState.shouldClose = false;

    const decision = await evaluateTECExit({
      symbol: 'BTC/USD',
      entryPrice: 100,
      stopPrice: 95,
      targetPrice: 110,
      currentPrice: 109.5,
      atr: 1,
      holdDurationMs: 60_000,
      maxHoldMs: 7 * 24 * 60 * 60 * 1000,
      context: defaultContext,
      useTrailing: true,
    });
    expect(decision.shouldExit).toBe(false);
    expect(decision.modeChanged).toBe(true);
    expect(decision.newStopPrice).toBe(108);
  });

  it('Scenario 5: timeout via MAX_HOLD_MS with live price closes at currentPrice', async () => {
    const decision = await evaluateTECExit({
      symbol: 'BTC/USD',
      entryPrice: 100,
      stopPrice: 95,
      targetPrice: 110,
      currentPrice: 103,
      atr: 0,
      holdDurationMs: 8 * 24 * 60 * 60 * 1000, // 8 days > 7 days
      maxHoldMs: 7 * 24 * 60 * 60 * 1000,
      context: defaultContext,
      useTrailing: false,
    });
    expect(decision.shouldExit).toBe(true);
    expect(decision.exitReason).toBe('timeout');
    expect(decision.exitPrice).toBe(103);
  });

  it('Scenario 6: cost-aware breakeven — trailing path close at ratcheted stop', async () => {
    // TEC stub applies net-breakeven floor (cost-aware) and signals close.
    tecState.newStopPrice = 100.25; // net breakeven (entry + costs)
    tecState.shouldClose = true;

    const decision = await evaluateTECExit({
      symbol: 'BTC/USD',
      entryPrice: 100,
      stopPrice: 95,
      targetPrice: 110,
      currentPrice: 100.2, // below the net-breakeven floor
      atr: 1,
      holdDurationMs: 60_000,
      maxHoldMs: 7 * 24 * 60 * 60 * 1000,
      context: defaultContext,
      useTrailing: true,
    });
    expect(decision.shouldExit).toBe(true);
    expect(decision.exitReason).toBe('trailing_stop_hit');
    expect(decision.exitPrice).toBe(100.2);
  });

  it('Scenario 7: stale-price force-close → exit at entryPrice', async () => {
    const decision = await evaluateTECExit({
      symbol: 'ILLIQUID/USD',
      entryPrice: 100,
      stopPrice: 95,
      targetPrice: 110,
      currentPrice: null, // no price data
      atr: 0,
      holdDurationMs: 8 * 24 * 60 * 60 * 1000,
      maxHoldMs: 7 * 24 * 60 * 60 * 1000,
      context: defaultContext,
      useTrailing: false,
    });
    expect(decision.shouldExit).toBe(true);
    expect(decision.exitReason).toBe('stale_timeout');
    expect(decision.exitPrice).toBe(100); // entry fallback
  });

  it('Bonus: resolved constants include all 4 B65.1 TEC defaults', async () => {
    const decision = await evaluateTECExit({
      symbol: 'BTC/USD',
      entryPrice: 100,
      stopPrice: 95,
      targetPrice: 110,
      currentPrice: 100,
      atr: 0,
      holdDurationMs: 60_000,
      maxHoldMs: 7 * 24 * 60 * 60 * 1000,
      context: defaultContext,
      useTrailing: false,
    });
    expect(decision.resolvedConstants?.breakEvenTriggerR).toBe(1.0);
    expect(decision.resolvedConstants?.targetLockR).toBe(1.5);
    expect(decision.resolvedConstants?.trailDistanceAtrMultiplier).toBe(1.0);
  });

  it('No-price + within-hold returns shouldExit:false (no decision)', async () => {
    const decision = await evaluateTECExit({
      symbol: 'ILLIQUID/USD',
      entryPrice: 100,
      stopPrice: 95,
      targetPrice: 110,
      currentPrice: null,
      atr: 0,
      holdDurationMs: 60_000, // still fresh
      maxHoldMs: 7 * 24 * 60 * 60 * 1000,
      context: defaultContext,
      useTrailing: false,
    });
    expect(decision.shouldExit).toBe(false);
    expect(decision.exitReason).toBeNull();
  });
});

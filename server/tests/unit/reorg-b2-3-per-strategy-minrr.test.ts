/**
 * reorg-B2.3 — per-(strategy × asset_class) minRR floor + single-chokepoint canonicalization.
 *
 * Guards:
 *  - OBJ-1 live path: a real `range_trade` token (and the `range_trading` StrategyType DRIFT) resolves the
 *    SEEDED per-strategy floor through the gate, NOT the permissive `*` default (a regression to the old
 *    silent-fallback fails this).
 *  - OBJ-5 fail-closed: an UNRECOGNIZED token resolves the conservative `min_rr_unknown_floor` (max-per-class),
 *    bumps the loud tripwire counter, and never throws.
 *  - back-compat: a call with no strategy resolves the per-class `*` default.
 *  - CI tripwire (reads the SSOT at test time): every caller literal/constant ∈ STRATEGY_DISPLAY_NAMES, and
 *    every `StrategyType` value canonicalizes 1:1 (the `Record<StrategyType,…>` is compile-time exhaustive).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { getPerClassTargetGate } from '../../core/calculations/expectancy.js';
import {
  STRATEGY_DISPLAY_NAMES,
  resolveCanonicalStrategy,
} from '../../config/canonical-regime-strategy-map.js';
import {
  getUnknownStrategyCounts,
  __resetUnknownStrategyCountsForTest,
} from '../../core/observability/unknown-strategy-counter.js';
import { _seedModuleCacheForTests } from '../../services/module-constants-service.js';
import type { StrategyType } from '../../services/paper-position-sizing.js';

const K = (assetClass: string, strategy: string, constantName: string, value: number) => ({
  moduleName: 'expectancy_gates', exchange: '*', assetClass, strategy, regime: '*', constantName, value,
});

function seedGate() {
  _seedModuleCacheForTests('expectancy_gates', [
    // per-class defaults (needed by floorPct / reachAtrMax / min_rr '*')
    K('crypto_spot', '*', 'target_floor_pct', 1.0),
    K('crypto_spot', '*', 'reach_atr_max', 3.0),
    K('crypto_spot', '*', 'min_rr', 2.0),
    // a seeded per-strategy floor (range_trade) — the live-path subject
    K('crypto_spot', 'range_trade', 'min_rr', 1.71),
    K('crypto_spot', 'morning_star', 'min_rr', 1.39),
    // fail-closed floors (max-per-class + global fallback)
    K('crypto_spot', '*', 'min_rr_unknown_floor', 2.88),
    { moduleName: 'expectancy_gates', exchange: '*', assetClass: '*', strategy: '*', regime: '*', constantName: 'min_rr_unknown_floor', value: 2.88 },
  ] as any);
}

beforeEach(() => {
  seedGate();
  __resetUnknownStrategyCountsForTest();
});

describe('reorg-B2.3 per-strategy minRR — live path', () => {
  it('resolves the SEEDED per-strategy floor for a canonical token (not the * default)', () => {
    expect(getPerClassTargetGate('crypto_spot', 'range_trade').minRR).toBe(1.71);
    expect(getPerClassTargetGate('crypto_spot', 'morning_star').minRR).toBe(1.39);
  });

  it('canonicalizes the range_trading→range_trade DRIFT at the chokepoint (resolves 1.71, not the * 2.0)', () => {
    // The StrategyType union emits `range_trading`; the seeded row is `range_trade`. The chokepoint MUST
    // normalize it — a regression to the silent identity-return would resolve the permissive * default.
    expect(getPerClassTargetGate('crypto_spot', 'range_trading').minRR).toBe(1.71);
  });

  it('falls back to the per-class * default for a canonical-but-unseeded strategy', () => {
    // mean_reversion is canonical but has no seeded row here → the * default 2.0.
    expect(getPerClassTargetGate('crypto_spot', 'mean_reversion').minRR).toBe(2.0);
  });

  it('back-compat: no strategy arg → per-class * default', () => {
    expect(getPerClassTargetGate('crypto_spot').minRR).toBe(2.0);
  });
});

describe('reorg-B2.3 fail-closed unknown-token path', () => {
  it('resolves min_rr_unknown_floor (max-per-class), bumps the counter, and does NOT throw', () => {
    expect(getUnknownStrategyCounts()).toEqual({});
    const gate = getPerClassTargetGate('crypto_spot', 'totally_bogus_strategy');
    expect(gate.minRR).toBe(2.88); // the conservative max-per-class floor, NOT the permissive * 2.0
    expect(getUnknownStrategyCounts()).toEqual({ crypto_spot: 1 });
  });

  it('the unknown floor (2.88) is STRICTER than the * default (2.0) — genuinely fail-closed', () => {
    const unknown = getPerClassTargetGate('crypto_spot', 'nope').minRR;
    const defaultFloor = getPerClassTargetGate('crypto_spot').minRR;
    expect(unknown).toBeGreaterThan(defaultFloor);
  });
});

describe('reorg-B2.3 CI tripwire — caller tokens ∈ the SSOT (read at test time)', () => {
  // The literal/constant tokens the ~22 gate callers pass (strategy-engine + strategy files).
  const CALLER_TOKENS = [
    'vwap_pullback', 'abcd_long', 'sma_trend_ride', 'breakout', 'mean_reversion', 'range_trade',
    'vwap_bounce', 'dhma', 'adaptive_flow', 'defensive_hedge', 'inside_bar_reversal', 'morning_star',
    'pivot_shift', 'reverse_impulse', 'support_bounce', 'volatility_edge', 'strong_bull_trend', 'orb',
  ];

  it('every caller literal is a canonical key in STRATEGY_DISPLAY_NAMES (the SSOT, read live)', () => {
    const canonical = Object.keys(STRATEGY_DISPLAY_NAMES); // imported SSOT, not a hand-copied list
    for (const t of CALLER_TOKENS) {
      expect(canonical, `caller token "${t}" must be a canonical strategy`).toContain(t);
    }
  });

  it('every StrategyType value canonicalizes 1:1 (the Record is compile-time exhaustive)', () => {
    // Compile-time exhaustiveness: TS errors if a StrategyType value is missing or a non-value is added.
    const STRATEGY_TYPE_VALUES: Record<StrategyType, true> = {
      vwap_pullback: true, abcd_long: true, sma_trend_ride: true, breakout: true, mean_reversion: true,
      range_trading: true, vwap_bounce: true, liquidity_trap: true, dhma: true,
    };
    for (const v of Object.keys(STRATEGY_TYPE_VALUES)) {
      const c = resolveCanonicalStrategy(v);
      expect(c, `StrategyType "${v}" must canonicalize to a known strategy`).not.toBeNull();
      expect(Object.keys(STRATEGY_DISPLAY_NAMES)).toContain(c);
    }
    // the one intentional drift: range_trading → range_trade
    expect(resolveCanonicalStrategy('range_trading')).toBe('range_trade');
  });

  it('an unknown token resolves to null (fail-closed signal), not identity-return', () => {
    expect(resolveCanonicalStrategy('not_a_real_strategy')).toBeNull();
  });
});

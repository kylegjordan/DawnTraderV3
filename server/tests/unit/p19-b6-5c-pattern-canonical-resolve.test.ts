/**
 * ════════════════════════════════════════════════════════════════════════════
 * P19-B6.5c — pattern → consuming CANONICAL strategy resolution (exact-match-or-drop)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * The crypto active orchestrator used to stamp signals with a fabricated
 * `pattern_<name>` strategy (e.g. `pattern_abcd`) that is NOT a valid
 * `strategy_type` enum value, so the rtb_signals insert rejected every pattern
 * signal (the B6.5b dry-run's 8,503 drops). The fix resolves each detected
 * pattern to the CANONICAL strategy that consumes it in the current regime+class
 * via `resolvePatternConsumingStrategy`, EXACT-MATCH only — no fallback to a
 * non-consuming strategy (Langston D3: never map-to-nearest), no invented
 * strategies (patterns are TRIGGERS, the 19 canonical strategies are fixed).
 *
 * These tests lock:
 *   - the regime-DEPENDENT exact matches (same pattern → different strategy by regime),
 *   - the no-match DROP (returns null) incl. the ABCD-pattern ≠ abcd_long-quant case,
 *   - the observable (pattern, regime, class) drop counter,
 *   - that selectContextAwareStrategy's shared fallback contract is UNCHANGED (VTS/xStock).
 * ════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  resolvePatternConsumingStrategy,
  getPatternNoMatchDropStats,
  resetPatternNoMatchDropStats,
  selectContextAwareStrategy,
  type CanonicalRegimeType,
} from '../../config/canonical-regime-strategy-map.js';

const CRYPTO = 'crypto_spot' as any;

describe('P19-B6.5c — resolvePatternConsumingStrategy (crypto_spot, exact-match-or-drop)', () => {
  beforeEach(() => resetPatternNoMatchDropStats());

  describe('regime-DEPENDENT exact matches (the corrected pattern→strategy model)', () => {
    it('PINBAR → reverse_impulse in HIGH_VOLATILITY_UNSTABLE', () => {
      const r = resolvePatternConsumingStrategy('HIGH_VOLATILITY_UNSTABLE', 'PINBAR', CRYPTO);
      expect(r?.strategy).toBe('reverse_impulse');
      expect(r?.signalType).toBe('HYBRID');
      expect(r?.patternType).toBe('PINBAR');
    });

    it('PINBAR → support_bounce in RANGE_BOUND_STABLE (same pattern, different regime → different strategy)', () => {
      const r = resolvePatternConsumingStrategy('RANGE_BOUND_STABLE', 'PINBAR', CRYPTO);
      expect(r?.strategy).toBe('support_bounce');
      expect(r?.signalType).toBe('PATTERN');
    });

    it('MORNING_STAR → morning_star in TREND_FRIENDLY_STABLE', () => {
      const r = resolvePatternConsumingStrategy('TREND_FRIENDLY_STABLE', 'MORNING_STAR', CRYPTO);
      expect(r?.strategy).toBe('morning_star');
    });

    it('INSIDE_BAR → inside_bar_reversal in HIGH_VOLATILITY_UNSTABLE', () => {
      const r = resolvePatternConsumingStrategy('HIGH_VOLATILITY_UNSTABLE', 'INSIDE_BAR', CRYPTO);
      expect(r?.strategy).toBe('inside_bar_reversal');
    });

    it('ENGULFING → defensive_hedge in HIGH_VOLATILITY_UNSTABLE', () => {
      const r = resolvePatternConsumingStrategy('HIGH_VOLATILITY_UNSTABLE', 'ENGULFING', CRYPTO);
      expect(r?.strategy).toBe('defensive_hedge');
    });

    it('ABCD → volatility_edge in IMPULSE_EXPANSION (NOT abcd_long — that is a separate QUANT strategy)', () => {
      const r = resolvePatternConsumingStrategy('IMPULSE_EXPANSION', 'ABCD', CRYPTO);
      expect(r?.strategy).toBe('volatility_edge');
      expect(r?.strategy).not.toBe('abcd_long');
    });

    it('THREE_SOLDIERS canonicalizes to MORNING_STAR → morning_star in TREND_FRIENDLY_STABLE', () => {
      const r = resolvePatternConsumingStrategy('TREND_FRIENDLY_STABLE', 'THREE_SOLDIERS', CRYPTO);
      expect(r?.strategy).toBe('morning_star');
    });

    it('DOJI canonicalizes to TRI_STAR → adaptive_flow in RANGE_BOUND_STABLE', () => {
      const r = resolvePatternConsumingStrategy('RANGE_BOUND_STABLE', 'DOJI', CRYPTO);
      expect(r?.strategy).toBe('adaptive_flow');
    });
  });

  describe('no-match DROP (null) + observable counter', () => {
    it('PINBAR in TREND_FRIENDLY_STABLE → null (no PINBAR consumer there) + counts the drop', () => {
      const r = resolvePatternConsumingStrategy('TREND_FRIENDLY_STABLE', 'PINBAR', CRYPTO);
      expect(r).toBeNull();
      expect(getPatternNoMatchDropStats()['PINBAR|TREND_FRIENDLY_STABLE|crypto_spot']).toBe(1);
    });

    it('ABCD in RANGE_BOUND_STABLE → null (abcd_long is QUANT, not a pattern consumer) — the conflation guard', () => {
      const r = resolvePatternConsumingStrategy('RANGE_BOUND_STABLE', 'ABCD', CRYPTO);
      expect(r).toBeNull();
      expect(getPatternNoMatchDropStats()['ABCD|RANGE_BOUND_STABLE|crypto_spot']).toBe(1);
    });

    it('counter is keyed by (pattern, regime, class) and accumulates', () => {
      resolvePatternConsumingStrategy('TREND_FRIENDLY_STABLE', 'PINBAR', CRYPTO);
      resolvePatternConsumingStrategy('TREND_FRIENDLY_STABLE', 'PINBAR', CRYPTO);
      resolvePatternConsumingStrategy('IMPULSE_EXPANSION', 'PINBAR', CRYPTO);
      const stats = getPatternNoMatchDropStats();
      expect(stats['PINBAR|TREND_FRIENDLY_STABLE|crypto_spot']).toBe(2);
      expect(stats['PINBAR|IMPULSE_EXPANSION|crypto_spot']).toBe(1);
    });

    it('unrecognized (non-canonical) pattern → null, UNcounted (no canonical trigger to consume)', () => {
      const r = resolvePatternConsumingStrategy('HIGH_VOLATILITY_UNSTABLE', 'NOT_A_PATTERN', CRYPTO);
      expect(r).toBeNull();
      expect(Object.keys(getPatternNoMatchDropStats())).toHaveLength(0);
    });

    it('null pattern → null, UNcounted', () => {
      const r = resolvePatternConsumingStrategy('HIGH_VOLATILITY_UNSTABLE', null, CRYPTO);
      expect(r).toBeNull();
      expect(Object.keys(getPatternNoMatchDropStats())).toHaveLength(0);
    });
  });

  describe('selectContextAwareStrategy fallback contract UNCHANGED (shared with VTS/xStock)', () => {
    it('still falls back (hybrid_fallback) where the exact-match resolver drops — proves no contract change', () => {
      // PINBAR in TFS has no PINBAR consumer → resolvePatternConsumingStrategy returns null (drop),
      // but selectContextAwareStrategy must STILL return a non-null fallback for VTS/xStock callers.
      const exact = resolvePatternConsumingStrategy('TREND_FRIENDLY_STABLE', 'PINBAR', CRYPTO);
      expect(exact).toBeNull();

      const ctx = selectContextAwareStrategy('TREND_FRIENDLY_STABLE' as CanonicalRegimeType, 'PINBAR', 0, CRYPTO);
      expect(ctx.strategy).toBeTruthy();
      expect(ctx.selectionReason).not.toBe('exact_match'); // fell back, as designed
    });
  });
});

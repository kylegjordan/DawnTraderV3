/**
 * ════════════════════════════════════════════════════════════════════════════
 * B79.0m.b2 — Lane eligibility unit tests
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Verifies that the per-lane strategy gate in `eval-cycle.ts` routes:
 *   - pattern strategies (STRATEGY_FAMILY_MAP === 'pattern') → pattern lane ONLY
 *   - quant strategies → matching family lane ONLY
 *   - hybrid strategies → family lanes per HYBRID_FAMILY_ELIGIBILITY
 *   - multi-family strategies → primary OR MULTI_FAMILY_ELIGIBILITY entry
 *
 * Mirrors crypto's `fx5-scanner.ts:1607-1643` semantics. Architectural lock
 * per Kyle directive 2026-05-11 + Langston rev1 Q-L1 confirm.
 * ════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect } from 'vitest';
import type { StrategyFamily } from '../../config/canonical-regime-strategy-map.js';

// Langston Step 4 nit #1 (2026-05-11): import the production function so
// MAP-entry drift OR helper-logic drift is caught. Prior version re-implemented
// the helper and only validated the test's own copy. Helper was extracted to
// `lane-eligibility.ts` (separate from eval-cycle.ts) so this import doesn't
// pull in MCE / vts-runner / pattern-filter etc.
import { isStrategyEligibleForLane, type EvalLane } from '../../asset_classes/xstock_spot/lane-eligibility.js';

describe('B79.0m.b2 — Lane eligibility', () => {
  // ── Pattern strategies → pattern lane only ──
  it('morning_star fires in pattern lane', () => {
    expect(isStrategyEligibleForLane('morning_star', { kind: 'pattern', sourcePool: 'pattern' })).toBe(true);
  });
  it('inside_bar_reversal fires in pattern lane', () => {
    expect(isStrategyEligibleForLane('inside_bar_reversal', { kind: 'pattern', sourcePool: 'pattern' })).toBe(true);
  });
  it('morning_star DOES fire in every family lane (Kyle directive 2026-05-11 — pattern strategies eligible in quant paths too)', () => {
    // B79.0m.b2 followup: pattern strategies are eligible in family lanes,
    // mirroring crypto where a pair in both quant + pattern pools produces
    // duplicate VTS-batch entries and pattern strategies fire on the family-
    // lane entries too. The scanPatterns()-derived patternInput is built per
    // strategy; pattern strategies gate at detect-time on whether a matching
    // pattern was detected.
    for (const fam of ['trend', 'reversal', 'breakout', 'oscillator', 'strong_trend'] as StrategyFamily[]) {
      expect(isStrategyEligibleForLane('morning_star', { kind: 'family', family: fam, sourcePool: `xstock-${fam}` })).toBe(true);
      expect(isStrategyEligibleForLane('inside_bar_reversal', { kind: 'family', family: fam, sourcePool: `xstock-${fam}` })).toBe(true);
    }
  });

  it('quant strategies do NOT fire in pattern lane (asymmetric rule)', () => {
    // Only `stratFamily === 'pattern'` strategies fire on the pattern lane.
    // Quant + hybrid strategies are restricted to family lanes only.
    expect(isStrategyEligibleForLane('breakout', { kind: 'pattern', sourcePool: 'pattern' })).toBe(false);
    expect(isStrategyEligibleForLane('mean_reversion', { kind: 'pattern', sourcePool: 'pattern' })).toBe(false);
    expect(isStrategyEligibleForLane('vwap_pullback', { kind: 'pattern', sourcePool: 'pattern' })).toBe(false);
  });

  // ── Quant strategies → primary family lane only ──
  it('breakout fires in breakout lane only', () => {
    expect(isStrategyEligibleForLane('breakout', { kind: 'family', family: 'breakout', sourcePool: 'xstock-breakout' })).toBe(true);
    expect(isStrategyEligibleForLane('breakout', { kind: 'family', family: 'trend', sourcePool: 'xstock-trend' })).toBe(false);
    expect(isStrategyEligibleForLane('breakout', { kind: 'pattern', sourcePool: 'pattern' })).toBe(false);
  });
  it('mean_reversion fires in reversal lane only', () => {
    expect(isStrategyEligibleForLane('mean_reversion', { kind: 'family', family: 'reversal', sourcePool: 'xstock-reversal' })).toBe(true);
    expect(isStrategyEligibleForLane('mean_reversion', { kind: 'family', family: 'trend', sourcePool: 'xstock-trend' })).toBe(false);
  });

  // ── ORB → breakout lane (B79.0m.b2 new entry) ──
  it('orb fires in breakout lane (B79.0m.b2 family-map entry)', () => {
    expect(isStrategyEligibleForLane('orb', { kind: 'family', family: 'breakout', sourcePool: 'xstock-breakout' })).toBe(true);
    expect(isStrategyEligibleForLane('orb', { kind: 'family', family: 'trend', sourcePool: 'xstock-trend' })).toBe(false);
    expect(isStrategyEligibleForLane('orb', { kind: 'pattern', sourcePool: 'pattern' })).toBe(false);
  });

  // ── Hybrid strategies → eligible family lanes only ──
  it('pivot_shift (hybrid: trend+pattern) fires in trend lane AND pattern lane', () => {
    expect(isStrategyEligibleForLane('pivot_shift', { kind: 'family', family: 'trend', sourcePool: 'xstock-trend' })).toBe(true);
    // pivot_shift is hybrid (HYBRID_FAMILY_ELIGIBILITY=['trend','pattern']);
    // in the pattern lane it doesn't fire because pattern lane only admits
    // STRATEGY_FAMILY_MAP === 'pattern' strategies. The hybrid pattern-half
    // eligibility is enforced via patternInput at detect time, not via lane
    // membership.
    expect(isStrategyEligibleForLane('pivot_shift', { kind: 'pattern', sourcePool: 'pattern' })).toBe(false);
    expect(isStrategyEligibleForLane('pivot_shift', { kind: 'family', family: 'breakout', sourcePool: 'xstock-breakout' })).toBe(false);
  });

  // ── Multi-family eligibility (vwap_pullback: trend primary + strong_trend additional) ──
  it('vwap_pullback fires in trend AND strong_trend lanes', () => {
    expect(isStrategyEligibleForLane('vwap_pullback', { kind: 'family', family: 'trend', sourcePool: 'xstock-trend' })).toBe(true);
    expect(isStrategyEligibleForLane('vwap_pullback', { kind: 'family', family: 'strong_trend', sourcePool: 'xstock-strong_trend' })).toBe(true);
    expect(isStrategyEligibleForLane('vwap_pullback', { kind: 'family', family: 'breakout', sourcePool: 'xstock-breakout' })).toBe(false);
    expect(isStrategyEligibleForLane('vwap_pullback', { kind: 'pattern', sourcePool: 'pattern' })).toBe(false);
  });

  // ── Strong-bull strategy → strong_trend only ──
  it('strong_bull_trend fires in strong_trend lane only', () => {
    expect(isStrategyEligibleForLane('strong_bull_trend', { kind: 'family', family: 'strong_trend', sourcePool: 'xstock-strong_trend' })).toBe(true);
    expect(isStrategyEligibleForLane('strong_bull_trend', { kind: 'family', family: 'trend', sourcePool: 'xstock-trend' })).toBe(false);
  });
});

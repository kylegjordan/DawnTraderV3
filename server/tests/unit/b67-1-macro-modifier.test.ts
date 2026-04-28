/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B67.1 — Macro Confidence Modifier Unit Tests
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Covers:
 *   1. Clamp behavior under extreme z-score inputs
 *   2. Weight math (sign convention: BTC dom + funding penalize, mcap reinforces)
 *   3. Z-score normalization (min-sample-count floor)
 *   4. Cold-start fallback path (any z-score unavailable → modifier=1.0)
 *   5. Stale-data fallback path (snapshot too old → modifier=1.0)
 *   6. buildB67_1Alternate returns correct JSONB shape with reverse-derivation
 *
 * Reference: BATCH_67_1_SCOPE.md §7, BATCH_67_1_PRE_AUDIT.md
 * ═════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect } from 'vitest';
import {
  computeMacroModifier,
  buildB67_1Alternate,
  type MacroSnapshot,
  type MacroBaseline,
  type MacroModifierConfig,
} from '../../core/metrics/macro-modifier';

const DEFAULT_CONFIG: MacroModifierConfig = {
  enabled: true,
  btcDominanceWeight: 0.40,
  fundingWeight: 0.35,
  mcapMomentumWeight: 0.25,
  modifierMin: 0.85,
  modifierMax: 1.05,
  staleSeconds: 300,
  zScoreMinSampleCount: 48,
};

function freshSnapshot(overrides: Partial<MacroSnapshot> = {}): MacroSnapshot {
  return {
    utcIso: new Date().toISOString(),
    ageSeconds: 5,
    btcDominance: 54.0,
    totalMarketCapUsd: 2.36e12, // raw USD (kept for future consumers)
    mcapMomentum: 0.0, // period-over-period % change (z-scored by modifier)
    fundingRate: 0.00010,
    partialFeed: false,
    ...overrides,
  };
}

function readyBaseline(overrides: Partial<MacroBaseline> = {}): MacroBaseline {
  return {
    btcDominanceSampleCount: 100,
    btcDominanceMean: 53.0,
    btcDominanceStdDev: 1.0,
    fundingSampleCount: 100,
    fundingMean: 0.00005,
    fundingStdDev: 0.00002,
    mcapMomentumSampleCount: 100,
    mcapMomentumMean: 0.0,
    mcapMomentumStdDev: 0.005,
    ...overrides,
  };
}

describe('B67.1 — computeMacroModifier', () => {
  describe('clamp behavior', () => {
    it('clamps to modifierMin under extreme penalizing inputs', () => {
      // BTC dominance 10 stddev above mean + funding 10 stddev above mean
      // → very strong negative push on modifier; should clamp to 0.85
      const snap = freshSnapshot({
        btcDominance: 63.0, // mean=53, sd=1, z=+10
        fundingRate: 0.00025, // mean=0.00005, sd=0.00002, z=+10
        mcapMomentum: 0.0,
      });
      const result = computeMacroModifier(snap, readyBaseline(), DEFAULT_CONFIG);
      expect(result.value).toBe(0.85);
      expect(result.fallbackActive).toBe(false);
      expect(result.staleDataFlag).toBe(false);
    });

    it('clamps to modifierMax under extreme reinforcing inputs', () => {
      // BTC dominance 10 sd below mean + funding 10 sd below mean +
      // mcap momentum 10 sd above mean → strong positive push, clamps to 1.05
      const snap = freshSnapshot({
        btcDominance: 43.0, // z=-10
        fundingRate: -0.00015, // z=-10
        mcapMomentum: 0.05, // z=+10
      });
      const result = computeMacroModifier(snap, readyBaseline(), DEFAULT_CONFIG);
      expect(result.value).toBe(1.05);
    });

    it('returns 1.0 when all z-scores are zero (snapshot equals baseline mean)', () => {
      const snap = freshSnapshot({
        btcDominance: 53.0,
        fundingRate: 0.00005,
        mcapMomentum: 0.0,
      });
      const result = computeMacroModifier(snap, readyBaseline(), DEFAULT_CONFIG);
      expect(result.value).toBeCloseTo(1.0, 6);
      expect(result.btcDomZ).toBeCloseTo(0, 6);
    });
  });

  describe('weight math + sign convention', () => {
    it('rising BTC dominance penalizes (z=+1, value < 1.0)', () => {
      const snap = freshSnapshot({
        btcDominance: 54.0, // z=+1
        fundingRate: 0.00005, // z=0
        mcapMomentum: 0.0, // z=0
      });
      const result = computeMacroModifier(snap, readyBaseline(), DEFAULT_CONFIG);
      // 1.0 + 0.40 × -1 + 0 + 0 = 0.60 → clamps to 0.85
      expect(result.value).toBe(0.85);
    });

    it('crowded funding penalizes (positive funding z, value < 1.0)', () => {
      const snap = freshSnapshot({
        btcDominance: 53.0, // z=0
        fundingRate: 0.00007, // z=+1
        mcapMomentum: 0.0,
      });
      const result = computeMacroModifier(snap, readyBaseline(), DEFAULT_CONFIG);
      // 1.0 + 0 + 0.35 × -1 + 0 = 0.65 → clamps to 0.85
      expect(result.value).toBe(0.85);
    });

    it('rising mcap momentum reinforces (positive mcap z, value > 1.0)', () => {
      const snap = freshSnapshot({
        btcDominance: 53.0, // z=0
        fundingRate: 0.00005, // z=0
        mcapMomentum: 0.005, // z=+1
      });
      const result = computeMacroModifier(snap, readyBaseline(), DEFAULT_CONFIG);
      // 1.0 + 0 + 0 + 0.25 × +1 = 1.25 → clamps to 1.05
      expect(result.value).toBe(1.05);
    });

    it('mid-range z-scores produce mid-range modifier (no clamp)', () => {
      // Smaller deltas so result is between 0.85 and 1.05 without clamping
      const baseline = readyBaseline({
        btcDominanceStdDev: 5.0, // larger sd → smaller z
        fundingStdDev: 0.0005,
        mcapMomentumStdDev: 0.05,
      });
      const snap = freshSnapshot({
        btcDominance: 54.0, // z = (54-53)/5 = 0.2
        fundingRate: 0.00010, // z = (0.0001-0.00005)/0.0005 = 0.1
        mcapMomentum: 0.005, // z = (0.005-0)/0.05 = 0.1
      });
      const result = computeMacroModifier(snap, baseline, DEFAULT_CONFIG);
      // 1.0 + 0.40×-0.2 + 0.35×-0.1 + 0.25×0.1 = 1.0 - 0.08 - 0.035 + 0.025 = 0.91
      expect(result.value).toBeCloseTo(0.91, 4);
      expect(result.fallbackActive).toBe(false);
    });
  });

  describe('cold-start fallback (sample-count floor)', () => {
    it('forces modifier=1.0 + fallbackActive when btc baseline below floor', () => {
      const baseline = readyBaseline({ btcDominanceSampleCount: 47 });
      const result = computeMacroModifier(freshSnapshot(), baseline, DEFAULT_CONFIG);
      expect(result.value).toBe(1.0);
      expect(result.fallbackActive).toBe(true);
      expect(result.staleDataFlag).toBe(false);
    });

    it('forces modifier=1.0 + fallbackActive when funding baseline below floor', () => {
      const baseline = readyBaseline({ fundingSampleCount: 10 });
      const result = computeMacroModifier(freshSnapshot(), baseline, DEFAULT_CONFIG);
      expect(result.value).toBe(1.0);
      expect(result.fallbackActive).toBe(true);
    });

    it('forces modifier=1.0 + fallbackActive when mcap baseline below floor', () => {
      const baseline = readyBaseline({ mcapMomentumSampleCount: 0 });
      const result = computeMacroModifier(freshSnapshot(), baseline, DEFAULT_CONFIG);
      expect(result.value).toBe(1.0);
      expect(result.fallbackActive).toBe(true);
    });

    it('happy path with all baselines exactly at floor admits z-scores', () => {
      const baseline = readyBaseline({
        btcDominanceSampleCount: 48,
        fundingSampleCount: 48,
        mcapMomentumSampleCount: 48,
      });
      const result = computeMacroModifier(freshSnapshot(), baseline, DEFAULT_CONFIG);
      expect(result.fallbackActive).toBe(false);
    });
  });

  describe('stale-data fallback', () => {
    it('forces modifier=1.0 + staleDataFlag when snapshot age > staleSeconds', () => {
      const snap = freshSnapshot({ ageSeconds: 301 });
      const result = computeMacroModifier(snap, readyBaseline(), DEFAULT_CONFIG);
      expect(result.value).toBe(1.0);
      expect(result.staleDataFlag).toBe(true);
      expect(result.fallbackActive).toBe(false);
    });

    it('respects custom staleSeconds threshold', () => {
      const snap = freshSnapshot({ ageSeconds: 60 });
      const cfg = { ...DEFAULT_CONFIG, staleSeconds: 30 };
      const result = computeMacroModifier(snap, readyBaseline(), cfg);
      expect(result.staleDataFlag).toBe(true);
    });
  });

  describe('missing inputs', () => {
    it('triggers fallback when btcDominance is undefined', () => {
      const snap = freshSnapshot({ btcDominance: undefined });
      const result = computeMacroModifier(snap, readyBaseline(), DEFAULT_CONFIG);
      expect(result.value).toBe(1.0);
      expect(result.fallbackActive).toBe(true);
    });

    it('triggers fallback when fundingRate is undefined', () => {
      const snap = freshSnapshot({ fundingRate: undefined });
      const result = computeMacroModifier(snap, readyBaseline(), DEFAULT_CONFIG);
      expect(result.value).toBe(1.0);
      expect(result.fallbackActive).toBe(true);
    });
  });
});

describe('B67.1 — buildB67_1Alternate', () => {
  it('returns correct factorName + factorState', () => {
    const modifier = {
      value: 0.92,
      btcDomZ: 0.5,
      fundingZ: 0.3,
      mcapZ: -0.1,
      fallbackActive: false,
      staleDataFlag: false,
    };
    const alt = buildB67_1Alternate(0.736, modifier, 'TREND_FRIENDLY_STABLE', true);
    expect(alt.factorName).toBe('b67_1_macro_modifier');
    expect(alt.factorState).toBe('alternate_disabled');
  });

  it('reverse-derives confidence_without_modifier correctly', () => {
    // 0.736 / 0.92 = 0.8 → confidence_without_modifier
    const modifier = {
      value: 0.92,
      btcDomZ: 0.5,
      fundingZ: 0.3,
      mcapZ: -0.1,
      fallbackActive: false,
      staleDataFlag: false,
    };
    const alt = buildB67_1Alternate(0.736, modifier, 'TFS', true);
    expect(alt.alternateDecision.metadata.confidence_without_modifier).toBeCloseTo(0.8, 6);
    expect(alt.alternateDecision.metadata.confidence_with_modifier).toBe(0.736);
    expect(alt.alternateDecision.metadata.modifier_value).toBe(0.92);
  });

  it('handles modifier=1.0 (shadow mode) with identity reverse-derivation', () => {
    const modifier = {
      value: 1.0,
      btcDomZ: 0,
      fundingZ: 0,
      mcapZ: 0,
      fallbackActive: false,
      staleDataFlag: false,
    };
    const alt = buildB67_1Alternate(0.7, modifier, 'TFS', true);
    expect(alt.alternateDecision.metadata.confidence_with_modifier).toBe(0.7);
    expect(alt.alternateDecision.metadata.confidence_without_modifier).toBe(0.7);
  });

  it('preserves z-scores + flags in metadata', () => {
    const modifier = {
      value: 0.95,
      btcDomZ: 0.7,
      fundingZ: -0.2,
      mcapZ: 0.1,
      fallbackActive: false,
      staleDataFlag: true,
    };
    const alt = buildB67_1Alternate(0.665, modifier, 'IE', true);
    expect(alt.alternateDecision.metadata.btc_dom_z).toBe(0.7);
    expect(alt.alternateDecision.metadata.funding_z).toBe(-0.2);
    expect(alt.alternateDecision.metadata.mcap_z).toBe(0.1);
    expect(alt.alternateDecision.metadata.stale_data_flag).toBe(true);
    expect(alt.alternateDecision.metadata.fallback_active).toBe(false);
  });

  it('handles modifier.value=0 edge case without division-by-zero', () => {
    // Defensive: modifier should never actually hit 0 due to clamp, but test
    // the guard for safety.
    const modifier = {
      value: 0,
      btcDomZ: 0,
      fundingZ: 0,
      mcapZ: 0,
      fallbackActive: false,
      staleDataFlag: false,
    };
    const alt = buildB67_1Alternate(0.5, modifier, 'TFS', true);
    expect(alt.alternateDecision.metadata.confidence_without_modifier).toBe(0.5);
  });
});

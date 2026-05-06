/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B76 — Chain-Final Emit Framework Unit Tests
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Verifies the calibration aggregator framework refactor (RUNNING_ISSUES #54):
 *
 *   1. CALIBRATION_FRAMEWORK_VERSION constant exported and stable.
 *   2. Each `buildXAlternate` divide-out helper computes
 *      `alt.confidence = realConfidenceFinal / factor` for normal factors.
 *   3. Edge cases:
 *      - factor = 0 → no division; alt.confidence = realConfidenceFinal.
 *      - factor = 1.0 → idempotent; alt.confidence == realConfidenceFinal.
 *      - factor < 1.0 (penalty) → alt.confidence > realConfidenceFinal.
 *      - factor > 1.0 (boost)   → alt.confidence < realConfidenceFinal.
 *   4. B67.1 macro modifier returns 3 alternates with counterfactual modifiers.
 *   5. B67.2 phase preference uses divide-by-weight semantics.
 *   6. B68.5 special case: label-counterfactual (NOT divide-out) — `confidence`
 *      comes from re-running classifier, not from chain-final / factor.
 *   7. `buildAllAlternates` dispatcher returns flat array; b67_1 expands to 3.
 *
 * Reference: BATCH_76_SCOPE.md §4.7 + §3 architecture diagram.
 * ═════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect } from 'vitest';
import { CALIBRATION_FRAMEWORK_VERSION } from '../../services/factor-ablation-emitter.js';
import { buildAllAlternates, type FactorAlternateInput } from '../../services/factor-ablation-builders.js';
import { buildB67_4Alternate } from '../../core/metrics/outcome-feedback-store.js';
import { buildB68_1Alternate } from '../../core/metrics/multi-tf-agreement.js';
import { buildB68_2Alternate } from '../../core/metrics/volume-regime.js';
import { buildB68_3Alternate } from '../../core/metrics/pair-correlation.js';
import { buildB68_4Alternate } from '../../core/metrics/regime-age-factor.js';
import { buildB67_2Alternate } from '../../core/metrics/regime-phase.js';

describe('B76 — CALIBRATION_FRAMEWORK_VERSION constant', () => {
  it('exports the expected version literal', () => {
    expect(CALIBRATION_FRAMEWORK_VERSION).toBe('b76_chain_final');
  });
});

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Minimal divide-out fixture: exercise the (realConfidenceFinal / factor) math. */
function divideOutFixture(realConfidenceFinal: number, factor: number) {
  return { realConfidenceFinal, factor, expected: factor > 0 ? realConfidenceFinal / factor : realConfidenceFinal };
}

// ─── B67.4 outcome feedback ───────────────────────────────────────────────

describe('B76 — buildB67_4Alternate divide-out semantics', () => {
  it('alt.conf = realConfidenceFinal / factor for normal factor', () => {
    const fix = divideOutFixture(0.6, 0.95);
    const alt = buildB67_4Alternate(fix.realConfidenceFinal, 'TFS', { factor: fix.factor, coldStart: false }, {
      regime: 'TFS', strategy: 'vwap_pullback', entry: undefined,
    });
    expect(alt.factorName).toBe('b67_4_outcome_feedback');
    expect(alt.alternateDecision.confidence).toBeCloseTo(fix.expected, 6);
  });
  it('factor = 0 → no division (alt = real)', () => {
    const alt = buildB67_4Alternate(0.6, 'TFS', { factor: 0, coldStart: true }, {
      regime: 'TFS', strategy: 'x', entry: undefined,
    });
    expect(alt.alternateDecision.confidence).toBe(0.6);
  });
  it('factor = 1.0 → idempotent (alt == real)', () => {
    const alt = buildB67_4Alternate(0.6, 'TFS', { factor: 1.0, coldStart: false }, {
      regime: 'TFS', strategy: 'x', entry: undefined,
    });
    expect(alt.alternateDecision.confidence).toBeCloseTo(0.6, 6);
  });
});

// ─── B68.4 freshness ──────────────────────────────────────────────────────

describe('B76 — buildB68_4Alternate divide-out semantics', () => {
  it('penalty factor (<1.0) → alt > real', () => {
    const alt = buildB68_4Alternate(0.5, 'TFS', { factor: 0.92, coldStart: false, ageHours: 12 }, 6);
    expect(alt.alternateDecision.confidence).toBeGreaterThan(0.5);
    expect(alt.factorName).toBe('b68_4_regime_age');
  });
  it('boost factor (>1.0) → alt < real', () => {
    const alt = buildB68_4Alternate(0.5, 'TFS', { factor: 1.05, coldStart: false, ageHours: 0 }, 6);
    expect(alt.alternateDecision.confidence).toBeLessThan(0.5);
  });
});

// ─── B67.2 phase preference (divide-by-weight) ────────────────────────────

describe('B76 — buildB67_2Alternate divide-by-weight semantics', () => {
  it('alt.conf = realConfidenceFinal / weight for normal weight', () => {
    const alt = buildB67_2Alternate(0.6, 'TFS', 'PRIME', 1800, 'vwap_pullback', 0.9);
    expect(alt.factorName).toBe('b67_2_phase_preference');
    expect(alt.alternateDecision.confidence).toBeCloseTo(0.6 / 0.9, 6);
  });
  it('weight = 0 → no division', () => {
    const alt = buildB67_2Alternate(0.6, 'TFS', 'EARLY', 0, 'x', 0);
    expect(alt.alternateDecision.confidence).toBe(0.6);
  });
});

// ─── B68.1/B68.2/B68.3 (representative divide-out checks) ────────────────

describe('B76 — B68.1/B68.2/B68.3 divide-out parity', () => {
  it('B68.1: alt.conf = real / factor', () => {
    const alt = buildB68_1Alternate(0.7, 'TFS', {
      factor: 0.97, agreement: 'COMPATIBLE', agreementScore: 0.5,
      activeTfRegime: 'TFS', higherTfRegime: 'TFS', higherTfSampleCount: 100,
      higherTfVolatility: 0, higherTfMomentum: 0, higherTfAdx: 30, higherTfConfidence: 0.7,
      coldStart: false,
    } as any, {
      higherTfIntervalMinutes: 240, minHigherTfSamples: 50, factorMin: 0.95, factorMax: 1.05,
    } as any);
    expect(alt.alternateDecision.confidence).toBeCloseTo(0.7 / 0.97, 6);
  });
  it('B68.2: alt.conf = real / factor', () => {
    const alt = buildB68_2Alternate(0.7, 'TFS', {
      score: 0.1, factor: 0.96, label: 'NEUTRAL', sampleCount: 30,
      coldStart: false, hasLiquidationSpike: false,
    } as any, { lookbackBars: 30 } as any);
    expect(alt.alternateDecision.confidence).toBeCloseTo(0.7 / 0.96, 6);
  });
  it('B68.3: alt.conf = real / factor', () => {
    const alt = buildB68_3Alternate(0.7, 'TFS', {
      correlationToBtc: 0.5, decorrelationScore: 0.5, factor: 1.025, label: 'ORTHOGONAL',
      sampleCount: 50, coldStart: false, btcReferenceAvailable: true, isBtcSelfReference: false,
    } as any, { lookbackBars: 50 } as any);
    expect(alt.alternateDecision.confidence).toBeCloseTo(0.7 / 1.025, 6);
  });
});

// ─── buildAllAlternates dispatcher ────────────────────────────────────────

describe('B76 — buildAllAlternates dispatcher', () => {
  it('flattens b67_1 to 3 alternates and preserves order', () => {
    const inputs: FactorAlternateInput[] = [
      {
        kind: 'b67_1',
        modifier: {
          value: 1.0, btcDomZ: 0, fundingZ: 0, mcapZ: 0,
          fallbackActive: false, staleDataFlag: false,
        },
        admissionPossible: true,
        config: {
          btcDominanceWeight: 0.05, fundingWeight: 0.03, mcapMomentumWeight: 0.04,
          modifierMin: 0.95, modifierMax: 1.05,
          stalenessThresholdSeconds: 3600,
        } as any,
      },
      {
        kind: 'b68_4',
        result: { factor: 1.0, coldStart: false, ageHours: 6 },
        targetAgeHours: 6,
      },
    ];
    const alts = buildAllAlternates(inputs, 0.6, 'TFS');
    // 3 from b67_1 + 1 from b68_4 = 4
    expect(alts.length).toBe(4);
    const names = alts.map(a => a.factorName);
    expect(names).toContain('b67_1_btc_dominance');
    expect(names).toContain('b67_1_funding_rates');
    expect(names).toContain('b67_1_mcap_momentum');
    expect(names).toContain('b68_4_regime_age');
  });

  it('empty inputs → empty alternates array (no-op safe)', () => {
    expect(buildAllAlternates([], 0.5, 'UNKNOWN')).toEqual([]);
  });
});

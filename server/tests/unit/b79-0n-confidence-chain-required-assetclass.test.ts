/**
 * ══════════════════════════════════════════════════════════════════════════════
 * B79.0n.CONFIDENCE-CHAIN — Type-lock harness for REQUIRED `assetClass` params
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Compile-time enforcement that every modulator-chain surface API REQUIRES the
 * `assetClass: AssetClass` parameter (no default, no optional). Each `@ts-expect-error`
 * directive asserts that calling the function WITHOUT the asset class fails to
 * compile. If a future refactor accidentally makes assetClass optional, these
 * directives invert — the tsc baseline gate catches it as a NEW error.
 *
 * Per CLAUDE.md §5 #15 NO PATCHES + §7 anti-graveyard discipline: the
 * `@ts-expect-error` directives are confined to THIS file (the dedicated
 * type-lock harness) — production code has zero `@ts-expect-error` / `@ts-ignore` /
 * `as any` / `!` introductions.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect } from 'vitest';
import { computeMacroModifier, buildB67_1Alternates } from '../../core/metrics/macro-modifier';
import type { MacroModifierConfig, MacroSnapshot, MacroBaseline, MacroModifierResult } from '../../core/metrics/macro-modifier';
import { applyPhasePreference, buildB67_2Alternate } from '../../core/metrics/regime-phase';
import { computeOutcomeFeedbackFactor, buildB67_4Alternate, outcomeFeedbackStore } from '../../core/metrics/outcome-feedback-store';
import { buildB68_1Alternate, type MultiTfAgreementResult, type MultiTfAgreementConfig } from '../../core/metrics/multi-tf-agreement';
import { computeVolumeRegime, buildB68_2Alternate, type VolumeRegimeConfig } from '../../core/metrics/volume-regime';
import { computePairCorrelation, buildB68_3Alternate, type PairCorrelationConfig } from '../../core/metrics/pair-correlation';
import { computeFreshnessFactor, buildB68_4Alternate } from '../../core/metrics/regime-age-factor';

const macroCfg: MacroModifierConfig = {
  enabled: true,
  btcDominanceWeight: 0.4, fundingWeight: 0.35, mcapMomentumWeight: 0.25,
  modifierMin: 0.85, modifierMax: 1.05, staleSeconds: 300, zScoreMinSampleCount: 48,
  assetClassNoOpActive: false,
};
const macroSnap: MacroSnapshot = { utcIso: 'now', ageSeconds: 5, btcDominance: 53, fundingRate: 0.00005, mcapMomentum: 0, partialFeed: false };
const macroBaseline: MacroBaseline = {
  btcDominanceSampleCount: 100, btcDominanceMean: 53, btcDominanceStdDev: 1,
  fundingSampleCount: 100, fundingMean: 0.00005, fundingStdDev: 0.00002,
  mcapMomentumSampleCount: 100, mcapMomentumMean: 0, mcapMomentumStdDev: 0.005,
};
const macroResult: MacroModifierResult = {
  value: 1.0, btcDomZ: 0, fundingZ: 0, mcapZ: 0,
  fallbackActive: false, staleDataFlag: false, assetClassNoOpActive: false,
};

describe('B79.0n.CONFIDENCE-CHAIN type-lock — REQUIRED-assetClass on modulator surface', () => {
  it('computeMacroModifier rejects call without assetClass', () => {
    // @ts-expect-error — assetClass is REQUIRED (B79.0n.CONFIDENCE-CHAIN)
    const _bad = () => computeMacroModifier(macroSnap, macroBaseline, macroCfg);
    // Happy path with assetClass compiles + runs cleanly.
    const ok = computeMacroModifier(macroSnap, macroBaseline, macroCfg, 'crypto_spot');
    expect(ok).toBeDefined();
  });

  it('buildB67_1Alternates rejects call without assetClass', () => {
    // @ts-expect-error — assetClass is REQUIRED
    const _bad = () => buildB67_1Alternates(0.5, macroResult, 'TFS', true, macroCfg);
    const ok = buildB67_1Alternates(0.5, macroResult, 'TFS', true, macroCfg, 'crypto_spot');
    expect(ok.length).toBe(3);
  });

  it('applyPhasePreference rejects call without assetClass', () => {
    const weights = { 'breakout_PRIME': 1.05 };
    // @ts-expect-error — assetClass is REQUIRED
    const _bad = () => applyPhasePreference('breakout', 'PRIME', weights, 0.5);
    const ok = applyPhasePreference('breakout', 'PRIME', weights, 0.5, 'crypto_spot');
    expect(ok).toBeCloseTo(0.525, 6);
  });

  it('buildB67_2Alternate rejects call without assetClass', () => {
    // @ts-expect-error — assetClass is REQUIRED
    const _bad = () => buildB67_2Alternate(0.5, 'TFS', 'PRIME', 1800, 'breakout', 1.0);
    const ok = buildB67_2Alternate(0.5, 'TFS', 'PRIME', 1800, 'breakout', 1.0, 'crypto_spot');
    expect(ok.factorName).toBe('b67_2_phase_preference');
  });

  it('outcomeFeedbackStore.peek rejects call without assetClass', () => {
    // @ts-expect-error — assetClass is REQUIRED (B79.0n.CONFIDENCE-CHAIN per-class key)
    const _bad = () => outcomeFeedbackStore.peek('TFS', 'breakout');
    const ok = outcomeFeedbackStore.peek('crypto_spot', 'TFS', 'breakout');
    expect(ok === undefined || ok.sample_count >= 0).toBe(true);
  });

  it('outcomeFeedbackStore.updateEma rejects call without assetClass', () => {
    // @ts-expect-error — assetClass is REQUIRED (B79.0n.CONFIDENCE-CHAIN per-class key)
    const _bad = () => outcomeFeedbackStore.updateEma('TFS', 'breakout', 0.5, 0.1, Date.now());
    // Happy path: explicit assetClass.
    outcomeFeedbackStore.updateEma('crypto_spot', 'TFS', 'breakout', 0.5, 0.1, Date.now());
    expect(true).toBe(true);
  });

  it('computeOutcomeFeedbackFactor rejects call without assetClass', () => {
    const cfg = { alpha: 0.1, sensitivity: 4.0, minSamples: 5, factorMin: 0.85, factorMax: 1.05, expiryHours: 168 };
    // @ts-expect-error — assetClass is REQUIRED
    const _bad = () => computeOutcomeFeedbackFactor(undefined, cfg);
    const ok = computeOutcomeFeedbackFactor(undefined, cfg, 'crypto_spot');
    expect(ok.factor).toBe(1.0);
  });

  it('buildB67_4Alternate rejects call without assetClass', () => {
    const r = { factor: 1.0, coldStart: false, assetClass: 'crypto_spot' as const };
    const ctx = { regime: 'TFS', strategy: 'breakout', entry: undefined };
    // @ts-expect-error — assetClass is REQUIRED
    const _bad = () => buildB67_4Alternate(0.5, 'TFS', r, ctx);
    const ok = buildB67_4Alternate(0.5, 'TFS', r, ctx, 'crypto_spot');
    expect(ok.factorName).toBe('b67_4_outcome_feedback');
  });

  it('buildB68_1Alternate rejects call without assetClass', () => {
    const result = { factor: 1.0, agreement: 'COMPATIBLE', agreementScore: 0.5, activeTfRegime: 'TFS', higherTfRegime: 'TFS',
      higherTfSampleCount: 30, higherTfVolatility: 0, higherTfMomentum: 0, higherTfAdx: 25, higherTfConfidence: 0.7, coldStart: false } as MultiTfAgreementResult;
    const cfg = { higherTfIntervalMinutes: 240, minHigherTfSamples: 30, factorMin: 0.95, factorMax: 1.05,
      sensitivity: 0.05, compatibleScore: 0.5, confirmedScore: 1.0, conflictedScore: 0.0 } as MultiTfAgreementConfig;
    // @ts-expect-error — assetClass is REQUIRED
    const _bad = () => buildB68_1Alternate(0.5, 'TFS', result, cfg);
    const ok = buildB68_1Alternate(0.5, 'TFS', result, cfg, 'crypto_spot');
    expect(ok.factorName).toBe('b68_1_multi_tf_agreement');
  });

  it('computeVolumeRegime + buildB68_2Alternate reject calls without assetClass', () => {
    const cfg: VolumeRegimeConfig = { lookbackBars: 30, accumulationThreshold: 0.4, distributionThreshold: -0.4,
      factorMin: 0.92, factorMax: 1.05, sensitivity: 0.05, minSamples: 30, liquidationSpikeMultiplier: 5.0 };
    // @ts-expect-error — assetClass REQUIRED
    const _bad1 = () => computeVolumeRegime([], cfg);
    const r = computeVolumeRegime([], cfg, 'crypto_spot');
    // @ts-expect-error — assetClass REQUIRED
    const _bad2 = () => buildB68_2Alternate(0.5, 'TFS', r, cfg);
    const ok = buildB68_2Alternate(0.5, 'TFS', r, cfg, 'crypto_spot');
    expect(ok.factorName).toBe('b68_2_volume_regime');
  });

  it('computePairCorrelation + buildB68_3Alternate reject calls without assetClass', () => {
    const cfg: PairCorrelationConfig = { lookbackBars: 30, btcReferenceSymbol: 'XBT/USD', factorMin: 0.95, factorMax: 1.05,
      sensitivity: 0.05, minSamples: 30, driftingThreshold: 0.70, idiosyncraticThreshold: 0.30, computeCorrelationEnabled: true };
    // @ts-expect-error — assetClass REQUIRED
    const _bad1 = () => computePairCorrelation('SOL/USD', [], null, cfg);
    const r = computePairCorrelation('SOL/USD', [], null, cfg, 'crypto_spot');
    // @ts-expect-error — assetClass REQUIRED
    const _bad2 = () => buildB68_3Alternate(0.5, 'TFS', r, cfg);
    const ok = buildB68_3Alternate(0.5, 'TFS', r, cfg, 'crypto_spot');
    expect(ok.factorName).toBe('b68_3_pair_correlation');
  });

  it('computeFreshnessFactor + buildB68_4Alternate reject calls without assetClass', () => {
    const cfg = { targetAgeHours: 6, sensitivity: 0.10, factorMin: 0.92, factorMax: 1.05 };
    // @ts-expect-error — assetClass REQUIRED
    const _bad1 = () => computeFreshnessFactor(undefined, cfg);
    const r = computeFreshnessFactor(undefined, cfg, 'crypto_spot');
    // @ts-expect-error — assetClass REQUIRED
    const _bad2 = () => buildB68_4Alternate(0.5, 'TFS', r, cfg.targetAgeHours);
    const ok = buildB68_4Alternate(0.5, 'TFS', r, cfg.targetAgeHours, 'crypto_spot');
    expect(ok.factorName).toBe('b68_4_regime_age');
  });
});

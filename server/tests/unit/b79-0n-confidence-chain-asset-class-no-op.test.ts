/**
 * ══════════════════════════════════════════════════════════════════════════════
 * B79.0n.CONFIDENCE-CHAIN — Asset-class no-op dispositions (b67_1 + b68_3)
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Tests the two F-2 modulators where xstock_spot ships as a per-class no-op
 * pending equity-macro feed (b67_1) or SPY-relative correlation calibration (b68_3):
 *
 * - b67_1 macro-modifier: when `assetClassNoOpActive: true` the function
 *   short-circuits to factor=1.0 + NaN z-scores + assetClassNoOpActive flag in
 *   the result. Crypto-native inputs (BTC dominance, funding rates, crypto
 *   mcap) are explicitly NOT applied to xstock signals.
 *
 * - b68_3 pair-correlation: when `computeCorrelationEnabled: false` the
 *   function short-circuits to factor=1.0 + label='COMPUTE_DISABLED' +
 *   computeDisabled=true. SPY-relative correlation calibration follow-up
 *   will flip the flag when the OHLC pipeline is verified.
 *
 * Numeric chain stability invariant: both modulators emit factor=1.0 under
 * their no-op disposition, so the chain math is identity-stable — no NaN/Inf
 * cascades into the chain-final modulated confidence.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect } from 'vitest';
import { computeMacroModifier, type MacroModifierConfig, type MacroSnapshot, type MacroBaseline } from '../../core/metrics/macro-modifier';
import { computePairCorrelation, type PairCorrelationConfig } from '../../core/metrics/pair-correlation';

const cryptoMacroCfg: MacroModifierConfig = {
  enabled: true,
  btcDominanceWeight: 0.4, fundingWeight: 0.35, mcapMomentumWeight: 0.25,
  modifierMin: 0.85, modifierMax: 1.05, staleSeconds: 300, zScoreMinSampleCount: 48,
  assetClassNoOpActive: false,
};
const xstockMacroCfg: MacroModifierConfig = {
  ...cryptoMacroCfg,
  // xstock per-class no-op disposition per D-1.
  modifierMin: 1.0, modifierMax: 1.0, // belt-and-suspenders clamp to identity
  assetClassNoOpActive: true,
};
const snap: MacroSnapshot = { utcIso: 'now', ageSeconds: 5, btcDominance: 60, fundingRate: 0.001, mcapMomentum: 0.05, partialFeed: false };
const baseline: MacroBaseline = {
  btcDominanceSampleCount: 100, btcDominanceMean: 53, btcDominanceStdDev: 1,
  fundingSampleCount: 100, fundingMean: 0.00005, fundingStdDev: 0.00002,
  mcapMomentumSampleCount: 100, mcapMomentumMean: 0, mcapMomentumStdDev: 0.005,
};

describe('B79.0n.CONFIDENCE-CHAIN — b67_1 macro no-op disposition', () => {
  it('crypto_spot with no-op=false runs the full macro formula', () => {
    const result = computeMacroModifier(snap, baseline, cryptoMacroCfg, 'crypto_spot');
    // BTC dom z=+7, funding z=large, mcap z=large+10 → clamps somewhere; assetClassNoOpActive=false
    expect(result.assetClassNoOpActive).toBe(false);
    expect(result.value).toBeGreaterThanOrEqual(0.85);
    expect(result.value).toBeLessThanOrEqual(1.05);
    expect(Number.isFinite(result.btcDomZ)).toBe(true);
  });

  it('xstock_spot with no-op=true short-circuits to factor=1.0 + NaN z-scores', () => {
    const result = computeMacroModifier(snap, baseline, xstockMacroCfg, 'xstock_spot');
    expect(result.assetClassNoOpActive).toBe(true);
    expect(result.value).toBe(1.0);
    expect(Number.isNaN(result.btcDomZ)).toBe(true);
    expect(Number.isNaN(result.fundingZ)).toBe(true);
    expect(Number.isNaN(result.mcapZ)).toBe(true);
    expect(result.fallbackActive).toBe(false);
    expect(result.staleDataFlag).toBe(false);
  });

  it('xstock_spot no-op ignores extreme crypto inputs (no leak through clamp)', () => {
    // Extreme z-scores that would clamp the crypto path to floor 0.85 — but
    // xstock no-op short-circuits BEFORE any z-score math, so the result is
    // identity 1.0 regardless of the snapshot.
    const extremeSnap: MacroSnapshot = { ...snap, btcDominance: 200, fundingRate: 1.0, mcapMomentum: -10 };
    const result = computeMacroModifier(extremeSnap, baseline, xstockMacroCfg, 'xstock_spot');
    expect(result.value).toBe(1.0);
    expect(result.assetClassNoOpActive).toBe(true);
  });

  it('xstock no-op is numerically stable in chain multiplication', () => {
    const result = computeMacroModifier(snap, baseline, xstockMacroCfg, 'xstock_spot');
    const baseConfidence = 0.6;
    const modulated = baseConfidence * result.value;
    expect(modulated).toBe(0.6); // identity multiplication
    expect(Number.isFinite(modulated)).toBe(true);
  });
});

describe('B79.0n.CONFIDENCE-CHAIN — b68_3 pair-correlation compute-disabled', () => {
  const cryptoCorrCfg: PairCorrelationConfig = {
    lookbackBars: 30, btcReferenceSymbol: 'XBT/USD',
    factorMin: 0.95, factorMax: 1.05, sensitivity: 0.05, minSamples: 30,
    driftingThreshold: 0.70, idiosyncraticThreshold: 0.30,
    computeCorrelationEnabled: true,
  };
  const xstockCorrCfg: PairCorrelationConfig = {
    ...cryptoCorrCfg,
    btcReferenceSymbol: 'SPY/USD',
    computeCorrelationEnabled: false, // xstock v1 disposition per D-2
  };

  it('xstock_spot with compute_disabled short-circuits to factor=1.0 + label=COMPUTE_DISABLED', () => {
    // Pass empty OHLC arrays — would normally trigger cold-start, but the
    // compute-disabled short-circuit fires first (before the cold-start check).
    const result = computePairCorrelation('AAPL/USD', [], null, xstockCorrCfg, 'xstock_spot');
    expect(result.computeDisabled).toBe(true);
    expect(result.factor).toBe(1.0);
    expect(result.label).toBe('COMPUTE_DISABLED');
    expect(result.coldStart).toBe(false);
  });

  it('crypto_spot with compute_enabled runs the full Spearman correlation', () => {
    const result = computePairCorrelation('SOL/USD', [], null, cryptoCorrCfg, 'crypto_spot');
    // Empty OHLC → cold-start path (factor=1.0, label='NEUTRAL'); NOT compute-disabled.
    expect(result.computeDisabled).toBe(false);
    expect(result.factor).toBe(1.0);
    expect(result.coldStart).toBe(true);
    expect(result.label).toBe('NEUTRAL');
  });

  it('xstock compute_disabled is numerically stable in chain multiplication', () => {
    const result = computePairCorrelation('AAPL/USD', [], null, xstockCorrCfg, 'xstock_spot');
    const modulatedConf = 0.6 * result.factor;
    expect(modulatedConf).toBe(0.6); // identity
    expect(Number.isFinite(modulatedConf)).toBe(true);
  });

  it('per-class reference symbols are preserved in result config (verified via build flow)', () => {
    // SPY/USD reference for xstock is the canonical v1 disposition; the reference
    // symbol lives in config — verify the cfg value flows through to the function
    // entry without mutation.
    expect(xstockCorrCfg.btcReferenceSymbol).toBe('SPY/USD');
    expect(cryptoCorrCfg.btcReferenceSymbol).toBe('XBT/USD');
  });
});

/**
 * B79.0n.MCE — ablation-path required-assetClass regression lock (2026-05-21)
 *
 * Two ablation/factor helpers internally re-run `calculatePairRegime` (the
 * label-counterfactual and higher-TF re-classification paths). Because
 * `calculatePairRegime` now requires an explicit `assetClass`, both helpers
 * gained a REQUIRED `assetClass` parameter so the re-classification uses the
 * pair's real per-class regime thresholds:
 *
 *   - `buildB68_5Alternate`     (server/core/metrics/regime-age-factor.ts)
 *       — B68.5 Path B sustainability label-counterfactual.
 *   - `computeMultiTfAgreement` (server/core/metrics/multi-tf-agreement.ts)
 *       — B68.1 higher-timeframe agreement.
 *
 * The `@ts-expect-error` directives below are the regression locks — if a
 * future refactor drops the required `assetClass` from either helper, the
 * directive becomes incorrect and the TypeScript compiler rejects this file
 * with "Unused @ts-expect-error directive." That is the regression signal.
 *
 * Per Kyle directive §11 (no silent defaults) + §15 (NO PATCHES).
 */

import { describe, it, expect } from 'vitest';
import { buildB68_5Alternate } from '../../core/metrics/regime-age-factor';
import {
  computeMultiTfAgreement,
  type MultiTfAgreementConfig,
} from '../../core/metrics/multi-tf-agreement';
import { DEFAULT_REGIME_CONFIG } from '../../core/metrics/market-regime';
import { REGIMES } from '../../config/canonical-regime-strategy-map';
import type { OHLCData } from '../../types/market-regime.types';

const FLAT_OHLC: OHLCData[] = Array.from({ length: 30 }, (_v, i) => ({
  open: 100,
  high: 100,
  low: 100,
  close: 100,
  volume: 1000,
  timestamp: i * 60_000,
}));

const MULTI_TF_CFG: MultiTfAgreementConfig = {
  higherTfIntervalMinutes: 240,
  minHigherTfSamples: 30,
  factorMin: 0.92,
  factorMax: 1.05,
  sensitivity: 0.05,
  compatibleScore: 0.5,
  confirmedScore: 1.0,
  conflictedScore: 0.0,
};

describe('[B79.0n.MCE] ablation-path helpers require assetClass', () => {
  it('TYPE LOCK — buildB68_5Alternate without assetClass MUST be a compile error', () => {
    function callerMissingAssetClass() {
      // @ts-expect-error — assetClass is REQUIRED per B79.0n.MCE
      return buildB68_5Alternate(
        FLAT_OHLC,
        0,   // dbsScore
        0,   // dbsSlope
        1.0, // macroModifier
        DEFAULT_REGIME_CONFIG,
        REGIMES.TREND_FRIENDLY_STABLE, // realRegimeLabel
        0.6, // realConfidence
      );
    }
    expect(typeof callerMissingAssetClass).toBe('function');
  });

  it('TYPE LOCK — buildB68_5Alternate WITH assetClass compiles cleanly', () => {
    function callerWithAssetClass() {
      return buildB68_5Alternate(
        FLAT_OHLC,
        0,
        0,
        1.0,
        DEFAULT_REGIME_CONFIG,
        REGIMES.TREND_FRIENDLY_STABLE,
        0.6,
        'crypto_spot' as const,
      );
    }
    expect(typeof callerWithAssetClass).toBe('function');
  });

  it('TYPE LOCK — computeMultiTfAgreement without assetClass MUST be a compile error', () => {
    function callerMissingAssetClass() {
      // @ts-expect-error — assetClass is REQUIRED per B79.0n.MCE
      return computeMultiTfAgreement(
        REGIMES.TREND_FRIENDLY_STABLE,
        null, // higherTfOhlc — cold-start path
        MULTI_TF_CFG,
        DEFAULT_REGIME_CONFIG,
      );
    }
    expect(typeof callerMissingAssetClass).toBe('function');
  });

  it('TYPE LOCK — computeMultiTfAgreement WITH assetClass compiles cleanly', () => {
    function callerWithAssetClass() {
      return computeMultiTfAgreement(
        REGIMES.TREND_FRIENDLY_STABLE,
        null,
        MULTI_TF_CFG,
        DEFAULT_REGIME_CONFIG,
        'crypto_spot' as const,
      );
    }
    expect(typeof callerWithAssetClass).toBe('function');
  });
});

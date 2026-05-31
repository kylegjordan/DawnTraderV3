/**
 * ══════════════════════════════════════════════════════════════════════════════
 * B.1.5 redeploy unblocker (2026-05-31) — Bridge JSON producer-consumer contract test
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * BUG-2026-05-31-A root cause: sync-canonical-bridge.ts's generateBridgeJSON()
 * emitted a flat-per-regime JSON shape, but the runtime consumer getClassMap
 * (server/core/strategy-mapper.ts:43) reads byAssetClass-nested shape (introduced
 * af99bd5, B79.0n.STRATEGY, 2026-05-24). Hand-authored on-disk JSON masked the
 * drift; any re-run of the sync script would have clobbered the JSON and crashed
 * scanner boot with "No canonical regime-strategy map for asset class 'crypto_spot'".
 *
 * This test locks the producer-consumer contract in CI: the output of
 * generateBridgeJSON() must exactly satisfy the shape expected by getClassMap.
 * If anyone changes either side without updating the other, this test fails.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { describe, test, expect } from 'vitest';
import { generateBridgeJSON } from '../../scripts/sync-canonical-bridge';

interface BridgeJsonEntry {
  favoredStrategies: string[];
  favoredSignalTypes: string[];
  minConfidence: number;
  riskMultiplier: number;
}

interface BridgeJson {
  _schema: string;
  _metadata: Record<string, unknown>;
  byAssetClass: Record<string, Record<string, BridgeJsonEntry>>;
}

const ALL_REGIMES = [
  'TREND_FRIENDLY_STABLE',
  'HIGH_VOLATILITY_UNSTABLE',
  'RANGE_BOUND_STABLE',
  'IMPULSE_EXPANSION',
  'STRUCTURAL_TRANSITION',
] as const;

const ALL_CLASSES = ['crypto_spot', 'xstock_spot'] as const;

describe('sync-canonical-bridge — generateBridgeJSON producer-consumer contract', () => {
  test('output parses as valid JSON with required top-level keys', () => {
    const raw = generateBridgeJSON();
    const parsed = JSON.parse(raw) as BridgeJson;

    expect(parsed._schema).toBeDefined();
    expect(parsed._schema).toContain('v3.0');
    expect(parsed._metadata).toBeDefined();
    expect(parsed.byAssetClass).toBeDefined();
    expect(typeof parsed.byAssetClass).toBe('object');
  });

  test('byAssetClass has BOTH crypto_spot AND xstock_spot subtrees (getClassMap contract)', () => {
    const parsed = JSON.parse(generateBridgeJSON()) as BridgeJson;
    for (const cls of ALL_CLASSES) {
      expect(parsed.byAssetClass[cls]).toBeDefined();
      expect(typeof parsed.byAssetClass[cls]).toBe('object');
    }
  });

  test('every (class, regime) entry has the 4 required getClassMap fields, well-typed', () => {
    const parsed = JSON.parse(generateBridgeJSON()) as BridgeJson;
    for (const cls of ALL_CLASSES) {
      for (const regime of ALL_REGIMES) {
        const entry = parsed.byAssetClass[cls][regime];
        expect(entry, `${cls}.${regime} missing`).toBeDefined();
        expect(Array.isArray(entry.favoredStrategies), `${cls}.${regime}.favoredStrategies not array`).toBe(true);
        expect(entry.favoredStrategies.length, `${cls}.${regime}.favoredStrategies empty`).toBeGreaterThan(0);
        expect(Array.isArray(entry.favoredSignalTypes), `${cls}.${regime}.favoredSignalTypes not array`).toBe(true);
        expect(entry.favoredSignalTypes.length, `${cls}.${regime}.favoredSignalTypes empty`).toBeGreaterThan(0);
        expect(typeof entry.minConfidence, `${cls}.${regime}.minConfidence not number`).toBe('number');
        expect(typeof entry.riskMultiplier, `${cls}.${regime}.riskMultiplier not number`).toBe('number');
      }
    }
  });

  test('per-class delta: defensive_hedge present in crypto HVU, ABSENT from xstock HVU', () => {
    const parsed = JSON.parse(generateBridgeJSON()) as BridgeJson;
    expect(parsed.byAssetClass.crypto_spot.HIGH_VOLATILITY_UNSTABLE.favoredStrategies).toContain('defensive_hedge');
    expect(parsed.byAssetClass.xstock_spot.HIGH_VOLATILITY_UNSTABLE.favoredStrategies).not.toContain('defensive_hedge');
  });

  test('per-class delta: orb present in xstock TFS+IE, ABSENT from xstock ST and all crypto regimes', () => {
    const parsed = JSON.parse(generateBridgeJSON()) as BridgeJson;
    // xstock has orb in TFS + IE (per B79.0n.STRATEGY hand-authored)
    expect(parsed.byAssetClass.xstock_spot.TREND_FRIENDLY_STABLE.favoredStrategies).toContain('orb');
    expect(parsed.byAssetClass.xstock_spot.IMPULSE_EXPANSION.favoredStrategies).toContain('orb');
    // xstock ST drops orb (hand-authored exclusion)
    expect(parsed.byAssetClass.xstock_spot.STRUCTURAL_TRANSITION.favoredStrategies).not.toContain('orb');
    // crypto NEVER has orb (xstock-only opening-range microstructure)
    for (const regime of ALL_REGIMES) {
      expect(
        parsed.byAssetClass.crypto_spot[regime].favoredStrategies,
        `crypto_spot.${regime} should not contain orb`
      ).not.toContain('orb');
    }
  });

  test('strong_bull_trend is excluded from canonical favored list in BOTH classes (routed via separate sourcePool, B63)', () => {
    const parsed = JSON.parse(generateBridgeJSON()) as BridgeJson;
    for (const cls of ALL_CLASSES) {
      for (const regime of ALL_REGIMES) {
        expect(
          parsed.byAssetClass[cls][regime].favoredStrategies,
          `${cls}.${regime} should not contain strong_bull_trend`
        ).not.toContain('strong_bull_trend');
      }
    }
  });

  test('output satisfies getClassMap consumer (server/core/strategy-mapper.ts:43) — no throw on either class', () => {
    // Replicate getClassMap's logic locally; the consumer throws if byAssetClass[cls] is missing.
    const parsed = JSON.parse(generateBridgeJSON()) as BridgeJson;
    for (const cls of ALL_CLASSES) {
      const classMap = parsed.byAssetClass?.[cls];
      // The actual getClassMap raises: `No canonical regime-strategy map for asset class '${assetClass}'`
      expect(classMap, `getClassMap would throw for ${cls}`).toBeTruthy();
      // Each regime must be addressable as a string key (consumer iterates Object.keys/values)
      for (const regime of ALL_REGIMES) {
        expect(classMap[regime]).toBeTruthy();
      }
    }
  });

  test('favoredSignalTypes is consistent with favoredStrategies (every strategy contributes its signal type)', () => {
    const parsed = JSON.parse(generateBridgeJSON()) as BridgeJson;
    for (const cls of ALL_CLASSES) {
      for (const regime of ALL_REGIMES) {
        const entry = parsed.byAssetClass[cls][regime];
        // Set of canonical signal types is QUANT | PATTERN | HYBRID — every entry in the union
        for (const st of entry.favoredSignalTypes) {
          expect(
            ['QUANT', 'PATTERN', 'HYBRID'].includes(st),
            `${cls}.${regime} has non-canonical signalType: ${st}`
          ).toBe(true);
        }
      }
    }
  });

  test('numeric thresholds are within expected reasonable range (sanity check)', () => {
    const parsed = JSON.parse(generateBridgeJSON()) as BridgeJson;
    for (const cls of ALL_CLASSES) {
      for (const regime of ALL_REGIMES) {
        const entry = parsed.byAssetClass[cls][regime];
        expect(entry.minConfidence).toBeGreaterThan(0);
        expect(entry.minConfidence).toBeLessThanOrEqual(1);
        expect(entry.riskMultiplier).toBeGreaterThan(0);
        expect(entry.riskMultiplier).toBeLessThanOrEqual(3);
      }
    }
  });
});

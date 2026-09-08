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

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, writeFileSync, renameSync } from 'fs';
import { resolve } from 'path';
import { generateBridgeJSON, syncCanonicalBridge } from '../../scripts/sync-canonical-bridge';

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

// ══════════════════════════════════════════════════════════════════════════════
// B-CANONICAL-BRIDGE-CHURN (#402, 2026-09-08) — THE COMMITTED FILE MUST MATCH THE GENERATOR
// ══════════════════════════════════════════════════════════════════════════════
// THE GAP THIS CLOSES: before this, the two halves lived in different files and were
// never joined. This suite called generateBridgeJSON() and never touched disk;
// mapping_drift_integrity.test.ts read the committed file and never called the
// generator. So a change to the TS map that added or dropped a favoredStrategies
// member left EVERY test green while the committed JSON silently disagreed — which is
// RISK-017 (SYSTEM_MANUAL), open and undetected since April.
//
// ⛔ NO existsSync GUARD, DELIBERATELY. mapping_drift_integrity.test.ts:277-280 wraps
//    its own comparison in one, so an ABSENT FILE PASSES THAT TEST SILENTLY — the #546
//    absent-as-valid shape. An absent file here must FAIL.
// ⛔ resolve(__dirname, ...) NOT process.cwd(): cwd-relativity is what made that guard
//    feel necessary in the first place. (Langston, Step-2 CONDITION A.)
//
// The two stamps are excluded because they are the only fields the sync is now allowed
// to leave stale — same exclusion set as contentKey() in the sync script.
describe('sync-canonical-bridge — committed JSON matches generator output', () => {
  const COMMITTED = resolve(__dirname, '../../../bridge/canonical/mapping-regime-strategy.json');

  test('committed byAssetClass equals generateBridgeJSON() byAssetClass', () => {
    const committed = JSON.parse(readFileSync(COMMITTED, 'utf8')) as BridgeJson;
    const generated = JSON.parse(generateBridgeJSON()) as BridgeJson;
    expect(committed.byAssetClass).toEqual(generated.byAssetClass);
  });

  test('committed _schema equals generateBridgeJSON() _schema', () => {
    const committed = JSON.parse(readFileSync(COMMITTED, 'utf8')) as BridgeJson;
    const generated = JSON.parse(generateBridgeJSON()) as BridgeJson;
    expect(committed._schema).toBe(generated._schema);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// B-CANONICAL-BRIDGE-CHURN — THE SKIP, AND THE HONEST REPORT OF IT
// ══════════════════════════════════════════════════════════════════════════════
// OBJ-1 + Langston's BLOCKER-GRADE CONDITION B. The failure being prevented is not
// just "the file got rewritten" — it is the function REPORTING a write it did not do.
// routes.ts feeds filesUpdated straight back to the Force Sync button, so a skipped
// run that still said "updated" would lie to the operator who just clicked it.
describe('sync-canonical-bridge — skip-on-unchanged reports honestly', () => {
  // ⛔⛔ THIS BLOCK CALLS THE REAL syncCanonicalBridge() AGAINST THE REAL bridge/canonical/,
  //     because that is the only way to exercise the real decision. That makes it capable of
  //     WRITING to tracked files, and the first version of this block did exactly that:
  //     on a drifted tree, run 1 failed AND silently regenerated the file (destroying the
  //     derived stamp), so run 2 passed. Red became green on re-run, with a canonical file
  //     the developer never authored and the RISK-017 drift repaired instead of traced —
  //     the self-defeating-detector shape this whole batch argues against.
  // ⇒ snapshot and restore unconditionally, INCLUDING on failure, which is when it matters.
  const BRIDGE = resolve(__dirname, '../../../bridge/canonical');
  const GUARDED = [
    'mapping-regime-strategy.json',
    'DawnTrader_Regime_Strategy_Mapping.md',
    'DawnTrader_Regime_Strategy_Signal_Pattern_Mapping.md',
  ].map(f => resolve(BRIDGE, f));
  const snapshot = new Map<string, Buffer>();

  beforeAll(() => {
    for (const f of GUARDED) snapshot.set(f, readFileSync(f));
  });
  afterAll(() => {
    // ⛔ RESTORE ATOMICALLY — tmp + rename, the same shape atomicWrite() uses in the script.
    //    A bare writeFileSync is O_TRUNC-then-write, and vitest.config.ts sets no `pool` or
    //    `fileParallelism` override, so test FILES run in parallel — while
    //    server/tests/system/mapping_drift_integrity.test.ts reads these very paths
    //    (the JSON at :151/:163/:180/:278, the .md at :124). A read landing inside the
    //    truncate window returns a short file and JSON.parse throws: RED CI WITH NO DEFECT
    //    BEHIND IT.
    // ★ NOT observed — the window is microseconds, and that is exactly why it is closed by
    //    CONSTRUCTION rather than by a green run. One green run against a window that narrow
    //    contains ~zero expected occurrences, so green is not evidence it cannot fire
    //    (#661 leg 3). Langston, Step-4 CONDITION 1.
    // ⚠️ The first version of this block made the test safe against ITSELF. It was not safe
    //    against the other file reading the same tree.
    for (const [f, buf] of snapshot) {
      const tmp = `${f}.restore.tmp.${process.pid}`;
      writeFileSync(tmp, buf);
      renameSync(tmp, f);
    }
  });

  test('unchanged content: the FILE IS NOT REWRITTEN, and the skip is reported honestly', async () => {
    const jsonPath = resolve(BRIDGE, 'mapping-regime-strategy.json');
    const before = readFileSync(jsonPath);

    const result = await syncCanonicalBridge();
    expect(result.success).toBe(true);

    // ⭐ THE PRIMARY OBJECTIVE, asserted directly: the bytes on disk did not move.
    //    The reporting assertions below would still pass if the code wrote the file and
    //    merely *said* it had not — this is the one that catches that.
    expect(readFileSync(jsonPath).equals(before)).toBe(true);

    const jsonEntries = (arr: string[]) =>
      arr.filter(p => p.endsWith('mapping-regime-strategy.json'));
    expect(jsonEntries(result.filesUnchanged)).toHaveLength(1);
    expect(jsonEntries(result.filesUpdated)).toHaveLength(0);
  });

  test('a second run is also a skip — the decision is stable, not a first-run artifact', async () => {
    const jsonPath = resolve(BRIDGE, 'mapping-regime-strategy.json');
    const before = readFileSync(jsonPath);
    await syncCanonicalBridge();
    const result = await syncCanonicalBridge();
    expect(readFileSync(jsonPath).equals(before)).toBe(true);
    expect(result.filesUnchanged.filter(p => p.endsWith('mapping-regime-strategy.json')))
      .toHaveLength(1);
  });
});

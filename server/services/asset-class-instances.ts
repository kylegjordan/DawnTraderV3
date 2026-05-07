/**
 * B79 — Per-asset-class telemetry / scanner / ratio-manager bootstrap factory.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * WHY THIS EXISTS (Langston PIA review, 2026-05-07)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * The crypto_spot pipeline uses module-scoped singletons for TelemetryAggregator,
 * AdaptiveRatioManager, AdaptiveScanManager, and PairFailureTracker. Adding a
 * second asset class (xstock_spot) without isolating those singletons would
 * corrupt cross-class telemetry — equity records would inflate crypto's
 * pool-performance comparison and silently shift its idealRatio, violating
 * the no-touch fence on crypto_spot.
 *
 * CC's initial PIA proposal was to add an `assetClass` param at every
 * telemetry boundary (default 'crypto_spot'). Langston pushed back: any
 * future call site that forgets the arg silently corrupts xstock telemetry
 * with crypto data. Bulletproof > elegant. Two separate triads of instances,
 * one per asset class, with a small factory dispatching by class — same
 * shape as the existing AdaptiveScanManager constructor injection pattern.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * STATIC-STATE HAZARD (CC PIA round-2 finding)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * `server/services/telemetry-aggregator.ts` lines 1600-1602 hardcode a
 * disk-persistence path (`logs/telemetry_state/aggregator_state.json`) and
 * a module-scoped persist setInterval. A naive second instance would
 * overwrite the same file on every persist tick.
 *
 * Resolution for B79 Day 1: the xstock_spot triad runs IN-MEMORY ONLY —
 * the second TelemetryAggregator is constructed directly (bypassing the
 * `getTelemetryAggregator()` factory which arms the persist timer +
 * rehydrates from disk). Pool aggregates live on the instance only.
 *
 * If Layer 3 calibration evidence requires xstock_spot persistence later,
 * a B79.x sub-batch parameterizes the disk-path/timer infrastructure by
 * assetClass. For B79 Day 1 this hazard is sidestepped.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * DAY-1 WIRING STATE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * The xstock_spot triad is INSTANTIATED at first call to `getXstockSpotInstances`,
 * but it is NOT WIRED INTO A LIVE SCAN LOOP in B79. A dedicated xstock
 * scanner setInterval is the B79.0a follow-on. Day 1 verification confirms
 * the triad bootstraps cleanly (`[B79][BOOT]` log line) and that the
 * crypto_spot path remains untouched (no-touch fence SQL on
 * regime_factor_alternates cadence).
 *
 * ════════════════════════════════════════════════════════════════════════════
 */

import { TelemetryAggregatorService } from './telemetry-aggregator.js';
import { AdaptiveRatioManager } from './adaptive-ratio-manager.js';
import { AdaptiveScanManager, PairFailureTracker } from './adaptive-scan-manager.js';
import { ASSET_CLASSES, type AssetClass } from '../../shared/asset-classes.js';

export interface AssetClassInstances {
  telemetry: TelemetryAggregatorService;
  ratioManager: AdaptiveRatioManager;
  failureTracker: PairFailureTracker;
  scanManager: AdaptiveScanManager;
  /** Set true for non-crypto_spot triads — persist disabled for B79 (see header). */
  inMemoryOnly: boolean;
}

let _xstockSpotInstances: AssetClassInstances | null = null;

/**
 * B79: bootstrap a fresh in-memory xstock_spot triad. Called lazily on first
 * `getXstockSpotInstances()` invocation. Idempotent — second call returns
 * the cached triad.
 *
 * The triad is created BUT NOT WIRED into a live scanner loop. A subsequent
 * sub-batch (B79.0a) starts the xstock scan setInterval consuming this
 * triad. Until then, the triad sits dormant — verification target is the
 * `[B79][BOOT]` log line confirming the bootstrap path is sound.
 */
function bootstrapXstockSpotInstances(): AssetClassInstances {
  // NEW instance, NOT the singleton getTelemetryAggregator() — that getter
  // arms the disk-persist timer + rehydrates from a hardcoded path. We want
  // an isolated in-memory instance with no disk side-effects for B79 Day 1.
  const telemetry = new TelemetryAggregatorService();

  // PairFailureTracker is per-instance by design (Map<symbol, Entry>) — a
  // separate instance gives us complete isolation from the crypto failure list.
  const failureTracker = new PairFailureTracker();

  // AdaptiveRatioManager — per-asset-class config TBD post-Layer-3; Day 1
  // uses the same defaults as crypto. Each instance holds its own
  // currentRatio + lastComparison state on the instance.
  //
  // NOTE: AdaptiveRatioManager.computeAdaptiveRatio() currently calls
  // getTelemetryAggregator() (the global singleton) internally on line 93
  // of adaptive-ratio-manager.ts. For Day 1 dormant scaffolding this is
  // acceptable because the xstock scan loop is not yet wired — the xstock
  // ratioManager is constructed but never invoked. Once the live xstock
  // loop wires up in B79.0a, ARM constructor injection of telemetry must
  // be added so the xstock ARM consumes its own telemetry instance, not
  // the global singleton. Tracked in MEMORY's Step 3 implementation queue.
  const ratioManager = new AdaptiveRatioManager();

  // AdaptiveScanManager already accepts injected telemetry + failureTracker
  // via its constructor (server/services/adaptive-scan-manager.ts:169).
  const scanManager = new AdaptiveScanManager(telemetry, failureTracker);

  console.log('[B79][BOOT] xstock_spot AssetClassInstances bootstrapped (in-memory only; dormant Day 1; live wire-in is B79.0a)');

  return {
    telemetry,
    ratioManager,
    failureTracker,
    scanManager,
    inMemoryOnly: true,
  };
}

/**
 * B79: get the xstock_spot instances triad. Lazily bootstrapped on first call.
 * Idempotent.
 */
export function getXstockSpotInstances(): AssetClassInstances {
  if (!_xstockSpotInstances) {
    _xstockSpotInstances = bootstrapXstockSpotInstances();
  }
  return _xstockSpotInstances;
}

/**
 * B79: dispatch to the right asset-class triad. Crypto_spot returns null —
 * crypto callers continue to use the existing module-scoped singletons
 * (no-touch fence). Non-crypto callers must use this dispatcher.
 *
 * Throws on unknown asset_class to surface mis-routing immediately rather
 * than silently corrupting telemetry.
 */
export function getAssetClassInstances(assetClass: AssetClass): AssetClassInstances | null {
  switch (assetClass) {
    case ASSET_CLASSES.CRYPTO_SPOT:
      // Crypto path uses existing globals — return null to signal "use the
      // module singletons via getTelemetryAggregator() / adaptiveRatioManager
      // / getAdaptiveScanManager()". This is the no-touch fence path.
      return null;
    case ASSET_CLASSES.XSTOCK_SPOT:
      return getXstockSpotInstances();
    default:
      throw new Error(`[B79][asset-class-instances] unsupported assetClass: ${assetClass}`);
  }
}

/**
 * B79: test-only reset of the xstock instances cache. Used in unit tests
 * that need a clean bootstrap between cases.
 */
export function _testResetXstockSpotInstances(): void {
  _xstockSpotInstances = null;
}

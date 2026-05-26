/**
 * B79 — Per-asset-class telemetry / scanner / ratio-manager bootstrap factory.
 * B79.0n.TELEMETRY (2026-05-26) — extended to 4-of-4 active-class coverage.
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
 * 4-OF-4 ACTIVE CLASS COVERAGE (B79.0n.TELEMETRY, 2026-05-26)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * The factory dispatches across all 4 active asset classes per
 * ASSET_CLASS_REGISTRY. The crypto_spot asymmetry is intentional + load-bearing
 * for live-trading safety (18+ months of disk-persisted state on the global
 * singleton — migrating it into a factory-managed instance is a regression
 * vector with no offsetting benefit).
 *
 *   ┌──────────────┬────────────────────────┬──────────────────────────────┐
 *   │ Asset class  │ Path                   │ State persistence            │
 *   ├──────────────┼────────────────────────┼──────────────────────────────┤
 *   │ crypto_spot  │ Global singleton via   │ Disk-persist @ 60s (Batch 46)│
 *   │              │ getTelemetryAggregator │ logs/telemetry_state/...     │
 *   │              │ (returns null from     │                              │
 *   │              │  this factory — fence) │                              │
 *   ├──────────────┼────────────────────────┼──────────────────────────────┤
 *   │ xstock_spot  │ Factory-managed triad  │ In-memory only (B79.0a)      │
 *   │ xstock_perp  │ via getXstock/Crypto   │ In-memory only (B79.0n.TELE) │
 *   │ crypto_perp  │ PerpInstances()        │ In-memory only (B79.0n.TELE) │
 *   └──────────────┴────────────────────────┴──────────────────────────────┘
 *
 * Reserved-future classes from ASSET_CLASS_REGISTRY (equity_spot,
 * equity_futures, commodity_futures, fx_spot) THROW from
 * getAssetClassInstances() with a [CLASS_NOT_WIRED] error citing the
 * ASSET_CLASS_REGISTRY[X].active flag so call sites can self-correct.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * STATIC-STATE HAZARD (CC PIA round-2 finding; resolved Variant C)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * `server/services/telemetry-aggregator.ts` lines 1600-1602 hardcode a
 * disk-persistence path (`logs/telemetry_state/aggregator_state.json`) and
 * a module-scoped persist setInterval. A naive second instance would
 * overwrite the same file on every persist tick.
 *
 * Structural resolution (B79.0n.TELEMETRY 2026-05-26): the persist-timer
 * arming is gated INSIDE getTelemetryAggregator() at the
 * `if (!telemetryPersistTimer)` block. Direct `new TelemetryAggregatorService()`
 * construction (which is what bootstrapXstock/CryptoPerpInstances does)
 * SKIPS that arming block entirely. New instances are therefore in-memory
 * only by construction — Variant C per scope Q1 ACK (Langston AGREE
 * 2026-05-26). Aggregates rebuild from VTS within 60-120s of restart;
 * acceptable for classes not actively trading.
 *
 * If a perp class flips to active trading in a future sub-batch and
 * persistence becomes empirically required, a follow-up B79.0n.TELEMETRY.b
 * batch parameterizes the disk-path/timer infrastructure by assetClass.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * BOOT PRE-WARM (B79.0n.TELEMETRY, 2026-05-26)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * server/index.ts pre-warms the 3 factory-managed triads at boot (after
 * loadTrailingStates + BEFORE xstockSpotScanner.start) so the
 * [B79.0n.TELEMETRY][BOOT] log lines fire predictably and any construction
 * failure HARD-FAILs at boot (not at lazy first-call hours later).
 *
 * ════════════════════════════════════════════════════════════════════════════
 */

import { TelemetryAggregatorService, peekTelemetryInstance } from './telemetry-aggregator.js';
import { AdaptiveRatioManager } from './adaptive-ratio-manager.js';
import { AdaptiveScanManager, PairFailureTracker } from './adaptive-scan-manager.js';
import { ASSET_CLASSES, ASSET_CLASS_REGISTRY, type AssetClass } from '../../shared/asset-classes.js';

export interface AssetClassInstances {
  telemetry: TelemetryAggregatorService;
  ratioManager: AdaptiveRatioManager;
  failureTracker: PairFailureTracker;
  scanManager: AdaptiveScanManager;
  /** Set true for non-crypto_spot triads — persist disabled (Variant C). */
  inMemoryOnly: boolean;
}

// B79.0n.TELEMETRY (2026-05-26): per-class observability stats shape.
// Returned from getTelemetryInstanceStats() — the per-instance verify-gate
// signal. Read by future /api/diagnostics/telemetry-instance-stats and the
// scheduled 48h verify-gate alert probe.
export interface InstanceStats {
  recordCount: number;
  lastWriteAt: number | null;
  pairCount: number;
  /**
   * - 'global-singleton' — crypto_spot reads from getTelemetryAggregator()
   *   singleton via peekTelemetryInstance() (no-touch fence).
   * - 'factory-instance' — the 3 factory-managed active classes
   *   (xstock_spot, xstock_perp, crypto_perp) read from their per-class
   *   TelemetryAggregatorService instance.
   * - 'inactive' — reserved-future classes from ASSET_CLASS_REGISTRY
   *   (equity_spot, equity_futures, commodity_futures, fx_spot) have no
   *   wired instance. Always zeros.
   *
   *   Langston Step 2 ACK clarification 2: 48h verify-gate alert body must
   *   filter `source !== 'inactive'` when reading recordCount so the
   *   inactive rows do not pollute the signal.
   */
  source: 'global-singleton' | 'factory-instance' | 'inactive';
}

let _xstockSpotInstances: AssetClassInstances | null = null;
let _xstockPerpInstances: AssetClassInstances | null = null;
let _cryptoPerpInstances: AssetClassInstances | null = null;

/**
 * B79: bootstrap a fresh in-memory xstock_spot triad. Called lazily on first
 * `getXstockSpotInstances()` invocation. Idempotent — second call returns
 * the cached triad.
 *
 * B79.0a wired the live xstock scanner consumer; this triad is live.
 */
function bootstrapXstockSpotInstances(): AssetClassInstances {
  // NEW instance, NOT the singleton getTelemetryAggregator() — that getter
  // arms the disk-persist timer + rehydrates from a hardcoded path. We want
  // an isolated in-memory instance with no disk side-effects (Variant C).
  const telemetry = new TelemetryAggregatorService();
  const failureTracker = new PairFailureTracker();
  // B79.0a (2026-05-08): ARM constructor takes injected telemetry — the
  // xstock ARM consumes its own per-class TelemetryAggregator instance so
  // pool-performance reads NEVER bleed into the global crypto telemetry.
  const ratioManager = new AdaptiveRatioManager({}, telemetry);
  // AdaptiveScanManager already accepts injected telemetry + failureTracker.
  const scanManager = new AdaptiveScanManager(telemetry, failureTracker);

  console.log('[B79.0n.TELEMETRY][BOOT] xstock_spot AssetClassInstances bootstrapped (in-memory only; Variant C)');

  return { telemetry, ratioManager, failureTracker, scanManager, inMemoryOnly: true };
}

/**
 * B79.0n.TELEMETRY (2026-05-26): bootstrap a fresh in-memory xstock_perp
 * triad. Mirror of bootstrapXstockSpotInstances. Lazily invoked on first
 * getXstockPerpInstances() call. Idempotent.
 *
 * Day-1 wiring state: triad is INSTANTIATED at first call (or via boot
 * pre-warm in server/index.ts), but NOT yet wired into a live VTS writer.
 * Per scope Q3 ACK, M70 writer (VTS) per-class threading is deferred to
 * WIRE-IN sub-batch #16. Until then, xstock_perp recordCount stays at 0
 * — that zero IS the 48h verify-gate signal.
 */
function bootstrapXstockPerpInstances(): AssetClassInstances {
  const telemetry = new TelemetryAggregatorService();
  const failureTracker = new PairFailureTracker();
  const ratioManager = new AdaptiveRatioManager({}, telemetry);
  const scanManager = new AdaptiveScanManager(telemetry, failureTracker);

  console.log('[B79.0n.TELEMETRY][BOOT] xstock_perp AssetClassInstances bootstrapped (in-memory only; Variant C; M70 writer deferred to WIRE-IN #16)');

  return { telemetry, ratioManager, failureTracker, scanManager, inMemoryOnly: true };
}

/**
 * B79.0n.TELEMETRY (2026-05-26): bootstrap a fresh in-memory crypto_perp
 * triad. Mirror of bootstrapXstockSpotInstances. Same Day-1 dormant state
 * as xstock_perp — recordCount stays at 0 until WIRE-IN #16 threads VTS.
 */
function bootstrapCryptoPerpInstances(): AssetClassInstances {
  const telemetry = new TelemetryAggregatorService();
  const failureTracker = new PairFailureTracker();
  const ratioManager = new AdaptiveRatioManager({}, telemetry);
  const scanManager = new AdaptiveScanManager(telemetry, failureTracker);

  console.log('[B79.0n.TELEMETRY][BOOT] crypto_perp AssetClassInstances bootstrapped (in-memory only; Variant C; M70 writer deferred to WIRE-IN #16)');

  return { telemetry, ratioManager, failureTracker, scanManager, inMemoryOnly: true };
}

/**
 * B79: get the xstock_spot instances triad. Lazily bootstrapped on first
 * call. Idempotent.
 */
export function getXstockSpotInstances(): AssetClassInstances {
  if (!_xstockSpotInstances) {
    _xstockSpotInstances = bootstrapXstockSpotInstances();
  }
  return _xstockSpotInstances;
}

/**
 * B79.0n.TELEMETRY: get the xstock_perp instances triad. Lazily bootstrapped.
 */
export function getXstockPerpInstances(): AssetClassInstances {
  if (!_xstockPerpInstances) {
    _xstockPerpInstances = bootstrapXstockPerpInstances();
  }
  return _xstockPerpInstances;
}

/**
 * B79.0n.TELEMETRY: get the crypto_perp instances triad. Lazily bootstrapped.
 */
export function getCryptoPerpInstances(): AssetClassInstances {
  if (!_cryptoPerpInstances) {
    _cryptoPerpInstances = bootstrapCryptoPerpInstances();
  }
  return _cryptoPerpInstances;
}

/**
 * B79.0n.TELEMETRY: exhaustive-switch helper for the dispatcher's unknown-
 * class fall-through. The `never` parameter type means if any AssetClass
 * case is missing from the switch, this call FAILS COMPILE — the right
 * surface for catching new active classes added to ASSET_CLASS_REGISTRY
 * without factory wiring here.
 */
function assertNever(x: never, assetClass: string): never {
  throw new Error(
    `[B79.0n.TELEMETRY][CLASS_NOT_WIRED] asset class '${assetClass}' has no telemetry instance yet — call sites must check ASSET_CLASS_REGISTRY[${assetClass}].active before invoking the factory. If this class is genuinely active, add a bootstrap function + lazy cache + switch case in server/services/asset-class-instances.ts.`
  );
}

/**
 * B79: dispatch to the right asset-class triad. Crypto_spot returns null —
 * crypto callers continue to use the existing module-scoped singletons
 * via getTelemetryAggregator() / adaptiveRatioManager / getAdaptiveScanManager()
 * (no-touch fence).
 *
 * B79.0n.TELEMETRY (2026-05-26) extension: handles all 4 active classes.
 * Reserved-future classes from ASSET_CLASS_REGISTRY throw with
 * [CLASS_NOT_WIRED] surfacing the registry path callers should check.
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
    case ASSET_CLASSES.XSTOCK_PERP:
      return getXstockPerpInstances();
    case ASSET_CLASSES.CRYPTO_PERP:
      return getCryptoPerpInstances();
    // Reserved-future classes from ASSET_CLASS_REGISTRY — explicitly
    // enumerated so the assertNever exhaustive check is sound.
    case ASSET_CLASSES.EQUITY_SPOT:
    case ASSET_CLASSES.EQUITY_FUTURES:
    case ASSET_CLASSES.COMMODITY_FUTURES:
    case ASSET_CLASSES.FX_SPOT:
      throw new Error(
        `[B79.0n.TELEMETRY][CLASS_NOT_WIRED] asset class '${assetClass}' is reserved-future (ASSET_CLASS_REGISTRY[${assetClass}].active === false) — no telemetry instance. Call sites must check ASSET_CLASS_REGISTRY[${assetClass}].active before invoking the factory.`
      );
    default:
      // Compile-time exhaustiveness check: if a new AssetClass is added to
      // shared/asset-classes.ts without a case here, this fails compile.
      return assertNever(assetClass, String(assetClass));
  }
}

/**
 * B79.0n.TELEMETRY (2026-05-26): per-class observability stats accessor.
 *
 * Returns a Record over ALL 8 entries in ASSET_CLASS_REGISTRY (4 active +
 * 4 reserved-future) so consumers can rely on a complete keyspace. The
 * `source` field discriminates how the row was obtained:
 *   - crypto_spot: source='global-singleton' via peekTelemetryInstance()
 *     non-arming read (avoids triggering rehydrate + persist-timer arm).
 *     Cold-boot semantic (Langston Step 2 ACK clarification 1): if the
 *     singleton hasn't been armed yet, returns zeros with
 *     source='global-singleton' preserved. ZERO ≠ INACTIVE for crypto_spot.
 *   - xstock_spot / xstock_perp / crypto_perp: source='factory-instance'
 *     read from the per-class triad's .telemetry instance (or zeros with
 *     source='factory-instance' if the lazy bootstrap hasn't run yet).
 *   - reserved-future (4 classes): source='inactive' with zeros.
 *
 *   Langston Step 2 ACK clarification 2: the 48h verify-gate alert body
 *   must filter `source !== 'inactive'` when reading recordCount so the
 *   inactive rows don't pollute the signal.
 *
 * Consumed by:
 *   - the +48h verify-gate alert probe (perp recordCount === 0 invariant)
 *   - future /api/diagnostics/telemetry-instance-stats route (B79.0n.TELE-
 *     METRY does NOT add the route per scope Q3 deferral; that lands in
 *     OBSERVABILITY #18)
 *   - Step 7/8 verification snapshots
 */
export function getTelemetryInstanceStats(): Record<AssetClass, InstanceStats> {
  const out = {} as Record<AssetClass, InstanceStats>;

  // crypto_spot: read from global singleton via non-arming peek.
  // Cold-boot: if singleton not yet armed, return zeros with
  // source='global-singleton' — zero ≠ inactive for an active class.
  const cryptoPeek = peekTelemetryInstance();
  out.crypto_spot = cryptoPeek
    ? {
        recordCount: cryptoPeek.getRecordCount(),
        lastWriteAt: cryptoPeek.getLastWriteAt(),
        pairCount: cryptoPeek.getPairCount(),
        source: 'global-singleton',
      }
    : {
        recordCount: 0,
        lastWriteAt: null,
        pairCount: 0,
        source: 'global-singleton',
      };

  // 3 factory-managed active classes: read from per-class triad if cached.
  // Read the cached _<class>Instances variable directly to avoid bootstrap-
  // ping just to read stats (matches the non-arming pattern).
  const peekFactory = (triad: AssetClassInstances | null): InstanceStats =>
    triad
      ? {
          recordCount: triad.telemetry.getRecordCount(),
          lastWriteAt: triad.telemetry.getLastWriteAt(),
          pairCount: triad.telemetry.getPairCount(),
          source: 'factory-instance',
        }
      : {
          recordCount: 0,
          lastWriteAt: null,
          pairCount: 0,
          source: 'factory-instance',
        };

  out.xstock_spot = peekFactory(_xstockSpotInstances);
  out.xstock_perp = peekFactory(_xstockPerpInstances);
  out.crypto_perp = peekFactory(_cryptoPerpInstances);

  // 4 reserved-future classes from ASSET_CLASS_REGISTRY — always inactive,
  // always zeros. The 48h verify-gate alert filters source !== 'inactive'.
  const inactiveRow: InstanceStats = {
    recordCount: 0,
    lastWriteAt: null,
    pairCount: 0,
    source: 'inactive',
  };
  out.equity_spot = inactiveRow;
  out.equity_futures = inactiveRow;
  out.commodity_futures = inactiveRow;
  out.fx_spot = inactiveRow;

  // Sanity: any AssetClass added to shared/asset-classes.ts without a row
  // assignment above will be undefined here. ASSET_CLASS_REGISTRY drives
  // the iteration to ensure completeness.
  for (const ac of Object.keys(ASSET_CLASS_REGISTRY) as AssetClass[]) {
    if (out[ac] === undefined) {
      throw new Error(
        `[B79.0n.TELEMETRY][REGISTRY_DRIFT] ASSET_CLASS_REGISTRY contains '${ac}' but getTelemetryInstanceStats() did not produce a row for it. Add a row in asset-class-instances.ts getTelemetryInstanceStats().`
      );
    }
  }

  return out;
}

/**
 * B79: test-only reset of the xstock instances cache. Used in unit tests
 * that need a clean bootstrap between cases.
 *
 * B79.0n.TELEMETRY: extended to also reset perp caches.
 */
export function _testResetXstockSpotInstances(): void {
  _xstockSpotInstances = null;
}

export function _testResetXstockPerpInstances(): void {
  _xstockPerpInstances = null;
}

export function _testResetCryptoPerpInstances(): void {
  _cryptoPerpInstances = null;
}

/**
 * B79.0n.TELEMETRY: convenience for tests that need to reset all 3
 * factory-managed caches in one call.
 */
export function _testResetAllAssetClassInstances(): void {
  _xstockSpotInstances = null;
  _xstockPerpInstances = null;
  _cryptoPerpInstances = null;
}

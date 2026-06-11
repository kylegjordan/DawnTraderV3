/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.4A — Market Indicators Service
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Provides global market intelligence for the operator dashboard:
 * - Market Regime (global macro climate)
 * - Global Friction Score (execution environment from Top-100 FX5 pool)
 * - Global Directional Bias (Phase 14)
 *
 * Phase 14 (Batch 15): Critical fix — eliminated stale parallel regime data.
 *   - Removed mapToBaseRegime() lossy adapter
 *   - Removed hardcoded regimeNarratives (8-value, non-canonical)
 *   - Now reads regime names, descriptions, and strategies from canonical map SSOT
 *   - MarketRegime type updated to use canonical CanonicalRegimeType
 *
 * Governance Invariants:
 * - M14: Global Friction derived only from Top-100 FX5 pool
 * - M15: Market Regime remains globally calculated
 *
 * ══════════════════════════════════════════════════════════════════════════════
 */

import {
  type CanonicalRegimeType,
  REGIME_NARRATIVES,
  normalizeRegime,
} from '../config/canonical-regime-strategy-map.js';
import { computeMarketFriction, describeFriction, type FrictionStatus } from '../core/metrics/cost-metrics.js';
import { getMarketContextEngine } from './market-context-engine.js';
import type { GlobalDirectionalBias } from '../types/directional-bias.types.js';
// B-4.7 (#162): per-asset-class indicator bundles.
import { resolveAssetClass, safeResolveAssetClass, type AssetClass } from '../../shared/asset-classes.js';
import { xstockDirectionalBiasStore } from '../core/metrics/directional-bias-store.js';
// B63 Item 16: static import of the persistent-store singleton so we can read snapshot
// staleness flags without awaiting a dynamic import inside a sync function.
import { directionalBiasStore } from '../core/metrics/directional-bias-store.js';
import { getCostMetrics as getCacheMetrics, getCacheSize, getAllCachedSymbols } from '../core/cache/cost-cache.js';
// B-5 AMR (Obj-13/F7): xstock friction reads the scanner-fed measured-sample
// store - the cost cache is structurally crypto-lane only (cost-cache.ts:32).
import { getXstockFrictionSample } from '../asset_classes/xstock_spot/friction-sample-store.js';
import { getDefaultCostComponentsForAssetClass } from '../core/math/cost-model.js';
import { activeFilterPool } from './active-filter-pool.js';
import { getTelemetryAggregator } from './telemetry-aggregator.js';
import { checkRegimeTransition, checkFrictionTransition } from '../utils/market-events.js';
import { getFavoredStrategiesForRegime, getFavoredSignalTypesForRegime } from '../core/strategy-mapper.js';

/**
 * Phase 14: MarketRegime is now CanonicalRegimeType directly.
 * No more lossy 6-value type with EXTREME_NOISE as the only non-canonical member.
 * EXTREME_NOISE is handled by normalizeRegime() -> RANGE_BOUND_STABLE.
 */
export type MarketRegime = CanonicalRegimeType;

export interface RegimeInfo {
  name: MarketRegime;
  description: string;
  favoredStrategies: string[];
}

export interface ExpandedRegimeDescription {
  title: string;
  description: string;
  favoredSignalTypes: string[];
  favoredStrategies: string[];
}

export interface MarketIndicators {
  /** B-4.7 (#162): which asset class this bundle describes. */
  assetClass: AssetClass;
  /**
   * B-4.7: LIVE = the per-class dominant-regime vote produced a result;
   * IDLE_OR_WARMING = fewer than the minimum same-class pairs are cached
   * (cold start, or the xStock cohort idle at the weekend boundary / US
   * market holidays — xStocks trade 24/5). When IDLE_OR_WARMING,
   * `marketRegime` is the LAST KNOWN value for the class (explicitly marked
   * by this flag — never a silent stale-hold) and `regimePercentage` is 0.
   */
  voteStatus: 'LIVE' | 'IDLE_OR_WARMING';
  marketRegime: MarketRegime;
  regimeDescription: string;
  regimeTitle: string;
  regimeScore: number;
  regimePercentage: number;
  favoredSignalTypes: string[];
  favoredStrategies: string[];
  /** B-4.7: null when no same-class friction sample exists (no cross-class fallback). */
  globalFrictionScore: number | null;
  /** B-5 (Obj-13): reason code when globalFrictionScore is null (taxonomy in FrictionResult). */
  frictionReason: FrictionResult['reason'] | null;
  frictionSampleSize: number;
  frictionDescription: FrictionStatus;
  frictionNarrative: string;
  // Phase 14: Global Directional Bias
  globalDBS: GlobalDirectionalBias | null;
  // B63 Item 16: staleness flags from the persistent-store snapshot.
  // `globalDBSIsStale` is true when the store is serving a carry-forward snapshot
  // (store dropped below 20-pair floor but a prior good snapshot is being reused
  // with isStale=true per behavior-spec Row 2). `globalDBSSnapshotAgeSeconds` is
  // the age of the currently-served snapshot; useful for "last updated" UI hints.
  globalDBSIsStale: boolean;
  globalDBSSnapshotAgeSeconds: number | null;
  timestamp: Date;
}

/**
 * Phase 14: Get expanded regime description from canonical SSOT.
 * No more hardcoded regimeNarratives — reads from REGIME_NARRATIVES in canonical map.
 */
function getExpandedRegimeDescriptionFromCanonical(regime: string): ExpandedRegimeDescription {
  // Normalize to canonical name (handles old names via GHOST_REGIME_NORMALIZATION)
  const canonicalRegime = normalizeRegime(regime);
  const narrative = REGIME_NARRATIVES[canonicalRegime];

  // B79.0n.STRATEGY (2026-05-24): global regime descriptions are crypto-centric pending
  // Phase 17 UI consolidation (per-asset-class regime tabs). Hardcoded 'crypto_spot' here
  // preserves byte-identical behavior — pre-batch the map was flat (no asset_class scope);
  // post-batch the crypto subtree of v3.0.0 is byte-identical to the flat shape.
  return {
    title: narrative.title,
    description: narrative.description,
    favoredStrategies: getFavoredStrategiesForRegime(canonicalRegime, 'crypto_spot'),
    favoredSignalTypes: getFavoredSignalTypesForRegime(canonicalRegime, 'crypto_spot')
  };
}

/**
 * Phase 14: Build regime descriptions dynamically from canonical map.
 * This replaces the old static regimeDescriptions object that had 8 hardcoded entries.
 */
export function getRegimeDescriptions(): Record<string, ExpandedRegimeDescription> {
  const descriptions: Record<string, ExpandedRegimeDescription> = {};
  for (const regime of Object.keys(REGIME_NARRATIVES)) {
    descriptions[regime] = getExpandedRegimeDescriptionFromCanonical(regime);
  }
  return descriptions;
}

// Lazy-initialized cache
let _regimeDescriptionsCache: Record<string, ExpandedRegimeDescription> | null = null;
function getCachedRegimeDescriptions(): Record<string, ExpandedRegimeDescription> {
  if (!_regimeDescriptionsCache) {
    _regimeDescriptionsCache = getRegimeDescriptions();
  }
  return _regimeDescriptionsCache;
}

// Re-export for backward compatibility (some files import regimeDescriptions)
export const regimeDescriptions = new Proxy({} as Record<string, ExpandedRegimeDescription>, {
  get(_, key: string) {
    return getCachedRegimeDescriptions()[key];
  },
  ownKeys() {
    return Object.keys(getCachedRegimeDescriptions());
  },
  getOwnPropertyDescriptor(_, key: string) {
    const desc = getCachedRegimeDescriptions();
    if (key in desc) {
      return { configurable: true, enumerable: true, value: desc[key] };
    }
    return undefined;
  }
});

const REGIME_DESCRIPTIONS_COMPAT: Record<string, RegimeInfo> = {};
for (const regime of Object.keys(REGIME_NARRATIVES) as CanonicalRegimeType[]) {
  const desc = getExpandedRegimeDescriptionFromCanonical(regime);
  REGIME_DESCRIPTIONS_COMPAT[regime] = {
    name: regime,
    description: desc.description,
    favoredStrategies: desc.favoredStrategies,
  };
}

/**
 * B-4.7 (#162): ALL module state is per-asset-class. The pre-B-4.7 singletons
 * mixed both classes (crypto-dominated ~2:1) — deleted, no silent global remains.
 */
interface ClassIndicatorState {
  cachedGlobalRegime: MarketRegime;
  cachedGlobalFriction: number | null;
  cachedGlobalDBSCategory: string;
  cachedGlobalDBSScore: number | null;
  lastFrictionSampleSize: number;
  lastUpdate: Date;
}
const classState = new Map<AssetClass, ClassIndicatorState>();
function stateFor(assetClass: AssetClass): ClassIndicatorState {
  let s = classState.get(assetClass);
  if (!s) {
    s = {
      cachedGlobalRegime: 'RANGE_BOUND_STABLE',
      cachedGlobalFriction: null,
      cachedGlobalDBSCategory: 'NEUTRAL',
      cachedGlobalDBSScore: null,
      lastFrictionSampleSize: 0,
      lastUpdate: new Date(),
    };
    classState.set(assetClass, s);
  }
  return s;
}

// B-5 AMR (Obj-13): TOP_100_FALLBACK_PAIRS removed - it existed to back-stop a
// THIN POOL, a case that no longer arises now that membership IS the scanned
// universe (when the cost cache is empty, the fallback pairs had no metrics
// either, so it never helped the empty-cache case; null is the honest value).

export function updateGlobalRegime(assetClass: AssetClass, regime: MarketRegime): void {
  const s = stateFor(assetClass);
  s.cachedGlobalRegime = regime;
  s.lastUpdate = new Date();
  console.log(`[11.4A][MarketIndicators] Global regime updated (${assetClass}): ${regime}`);
}

export interface FrictionResult {
  /** B-4.7: null = no same-class sample (class idle/warming — never a cross-class substitute). */
  score: number | null;
  sampleSize: number;
  symbolCount: number;
  /**
   * B-5 AMR (Obj-0a taxonomy): why score is null - NEVER ambiguous (Kyle
   * ruling 2026-06-11: low-volume must read as low-volume, not shutdown).
   * NO_SOURCE = error-grade (source unwired/empty); MARKET_CLOSED = xstock
   * weekend window (the only legitimate off state - xStocks trade 24/5);
   * LOW_VOLUME_THIN = open but too few fresh names; WARMING = post-boot/idle
   * fill (detail carries n=k/N). Crypto uses NO_SOURCE (empty cache at boot).
   */
  reason?: 'NO_SOURCE' | 'MARKET_CLOSED' | 'LOW_VOLUME_THIN' | 'WARMING';
  reasonDetail?: string;
}

export function computeGlobalFriction(assetClass: AssetClass): number | null {
  const result = computeGlobalFrictionWithDetails(assetClass);
  return result.score;
}

/**
 * B-5 Obj-15a: optional per-sample collector threaded through the SAME
 * sampling pass (never a duplicate loop — drift-proof by construction). The
 * audit-dump endpoint passes one; the recompute leg averages these samples
 * independently and compares EXACT against the same-pass score (§7 R4 row 3).
 */
export interface FrictionAuditCollector {
  samples: Array<{ symbol: string; spread: number; slippage: number; fee: number; friction: number }>;
}

export function computeGlobalFrictionWithDetails(assetClass: AssetClass, auditOut?: FrictionAuditCollector): FrictionResult {
  try {
    // B-5 AMR (Obj-13, supersedes the B-4.7 pool-based read): friction samples
    // the SCANNED UNIVERSE, not the activation-dependent filter pool. The pool
    // is selection-biased toward low-friction survivors and shifts composition
    // with activation state; the scanners write spreads continuously in
    // passive AND active states, so the universe read measures the MARKET and
    // is stable across activation (scope Pull-in B; SIM records the
    // supersession). Per class:
    //   crypto_spot - every live cost-cache entry of the class (the scanners'
    //     write surface; 5-min TTL bounds staleness).
    //   xstock_spot - the XstockFrictionSample store (the cost cache is
    //     structurally crypto-only; the store is BOTH membership and metrics,
    //     reason-coded per the Obj-0a taxonomy).
    if (assetClass === 'xstock_spot') {
      return computeXstockFrictionFromStore(auditOut);
    }
    // Step-7 iteration (staging finding): the UNIVERSE contains pairs the
    // B69 resolver has no pattern for (e.g. single-letter wsnames like
    // A/EUR) — the THROWING variant killed the whole read on the first one.
    // safeResolveAssetClass logs-and-nulls per Langston cc-inbox #890 B.2;
    // unresolvable pairs are simply not class members.
    const symbolsToSample = getAllCachedSymbols()
      .filter(symbol => safeResolveAssetClass(symbol, 'kraken') === assetClass)
      .slice(0, 500);

    let totalFriction = 0;
    let count = 0;

    // Directive 11.4H.3 Task 1: Collect raw data for audit logging
    const auditData: { symbol: string; spread: number; mid: number; friction: number }[] = [];

    for (const symbol of symbolsToSample) {
      const metrics = getCacheMetrics(symbol);
      // Step-7 iteration: the cache has no LOWER clamp and some writers store
      // sentinel/negative spreads (observed avgSpread=-0.11% across 673
      // entries) — a negative spread is not a measurement; skip it rather
      // than let it deflate the universe friction average.
      if (metrics && metrics.spread >= 0) {
        const friction = computeMarketFriction(metrics.spread, metrics.slippage, metrics.fee);
        totalFriction += friction;
        count++;

        // Directive 11.4H.3: Collect for audit (spread is in decimal form)
        auditData.push({
          symbol,
          spread: metrics.spread,
          mid: 0, // Mid price not available in cost cache, using spread directly
          friction
        });
        // B-5 Obj-15a: same-pass sample for the audit dump (incl. the fee/
        // slippage components the recompute leg needs).
        auditOut?.samples.push({ symbol, spread: metrics.spread, slippage: metrics.slippage, fee: metrics.fee, friction });
      }
    }

    const s = stateFor(assetClass);
    if (count === 0) {
      console.log(`[GlobalFriction][Audit] (${assetClass}) Sample size: 0 (no same-class metrics) -> score=null`);
      s.lastFrictionSampleSize = 0;
      // B-4.7: NO synthetic 25 default — null is the honest no-sample value.
      // B-5: empty universe = source not flowing yet (boot warmup) - NO_SOURCE.
      return { score: null, sampleSize: 0, symbolCount: symbolsToSample.length, reason: 'NO_SOURCE' };
    }

    const avgFriction = Math.round(totalFriction / count);
    s.cachedGlobalFriction = avgFriction;
    s.lastFrictionSampleSize = count;
    s.lastUpdate = new Date();

    // Directive 11.4H.3 Task 1: Global Friction Audit Logging
    const spreads = auditData.map(d => d.spread);
    const frictionScores = auditData.map(d => d.friction);
    const spreadVariance = spreads.length > 1
      ? spreads.reduce((sum, s) => sum + Math.pow(s - (spreads.reduce((a, b) => a + b, 0) / spreads.length), 2), 0) / spreads.length
      : 0;
    const frictionMin = Math.min(...frictionScores);
    const frictionMax = Math.max(...frictionScores);

    console.log(`[GlobalFriction][Audit] Sample size: ${count}`);
    console.log(`[GlobalFriction][Audit] Spread range: ${(Math.min(...spreads) * 100).toFixed(4)}% - ${(Math.max(...spreads) * 100).toFixed(4)}%`);
    console.log(`[GlobalFriction][Audit] Spread variance: ${(spreadVariance * 10000).toFixed(6)}`);
    console.log(`[GlobalFriction][Audit] Friction range: ${frictionMin} - ${frictionMax}`);
    // Directive 11.4H.6 Task 6: Global Friction Continuous Audit Logging
    console.log(`[11.4H.6][FrictionAudit] Global friction recalculated: ${avgFriction} | Spread range: ${(Math.min(...spreads) * 100).toFixed(4)}%-${(Math.max(...spreads) * 100).toFixed(4)}% | Sample size: ${count}`);
    console.log(`[GlobalFriction][Audit] Global friction result: ${avgFriction}`);

    return { score: avgFriction, sampleSize: count, symbolCount: symbolsToSample.length };
  } catch (err) {
    console.warn('[11.4A][MarketIndicators] Error computing global friction:', err);
    const s = stateFor(assetClass);
    return { score: s.cachedGlobalFriction, sampleSize: s.lastFrictionSampleSize, symbolCount: 0 };
  }
}

/**
 * B-5 AMR (Obj-13/F7): xstock friction from the scanner-fed measured-sample
 * store. Maps the store's reason-coded status onto FrictionResult - score is
 * null with an explicit reason in every non-OK state; LOW_VOLUME_THIN keeps
 * the (sub-floor) sample count visible as a caution-grade input, never an
 * error.
 */
function computeXstockFrictionFromStore(auditOut?: FrictionAuditCollector): FrictionResult {
  const read = getXstockFrictionSample();
  if (read.status.kind !== 'OK') {
    const detail =
      read.status.kind === 'WARMING' ? `n=${read.status.cyclesSeen}/${read.status.cyclesRequired}` :
      read.status.kind === 'LOW_VOLUME_THIN' ? `${read.status.sampleCount}/${read.status.minRequired} fresh names` :
      undefined;
    return {
      score: null,
      sampleSize: read.status.kind === 'LOW_VOLUME_THIN' ? read.status.sampleCount : 0,
      symbolCount: read.samples.size,
      reason: read.status.kind,
      reasonDetail: detail,
    };
  }
  // Same friction formula as crypto: measured spread (store, percent->decimal)
  // + the class's static slippage + DB-governed fee (B-4.5 merge site).
  const defaults = getDefaultCostComponentsForAssetClass('xstock_spot');
  let total = 0;
  let count = 0;
  for (const [sym, s] of read.samples.entries()) {
    const friction = computeMarketFriction(s.bidAskSpreadPct / 100, defaults.slippage, defaults.fee);
    total += friction;
    count++;
    // B-5 Obj-15a: same-pass sample for the audit dump.
    auditOut?.samples.push({ symbol: sym, spread: s.bidAskSpreadPct / 100, slippage: defaults.slippage, fee: defaults.fee, friction });
  }
  const score = Math.round(total / count);
  const st = stateFor('xstock_spot');
  st.cachedGlobalFriction = score;
  st.lastFrictionSampleSize = count;
  st.lastUpdate = new Date();
  console.log(`[GlobalFriction][Audit] (xstock_spot) store-sourced: score=${score} sample=${count} p50Spread=${read.p50SpreadPct?.toFixed(4)}% p95Spread=${read.p95SpreadPct?.toFixed(4)}%`);
  return { score, sampleSize: count, symbolCount: read.samples.size };
}

export function getFrictionSampleSize(assetClass: AssetClass): number {
  return stateFor(assetClass).lastFrictionSampleSize;
}

export function getMarketIndicators(assetClass: AssetClass): MarketIndicators {
  // B-4.7 (#162): per-asset-class — REQUIRED assetClass (supersedes the
  // B79.0n.TELEMETRY "crypto-only reader / OBSERVABILITY #18" deferral; this
  // batch IS that extension for the regime+friction+DBS surface).
  // Directive 11.4H.4A-Fix: Get dominant regime from live telemetry instead of stale cache
  const telemetry = getTelemetryAggregator();
  const s = stateFor(assetClass);
  // Phase 14.5: Mode-aware regime sourcing, now per class —
  // MCE-preferred when it has >=5 SAME-CLASS pairs; else the per-class VTS
  // telemetry vote. Both return null below the same-class minimum (CLASS_IDLE
  // semantics, B_4_7_PRE_AUDIT §5 — weekend boundary / US holidays / cold start).
  let dominantRegime: { regime: any; avgRegimeScore?: number; avgScore?: number; pairCount: number; percentage: number } | null = null;
  try {
    const mce = getMarketContextEngine();
    const mceRegime = mce.getDominantRegimeForClass(assetClass);
    if (mceRegime) {
      dominantRegime = { regime: mceRegime.regime, avgRegimeScore: mceRegime.avgScore, pairCount: mceRegime.pairCount, percentage: mceRegime.percentage };
    } else {
      dominantRegime = telemetry.getDominantRegimeForClass(assetClass);
    }
  } catch {
    dominantRegime = telemetry.getDominantRegimeForClass(assetClass);
  }

  // B-4.7: voteStatus is the EXPLICIT idle/warming marker — when the vote is
  // null, marketRegime carries the last known per-class value but consumers
  // (UI, transitions) see IDLE_OR_WARMING; no silent stale-hold.
  const voteStatus: 'LIVE' | 'IDLE_OR_WARMING' = dominantRegime ? 'LIVE' : 'IDLE_OR_WARMING';
  const effectiveRegime: MarketRegime = dominantRegime
    ? normalizeRegime(dominantRegime.regime)
    : s.cachedGlobalRegime;
  const effectiveRegimeScore = dominantRegime?.avgRegimeScore ?? 50;
  const effectivePercentage = dominantRegime?.percentage ?? 0;

  // Update per-class cache for consistency
  if (dominantRegime) {
    s.cachedGlobalRegime = effectiveRegime;
    s.lastUpdate = new Date();
  }

  const regimeKey = effectiveRegime as string;
  const expandedRegime = getCachedRegimeDescriptions()[regimeKey]
    ?? getCachedRegimeDescriptions()['RANGE_BOUND_STABLE'];
  const frictionResult = computeGlobalFrictionWithDetails(assetClass);
  // B-4.7: null score -> an explicit no-sample status, never a synthetic band.
  // B-5 (Obj-13): reason-specific narrative - LOW_VOLUME_THIN must read as
  // thin liquidity in an OPEN 24/5 market, never as the class being off
  // (Kyle ruling 2026-06-11).
  const frictionStatus: FrictionStatus = frictionResult.score !== null
    ? describeFriction(frictionResult.score)
    : {
        value: -1, status: 'NO_SAMPLE', color: 'yellow', emoji: '\u23f8\ufe0f',
        narrative:
          frictionResult.reason === 'MARKET_CLOSED' ? `Market closed for ${assetClass} (weekend window) - friction sampling resumes at open.` :
          frictionResult.reason === 'LOW_VOLUME_THIN' ? `Thin liquidity for ${assetClass} (${frictionResult.reasonDetail ?? 'below sample floor'}) - market open, sample below decision floor.` :
          frictionResult.reason === 'WARMING' ? `Friction sample warming for ${assetClass} (${frictionResult.reasonDetail ?? ''}).` :
          `No same-class friction sample for ${assetClass} (source not flowing).`,
      };

  // Directive 11.4H.6A Task 1: Use strategy mapper for dynamic regime-based strategies/signals
  // B79.0n.STRATEGY (2026-05-24): global market-indicators view is crypto-centric (single
  // global regime per the system's pre-multi-asset architecture). Per-asset-class regime
  // routing happens at MCE → mceContext.regime.allowedStrategies (orchestrator line 1506);
  // this function provides the global summary for the UI. Threading 'crypto_spot' here
  // preserves byte-identical pre-batch behavior. Phase 17 UI consolidation may add a
  // per-asset-class global regime view.
  const favoredStrategies = getFavoredStrategiesForRegime(regimeKey, assetClass);
  const favoredSignalTypes = getFavoredSignalTypesForRegime(regimeKey, assetClass);

  console.log(`[Phase14][MarketIndicators] class=${assetClass} regime=${effectiveRegime} vote=${voteStatus} score=${effectiveRegimeScore} percentage=${effectivePercentage}%`);
  // Directive 11.4H.6G: Canonical logging for regime-strategy mapping
  console.log(`[11.4H.6G][Canonical] Regime=${effectiveRegime} | Strategies=${favoredStrategies.join(", ")} | Signals=${favoredSignalTypes.join(", ")}`);

  // B62: Compute global directional bias from MCE cache with real volume weights
  let globalDBS: GlobalDirectionalBias | null = null;
  let globalDBSIsStale = false;
  let globalDBSSnapshotAgeSeconds: number | null = null;
  try {
    if (assetClass === 'xstock_spot') {
      // B-4.7: the xStock class reads ITS OWN store (B-PHASE-A2) — never the
      // crypto computeGlobalBias path.
      const snap = xstockDirectionalBiasStore.getLatestSnapshot();
      globalDBS = snap?.value ?? null;
      globalDBSIsStale = snap?.isStale ?? false;
      globalDBSSnapshotAgeSeconds = snap ? Math.max(0, Math.round((Date.now() - snap.snapshotTime) / 1000)) : null;
      if (globalDBS && globalDBS.pairCount > 0) {
        console.log(`[B62][MarketIndicators] Global DBS (xstock_spot): score=${globalDBS.score.toFixed(3)} category=${globalDBS.category} pairs=${globalDBS.pairCount}`);
      }
    } else {
    const mce = getMarketContextEngine();
    // B62 A.3 fix #1: Extract real 24h volumes from MCE cached contexts
    const volumes = mce.getCachedVolumes();
    globalDBS = mce.computeGlobalBias(volumes);
    if (globalDBS.pairCount > 0) {
      console.log(`[B62][MarketIndicators] Global DBS: score=${globalDBS.score.toFixed(3)} category=${globalDBS.category} pairs=${globalDBS.pairCount} (volume-weighted)`);
    }
    // B63 Item 16: read the raw snapshot for staleness + age metadata (value itself
    // is already returned from computeGlobalBias above; we just want the flags).
    // Uses the top-of-file static import of directionalBiasStore to keep this function sync.
    const snapshot = directionalBiasStore.getLatestSnapshot();
    if (snapshot) {
      globalDBSIsStale = snapshot.isStale;
      globalDBSSnapshotAgeSeconds = Math.max(0, Math.round((Date.now() - snapshot.snapshotTime) / 1000));
    }
    }
  } catch (err) {
    console.warn('[B62][MarketIndicators] Global DBS unavailable:', err);
  }

  // HF6: Cache DBS category for VTS trade context getter
  // B61 (2026-04-15): also cache the numeric score
  if (globalDBS) {
    s.cachedGlobalDBSCategory = globalDBS.category;
    s.cachedGlobalDBSScore = globalDBS.score;
  }

  // Directive 11.4H.5 Task 3: Check for market event transitions
  // B-4.7: transitions tracked PER CLASS; IDLE_OR_WARMING suppresses
  // transition events (the first LIVE vote after idle re-seeds silently).
  checkRegimeTransition(assetClass, effectiveRegime, voteStatus);
  checkFrictionTransition(assetClass, frictionStatus.status, voteStatus);

  return {
    assetClass,
    voteStatus,
    marketRegime: effectiveRegime,
    regimeTitle: expandedRegime.title,
    regimeDescription: expandedRegime.description,
    regimeScore: effectiveRegimeScore,
    regimePercentage: effectivePercentage,
    favoredSignalTypes,
    favoredStrategies,
    globalFrictionScore: frictionResult.score,
    frictionReason: frictionResult.reason ?? null,
    frictionSampleSize: frictionResult.sampleSize,
    frictionDescription: frictionStatus,
    frictionNarrative: frictionStatus.narrative,
    globalDBS,
    globalDBSIsStale,
    globalDBSSnapshotAgeSeconds,
    timestamp: s.lastUpdate,
  };
}

export function getExpandedRegimeDescription(regime: string): ExpandedRegimeDescription | undefined {
  // Normalize to canonical name first
  const canonical = normalizeRegime(regime);
  return getCachedRegimeDescriptions()[canonical];
}

export function getRegimeInfo(regime: MarketRegime): RegimeInfo {
  return REGIME_DESCRIPTIONS_COMPAT[regime] || REGIME_DESCRIPTIONS_COMPAT['RANGE_BOUND_STABLE'];
}

export function getCurrentRegime(assetClass: AssetClass): MarketRegime {
  return stateFor(assetClass).cachedGlobalRegime;
}

/** B-4.7: null until a same-class friction sample has been computed. */
export function getGlobalFriction(assetClass: AssetClass): number | null {
  return stateFor(assetClass).cachedGlobalFriction;
}

/**
 * HF6: Get last computed global DBS category for VTS trade context.
 * Updated each cycle by getMarketIndicators().
 */
export function getLastGlobalDBSCategory(assetClass: AssetClass): string {
  return stateFor(assetClass).cachedGlobalDBSCategory;
}

/**
 * B61 (2026-04-15): Get last computed global DBS numeric score for VTS trade context.
 * Paired with getLastGlobalDBSCategory(). Returns null if no global DBS has been
 * computed yet this session (cachedGlobalDBSCategory will still be 'NEUTRAL' in
 * that case, and consumers should treat a null score as "unknown", not "zero").
 */
export function getLastGlobalDBSScore(assetClass: AssetClass): number | null {
  return stateFor(assetClass).cachedGlobalDBSScore;
}

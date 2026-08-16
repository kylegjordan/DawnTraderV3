/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.0E — Ready-to-Buy (RTB) Queue Service
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Manages the unified pool of high-quality, SQE-qualified signals.
 * 
 * DIRECTIVE 11.0E: FinalScore Unification
 * Signals are ranked by FinalScore only.
 * FinalScore = (HybridScore × 0.4) + (Confidence × 0.3) + (RegimeWeight × 0.2) - (DecayPenalty × 0.1)
 *
 * Key Features:
 * 1. Accepts ALL SQE-qualified signals into unified pool
 * 2. Ranks signals by FinalScore (descending)
 * 3. Enforces uniqueness by symbol + strategy pair
 * 4. Removes stale/expired signals (TTL: 30s per-signal rolling)
 * 5. Promotes highest-FinalScore signals when TCL is active and capacity available
 * 6. FinalScore Decay: fresher signals prioritized via decayPenalty
 * 7. Per-signal rolling TTL with staggered refresh
 * 8. Explicit state transitions: active → reconfirmed → promoted → expired
 * 9. TCL synchronization barrier for atomic operations
 * 10. Enhanced deduplication via (symbol, strategy, createdAt)
 * 11. Central Clock synchronized refresh (every 30 ticks)
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { storage } from '../../storage';
// B72 (2026-05-05): MIN_QUEUE_CONFIDENCE migrated to module='queue_admission'.
// Read via cached sync resolver. Module prefetched in b72-warmup.
import { getCachedNumberRequired } from '../../services/module-constants-service.js';
// P19-B7.1 (OBJ-1/2): rank-time R-multiple = reuse the gate's own friction+kernel via the
// wrapper (sample-free; the EV-input sample is a SEPARATE open-path call). Reads .netRewardToRisk.
import { evaluateTradeExpectancy } from '../calculations/expectancy.js';
const _RTB_GK = { exchange: '*', assetClass: '*', strategy: '*', regime: '*' };
import { calculateRegimeWeight } from '../utils/score-calculator';
import { signalQualityEvaluator, type SQEInput } from '../filters/signal_quality_evaluator';
// P19-B8.4b: active-path funnel — per-signal RTB-refresh outcomes (refreshedAttempted / reconfirmed /
// rejectedInRefresh) + the SQE-during-refresh tally (phase='refresh', the honest MUST-4 double-count vs
// SQE-at-generation). cyclesRun is ticked separately in rtb-refresh-service (anchor-a). Dormant until B8.5.
import { recordActiveRtbRefresh, recordActiveSqeEvaluation, type FunnelAssetClass } from '../observability/active-funnel-tracker';
// B79.0n.STORAGE (2026-05-21): AssetClass type for SQEInput population.
// P19-B4a (C4): prefer the row's stamp (asValidAssetClass), safe-resolve+skip as fallback.
import { safeResolveAssetClass, asValidAssetClass, type AssetClass } from '../../../shared/asset-classes';
import { isCapacityBlock, type TradingMode, type CapacityGuardrailCode } from '../../services/guardrail-policy';
// P19-B5a: active-path RTB reject capture (structurally dormant — queue is empty in VTS/passive).
import { tradingModeToRunMode } from '../../services/run-mode-controller.js';

import type { RtbSignal, InsertRtbSignal } from '@shared/schema';
import { tclWatchdog } from './tcl_watchdog';
import { eventBus, type PromotionEvent } from '../../lib/event-bus';
import { contextBridge } from '../../services/context-bridge';
import { centralClock, ClockTick } from '../../services/central-clock';
// P19-B6.5b (F1b/F2/#320/#321): per-asset-class active gate defense-in-depth at the single RTB
// admission chokepoint + the #321 hard-breach witness. trading-state-sync does NOT import RTB → no cycle.
import { tradingStateSync, isAssetClassActiveInContext } from '../../services/trading-state-sync.js';
import { performanceMonitor } from '../diagnostics/performance_monitor';
import { normalizeInternal } from '../../markets/kraken-symbol-resolver';
import { diagnosticTrace } from '../diagnostics/trace_service';
// Directive 11.0E: fetchFreshMetrics/calculateDecayedMetric removed - using FinalScore-native logic
import { getAdaptivePoolSize } from '../../services/adaptive-pool-config';
import { poolBus } from '../../services/pool-broadcast';
// Directive 10.9A: Math Core Harmonization - Version-tracked weights (inlined calculation)
import { SCORE_WEIGHTS, SCORE_WEIGHTS_VERSION } from '../../config/score-weights.config.js';
// Directive 11.3A: Net Expectancy Standardization - Cost Model & Spread
import { getCachedCostMetrics, computeTotalRoundTripCost, computeNetGeometry, getFrictionForAssetClass } from '../math/cost-model.js';
// P19-B7.2b (OBJ-E, Kyle 2026-07-01): the RTB refresh RE-RUNS the shared maker/taker
// best-of-both decision on CURRENT market data so a signal sitting in the RTBQ keeps a
// live entry-mode + chosen netEV (not frozen at gen-time). Same shared function the
// signal orchestrator + VTS call (F6).
import { decideMakerTaker, entryUrgencyClassForFamily } from '../math/maker-taker-decision.js';
import { resolveMakerTakerHaircut } from '../../services/maker-taker-config.js';
import { STRATEGY_FAMILY_MAP, normalizeStrategy } from '../../config/canonical-regime-strategy-map.js';
import { getCachedSpread } from '../metrics/cost-metrics.js';
import { getNormalizedVolatility as getVolatility } from '../metrics/market-metrics.js';
// B-REGIME-INPUTS-LIVE: the live MCE-backed regime inputs for the refresh path.
// getVolatility above is now UNUSED by the gate and is OBJ-4's retirement target.
import { computeRefreshRegimeInputs, recordRegimeInputsMiss } from '../metrics/regime-inputs.js';
// Phase 14.5: Ranking weights for cross-family signal comparison

// T5: Subscribe to pool size updates from RTB Refresh Service
let currentPoolSize = getAdaptivePoolSize();
poolBus.on('POOL_UPDATE', (size: number) => {
  currentPoolSize = size;
  console.log(`[8.8.4-A4.R10R-3.T5][ACT][SYNC] ReadyToBuyService updated pool=${size}`);
});

// P19-B6.5b (rule 18, Langston Q4): `RTBSignalInput` + the `queueSignal` capacity-block
// insertion variant were DELETED here — zero callers (the live path is queueSQESignal →
// upsertRtbSignal). Archived: 1-system-manual/_archive/deleted-code/p19-b6-5b-rtb-deadcode.removed;
// logged: DELETED_COMPONENTS_LOG.md.

/**
 * Phase 8.8.4-C.5: SQE-qualified signal input for unified RTB pool
 * All signals that pass SQE go directly into the pool regardless of capacity
 * 
 * DIRECTIVE 11.0E: Signals ranked by FinalScore
 * Use finalScore, confidence, regimeWeight, decayPenalty instead
 */
/**
 * P19-B8.5f (OBJ-2) — the ENFORCED transit contract for the sized-signal metadata blob.
 *
 * The blob stays OPEN (index signature) because most of what rides it is genuinely optional
 * display/genesis context where absent-is-absent is the correct, documented behaviour. What
 * is NOT optional is the handful of keys a downstream ENGINE depends on to function: those
 * are declared required here so the compiler — not a human maintaining a list — enforces the
 * carry, and the next omission fails at build time instead of surfacing as a zero in
 * production weeks later.
 *
 * Add a key here ONLY if an engine's behaviour silently degrades without it. This is not a
 * schema for "everything useful"; it is the minimum set whose absence is a defect.
 */
export interface SQESignalMetadata extends Record<string, unknown> {
  /**
   * Max holding period in MILLISECONDS. Stamped centrally for every active-path signal by
   * `stampMaxHoldingMs` (`signal-orchestrator.ts:531`) and consumed by the exit engine's
   * `max_holding_period` branch (`active-execution-engine.ts:1482-1494`), which is skipped
   * entirely when the key is absent — the #550 defect. REQUIRED so the curated rebuild can
   * never drop it again without failing the build.
   */
  maxHoldingMs: number;
}

export interface SQESignalInput {
  signalId: string;
  mode: TradingMode;
  symbol: string;
  strategy: string;
  entryPrice: number;
  stopPrice: number;
  targetPrice?: number;
  quantity?: number;
  notional?: number;
  confidence: number;
  // P19-B3b (2026-06-13, landmine #2): riskScore + profitRate are REQUIRED RTB
  // inputs — queueSQESignal writes them to the risk_score + expected_return
  // columns. They were read off this input (`input.riskScore`/`input.profitRate`)
  // but never declared, and the sole caller (signal-orchestrator) never set them,
  // so `.toString()` threw at runtime and the orchestrator's fire-and-forget
  // `.catch` swallowed it → EVERY SQE-qualified signal silently dropped once
  // active-paper turns on. Declared here + populated at the orchestrator build
  // site from extendedMetrics (which already computes both). NGC retired: the DB
  // `ngc` column is now written from `confidence` (Directive 12.3.3 — deterministic
  // confidence replaced NGC), so there is no `ngc` field on this input (rule 16).
  riskScore: number;
  profitRate: number;
  finalScore: number; // Directive 11.0E: PRIMARY ranking metric
  regimeWeight?: number; // Directive 11.0E: Market regime alignment
  decayPenalty?: number; // Freshness penalty
  hybridScore?: number; // Directive 11.0E: Combined quant+pattern score
  trendStrength?: number; // Directive 11.0E: For regime calculation
  volatility?: number; // Directive 11.0E: For regime calculation
  atr?: number;
  currentPrice?: number; // Directive 8.8.4-C.14.B: Market price at queue time
  volume24h?: number | null; // Directive 8.8.4-C.14.B: 24h USD volume (NULL if not in FX5 pool)
  // reorg-B3 (#233): Net-Expectancy kernel EV inputs captured AT QUEUE from the routing-time FX5
  // survivor snapshot (active-filter-pool entry). Persisted to the typed rtb_signals.di_at_queue /
  // dbs_score_at_queue columns (NOT metadata) so the open-gate reads the same snapshot that drove
  // routing. NULL if the symbol is absent from the FX5 pool or hydrated via the no-DBS cold-cache
  // path → kernel documented defaults (Kyle #10, no silent coerce).
  diAtQueue?: number | null;       // Directional Integrity [0-100] at queue
  dbsScoreAtQueue?: number | null; // Directional Bias Score [-1,1] at queue
  // P19-B7.2: the best-of-both maker/taker entry-decision snapshot (OBJ-1/OBJ-3),
  // captured at the shared signal-build convergence and persisted to the typed
  // rtb_signals columns so the [11.8B] open-gate + the B7.1 ranker read one
  // consistent value. chosenNetEv is the SINGLE-CONSISTENT-NUMBER (the
  // haircut-adjusted best netEV, NEVER the raw maker EV).
  chosenEntryMode?: 'taker' | 'maker';  // the planned entry mode
  chosenNetEv?: number | null;          // the best (chosen-mode) net-EV — what gates + ranks
  takerNetEv?: number | null;           // the taker-leg net-EV (diagnostic + the B7.2c marketable-at-placement stored-taker check)
  makerNetEvAdjusted?: number | null;   // the haircut-adjusted maker net-EV (diagnostic)
  // P19-B8.5f (OBJ-2): was `Record<string, unknown>`, and THAT WAS THE HOLE. `Record<string,
  // unknown>` accepts ANY object, so omitting a key the downstream engine depends on is
  // perfectly legal and perfectly silent — which is how `maxHoldingMs` (#550) and `atr` were
  // dropped by the curated rebuild at `signal-orchestrator.ts:1059-1077` and nobody found out
  // until 0/15 live positions carried a time limit.
  //
  // ★ WHY A TYPE AND NOT A RUNTIME ASSERTION LIST (CC-A's correction, and it is the point):
  // an assertion list is ITSELF a hand-maintained allow-list — the same kind of object that
  // failed here — so it just moves the problem up a level and the next omission still ships.
  // A REQUIRED FIELD makes the omission a COMPILE error. This is the B4a pattern already in
  // the orchestrator at `:496-509`: the typed field is the primary gate, the runtime throw is
  // only the `as any` / JSON-boundary backstop.
  //
  // ★ DELIBERATELY NARROW (Langston's Step-1 carry): ONLY enforcement-required keys go here.
  // `atr` is NOT required — B6.5b's hard-stop/target FLOOR governs its absence and forcing it
  // would silently re-activate ATR trailing that has never run on the active path (OBJ-3, a
  // Kyle scope call). The `_displayContext` genesis fields are NOT required either —
  // absent-is-absent, no fabrication. The index signature keeps the blob open for both.
  metadata?: SQESignalMetadata;
  skipSelfCheck?: boolean; // Directive 8.8.4-A3.R2: Skip self-dedupe during refreshAndRank
  sourcePool?: string;    // Batch 37: Family-qualified source pool
  signalType?: 'QUANT' | 'PATTERN' | 'HYBRID';  // Phase 14.5: signal family
  assetClass?: string;                  // P19-B4a stamp-at-source: pipe-stamped class; queueSQESignal THROWS if absent (no default)
  rankingScore?: number;                // Phase 14.5: cross-family desirability score
}

export interface RTBQueueStats {
  mode: TradingMode;
  totalQueued: number;
  avgFinalScore: number;
  oldestSignalAge: number; // seconds
  byStrategy: Record<string, number>;
  byBlockReason: Record<string, number>;
}

export interface RTBPromotionResult {
  success: boolean;
  signal?: RtbSignal;
  tradeId?: string;
  reason?: string;
}

// Directive 8.8.4-A3.R8: Immediate expiry on SQE failure (no missed refresh counter)
const RTB_REFRESH_INTERVAL_MS = 30 * 1000; // 30 seconds

// Directive 8.8.4-A3.R9.3: TTL removed - lifecycle governed by SQE results only
// const SIGNAL_TTL_MS removed per R9.3-C

// B72 (2026-05-05): TCL_WARMUP_THRESHOLD and FINALSCORE_DECAY_LAMBDA migrated
// to module_constants. Precedence preserved (Langston cc-inbox #906):
//   process.env override (operator)  →  module_constants (DB authority)
// No hardcoded fallback — module is prefetched at boot in b72-warmup; if the
// row is missing the resolver throws, matching Kyle's no-silent-fallback rule.
function getTclWarmupThreshold(): number {
  const envVal = process.env.TCL_SIGNAL_THRESHOLD;
  if (envVal !== undefined && envVal !== '') {
    const parsed = parseInt(envVal, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return getCachedNumberRequired('rtb_config', 'tcl_warmup_threshold_signals', _RTB_GK);
}

// Directive 8.8.4-A3.R2: TCL failsafe (reduced to 2 minutes)
const TCL_FAILSAFE_MS = 2 * 60 * 1000; // 2 minutes

// FinalScore decay configuration
// Decay rate λ = 0.03/min means a signal loses ~3% of its freshness bonus per minute
function getFinalscoreDecayLambda(): number {
  const envVal = process.env.FINALSCORE_DECAY_RATE;
  if (envVal !== undefined && envVal !== '') {
    const parsed = parseFloat(envVal);
    if (Number.isFinite(parsed)) return parsed;
  }
  return getCachedNumberRequired('rtb_ranking', 'finalscore_decay_lambda', _RTB_GK);
}

// ─────────────────────────────────────────────────────────────────────────────
// P19-B7.1 — RANK-TIME R-multiple (OBJ-2) + degenerate-geometry reject/floor (OBJ-3).
// The live picker (getRankedSignals) ranks the ready-to-buy pool by the expected
// R-multiple (`R = netEV ÷ risk_price`) — risk-normalized, net-of-cost, CROSS-ASSET
// comparable (Van Tharp R-multiples / Kelly growth-optimal for sequential single-bets).
// ★ B-RETIRED-SCORE-REMOVAL (#558, A1): the two CONTROL arms are GONE. The
// friction-blind `finalScore` ("rank-by-confidence") arm and the inert `rankingScore`
// arm — both shadow-A/B controls that measured anti-predictive — are removed, along with
// the `active_ranker` selector row (retired in this batch's migration). `r_multiple` is
// now the SOLE ranker; there is no longer anything to configure.
// ─────────────────────────────────────────────────────────────────────────────
export const RANKER_STRATEGIES = ['r_multiple'] as const;
export type RankerStrategy = (typeof RANKER_STRATEGIES)[number];

/**
 * OBJ-3 microstructure floor (CAPITAL-INDEPENDENT — distinct from OBJ-5's capital/heat
 * clamp-bind). risk_price = |entry − stop|; a sub-floor stop is UN-EXECUTABLE (the sizer
 * would size nonsense) and is REJECTED from ranking — primary — so the kernel's own
 * `distStop>0 ? … : 0` R-fallback can never become a sort key. Floor basis:
 * max(min_ATR_fraction × ATR, min_abs_risk_fraction × entry) — min-ATR-fraction PRIMARY
 * (regime/price-scaling, cross-asset-clean), the entry-fraction underneath as the absolute-
 * executability floor only (the cross-asset-clean fractional stand-in for a min-tick, used
 * when ATR is unavailable). Both DB-governed, fail-hard.
 */
function rankRiskFloorPrice(entryPrice: number, atr: number | null): number {
  const minAtrFrac = getCachedNumberRequired('rtb_ranking', 'min_atr_fraction_floor', _RTB_GK);
  const minAbsFrac = getCachedNumberRequired('rtb_ranking', 'min_abs_risk_fraction', _RTB_GK);
  return computeRankRiskFloor(entryPrice, atr, minAtrFrac, minAbsFrac);
}

/**
 * P19-B7.1 (OBJ-3): the PURE floor math (params injected, no DB) — testable in isolation,
 * mirroring the kernel's pure-with-injected-constants design. floor = max(min_ATR_fraction × ATR,
 * min_abs_risk_fraction × entry); ATR term drops out (→ 0) when ATR is unavailable, leaving the
 * absolute entry-fraction floor. Cross-asset-clean (ATR scales with each asset's own volatility).
 */
export function computeRankRiskFloor(
  entryPrice: number, atr: number | null, minAtrFrac: number, minAbsFrac: number,
): number {
  const atrFloor = (atr !== null && Number.isFinite(atr) && atr > 0) ? minAtrFrac * atr : 0;
  const absFloor = minAbsFrac * entryPrice;
  return Math.max(atrFloor, absFloor);
}

/**
 * Directive 11.0E: Calculate decay penalty for FinalScore
 * 
 * Decay is applied as a penalty subtracted from FinalScore (not multiplicative)
 * This creates a gentle aging effect that prioritizes fresher signals
 * 
 * Formula: decayPenalty = λ × ageMinutes (linear, simple)
 * Capped at 0.10 to prevent excessive freshness bias
 * 
 * @param queuedAt - Timestamp when signal was queued
 * @param symbol - Optional symbol for diagnostic logging
 * @returns Decay penalty value [0, 0.10]
 */
export function calculateDecayPenalty(queuedAt: Date | string, symbol?: string): number {
  const ageMs = Date.now() - new Date(queuedAt).getTime();
  const ageMinutes = ageMs / (60 * 1000);
  
  // Linear decay penalty: λ * ageMinutes, capped at 0.10
  // This creates a gentle freshness preference without over-penalizing older signals
  const lambda = getFinalscoreDecayLambda();
  const cap = getCachedNumberRequired('rtb_ranking', 'decay_penalty_cap', _RTB_GK);
  const rawPenalty = lambda * ageMinutes;
  const cappedPenalty = Math.min(rawPenalty, cap);
  
  if (symbol && rawPenalty > 0.01) {
    console.log(
      `[11.0E][DECAY_PENALTY] symbol=${symbol} ageMin=${ageMinutes.toFixed(1)} rawPenalty=${rawPenalty.toFixed(4)} cappedPenalty=${cappedPenalty.toFixed(4)}`
    );
  }
  
  return Math.round(cappedPenalty * 10000) / 10000;
}

/**
 * Directive 11.0E: Get FinalScore decay factor (for compatibility)
 * Returns 1 - decayPenalty for cases where multiplicative decay is needed
 */
export function getFinalScoreDecayFactor(ageMinutes: number): number {
  const lambda = getFinalscoreDecayLambda();
  const cap = getCachedNumberRequired('rtb_ranking', 'decay_penalty_cap', _RTB_GK);
  const penalty = Math.min(lambda * ageMinutes, cap);
  return 1 - penalty;
}

// Directive 11.3A: Geometry refresh thresholds (B72: cost_geometry module)
function getGeometryVolatilityShiftThreshold(): number {
  return getCachedNumberRequired('cost_geometry', 'volatility_shift_threshold', _RTB_GK);
}
function getGeometrySpreadShiftThreshold(): number {
  return getCachedNumberRequired('cost_geometry', 'spread_shift_threshold', _RTB_GK);
}
function getGeometryMaxAgeMs(): number {
  return getCachedNumberRequired('cost_geometry', 'geometry_max_age_ms', _RTB_GK);
}

/**
 * Directive 11.3A: Determine if geometry should be recalculated
 * Recalculate when:
 * - Volatility shift > 5%, OR
 * - Spread shift > 5%, OR
 * - Time since last refresh > 180 seconds
 */
export function shouldRecalculateGeometry(
  signal: RtbSignal,
  currentVol: number,
  currentSpread: number
): boolean {
  const metadata = signal.metadata as Record<string, any> || {};
  const lastCostRefresh = metadata.lastCostRefresh ?? 0;
  const lastVol = metadata.volatility ?? 0.3;
  const lastSpread = metadata.spread ?? 0.001;
  
  const timeSinceRefresh = Date.now() - lastCostRefresh;
  if (timeSinceRefresh > getGeometryMaxAgeMs()) {
    return true;
  }

  const volShift = lastVol > 0 ? Math.abs(currentVol - lastVol) / lastVol : 0;
  if (volShift > getGeometryVolatilityShiftThreshold()) {
    return true;
  }

  const spreadShift = lastSpread > 0 ? Math.abs(currentSpread - lastSpread) / lastSpread : 0;
  if (spreadShift > getGeometrySpreadShiftThreshold()) {
    return true;
  }
  
  return false;
}

/**
 * Directive 8.8.4-A3.R9.0.C (R9C-3): Normalize pair key via Kraken Symbol Resolver
 * Ensures consistent comparison and storage of trading pairs using canonical format
 * 
 * @param symbol - The trading pair (e.g., 'btc/usd', 'BTC/USD', 'XBTUSD')
 * @returns Normalized BASE/QUOTE format (e.g., 'BTC/USD')
 */
export function normalizePairKey(symbol: string): string {
  // R9C-3: Use Kraken Symbol Resolver for canonical normalization
  const startMs = Date.now();
  const canonical = normalizeInternal(symbol);
  const elapsedMs = Date.now() - startMs;
  
  // R9C-5: Track symbol resolution latency if > 1ms
  if (elapsedMs > 1) {
    performanceMonitor.recordSymbolResolutionLatency(elapsedMs);
  }
  
  return canonical;
}

/**
 * Directive 8.8.4-A3.R9.0.A (R9-D2): Simple hash function for uniform refresh stagger
 * Uses djb2 algorithm for fast, well-distributed hashing
 * @param str - String to hash (signal id + symbol)
 * @returns Positive integer hash value
 */
function simpleHash(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash >>> 0; // Convert to unsigned 32-bit integer
  }
  return hash;
}

/**
 * Directive 8.8.4-A3.R9.0.A (R9-D2): Calculate stagger offset for uniform distribution
 * Distributes signal refreshes evenly across the 30-second window
 * @param signalId - Signal ID
 * @param symbol - Signal symbol
 * @returns Offset in milliseconds (0-30000)
 */
function calculateRefreshStaggerMs(signalId: string, symbol: string): number {
  const hashKey = `${signalId}${symbol}`;
  const offsetMs = Math.abs(simpleHash(hashKey)) % 30000; // 0-30s distribution
  return offsetMs;
}

/**
 * Directive 8.8.4-A4.R10R-3.T3: Chunk array into groups for concurrent processing
 * @param array - Array to chunk
 * @param size - Chunk size
 * @returns Array of chunks
 */
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Directive 8.8.4-A4.R10R-3.T3: Signal processing result for batch operations
 */
interface SignalProcessingResult {
  type: 'update' | 'delete';
  signalId: string;
  symbol: string;
  updates?: Partial<RtbSignal>;
  reason?: string;
}

/**
 * Directive 8.8.4-A3.R9.3: Per-signal refresh state tracking
 * Replaces global batch refresh with individual signal timers
 */
interface SignalRefreshState {
  nextRefreshAt: number;  // Unix timestamp (ms) when signal should next refresh
  isRefreshing: boolean;  // Flag to prevent TCL promoting during refresh
}

class ReadyToBuyService {
  private initialized = false;
  // Directive R9.3-A: Per-signal refresh tracking (replaces global isRefreshing)
  private signalRefreshStates: Map<string, SignalRefreshState> = new Map(); // P19-B4b D5: key = `${mode}:${signalId}`
  private engineStartTimes: Map<TradingMode, number> = new Map(); // Phase 8.8.4-C.6: Track engine start for TCL failsafe
  private tclFailsafeTriggered: Map<TradingMode, boolean> = new Map(); // Phase 8.8.4-C.6: Track if failsafe was triggered
  private promotionHandlerRegistered = false; // Directive 8.8.4-A1: Track handler registration

  // P19-B3b (2026-06-13, landmine #2): observable counter for SQE-signal queue
  // DROPS. queueSQESignal is called fire-and-forget from the orchestrator; a throw
  // there (e.g. a malformed SQESignalInput) is caught and the signal is lost. A
  // non-zero count here means qualified signals are being dropped BEFORE the queue —
  // surfaced as a metric (read via getQueueFailureStats(), exposed on health/
  // diagnostics) so the next regression of this silent-drop shape is caught by a
  // number, not by reading orchestrator logs after the fact (Langston Q3 + rules 10/11).
  private queueFailureCount = 0;
  private lastQueueFailure: { at: number; symbol: string; strategy: string; error: string } | null = null;

  /** Record a dropped SQE-qualified signal (called from the orchestrator's queue catch). */
  recordQueueFailure(symbol: string, strategy: string, error: unknown): void {
    this.queueFailureCount++;
    this.lastQueueFailure = {
      at: Date.now(),
      symbol,
      strategy,
      error: error instanceof Error ? error.message : String(error),
    };
    console.error(
      `[RTB_QUEUE_DROP][CRITICAL] count=${this.queueFailureCount} ${symbol}/${strategy} — SQE-qualified signal DROPPED before queue insert:`,
      error,
    );
  }

  /** Observable surface for health/diagnostics: dropped-signal count + last failure. */
  getQueueFailureStats(): { count: number; last: { at: number; symbol: string; strategy: string; error: string } | null } {
    return { count: this.queueFailureCount, last: this.lastQueueFailure };
  }

  constructor() {
    console.log('[RTB] Ready-to-Buy Queue Service initialized');
    this.registerPromotionHandler();
    // A3.R9.0: Start performance monitor for metrics collection
    performanceMonitor.start();
  }

  /**
   * Directive 8.8.4-A1: Register PROMOTION event handler for cleanup
   * When a signal is promoted to active trade, immediately remove it from RTB queue
   * and broadcast rtb:cleared to all clients
   */
  private registerPromotionHandler(): void {
    if (this.promotionHandlerRegistered) {
      return;
    }

    eventBus.onPromotion(async (event: PromotionEvent) => {
      try {
        console.log(`[8.8.4-A1][RTB_CLEANUP] Processing promotion event: ${event.symbol}/${event.strategy} (mode=${event.mode})`);
        
        // Remove the promoted signal from the queue by symbol/mode
        const removed = await this.removeSignalBySymbol(event.symbol, event.mode);
        
        if (removed) {
          // Broadcast rtb:cleared for the promoted symbol
          await contextBridge.broadcast({
            type: 'rtb:cleared',
            payload: {
              mode: event.mode,
              symbol: event.symbol,
              reason: 'promoted',
              timestamp: new Date().toISOString()
            },
            mode: event.mode
          });
          console.log(`[8.8.4-A1][RTB_CLEANUP] ✅ Signal ${event.symbol} removed and rtb:cleared broadcasted`);
        }
      } catch (err: any) {
        console.error(`[8.8.4-A1][RTB_CLEANUP][ERROR] Failed to cleanup promoted signal:`, err);
      }
    });

    this.promotionHandlerRegistered = true;
    console.log('[8.8.4-A1][RTB_CLEANUP] PROMOTION event handler registered');
  }

  /**
   * Directive 8.8.4-A3: Check if a pair exists in the RTB queue
   * Used for pair-level duplicate validation
   * 
   * @param symbol - The trading pair in BASE/QUOTE format (e.g., 'BTC/USD')
   * @param mode - Trading mode ('paper' or 'live')
   * @returns true if the pair exists in the RTB queue
   */
  async hasPair(symbol: string, mode: TradingMode): Promise<boolean> {
    // Directive 8.8.4-A3.R1: Normalize pair key for consistent comparison
    const normalizedSymbol = normalizePairKey(symbol);
    const signals = await storage.getRtbSignals({ mode, status: 'queued', symbol: normalizedSymbol });
    return signals.length > 0;
  }

  /**
   * Directive 8.8.4-A1: Remove a signal by symbol and mode
   * Used when a signal is promoted to an active trade
   * 
   * @param symbol - The symbol to remove (e.g., 'BTC/USD')
   * @param mode - Trading mode ('paper' or 'live')
   * @returns true if a signal was removed
   */
  async removeSignalBySymbol(symbol: string, mode: TradingMode): Promise<boolean> {
    const signals = await storage.getRtbSignals({ mode, status: 'queued' });
    const matchingSignal = signals.find(s => s.symbol === symbol);
    
    if (matchingSignal) {
      // Mark as promoted (removes from queued pool)
      await storage.updateRtbSignal(matchingSignal.id, {
        status: 'promoted',
        promotedAt: new Date()
      });
      performanceMonitor.recordQueueRemove(1);
      console.log(`[A3.R9.2][RTB] Removed signal ${symbol} (id=${matchingSignal.id}) from ${mode} queue`);
      return true;
    }
    
    return false;
  }

  /**
   * Phase 8.8.4-C.6: Set engine start time for TCL failsafe tracking
   * Called when trading engine starts
   */
  setEngineStartTime(mode: TradingMode): void {
    this.engineStartTimes.set(mode, Date.now());
    this.tclFailsafeTriggered.set(mode, false);
    console.log(`[8.8.4-C.6][TCL_FAILSAFE] Engine start time set for ${mode} mode`);
  }

  /**
   * Phase 8.8.4-C.6: Clear engine start time
   * Called when trading engine stops
   */
  clearEngineStartTime(mode: TradingMode): void {
    this.engineStartTimes.delete(mode);
    this.tclFailsafeTriggered.delete(mode);
  }

  /**
   * Directive 8.8.4-A3.R9.3-A: Per-signal refresh helpers
   */
  // P19-B4b D5 (S6): mode-prefix the key so paper + live can never collide on a shared
  // signalId (which is only statistically unique — `${symbol}-${strategy}-${Date.now()}-${rand6}`,
  // no mode namespace). Makes the per-signal refresh latch structurally per-mode.
  private _refreshKey(mode: TradingMode, signalId: string): string {
    return `${mode}:${signalId}`;
  }

  private getSignalRefreshState(mode: TradingMode, signalId: string): SignalRefreshState {
    const key = this._refreshKey(mode, signalId);
    if (!this.signalRefreshStates.has(key)) {
      this.signalRefreshStates.set(key, {
        nextRefreshAt: Date.now() + RTB_REFRESH_INTERVAL_MS,
        isRefreshing: false
      });
    }
    return this.signalRefreshStates.get(key)!;
  }

  isSignalRefreshing(mode: TradingMode, signalId: string): boolean {
    return this.signalRefreshStates.get(this._refreshKey(mode, signalId))?.isRefreshing ?? false;
  }

  /**
   * P19-B6.5b (F1b / RUNNING_ISSUES #320 — defense-in-depth re-eval purge): drop any QUEUED signal
   * whose per-asset-class active gate is OFF for this mode. The admission chokepoint (queueSQESignal)
   * blocks NEW entries; this clears STALE ones (e.g. a class deactivated while it held live queued
   * signals) so a gated-OFF class can never be re-ranked or promoted out of the queue. Runs once per
   * refresh cycle on the SystemContext the caller already fetched (no extra round-trip per signal).
   * Reads the SAME isAssetClassActiveInContext the entry gate uses; witnesses each breach via the
   * #321 hard-breach hook (LIVENESS_SPLIT) so an isolation failure is observable, never silent.
   */
  private async purgeInactiveClassSignals(
    mode: TradingMode,
    systemContext: Parameters<typeof isAssetClassActiveInContext>[0],
  ): Promise<number> {
    const queued = await this.getQueuedSignals(mode);
    let purged = 0;
    for (const sig of queued) {
      const cls = asValidAssetClass(sig.assetClass);
      if (cls && !isAssetClassActiveInContext(systemContext, cls)) {
        tradingStateSync.witnessAssetClassEmissionWhileInactive(mode, cls);
        await storage.deleteRtbSignals({ mode, id: sig.id });
        performanceMonitor.recordQueueRemove(1);
        this.signalRefreshStates.delete(this._refreshKey(mode, sig.signalId));
        purged++;
        console.warn(`[P19-B6.5b][#320][RTB_GATE_PURGE] queued ${cls} signal ${sig.symbol} purged — per-class gate OFF in ${mode} (defense-in-depth re-eval).`);
      }
    }
    if (purged > 0) console.log(`[P19-B6.5b][#320] purged ${purged} inactive-class signal(s) from ${mode} queue.`);
    return purged;
  }

  /**
   * B-RTB-REFRESH-CONSOLIDATE (OBJ-1/OBJ-2, 2026-07-19) — THE SHARED REFRESH ACQUISITION.
   *
   * Extracted VERBATIM from the retired per-signal mechanism's inline block so BOTH refresh
   * mechanisms ran IDENTICAL logic during the transition. Mechanism A is now RETIRED
   * (OBJ-1, 2026-07-22), so this has a SINGLE caller: the bucketed refreshAndRank. Until this batch, only the Central-Clock per-signal mechanism
   * re-read market state; the bucketed service replayed the frozen queue-time snapshot AND
   * never wrote the freshness fields back (self-perpetuating — pre-audit §2). Behaviour for
   * the per-signal caller is unchanged by construction (same code, same order); the bucketed
   * caller becomes honest.
   *
   * Kyle's ratified refresh contract (2026-07-19): "represent the signal AS IT CURRENTLY IS,
   * as accurately as possible, so the SQE can make the best possible accept/reject decision."
   *
   * Score-timing invariant PRESERVED (Langston P19-B7.2b Step-4 gate): geometry inputs are
   * captured first, `refreshedFinalScore` is computed next, and ONLY THEN is decideMakerTaker
   * run. The ORDERING still holds and is still the gate.
   * ⚠️ CORRECTED (#555 follow-up, 2026-07-22): the old trailing clause here read "so
   * `signalStrength` consumes the DECAYED score, never the stale stored one." That is NO
   * LONGER TRUE and was misrouting the dependency graph — `decideMakerTaker` below takes
   * `signalStrength: scoring_base.flat_pwin_base` (a CONFIG base rate, ~:956), not the
   * decayed score. It was true pre-B8.5a, which de-tinted the ranker onto measured per-class
   * flat pWin base rates. Ordering text kept because it is still correct; the false
   * consumption claim removed. Verified at origin before editing, not assumed.
   */
  private async acquireRefreshedInputs(
    signal: RtbSignal,
    normalizedSymbol: string,
    metadata: Record<string, any>,
    confidence: number,
    hybridScore: number,
    regimeWeight: number,
  ): Promise<{
    currentVol: number;
    currentSpread: number;
    netExpectedEdge: any;
    geometryRefreshed: boolean;
    decayPenalty: number;
    refreshedFinalScore: number;
    refreshedMT: { chosenMode: 'taker' | 'maker'; chosenNetEV: number; takerNetEV: number; makerNetEVAdjusted: number; entryFeeRate: number } | null;
    /**
     * `null` = NOT COMPUTED (a gate input was unavailable) — #546. Callers MUST reject the
     * signal rather than score it; never coerce this to a number. Distinct from every
     * computed value, because the formula clamps at 0.1 and cannot otherwise yield 0.
     */
    refreshedRegimeWeight: number | null;
  }> {
    // Directive 11.3A: conditional geometry refresh (throttled on max-age / vol-shift /
    // spread-shift — an efficiency guard, not a staleness defect).
    const currentSpread = getCachedSpread(normalizedSymbol);

    // ══ B-REGIME-INPUTS-LIVE (2026-07-20) — THE REFRESH PATH READS THE MCE, NOT THE ORPHAN ══
    // ★ WHAT THIS FIXES, and the arithmetic that identified it: post-deploy 9ee4f1271 the live
    // logs showed regimeWeight 31× 0.6455 against only 6× varied. 0.6455 is EXACTLY
    // 0.5×0.70 + (1−0.015)×0.30 — i.e. trendStrength pinned at 0.5 AND volatility pinned at
    // 0.015. The 0.015 is `market-metrics.ts:33 return 0.015`, an orphaned cache whose only
    // writer has zero production callers. So the pinned rows were never the genesis path (it
    // was wired at signal-orchestrator.ts:628); they were THIS refresh path, on both inputs.
    //
    // ★ HOIST ORDERING (Langston ruling + NEW Claude's correction): read the MCE ONCE, HERE,
    // above the geometry throttle. A miss then propagates to refreshedRegimeWeight = null and
    // the callers reject BEFORE the throttle's degrade path can matter — so the fail-safe
    // below is only ever exercised for a single cold symbol while the pool is healthy, never
    // during an MCE outage.
    //
    // ★ PER-USE DISPOSITION (the fork Langston ruled): fail-loud is a property of GATE INPUTS,
    // not of every consumer. The GATE (regimeWeight) gets the live value or REJECTS. The
    // THROTTLE (shouldRecalculateGeometry, an efficiency guard) degrades FAIL-SAFE: with no
    // live volatility it uses the queued value so the shift-ratio stays finite and geometry
    // simply recomputes. Rejecting a signal because a performance heuristic lacked an input
    // would be the wrong disposition for that use.
    const _refreshClass = asValidAssetClass(signal.assetClass) ?? safeResolveAssetClass(normalizedSymbol, 'kraken');
    // ══ B-REGIME-REFRESH-PIPE (2026-07-21) — COMPUTE fresh, don't read a cold cache ══
    // `readRegimeInputs` (the cache-router) misses 54/55 here: queued pairs are excluded from
    // the FX5 survivor set (market-scanner.ts:773), so the MCE's survivor-populated cache is
    // cold for them. `computeRefreshRegimeInputs` fetches fresh 60m bars + carries the queue-time
    // DBS + computes vol/adx via the MCE's PURE `computeRegimeInputsOnly` (zero side-effects).
    // Async — hence this method is now async. Fail-loud preserved: a miss → inputs:null → reject.
    const _dbsAtQueue = signal.dbsScoreAtQueue != null ? Number(signal.dbsScoreAtQueue) : undefined;
    const _regime = _refreshClass !== null
      ? await computeRefreshRegimeInputs(normalizedSymbol, _refreshClass, _dbsAtQueue)
      : { inputs: null, miss: 'mce_context_absent' as const };
    if (!_regime.inputs && _refreshClass !== null) {
      recordRegimeInputsMiss(normalizedSymbol, _refreshClass, _regime.miss!);
    }
    // Throttle-only volatility — NEVER fed to the gate. See the per-use note above.
    // ★ FAIL-SAFE MEANS "RECOMPUTE ANYWAY", NOT "DECIDE ON A GUESS" (NEW Claude's catch,
    // 2026-07-20). The first cut of this line fell back to a queued value and, failing that,
    // a literal 0.3 — and that number was REACHABLE AND DECIDING: it flowed straight into
    // `shouldRecalculateGeometry`'s shift ratio, so a fabricated volatility silently decided
    // whether geometry refreshed. That is not what Langston ruled. His ruling was that the
    // throttle DEGRADES SAFE — i.e. does the expensive, correct thing — while only the GATE
    // refuses. Deciding a throttle on an invented number is a third disposition neither of us
    // sanctioned, and it re-imports the substitute-a-plausible-value habit into a second place.
    // ⇒ No live volatility → FORCE the recompute. The stand-in below is retained only so the
    //   shift arithmetic stays finite; it can no longer decide the branch.
    const _liveVol = _regime.inputs?.volatility ?? null;
    const _forceGeometry = _liveVol === null;
    const currentVol = _liveVol ?? (typeof metadata.volatility === 'number' ? metadata.volatility : 0.3);
    let netExpectedEdge = metadata.netExpectedEdge;
    let geometryRefreshed = false;
    let refreshedMT: { chosenMode: 'taker' | 'maker'; chosenNetEV: number; takerNetEV: number; makerNetEVAdjusted: number; entryFeeRate: number } | null = null;
    let _mtInputs:
      | { geomClass: AssetClass; costMetrics: ReturnType<typeof getCachedCostMetrics>; entryPrice: number; stopPrice: number; targetPrice: number }
      | null = null;

    // `_forceGeometry ||` FIRST and deliberately: with no live volatility the throttle has no
    // honest basis to say "skip", so it does the expensive-but-correct thing instead of
    // deciding on a stand-in. Short-circuit order matters — it makes the stand-in incapable
    // of influencing the branch even though it is still passed for the shift arithmetic.
    if (_forceGeometry || shouldRecalculateGeometry(signal, currentVol, currentSpread)) {
      const geomClass = asValidAssetClass(signal.assetClass) ?? safeResolveAssetClass(normalizedSymbol, 'kraken');
      const entryPrice = parseFloat(signal.entryPrice?.toString() || '0');
      const stopPrice = parseFloat(signal.stopPrice?.toString() || '0');
      const targetPrice = parseFloat(signal.targetPrice?.toString() || '0');

      if (geomClass !== null && entryPrice > 0 && stopPrice > 0 && targetPrice > 0) {
        const costMetrics = getCachedCostMetrics(normalizedSymbol, geomClass);
        const geometry = computeNetGeometry(entryPrice, stopPrice, targetPrice, costMetrics);
        netExpectedEdge = geometry.netExpectedEdge;
        geometryRefreshed = true;
        console.log(`[11.3A][GEOMETRY_REFRESH] ${normalizedSymbol}: netEdge=${(netExpectedEdge * 100).toFixed(3)}%`);
        _mtInputs = { geomClass, costMetrics, entryPrice, stopPrice, targetPrice };
      } else if (geomClass === null) {
        console.warn(`[11.3A][GEOMETRY_SKIP] unclassifiable ${normalizedSymbol} — skipping geometry refresh (no valid stamp, unresolvable)`);
      }
    }

    // Directive 11.0E: decay + FinalScore recompute (the gate is retired — #525 — but the
    // decayed score is still recorded/telemetry-relevant).
    // ⚠️ CORRECTED (#555 follow-up, 2026-07-22): this previously read "…is still the ranker's
    // basis and decideMakerTaker's signalStrength vintage." BOTH halves are now false and
    // together they described a dependency graph that no longer exists: the live default
    // ranker is `r_multiple` (computeRankKey → signalRMultiple), which does not read
    // finalScore; and decideMakerTaker's `signalStrength` takes the `flat_pwin_base` CONFIG
    // value (~:956). This matters because it is exactly why the #555 hybridScore removal is
    // safe — nothing behavioural consumes this score anymore.
    const decayPenalty = calculateDecayPenalty(signal.queuedAt, normalizedSymbol);
    const W = SCORE_WEIGHTS.FINAL_SCORE;
    const refreshedFinalScore = Math.max(0, Math.min(1,
      (hybridScore ?? 0) * W.HYBRID +
      (confidence ?? 0) * W.CONFIDENCE +
      (regimeWeight ?? 0) * W.REGIME -
      (decayPenalty ?? 0) * W.DECAY
    ));

    // P19-B7.2b (OBJ-E): re-run the maker/taker best-of-both decision on CURRENT market data.
    // chosen_net_ev drives BOTH the B7.1 ranker (queue order) AND the [11.8B] open-gate.
    if (_mtInputs) {
      try {
        const { geomClass, costMetrics, entryPrice, stopPrice, targetPrice } = _mtInputs;
        const _mtFr = getFrictionForAssetClass(geomClass);
        const _mtGK = { exchange: '*', assetClass: '*', strategy: '*', regime: '*' };
        const _mt = decideMakerTaker({
          entryPrice, stopPrice, targetPrice,
          costs: costMetrics,
          feeRateMaker: _mtFr.feeRateMaker,
          feeRateTaker: _mtFr.feeRateTaker,
          DI: signal.diAtQueue != null ? Number(signal.diAtQueue) : undefined,
          sourcePool: (signal as any).sourcePool ?? (signal.metadata as any)?.sourcePool,
          dbsScore: signal.dbsScoreAtQueue != null ? Number(signal.dbsScoreAtQueue) : undefined,
          minPWin:      getCachedNumberRequired('expectancy_kernel',     'pwin_floor',     _mtGK),
          maxPWin:      getCachedNumberRequired('expectancy_kernel',     'pwin_ceiling',   _mtGK),
          diPWinFactor: getCachedNumberRequired('directional_integrity', 'di_pwin_factor', _mtGK),
          signalStrength: getCachedNumberRequired('scoring_base', 'flat_pwin_base',
            { exchange: '*', assetClass: geomClass, strategy: '*', regime: '*' }),
          urgencyClass: entryUrgencyClassForFamily(STRATEGY_FAMILY_MAP[normalizeStrategy(signal.strategy)]),
          haircut: resolveMakerTakerHaircut(geomClass),
        });
        refreshedMT = {
          chosenMode: _mt.chosenMode,
          chosenNetEV: _mt.chosenNetEV,
          takerNetEV: _mt.takerNetEV,
          makerNetEVAdjusted: _mt.makerNetEVAdjusted,
          entryFeeRate: _mt.chosenMode === 'maker' ? _mtFr.feeRateMaker : _mtFr.feeRateTaker,
        };
        console.log(`[P19-B7.2b][RTB_REFRESH][MAKER_TAKER] ${normalizedSymbol}: re-decided ${_mt.chosenMode} (chosen netEV=${_mt.chosenNetEV.toFixed(6)}, taker=${_mt.takerNetEV.toFixed(6)}) on current data + decayed score`);
      } catch (mtErr) {
        console.warn(`[P19-B7.2b][RTB_REFRESH][MAKER_TAKER] ${normalizedSymbol}: decision re-run failed (keeping gen-time snapshot):`, mtErr instanceof Error ? mtErr.message : mtErr);
      }
    }

    // ── B-RTB-REFRESH-CONSOLIDATE OBJ-2 (2026-07-19): recompute regimeWeight on the LIVE
    // volatility this pass just read, instead of replaying the queue-time value.
    //
    // ⚠️ THIS IS NOT A REPAIR OF regimeWeight, and must never be billed as one.
    // calculateRegimeWeight = (trendScore × 0.70) + ((1 − normalizedVolatility) × 0.30), and
    // `trendStrength` is HARDCODED 0.5 at generation with no honest source anywhere in the repo
    // (own named item). So ~70% of this number remains fabricated; only the 0.30 volatility
    // term becomes honest here. What it genuinely fixes: the RegimeWeight gate BLOCKS, and it
    // was evaluating a queue-time volatility — so a signal whose market turned volatile after
    // queueing kept its calm-market weight. Now the volatility third tracks reality.
    // ADMISSION-AFFECTING: a volatility spike now lowers regimeWeight and can evict, which is
    // the correct direction and the reason this belongs in the refresh at all.
    // ★ BOTH INPUTS NOW LIVE FROM THE MCE (B-REGIME-INPUTS-LIVE). Previously this read
    // `trendStrength: metadata.trendStrength ?? 0.5` (fabricated — the comment admitted it)
    // and a `currentVol` that resolved to the hardcoded 0.015 orphan, which is precisely the
    // pair that produced the pinned 0.6455 on every refreshed signal.
    // ⚠️ Deliberately NOT `currentVol` — that variable is the THROTTLE's fail-safe value and
    // may be a queued fallback. The gate must never score on it; on a miss `_regime.inputs`
    // is null, calculateRegimeWeight returns {ok:false}, and the caller rejects.
    const _rwResult = calculateRegimeWeight({
      trendStrength: _regime.inputs?.trendStrength,
      volatility: _regime.inputs?.volatility,
    });
    // #546: absence survives as null rather than becoming a number here. Callers of
    // acquireRefreshedInputs must reject on null — see the field's doc on the return type.
    const refreshedRegimeWeight = _rwResult.ok ? _rwResult.value : null;

    return { currentVol, currentSpread, netExpectedEdge, geometryRefreshed, decayPenalty, refreshedFinalScore, refreshedMT, refreshedRegimeWeight };
  }

  /**
   * Directive 11.0E: Refresh and dynamically re-rank RTB signals using FinalScore
   * 
   * Per-signal rolling TTL refresh (30s per signal):
   * 1. Check individual signal expiry based on its own TTL
   * 2. Calculate decayPenalty based on signal age (fresher signals rank higher)
   * 3. Recalculate FinalScore with decay applied
   * 4. Re-validate signals through SQE (FinalScore/RegimeWeight only)
   * 5. Immediate deletion on SQE failure
   * 6. Update status to 'reconfirmed' on successful refresh with FinalScore-native metrics
   * 7. Broadcast rtb:updated to clients for UI refresh
   * 
   * @param mode - Trading mode ('paper' or 'live')
   * @param bucketSignalKeys - Optional set of signal keys (mode:symbol:strategy) to filter
   *                           If provided, only processes signals matching these keys
   */
  async refreshAndRank(mode: TradingMode, bucketSignalKeys?: Set<string>): Promise<void> {
    const startTime = Date.now();
    
    // A3.R9.0: Set refresh incomplete flag for TCL sync barrier
    this.setRefreshComplete(mode, false);
    
    try {
      let signals = await this.getQueuedSignals(mode);
      
      // R3: Filter to bucket-specific signals if keys provided
      if (bucketSignalKeys && bucketSignalKeys.size > 0) {
        const originalCount = signals.length;
        signals = signals.filter(s => {
          const signalKey = `${mode}:${s.symbol}:${s.strategy}`;
          return bucketSignalKeys.has(signalKey);
        });
        console.log(`[A4.R10R-3.R3][RTBRefresh][BUCKET_FILTER] mode=${mode} total=${originalCount} bucketFiltered=${signals.length}`);
      }
      
      if (signals.length === 0) {
        console.log(`[A3.R9.2][RTB_REFRESH] mode=${mode} no signals to refresh`);
        this.setRefreshComplete(mode, true);
        return;
      }

      // Directive 8.8.4-A3.R8.5: Deduplicate during refresh
      // Track seen symbol+strategy pairs to prevent duplicates in the pool
      const seenPairs = new Set<string>();
      const deduplicatedSignals: typeof signals = [];
      let duplicateCount = 0;
      
      for (const signal of signals) {
        // A3.R9.0: Enhanced dedup key includes createdAt timestamp bucket (minute-level)
        const createdAtBucket = signal.queuedAt 
          ? new Date(signal.queuedAt).toISOString().substring(0, 16) // YYYY-MM-DDTHH:MM
          : 'unknown';
        // Directive A3.R9.0.C: Normalize symbol via Kraken Resolver for consistent comparisons
        const normalizedSymbol = normalizePairKey(signal.symbol);
        const pairKey = `${normalizedSymbol}:${signal.strategy}`;
        const fullDedupKey = `${pairKey}:${createdAtBucket}`;
        
        if (!seenPairs.has(pairKey)) {
          seenPairs.add(pairKey);
          deduplicatedSignals.push(signal);
        } else {
          // A3.R9.0: Delete older duplicates immediately (not just mark expired)
          await storage.deleteRtbSignals({ mode, id: signal.id });
          duplicateCount++;
          performanceMonitor.recordQueueRemove(1);
          console.log(`[A3.R9.2][RTB_DEDUP] Deleted duplicate ${pairKey} id=${signal.id}`);
        }
      }
      
      if (duplicateCount > 0) {
        console.log(`[A3.R9.2][RTB_DEDUP] mode=${mode} deleted=${duplicateCount} duplicates, remaining=${deduplicatedSignals.length}`);
      }

      // Directive 8.8.4-A4.R10R-3.T3/T4/T5: Concurrent processing with batched DB writes and adaptive pool
      const now = new Date();
      const statusUpdatedAt = now.toISOString();
      
      // T5: Use broadcast-synced pool size (falls back to getAdaptivePoolSize if not yet received)
      const POOL_SIZE = currentPoolSize > 0 ? currentPoolSize : getAdaptivePoolSize();
      console.log(`[8.8.4-A4.R10R-3.T5][RTBRefresh][POOL_USE] poolSize=${POOL_SIZE} signals=${deduplicatedSignals.length}`);
      const cycleStart = performance.now();
      
      // Collect batch operations for efficient DB writes
      const bulkUpdates: Array<{ id: string; updates: Partial<RtbSignal> }> = [];
      const bulkDeletes: string[] = [];
      let reconfirmedCount = 0;
      let expiredCount = 0;
      
      // Process signals in concurrent chunks
      const chunks = chunkArray(deduplicatedSignals, POOL_SIZE);
      
      for (const group of chunks) {
        await Promise.all(
          group.map(async (signal) => {
            // OBJ-4: hoisted ABOVE the try so the catch can attribute the droppedError exit with
            // the SAME class that gated the refreshedAttempted increment. Assigned inside once
            // the class resolves; undefined here means the row never entered the denominator,
            // so an error before that point correctly records nothing.
            let _fCls: FunnelAssetClass | undefined;
            // ★ B-RTB-REFRESH-CONSOLIDATE OBJ-1 FOLLOW-UP (#532, 2026-07-22 — Langston-ruled
            // RESTORE, bucket (1) real defect). The per-signal `isRefreshing` latch is the
            // documented replacement for the GLOBAL refresh barrier that R9.3-D removed
            // (see the SignalRefreshState field comment: "Flag to prevent TCL promoting during
            // refresh" / "replaces global isRefreshing"). Its ONLY writer lived in the retired
            // per-signal mechanism, so after that retirement NOTHING set it: `isSignalRefreshing`
            // returned false unconditionally and the promotion filter at getRankedSignals
            // (`!this.isSignalRefreshing(...)`) passed EVERYTHING — a filter presenting as a
            // guard while guarding nothing, with no barrier behind it.
            // ⚠️ Mechanism B NEVER set this latch even while both mechanisms ran, so this is not
            // merely a restore — it is the FIRST time the surviving refresh honours it. That was
            // the unfinished half of the R9.3-A migration, not a deliberate omission.
            // GATE PROVEN BEFORE WIRING (Langston's condition — partial coverage here would
            // recreate the same bug flipped): `refreshAndRank` is the ONLY path that REFRESHES a
            // signal — sole caller of `acquireRefreshedInputs` and sole writer of
            // `lastRefreshedAt`/the refreshed fields. Every other `updateRtbSignal` site
            // (`removeSignalBySymbol`, the promotion-cleanup fallback, `criteria-limiter`) writes
            // `status:'promoted'` + `promotedAt` — EXIT writes that touch no decision input.
            const _refreshState = this.getSignalRefreshState(mode, signal.signalId);
            _refreshState.isRefreshing = true;
            try {
              // Directive 11.0E: Normalize symbol for consistent comparisons
              const normalizedSymbol = normalizePairKey(signal.symbol);
              
              // Directive 11.0E: Extract FinalScore-native metrics
              const metadata = signal.metadata as Record<string, any> || {};
              const confidence = parseFloat(signal.confidence || '0.5');
              const originalFinalScore = metadata.finalScore ?? parseFloat(signal.finalScore || '0.5');
              // ★ B-RANKING-COMPONENT-CAPTURE follow-up (#555, 2026-07-22): same removal as
              // the per-signal path above — this is the BATCH refresh's copy of the identical
              // substitution. Both had to go together; fixing one would have left the other
              // writing substituted-confidence into metadata on every batch cycle.
              // ⚠️ Same caveat as the per-signal site: `refreshedFinalScore` DOES drop by
              // confidence × W.HYBRID here too. It is safe because the finalScore gate is
              // retired and neither the live `r_multiple` ranker nor decideMakerTaker reads
              // it — NOT because the math is equivalent. See the full note at the per-signal
              // site; my original "equivalent via calculateFinalScore" claim was false (that
              // function is not on this path).
              const hybridScore = metadata.hybridScore;
              const regimeWeight = metadata.regimeWeight ?? 0.5;
              
              const queuedAt = signal.queuedAt;
              const oldStatus = signal.status || 'active';
              
              // ★ B-RTB-REFRESH-CONSOLIDATE (OBJ-1/OBJ-2, 2026-07-19) — THE TRANSPLANT.
              // This mechanism previously replayed the FROZEN queue-time snapshot: stored
              // volatility, stored chosen_net_ev, no geometry re-read, no maker/taker
              // re-decide — and wrote none of those fields back, so the staleness was
              // self-perpetuating. It now runs the SAME acquisition the per-signal
              // mechanism runs, so the SQE is handed CURRENT market state.
              // Per Kyle's refresh contract: represent the signal as it currently is.
              const _acq = await this.acquireRefreshedInputs(
                signal, normalizedSymbol, metadata, confidence, hybridScore, regimeWeight,
              );
              const decayPenalty = _acq.decayPenalty;
              const refreshedFinalScore = _acq.refreshedFinalScore;
              const refreshedRegimeWeight = _acq.refreshedRegimeWeight;

              // ── #546 / OBJ-3 — the regimeWeight-absent guard. (OBJ-1 2026-07-22: this used to
              // read "parity with the single-refresh guard above"; that guard was Mechanism A's
              // and is now DELETED, so this is THE guard, not a mirror of one.) ──
              // Same trap, same disposition. `?? undefined` would NOT mean "absent" to the
              // SQE; it means RECOMPUTE from `trendStrength ?? 0.5` / `volatility ?? 0.3`,
              // re-pinning the gate at the constant this batch removes.
              // NOTE the deliberate asymmetry with the `sqeAssetClass === null` branch just
              // below: that one pushes to `bulkDeletes` because an unresolvable asset class
              // is permanent upstream breakage. A missing market context is transient, so
              // this returns WITHOUT deleting — the signal stays queued and is re-evaluated
              // once the MCE repopulates. Divergence between the two refresh mechanisms here
              // is exactly what B-RTB-REFRESH-CONSOLIDATE exists to prevent, so this guard
              // must stay identical in disposition to the single-refresh one.
              if (refreshedRegimeWeight === null) {
                console.warn(
                  `[B-REGIME-INPUTS-LIVE][REFRESH_REJECT] ${normalizedSymbol}: regimeWeight ` +
                  `unavailable (no live market context) — refresh FAILED, signal left queued ` +
                  `for retry. Not scored on a substituted constant, and NOT deleted.`,
                );
                return;
              }

              // Phase 14: SQE revalidation — pass pre-computed FinalScore/RegimeWeight (no backfill)
              // P19-B4a (C4): assetClass REQUIRED on SQEInput. PREFER the row's stamp
              // (rtb_signals.asset_class, schema.ts:1885, stamped at queue-write — the
              // source of truth post-C1); safe-resolve from the symbol only as a legacy
              // fallback. Unclassifiable → drop from the queue (mirrors the SQE-fail
              // bulkDelete below) rather than THROW and reject the whole concurrent chunk.
              const sqeAssetClass = asValidAssetClass(signal.assetClass) ?? safeResolveAssetClass(normalizedSymbol, 'kraken');
              if (sqeAssetClass === null) {
                // B-RTB-REFRESH-CONSOLIDATE OBJ-3/OBJ-4: this is NOT routine attrition. A queued
                // row was STAMPED with its asset class at write, so an unresolvable class here
                // means something upstream is broken. Counted (was one of the six silent deletes)
                // and logged at ERROR grade so it cannot vanish quietly.
                // NOT tallied into a per-class bucket: this branch is DEFINED by the asset class
                // being unresolvable, so keying a per-class counter off that same field is dead
                // code by construction (Langston Step-4 ①). It also returns BEFORE
                // refreshedAttempted increments, so it never enters the pass denominator.
                // The honest instrument here is the alarm, not a tally.
                console.error(`[11.0E][SQE_SKIP][DATA_INTEGRITY] unclassifiable ${normalizedSymbol} — dropping from queue (row was stamped at write; unresolvable now = upstream breakage)`);
                bulkDeletes.push(signal.id);
                expiredCount++;
                return;
              }

              // P19-B8.4b: active-path funnel — this signal is about to be re-SQE'd on the refresh path.
              // Narrow to the funnel grid + count the refresh attempt (per-signal; cyclesRun ticks per bucket
              // in rtb-refresh-service). Increments are single-threaded-atomic under the Promise.all chunk.
              _fCls = (sqeAssetClass === 'crypto_spot' || sqeAssetClass === 'xstock_spot') ? sqeAssetClass : undefined;
              if (_fCls) recordActiveRtbRefresh(mode, _fCls, { refreshedAttempted: 1 });

              const sqeInput: SQEInput = {
                signalId: signal.signalId,
                symbol: normalizedSymbol,
                strategy: signal.strategy,
                mode,
                assetClass: sqeAssetClass,
                confidence: confidence,
                finalScore: refreshedFinalScore,
                // OBJ-2: recomputed on live volatility (NOT a repair — ~70% is still the
                // hardcoded trendStrength term; see acquireRefreshedInputs).
                // Use the NARROWED local, not `_acq.…` — the null guard above narrows the
                // local binding, and reading the property again re-widens it to
                // `number | null`, defeating the guard. Same value, but the type system can
                // only prove it via the local.
                regimeWeight: refreshedRegimeWeight,
                trendStrength: metadata.trendStrength ?? 0.5,
                // OBJ-2: LIVE volatility from the shared acquisition (was `metadata ?? 0.3`).
                volatility: _acq.currentVol,
                // P19-B8.5b (OBJ-4, #498): frozen at-queue sourcePool — batch-refresh parity with
                // the single-refresh feed above (same row-read, same honest-absent semantics;
                // regimeStability deliberately NOT fed — see the single-refresh comment).
                sourcePool: (signal as any).sourcePool ?? (signal.metadata as any)?.sourcePool,
                // P19-B8.5a (OBJ-3): the ★third call site (batch refresh — Step-2 enumeration
                // found it; the consensus said two). No re-decide runs on this path, so feed
                // the stored row snapshot; absent → fail-open (Langston-ratified).
                // ★ OBJ-2 HIGHEST-PRIORITY REWIRE: NetEV is the BINDING admission gate (#501 fee
                // wall). This path replayed the queue-time snapshot, so a signal whose net
                // expectancy had gone NEGATIVE since queueing was reconfirmed on the old
                // number. Now prefers THIS tick's re-decide, exactly as the per-signal path does.
                chosenNetEv: _acq.refreshedMT?.chosenNetEV
                  ?? ((signal as any).chosenNetEv != null ? Number((signal as any).chosenNetEv) : undefined),
                chosenEntryMode: (_acq.refreshedMT?.chosenMode
                  ?? ((signal as any).chosenEntryMode as 'maker' | 'taker' | undefined)) ?? undefined,
              };
              
              // P19-B8.5 OBJ-6: same shadow treatment as the single-refresh site above (#514).
              const sqeResult = await signalQualityEvaluator.evaluate(sqeInput, { gateShadowMode: true });
              // P19-B8.4b: SQE-during-refresh tally (phase='refresh') — per-gate breakdown + pass/fail
              // denominator, kept as TWO labelled numbers vs SQE-at-generation, never summed (MUST-4).
              if (_fCls) recordActiveSqeEvaluation(mode, _fCls, sqeResult.passed, sqeResult.failures, 'refresh');

              // P19-B8.5 exploration lane: honor the gen-time stamp on a NetEV-only
              // refresh failure (mirror of the single-refresh site above — the lane
              // admission was decided once at generation; any OTHER failure still deletes).
              const _exploStampedB = ((signal.metadata as any)?.admissionBasis === 'exploration');
              if (!sqeResult.passed && _exploStampedB && sqeResult.failures.length === 1 && sqeResult.failures[0].startsWith('NetEV ')) {
                console.log(`[P19-B8.5][EXPLORATION_REFRESH_PASS] ${normalizedSymbol}: NetEV-only batch-refresh failure on an exploration-stamped signal — stamp honored, signal retained`);
              } else if (!sqeResult.passed) {
                console.log(`[11.0E][SQE_REVALIDATION_FAIL] symbol=${normalizedSymbol} reason=${sqeResult.reason}`);
                this.logRtbTrace(mode, normalizedSymbol, signal.strategy, oldStatus, 'deleted', 'SQE_failure');
                this.logSqeRejection(signal, sqeResult.reason || 'unknown', refreshedFinalScore);
                bulkDeletes.push(signal.id);
                expiredCount++;
                // P19-B8.4b: failed re-SQE → dropped from the queue during refresh.
                if (_fCls) recordActiveRtbRefresh(mode, _fCls, { rejectedInRefresh: 1 });
                return;
              }
              
              // Directive 11.0E: Queue update with FinalScore-native metrics
              bulkUpdates.push({
                id: signal.id,
                updates: {
                  status: 'reconfirmed',
                  confidence: confidence.toString(),
                  // ★ B-RETIRED-SCORE-REMOVAL (#558, A1): finalScore column write REMOVED (column
                  // is now nullable; dropped in Phase B). `refreshedFinalScore` still flows to the
                  // SQE input + logs — that consumer is the deferred SQE-contract slice.
                  lastRefreshedAt: now,
                  // ★ OBJ-2: write the re-decided maker/taker snapshot back, mirroring the
                  // per-signal path — chosen_net_ev is read by BOTH the B7.1 ranker (queue
                  // order) and the [11.8B] open-gate, so a stale stored value mis-ranks and
                  // mis-gates. Atomic with the metadata write below (no half-updated row).
                  ...(_acq.refreshedMT ? {
                    chosenEntryMode: _acq.refreshedMT.chosenMode,
                    chosenNetEv: _acq.refreshedMT.chosenNetEV.toString(),
                    takerNetEv: _acq.refreshedMT.takerNetEV.toString(),
                    makerNetEvAdjusted: _acq.refreshedMT.makerNetEVAdjusted.toString(),
                  } : {}),
                  metadata: {
                    ...metadata,
                    lastReconfirmedAt: statusUpdatedAt,
                    statusUpdatedAt,
                    originalFinalScore: originalFinalScore.toString(),
                    hybridScore: hybridScore,
                    // OBJ-2: persist the RECOMPUTED weight — writing the stale one back would
                    // re-freeze the value the next pass reads (the self-perpetuating pattern).
                    regimeWeight: refreshedRegimeWeight,
                    decayPenalty: decayPenalty,
                    // ★ OBJ-2: the freshness fields this path NEVER wrote — the reason the
                    // frozen snapshot was self-perpetuating. `lastCostRefresh` also re-arms
                    // shouldRecalculateGeometry's age throttle correctly.
                    netExpectedEdge: _acq.netExpectedEdge,
                    volatility: _acq.currentVol,
                    spread: _acq.currentSpread,
                    lastCostRefresh: _acq.geometryRefreshed ? Date.now() : (metadata.lastCostRefresh ?? 0),
                  }
                }
              });
              
              this.logRtbTrace(mode, normalizedSymbol, signal.strategy, oldStatus, 'reconfirmed', 'refresh');
              console.log(`[11.0E][RECONFIRM_COMPLETE] pair=${normalizedSymbol} ${oldStatus}→reconfirmed FinalScore=${refreshedFinalScore.toFixed(4)} decayPenalty=${decayPenalty.toFixed(4)}`);
              reconfirmedCount++;
              // P19-B8.4b: survived re-SQE → stayed queued (reconfirmed) on the refresh path.
              if (_fCls) recordActiveRtbRefresh(mode, _fCls, { reconfirmed: 1 });
            } catch (err) {
              // OBJ-4 / #419: this catch bulk-deleted the row while ticking NEITHER outcome, so
              // under errors refreshedAttempted > reconfirmed + rejectedInRefresh and the refresh
              // sub-stage never balanced. Now counted as its own honest exit.
              console.error(`[T3][SIGNAL_PROCESS_ERROR] signal=${signal.id}:`, err);
              // Attribute via the SAME variable that gated the refreshedAttempted increment
              // (_fCls), NOT a fresh asValidAssetClass call — Langston Step-4 ③: re-deriving
              // would silently drop any errored row lacking a valid stamp, leaving an exit that
              // escapes every counter. Reusing _fCls makes entry and exit symmetric BY
              // CONSTRUCTION: whatever counted into the denominator can always count out of it.
              if (_fCls) recordActiveRtbRefresh(mode, _fCls, { droppedError: 1 });
              bulkDeletes.push(signal.id);
              expiredCount++;
            } finally {
              // Cleared in `finally`, exactly as the retired mechanism did: a throw between the
              // set and the clear would strand the latch TRUE and make the signal permanently
              // invisible to promotion — a silent, self-inflicted queue leak. The error path
              // above deletes the row anyway, but the latch must not depend on that.
              _refreshState.isRefreshing = false;
            }
          })
        );
      }
      
      // T3: Batch database operations
      if (bulkDeletes.length > 0) {
        const deleted = await storage.deleteRtbSignalsByIds(bulkDeletes);
        performanceMonitor.recordQueueRemove(deleted);
        console.log(`[T3][BATCH_DELETE] deleted=${deleted} signals`);
      }
      
      if (bulkUpdates.length > 0) {
        const updated = await storage.updateRtbSignalsBatch(bulkUpdates);
        console.log(`[T3][BATCH_UPDATE] updated=${updated} signals`);
      }
      
      // T3 Metrics: End timing
      const duration = performance.now() - cycleStart;
      console.log(`[8.8.4-A4.R10R-3.T3][RTBRefresh][METRICS] duration=${duration.toFixed(2)}ms`)

      // A3.R8.5 FIX: Use deduplicatedSignals count, not original signals count
      await contextBridge.broadcast({
        type: 'rtb:updated',
        payload: {
          mode,
          timestamp: now.toISOString(),
          signalCount: deduplicatedSignals.length,
          reconfirmedCount,
          expiredCount,
          duplicatesRemoved: duplicateCount
        },
        mode
      });

      const elapsedMs = Date.now() - startTime;
      
      // A3.R9.2: Report remaining from deduplicated set minus expired
      console.log(`[A3.R9.2][RTB_REFRESH] mode=${mode} reconfirmed=${reconfirmedCount} expired=${expiredCount} duplicates=${duplicateCount} remaining=${deduplicatedSignals.length - expiredCount} elapsed=${elapsedMs}ms`);
      
      // A3.R9.2: Record metrics for performance monitoring
      performanceMonitor.recordRTBRefresh(elapsedMs, reconfirmedCount, expiredCount);
      
      // A3.R9.2: Set refresh complete flag to release TCL barrier
      this.setRefreshComplete(mode, true);
      
      // A3.R9.2: Check TCL threshold now that refresh is complete (barrier released)
      await tclWatchdog.checkSignalThresholdLive(mode, this.isRefreshComplete(mode));
      
    } catch (error) {
      console.error(`[A3.R9.2][RTB_REFRESH][ERROR] mode=${mode}:`, error);
      // A3.R9.2: On error, keep barrier closed - TCL should NOT proceed during failed refresh
      // The next refresh cycle will retry and properly complete
      // This prevents TCL from activating on potentially corrupt/incomplete state
      console.log(`[A3.R9.2][TCL_SYNC] Refresh failed for ${mode}, barrier remains CLOSED until next cycle`);
    }
  }

  /**
   * Directive A3.R9.3-D: Legacy barrier methods - kept for backwards compatibility
   * R9.3-D removes the global barrier concept. These methods now always return true.
   * Per-signal refresh tracking is handled via signalRefreshStates.
   */
  private refreshComplete: Map<TradingMode, boolean> = new Map();
  
  isRefreshComplete(_mode: TradingMode): boolean {
    // R9.3-D: Global barrier removed - always return true
    // Per-signal refresh state is tracked via isSignalRefreshing()
    return true;
  }
  
  setRefreshComplete(_mode: TradingMode, _complete: boolean): void {
    // R9.3-D: No-op - global barrier removed
    // Per-signal refresh state is tracked via signalRefreshStates
  }

  /**
   * Directive 8.8.4-A3.R8: Log RTB trace event to persistent file
   * Tracks all status transitions for observability
   */
  private logRtbTrace(mode: TradingMode, symbol: string, strategy: string, oldStatus: string, newStatus: string, trigger: string): void {
    try {
      const fs = require('fs');
      const path = require('path');
      const logDir = path.join(process.cwd(), 'logs');
      
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      
      const timestamp = new Date().toISOString();
      const dateStr = timestamp.split('T')[0].replace(/-/g, '');
      const logEntry = {
        timestamp,
        mode,
        symbol,
        strategy,
        oldStatus,
        newStatus,
        trigger
      };
      
      const logPath = path.join(logDir, `rtb_refresh_trace_${dateStr}.log`);
      fs.appendFileSync(logPath, JSON.stringify(logEntry) + '\n');
    } catch (err) {
      // Silent fail - diagnostic logging should not break refresh cycle
    }
  }

  /**
   * Directive 8.8.4-A3.R2: Log SQE rejection to diagnostic file
   */
  private logSqeRejection(signal: RtbSignal, reason: string, finalScore: number): void {
    try {
      const fs = require('fs');
      const path = require('path');
      const logDir = path.join(process.cwd(), 'logs', 'diagnostics');

      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      const logEntry = {
        timestamp: new Date().toISOString(),
        symbol: signal.symbol,
        strategy: signal.strategy,
        finalScore: finalScore.toFixed(4),
        reason,
        signalId: signal.signalId
      };

      const logPath = path.join(logDir, 'sqe_rejections.log');
      fs.appendFileSync(logPath, JSON.stringify(logEntry) + '\n');
    } catch (err) {
      // Silent fail - diagnostic logging should not break refresh cycle
    }
  }

  // ★ B-RTB-REFRESH-CONSOLIDATE OBJ-1 (#532, 2026-07-22): `isRefreshCycleRunning(mode)` DELETED
  // (rule 18 — removed, not stubbed; see DELETED_COMPONENTS_LOG).
  // It returned `this.refreshIntervals.has(mode)` on a map that was declared, read and deleted
  // from but **never once `.set`** anywhere in the file — so it answered `false` unconditionally,
  // for every mode, forever, while the refresh WAS running via the Central Clock. Its sole
  // consumer (`GET /api/diagnostics/rtb-queue/refresher-status`) reported "not running" on a
  // healthy system for as long as it has existed.
  // PROVENANCE (rule 24.a): LEGACY, not a fresh defect — the interval-timer model it queried was
  // superseded by the Central-Clock subscription at Phase 8.8.4-A3.R7 and this accessor was never
  // re-pointed. Rule-24 class (3): legacy that no longer fits intent.
  // NOT re-pointed here on purpose: `rtb-refresh-service.ts:22` statically imports THIS module,
  // so calling back into it would close an import cycle. The endpoint now asks the surviving
  // mechanism directly (`rtbRefreshService.isActive()`), which is the honest source.

  // P19-B6.5b (rule 18 / Langston Q4): `queueSignal` (capacity-block insertion variant) DELETED —
  // zero production + zero test callers. Live admission = queueSQESignal → upsertRtbSignal.
  // Archived: _archive/deleted-code/p19-b6-5b-rtb-deadcode.removed; logged: DELETED_COMPONENTS_LOG.md.

  // P19-B8.10 (OBJ-5c, rule 18): getTopSignal DELETED with checkForPromotion as a
  // unit — the dead legacy ranker pair (finalScore-fallback + FINAL_SCORE_GAP_OVERRIDE
  // ordering). Zero live callers: the engine promotes via getRankedSignals (B7.1
  // R-multiple). 2026-06-18 dead-ranker coupling RESOLVED: getRankedSignals won;
  // rankingScore-ordering never adopted; P25 verdict delete. Archived:
  // _archive/deleted-code/p19-b8-10-dead-ranker-pair.removed; DELETED_COMPONENTS_LOG.md.

  /**
   * Get a specific queued signal by symbol+strategy
   */
  async getQueuedSignal(mode: TradingMode, symbol: string, strategy: string): Promise<RtbSignal | null> {
    const signals = await storage.getRtbSignals({
      mode,
      status: 'queued',
      symbol,
      strategy: strategy as any,
      limit: 1,
    });
    
    return signals[0] || null;
  }

  /**
   * Get all queued signals for a mode
   * Directive 8.8.4-A3.R8: Include both 'active' and 'reconfirmed' statuses
   */
  async getQueuedSignals(mode: TradingMode, assetClass?: AssetClass): Promise<RtbSignal[]> {
    // B79.0n.RTB (2026-05-27): optional assetClass filter for per-class
    // queue reads. Default-undefined preserves backwards-compat global-read.
    // Storage layer uses rtb_signals_mode_asset_class_status_idx for hot path.
    const baseFilter = assetClass ? { mode, assetClass } : { mode };

    // Get active signals (newly inserted, pending first refresh)
    const activeSignals = await storage.getRtbSignals({
      ...baseFilter,
      status: 'active',
      // #558 A1: was 'finalScore' (retired). This raw queue read now orders by recency; the
      // TRUE ranking is applied downstream in getRankedSignals via computeRankKey (r_multiple).
      orderBy: 'queuedAt',
      orderDir: 'desc',
    });

    // Get reconfirmed signals (passed at least one refresh)
    const reconfirmedSignals = await storage.getRtbSignals({
      ...baseFilter,
      status: 'reconfirmed',
      orderBy: 'queuedAt', // #558 A1: was 'finalScore' (retired) — true ranking is downstream
      orderDir: 'desc',
    });

    // Also include legacy 'queued' status for backward compatibility
    const queuedSignals = await storage.getRtbSignals({
      ...baseFilter,
      status: 'queued',
      orderBy: 'queuedAt', // #558 A1: was 'finalScore' (retired) — true ranking is downstream
      orderDir: 'desc',
    });

    const allSignals = [...activeSignals, ...reconfirmedSignals, ...queuedSignals];
    // #558 A1: was a finalScore sort (retired). Order this raw queue read newest-first;
    // the decision-grade ranking is applied in getRankedSignals via computeRankKey (r_multiple).
    allSignals.sort((a, b) => new Date(b.queuedAt).getTime() - new Date(a.queuedAt).getTime());

    return allSignals;
  }

  /**
   * B79.0n.RTB (2026-05-27): per-class × per-mode queue depth accessor.
   *
   * Returns `Record<AssetClass, Record<TradingMode, number>>` over all 4
   * active asset classes. Serves the 48h verify-gate signal: pre-WIRE-IN
   * #16, xstock queue depth must stay at 0 because xstock signals don't
   * currently reach RTB via the orchestrator path (M70 writer threading
   * deferred). Any non-zero xstock depth signals a routing leak.
   *
   * Used by:
   *   - /api/diagnostics/rtb-queue-depth (future OBSERVABILITY #18 endpoint)
   *   - +48h verify-gate alert probe per scope §6.4
   *   - Step 7 first-pass verification snapshot
   */
  async getQueueDepth(): Promise<Record<AssetClass, Record<TradingMode, number>>> {
    const activeClasses: AssetClass[] = ['crypto_spot', 'crypto_perp', 'xstock_spot', 'xstock_perp'];
    const modes: TradingMode[] = ['paper', 'live'];
    const out = {} as Record<AssetClass, Record<TradingMode, number>>;

    for (const cls of activeClasses) {
      out[cls] = {} as Record<TradingMode, number>;
      for (const mode of modes) {
        const signals = await this.getQueuedSignals(mode, cls);
        out[cls][mode] = signals.length;
      }
    }

    return out;
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(mode: TradingMode): Promise<RTBQueueStats> {
    const signals = await this.getQueuedSignals(mode);
    
    const byStrategy: Record<string, number> = {};
    const byBlockReason: Record<string, number> = {};
    let totalFinalScore = 0;
    let oldestAge = 0;
    const now = Date.now();

    for (const signal of signals) {
      const strategy = signal.strategy;
      byStrategy[strategy] = (byStrategy[strategy] || 0) + 1;

      const blockReason = signal.blockReason || 'UNKNOWN';
      byBlockReason[blockReason] = (byBlockReason[blockReason] || 0) + 1;

      totalFinalScore += parseFloat(signal.finalScore || '0');

      const age = (now - new Date(signal.queuedAt).getTime()) / 1000;
      if (age > oldestAge) {
        oldestAge = age;
      }
    }

    return {
      mode,
      totalQueued: signals.length,
      avgFinalScore: signals.length > 0 ? totalFinalScore / signals.length : 0,
      oldestSignalAge: Math.round(oldestAge),
      byStrategy,
      byBlockReason,
    };
  }

  /**
   * Directive 8.8.4-A3.R8.4.A: Immediately delete signal on expiry
   * Amendment: No longer marks as 'expired' - deletes immediately
   */
  async expireSignal(signalId: string, reason?: string): Promise<void> {
    const signal = await storage.getRtbSignalById(signalId);
    
    if (!signal) {
      console.warn(`[RTB] Cannot expire - signal ${signalId} not found`);
      return;
    }
    
    // A3.R9.0.C: Normalize symbol for consistent logging
    const normalizedSymbol = normalizePairKey(signal.symbol);
    
    // A3.R9.0: Immediately delete instead of marking expired
    await storage.deleteRtbSignals({
      mode: signal.mode as 'live' | 'paper',
      id: signal.id
    });
    performanceMonitor.recordQueueRemove(1);
    
    console.log(`[A3.R9.2][RTB] Deleted signal ${normalizedSymbol}/${signal.strategy}: ${reason || 'expired'}`);
  }

  /**
   * Promote a signal from queue to execution
   * Directive 8.8.4-A3.R8: Log trace and delete signal after promotion
   * Directive 8.8.4-A3.R9.2-D: Atomic promotion - defer RTB removal until trade creation confirmed
   * Directive A3.R9.0.C: Normalize symbols for consistent comparisons
   * 
   * IMPORTANT: This method should ONLY be called AFTER trade creation succeeds.
   * The tradeId parameter confirms the trade was already created.
   */
  async promoteSignal(signalId: string, tradeId: string): Promise<void> {
    const signal = await storage.getRtbSignalById(signalId);
    
    if (!signal) {
      console.warn(`[A3.R9.2][RTB] Cannot promote - signal ${signalId} not found`);
      return;
    }

    // A3.R9.0.C: Normalize symbol for consistent comparisons
    const normalizedSymbol = normalizePairKey(signal.symbol);
    const oldStatus = signal.status || 'active';
    const mode = signal.mode as TradingMode;
    const promotionStartMs = Date.now();

    // Directive 8.8.4-A3.R9.2-D: Verify trade exists before deleting signal
    // This ensures we don't orphan signals if trade creation failed
    if (!tradeId) {
      console.error(`[A3.R9.2][PROMOTION_ABORT] symbol=${normalizedSymbol} no tradeId - trade creation may have failed`);
      return;
    }

    console.log(`[A3.R9.2][PROMOTION_START] symbol=${normalizedSymbol} tradeId=${tradeId} starting atomic promotion`);

    // Step 2: Log promotion trace
    this.logRtbTrace(mode, normalizedSymbol, signal.strategy, oldStatus, 'promoted', 'TCL_promotion');

    // Step 3: Delete signal from RTBQ (deferred until after trade creation confirmed)
    // A3.R9.2-D: Deletion happens ONLY after trade creation is confirmed via tradeId
    try {
      await storage.deleteRtbSignals({ mode, id: signal.id });
      performanceMonitor.recordQueueRemove(1);
      
      const promotionDurationMs = Date.now() - promotionStartMs;
      console.log(`[A3.R9.2][PROMOTION_COMPLETE] symbol=${normalizedSymbol} tradeId=${tradeId} rtbRemoved=true duration=${promotionDurationMs}ms`);
      
    } catch (error) {
      // A3.R9.2-D: Deletion failed but trade was already created
      // Signal may remain in queue as orphan - log for manual cleanup
      console.error(`[A3.R9.2][PROMOTION_CLEANUP_FAILED] symbol=${normalizedSymbol} tradeId=${tradeId} - signal may be orphaned:`, error);
      
      // Attempt to mark as promoted to prevent re-promotion
      try {
        await storage.updateRtbSignal(signalId, {
          status: 'promoted',
          promotedAt: new Date(),
          promotedTradeId: tradeId,
        });
        console.log(`[A3.R9.2][PROMOTION_MARKED] symbol=${normalizedSymbol} marked as promoted (delete failed)`);
      } catch (markError) {
        console.error(`[A3.R9.2][PROMOTION_MARK_FAILED] symbol=${normalizedSymbol}:`, markError);
      }
    }
  }

  /**
   * Directive 8.8.4-A3.R9.3-C: Legacy cleanup only
   * 
   * R9.3-C: TTL-based expiry removed. Lifecycle governed by SQE only.
   * This method now only handles legacy 'expired' status signals (immediate delete).
   * Active signal expiry is handled by SQE revalidation in the bucketed refresh
   * (RTBRefreshService → refreshAndRank). [B-RTB-REFRESH-CONSOLIDATE OBJ-1: was
   * executePerSignalRefresh, retired 2026-07-22.]
   */
  async cleanupExpiredSignals(mode: TradingMode): Promise<number> {
    let cleanedCount = 0;
    
    // R9.3-C: Only handle legacy 'expired' status signals
    const expiredSignals = await storage.getRtbSignals({
      mode,
      status: 'expired',
    });
    
    for (const signal of expiredSignals) {
      // A3.R9.0.C: Normalize symbol for consistent logging
      const normalizedSymbol = normalizePairKey(signal.symbol);
      await storage.deleteRtbSignals({ mode, id: signal.id });
      performanceMonitor.recordQueueRemove(1);
      console.log(`[A3.R9.3][CLEANUP] Deleted legacy expired signal ${normalizedSymbol}/${signal.strategy}`);
      cleanedCount++;
    }
    
    // R9.3-C: TTL-based expiry removed - no longer checking expiresAt
    // Signal lifecycle is now governed solely by SQE revalidation

    if (cleanedCount > 0) {
      console.log(`[A3.R9.3][RTB] Cleaned up ${cleanedCount} legacy signals for ${mode} mode`);
    }

    return cleanedCount;
  }

  /**
   * Re-evaluate all queued signals
   * Removes signals that no longer meet quality thresholds
   */
  async reEvaluateQueue(mode: TradingMode): Promise<{ removed: number; remaining: number }> {
    const signals = await this.getQueuedSignals(mode);
    let removed = 0;

    for (const signal of signals) {
      const confidence = parseFloat(signal.confidence);
      const age = (Date.now() - new Date(signal.queuedAt).getTime()) / 1000;

      // R9.3-C: TTL check removed - lifecycle governed by SQE only
      // Only remove if confidence is below threshold (B72: module_constants).
      const minQueueConfidence = getCachedNumberRequired('queue_admission', 'min_queue_confidence', _RTB_GK);
      if (confidence < minQueueConfidence) {
        await this.expireSignal(signal.id, `Confidence ${confidence.toFixed(2)} below threshold`);
        removed++;
        // P19-B5a: RTB confidence-drop reject capture. The queue only holds signals
        // when active trading is ON (orchestrator emit is dormant in VTS/passive),
        // so this is dormant by construction — no explicit active gate. Langston
        // NO-PATCHES: confidence_modulated IS the value tested at the drop — capture
        // it (not null). Fire-and-forget, try/catch — never throw into RTB refresh.
        try {
          // P19-B6.5d (OBJ-5): prefer the carried stamp; safe-resolve fallback; on a
          // genuinely-unclassifiable symbol SKIP the archive row rather than mislabel it
          // crypto_spot (the old silent tail-default would pollute per-class reject telemetry).
          const _evalClass = asValidAssetClass(signal.assetClass) ?? safeResolveAssetClass(signal.symbol, 'kraken');
          if (_evalClass !== null) {
            const { archiveSignalEval } = await import('../../services/data-archive/signal-eval-archiver.js');
            archiveSignalEval({
              mode: tradingModeToRunMode(mode),
              symbol: signal.symbol,
              exchange: 'kraken',
              assetClass: _evalClass,
              source: 'ready-to-buy',
              strategy: signal.strategy,
              rejectStage: 'rtb',
              confidenceModulated: confidence,
              gateDecision: { gate: 'rtb', accepted: false, reason: 'confidence_below_min_queue', observed: confidence, threshold: minQueueConfidence },
            });
          } else {
            console.warn(`[P19-B6.5d][ARCH] RTB-reject signal-eval archive SKIPPED for ${signal.symbol} — unclassifiable (no crypto_spot mislabel)`);
          }
        } catch (b70Err) {
          console.warn(`[B70][ARCH] RTB-reject signal-eval archive enqueue failed:`, b70Err instanceof Error ? b70Err.message : b70Err);
        }
      }
    }

    const remaining = signals.length - removed;
    console.log(`[RTB] Re-evaluated queue: ${removed} removed, ${remaining} remaining`);

    return { removed, remaining };
  }

  /**
   * P19-B7.1 (OBJ-3): true if the signal's stop is executable — risk_price = |entry − stop| ≥ the
   * capital-independent microstructure floor (max(min_ATR_fraction × ATR, min_abs_risk_fraction ×
   * entry)). A sub-floor stop is un-executable (the sizer would size nonsense) → rejected from
   * ranking upstream, so the kernel's :0 R-fallback is never a sort key.
   */
  private passesGeometryFloor(signal: RtbSignal): boolean {
    const entry = parseFloat(signal.entryPrice);
    const stop = parseFloat(signal.stopPrice);
    if (!Number.isFinite(entry) || !Number.isFinite(stop)) return false;
    const riskPrice = Math.abs(entry - stop);
    if (riskPrice <= 0) return false;
    const meta = (signal.metadata ?? {}) as Record<string, any>;
    const atrRaw = meta.atr ?? meta.atrAtOpen;
    const atrNum = atrRaw != null ? Number(atrRaw) : NaN;
    const atr = Number.isFinite(atrNum) ? atrNum : null;
    return riskPrice >= rankRiskFloorPrice(entry, atr);
  }

  /**
   * P19-B7.1 (OBJ-1/2): the sort key for a signal — the expected R-multiple =
   * evaluateTradeExpectancy(...).netRewardToRisk — REUSE of the gate's own friction+kernel
   * (sample-free, quiet). The number that ranks is the number the gate later confirms (zero
   * divergence surface).
   * ★ B-RETIRED-SCORE-REMOVAL (#558, A1): the `confidence` (friction-blind finalScore) and
   * `ranking_score` (inert VTS rankingScore) control arms — the last readers of `finalScore`
   * in the ranker — are removed. R-multiple is the only sort key now.
   */
  private computeRankKey(signal: RtbSignal, assetClass?: AssetClass): number {
    return this.signalRMultiple(signal, assetClass).r;
  }

  /**
   * P19-B8.7 Step-9 (Langston E2 amendment, 2026-07-17): the RANK KEY for a display
   * surface — THE RANKER ATTACHES, the route never recomputes. This is the same
   * computeRankKey the promotion sort uses (the r_multiple expected-R-multiple, incl.
   * the null-snapshot → netRewardToRisk fallback inside signalRMultiple), exposed
   * per-row because the RTB table lists MORE rows than a promotion cycle touches
   * (persisted rank-time values would go stale between cycles). The route stays
   * formula-blind: the displayed number remains the number that ranks — zero
   * divergence surface. (B-RETIRED-SCORE-REMOVAL #558 A1: r_multiple is now the sole
   * ranker; `arm` is a constant, no longer a config selection.)
   * -Infinity (unpriceable) is surfaced as null so the client renders an honest
   * em-dash instead of a serialized "-Infinity"/null-JSON artifact.
   */
  getDisplayRankKey(signal: RtbSignal, assetClass?: AssetClass): { value: number | null; arm: RankerStrategy } {
    // Langston Step-4 fold-in (2026-07-17): thread the resolved class exactly as
    // the promotion sort does — without it a class-degraded row could rank-display
    // differently than it ranks, a narrow exception the zero-divergence claim
    // shouldn't carry.
    const arm: RankerStrategy = 'r_multiple'; // #558 A1: the sole ranker (control arms removed)
    const key = this.computeRankKey(signal, assetClass);
    return { value: Number.isFinite(key) ? key : null, arm };
  }

  /**
   * P19-B7.1 (OBJ-2/4): the expected R-multiple for a candidate at rank time + the kernel's own
   * floored-pWin flag. Mirrors the open path's tradeMeta build (active-execution-engine.ts:2076-2087)
   * and reads the kernel's own `netRewardToRisk` + `pWinFloored` surfaced on the result — REUSE over
   * recompute (no parallel friction model + no re-derivation of the kernel's floor trigger; the same
   * numbers the gate uses). Sample-free: `recordEvInputSample` lives ONLY in the open path, so
   * rank-time ranking records no EV-input sample (no-double-sample by construction). Returns
   * `r=-Infinity` on unpriceable input so it sorts to the bottom (degenerate geometry is already
   * rejected upstream by passesGeometryFloor).
   */
  private signalRMultiple(signal: RtbSignal, assetClass?: AssetClass): { r: number; pwinFloored: boolean } {
    const meta = (signal.metadata ?? {}) as Record<string, any>;
    const targetNum = signal.targetPrice != null ? parseFloat(signal.targetPrice) : NaN;
    const ac = asValidAssetClass(signal.assetClass as unknown as string)
      ?? asValidAssetClass(meta.assetClass)
      ?? assetClass;
    return this.rMultipleCore({
      symbol: signal.symbol,
      entry: parseFloat(signal.entryPrice),
      stop: parseFloat(signal.stopPrice),
      target: Number.isFinite(targetNum) ? targetNum : null,
      di: signal.diAtQueue != null ? Number(signal.diAtQueue) : undefined,
      dbs: signal.dbsScoreAtQueue != null ? Number(signal.dbsScoreAtQueue) : undefined,
      chosenNetEv: signal.chosenNetEv != null ? Number(signal.chosenNetEv) : null,
      VolNoise: meta.VolNoise,
      prices: meta.prices,
      sourcePool: (signal as any).sourcePool ?? meta.sourcePool,
      assetClass: ac,
    });
  }

  /**
   * P19-B7.1 (OBJ-2) — the expected-R-multiple KERNEL, shared by the rank-time path
   * (signalRMultiple, off an RtbSignal row) and the queue tiebreaker (off a fresh
   * SQESignalInput). ONE formula so a duplicate-collision decision uses the exact number
   * the ranker/open-gate use — zero divergence. Reads the kernel's own `netRewardToRisk` +
   * `pWinFloored` (REUSE over recompute). Returns `r=-Infinity` on unpriceable geometry so it
   * sorts to the bottom / trips the tiebreaker's explicit keep-first.
   * P19-B7.2 (OBJ-3): rank on the CHOSEN-mode netEV (best-of-both snapshot), consistent with
   * the [11.8B] open-gate — the number that ranks is the number that gates. R = chosenNetEv /
   * risk_price. NULL snapshot (pre-B7.2 rows / un-snapshotted path) → the taker recompute.
   */
  private rMultipleCore(p: {
    symbol: string;
    entry: number;
    stop: number;
    target: number | null;
    di?: number;
    dbs?: number;
    chosenNetEv?: number | null;
    VolNoise?: any;
    prices?: any;
    sourcePool?: string;
    assetClass?: AssetClass;
  }): { r: number; pwinFloored: boolean } {
    if (!Number.isFinite(p.entry) || !Number.isFinite(p.stop)) return { r: -Infinity, pwinFloored: false };
    const target = (p.target != null && Number.isFinite(p.target)) ? p.target : p.entry * 1.02; // mirror executePromotedSignal default
    const result = evaluateTradeExpectancy(p.symbol, {
      entryPrice: p.entry,
      targetPrice: target,
      stopPrice: p.stop,
      DI: p.di !== undefined && Number.isFinite(p.di) ? p.di : undefined,
      VolNoise: p.VolNoise,
      prices: p.prices,
      sourcePool: p.sourcePool,
      dbsScore: p.dbs !== undefined && Number.isFinite(p.dbs) ? p.dbs : undefined,
    }, p.assetClass, /* quiet */ true);
    const distStop = Math.abs(p.entry - p.stop);
    let r = Number.isFinite(result.netRewardToRisk) ? result.netRewardToRisk : -Infinity;
    if (p.chosenNetEv != null && Number.isFinite(p.chosenNetEv) && distStop > 0) {
      r = p.chosenNetEv / distStop;
    }
    return { r, pwinFloored: result.pWinFloored };
  }

  /**
   * Phase 8.8.4-C.14.B: Get ranked signals for multi-signal promotion.
   * P19-B7.1: ranked by the configured ranker (default = expected R-multiple; §5 r15 no hidden
   * default), after rejecting degenerate-geometry candidates (OBJ-3).
   * R9.3-C: expiresAt filter removed - lifecycle governed by SQE only
   */
  async getRankedSignals(mode: TradingMode, limit: number = 15, assetClass?: AssetClass): Promise<RtbSignal[]> {
    // B79.0n.RTB (2026-05-27): optional assetClass filter for per-class
    // ranked reads. Default-undefined preserves backwards-compat (global
    // top-N across all classes; current behavior). Per-class call returns
    // top-N within that class only.
    const signals = await this.getQueuedSignals(mode, assetClass);

    if (signals.length === 0) {
      return [];
    }

    // R9.3-C: No expiry filter - all queued signals are valid (SQE governs lifecycle)
    // R9.3-A: Filter out signals currently being refreshed
    let validSignals = signals.filter(s => !this.isSignalRefreshing(mode, s.signalId));

    // Batch 19F: Pair-level promotion guard (prevent overexposure)
    // Filter out signals for pairs that already have active trades
    try {
      const activeTrades = await storage.getActiveTrades(mode as 'paper' | 'live');
      const activeSymbols = new Set(activeTrades.map(t => t.symbol));
      const beforeCount = validSignals.length;
      validSignals = validSignals.filter(s => !activeSymbols.has(s.symbol));
      const pairGuardFiltered = beforeCount - validSignals.length;
      if (pairGuardFiltered > 0) {
        console.log(`[19F][RTB] Pair-level guard filtered ${pairGuardFiltered} signals (active trades exist for those pairs)`);
      }
    } catch (err) {
      console.warn(`[19F][RTB] Pair-level guard check failed in getRankedSignals:`, err);
    }

    // ── P19-B7.1 — rank by the configured key (default = expected R-multiple) ──
    // OBJ-3: reject degenerate-geometry (un-executable near-zero stop) BEFORE ranking —
    // PRIMARY, so the kernel's `distStop>0 ? … : 0` R-fallback can never become a sort key
    // (the floor is the arithmetic guard; the reject is what kills the un-executable trade).
    {
      const beforeGeo = validSignals.length;
      // P19-B8.5 gates-sweep (Langston site-5 rider, "enumerate, don't count"): every
      // dropped signal is logged individually — symbol/strategy/entry/stop/riskPrice/
      // floor — so the drop set is auditable, never a bare tally (a silent drop was
      // the objection; the gate itself stays JUSTIFIED-OUTSIDE per the sweep ruling).
      const _geoDropped: string[] = [];
      validSignals = validSignals.filter(s => {
        if (this.passesGeometryFloor(s)) return true;
        const _e = parseFloat(s.entryPrice);
        const _st = parseFloat(s.stopPrice);
        const _risk = (Number.isFinite(_e) && Number.isFinite(_st)) ? Math.abs(_e - _st) : NaN;
        const _meta = (s.metadata ?? {}) as Record<string, any>;
        const _atrRaw = _meta.atr ?? _meta.atrAtOpen;
        const _atrN = _atrRaw != null ? Number(_atrRaw) : NaN;
        const _floor = Number.isFinite(_e) ? rankRiskFloorPrice(_e, Number.isFinite(_atrN) ? _atrN : null) : NaN;
        _geoDropped.push(`${s.symbol}/${s.strategy} entry=${_e} stop=${_st} riskPrice=${Number.isFinite(_risk) ? _risk.toFixed(8) : 'NaN'} floor=${Number.isFinite(_floor) ? _floor.toFixed(8) : 'NaN'}`);
        return false;
      });
      const geoRejected = beforeGeo - validSignals.length;
      if (geoRejected > 0) {
        console.log(`[P19-B7.1][RANK] OBJ-3 rejected ${geoRejected} degenerate-geometry signal(s) (risk_price < microstructure floor) before ranking:`);
        for (const _d of _geoDropped) console.log(`[P19-B7.1][RANK][GEO_DROP] ${_d}`);
      }
    }
    // OBJ-1/2: memoize each survivor's sort key, then sort plain-descending. For the default
    // r_multiple ranker, computeRankKey reuses the gate's own friction+kernel via the wrapper
    // (sample-free; reads the surfaced netRewardToRisk) — the number that ranks is the number
    // the gate later confirms. Plain DESC: negative-R losers sort to the bottom (no abs/clamp).
    const rankKey = new Map<string, number>();
    for (const s of validSignals) rankKey.set(s.signalId, this.computeRankKey(s, assetClass));
    validSignals.sort((a, b) => (rankKey.get(b.signalId) ?? -Infinity) - (rankKey.get(a.signalId) ?? -Infinity));

    const topKey = validSignals.length > 0 ? rankKey.get(validSignals[0].signalId) : undefined;
    console.log(`[8.8.4-C.14.B][RTB_RANKED] mode=${mode}, ranker=r_multiple, total=${signals.length}, valid=${validSignals.length}, topKey=${topKey != null ? topKey.toFixed(4) : 'n/a'}, returning top ${Math.min(limit, validSignals.length)}`);

    // reorg-B4: shadow-trade capture (telemetry-only selection-quality layer). This
    // method is the SOLE live caller of the promotion path, so this is exactly one
    // capture per promotion cycle. For EVERY member of the full ranked pool (NOT
    // just the top-`limit` that get promoted) open a counterfactual shadow trade +
    // record the decision-time ranking inputs into the isolated rtb_shadow_pairings
    // sink. Fire-and-forget OFF the hot path (own catch); the return value is
    // unchanged. DORMANT until paper active trading is on (rtb_total=0 today).
    void this.captureShadowPool(mode, validSignals, limit, assetClass).catch((err) => {
      console.warn(`[reorg-B4][SHADOW_CAPTURE] capture threw (promotion unaffected):`, err instanceof Error ? err.message : err);
    });

    return validSignals.slice(0, limit);
  }

  /**
   * reorg-B4 — open one shadow trade per ranked-pool member (the promoted picks AND
   * the non-promoted alternatives), each tagged with its promotionRank + a shared
   * per-cycle cycleKey + whether the ranker selected it this cycle (`promoted` =
   * rank < limit). The shadow layer is segregated by construction — see
   * registerOpenShadowTrade. Dynamic import avoids an rtb↔vts-runner import cycle.
   *
   * reorg-B4.1 — ALSO write a per-cycle pool-membership row for every member each
   * cycle (the EVENT grain), FK'd to the resolving shadow trade. The shadow TRADE is
   * deduped one-per-signal (its outcome resolves once); the member ROW is written
   * every cycle so rank/promoted are captured per-cycle (the "did we pick the best
   * at cycle N?" view). Boundary (Langston Step-2): resolve the trade id FIRST; only
   * write the member row when it's non-null (so a dangling FK is impossible); a
   * member-write failure is logged + tolerated (one telemetry row lost, no
   * corruption). `poolSize` is stamped from the ranked-signal count, NOT COUNT(*).
   */
  private async captureShadowPool(
    mode: TradingMode,
    pool: RtbSignal[],
    limit: number,
    assetClass?: AssetClass,
  ): Promise<void> {
    if (!pool || pool.length === 0) return;
    const { registerOpenShadowTrade, nextShadowCycleKey } = await import('../../services/vts-runner.js');
    const { insertShadowPoolMember } = await import('../../services/rtb-shadow-store.js');
    const cycleKey = nextShadowCycleKey(mode, assetClass ?? 'all');
    const poolSize = pool.length; // the ranked-signal count at capture — the SSOT for "N candidates" (stamped, never COUNT(*))
    // P19-B7.1 (OBJ-4): per-cycle cross-class flag — the rank-0 winner is a different asset class
    // than the rank-1 runner-up (the cross-class selection the floored-pWin limitation bears on;
    // Langston Q2). Meaningful only on a mixed-class (global) pool; always false on a per-class pool.
    // The pool arrives in ranked order (rank 0 = the picked winner).
    const crossClassPromotion = pool.length >= 2
      && pool[0].assetClass != null && pool[1].assetClass != null
      && pool[0].assetClass !== pool[1].assetClass;
    const num = (v: unknown): number | null => {
      if (v === null || v === undefined) return null;
      const n = parseFloat(String(v));
      return Number.isFinite(n) ? n : null;
    };
    for (let i = 0; i < pool.length; i++) {
      const s = pool[i];
      const meta = (s.metadata ?? {}) as Record<string, any>;
      const ac = (s.assetClass as AssetClass) ?? assetClass ?? 'crypto_spot';
      const entryPrice = num(s.entryPrice);
      const stopPrice = num(s.stopPrice);
      if (entryPrice === null || stopPrice === null) continue; // a pool member with no geometry can't be shadow-simmed
      const targetPrice = num(s.targetPrice) ?? entryPrice * 1.02; // mirror executePromotedSignal's default
      const promoted = i < limit;
      const regime = meta.regime ?? meta.pairRegime ?? null;
      const finalScore = num(s.finalScore);
      // ★ B-RANKING-COMPONENT-CAPTURE (#555, 2026-07-22): these three read METADATA, not the
      // row columns. `rtb_signals.{hybrid_score,regime_weight,decay_penalty}` are NULL FROM
      // BIRTH — the queue-insert builder never passed them (storage.ts's upsert mapping is
      // wired but fed `undefined`), and the refresh writes the recomputed values only into
      // `metadata`. Reading the columns therefore recorded NULL for 3 of the 4 FinalScore
      // components on EVERY shadow-pairing row (measured: 14,232 rows, final_score 14,232
      // non-null, these three 0) — leaving the "did we pick the best?" selection-quality
      // view structurally unable to answer its own question. Metadata is the SSOT here, which
      // is already this block's idiom: `meta.atr`/`meta.sourcePool` above and
      // `num(meta.rankingScore)` immediately below. The three column reads were the anomaly.
      // `confidence` stays on `s.` — it IS populated at insert (a real column). The now-dead
      // columns are dropped by this same batch (zero readers after this change).
      const hybridScore = num(meta.hybridScore);
      const confidence = num(s.confidence);
      const regimeWeight = num(meta.regimeWeight);
      const decayPenalty = num(meta.decayPenalty);
      const rankingScore = num(meta.rankingScore);
      const diAtQueue = num(s.diAtQueue);
      const dbsScoreAtQueue = num(s.dbsScoreAtQueue);
      // P19-B7.1 (OBJ-4): the new ranker's decision-time R-multiple + floored-pWin flag for this
      // candidate — reuse the rank-time helper (the gate's own friction+kernel, sample-free). Store
      // null (not -Infinity) on a non-finite R so the decimal column stays clean. `pwinFloored` comes
      // straight from the kernel's OWN output (CHANGE-2, Langston): pWin sitting at the injected floor
      // — complete across ALL floor paths (strong-trend null/zero/neg dbs AND DI≤0), no re-derivation
      // that could drift from the kernel. The raw di/dbs columns remain as the auditable backstop.
      const _re = this.signalRMultiple(s, ac);
      const predictedRMultiple = Number.isFinite(_re.r) ? _re.r : null;
      const pwinFloored = _re.pwinFloored;
      const sqeVerdict = meta.sqeVerdict ?? 'pass';
      try {
        // Resolve the shadow TRADE first (existing id on dedupe, new on open, null on fail/cap).
        const shadowTradeId = await registerOpenShadowTrade({
          cycleKey,
          mode,
          assetClass: ac,
          symbol: s.symbol,
          strategy: s.strategy,
          signalId: s.signalId,
          regime,
          promotionRank: i,
          promoted,
          entryPrice,
          stopPrice,
          targetPrice,
          atrAtOpen: num(meta.atr ?? meta.atrAtOpen),
          sourcePool: meta.sourcePool ?? null,
          finalScore,
          hybridScore,
          confidence,
          regimeWeight,
          decayPenalty,
          rankingScore,
          diAtQueue,
          dbsScoreAtQueue,
          predictedRMultiple, // P19-B7.1 (OBJ-4)
          pwinFloored,
          crossClassPromotion,
          // In-queue ⇒ this member already passed SQE; reject-reason is for the
          // future SQE-rejected E-trigger (deferred — RUNNING_ISSUES §13).
          sqeVerdict,
          sqeRejectReason: null,
        });
        // reorg-B4.1: only write the per-cycle member row when a valid trade id was
        // resolved (null = cap-reject/persist-fail → no trade to FK → skip). This makes
        // a dangling FK impossible by construction (Langston Step-2 boundary).
        if (shadowTradeId) {
          try {
            await insertShadowPoolMember({
              cycleKey,
              mode,
              assetClass: ac,
              signalId: s.signalId,
              shadowTradeId,
              symbol: s.symbol,
              strategy: s.strategy,
              promotionRank: i,
              promoted,
              poolSize,
              finalScore,
              hybridScore,
              confidence,
              regimeWeight,
              decayPenalty,
              rankingScore,
              diAtQueue,
              dbsScoreAtQueue,
              predictedRMultiple, // P19-B7.1 (OBJ-4)
              pwinFloored,
              crossClassPromotion,
              sqeVerdict,
              regime,
            });
          } catch (memberErr) {
            // Tolerated: one telemetry member row lost for one cycle; the trade +
            // its outcome are intact, no dangling FK. A persisted cycle can thus
            // hold FEWER member rows than the pool had — readers must use pool_size,
            // never COUNT(*) (Langston Step-2 watch item).
            console.warn(`[reorg-B4.1][SHADOW_MEMBER] ${s.symbol}/${s.strategy} member-write failed (tolerated):`, memberErr instanceof Error ? memberErr.message : memberErr);
          }
        }
      } catch (err) {
        console.warn(`[reorg-B4][SHADOW_CAPTURE] ${s.symbol}/${s.strategy} open failed (continuing pool):`, err instanceof Error ? err.message : err);
      }
    }
  }

  /**
   * Clear all queued signals for a mode (used during engine reset)
   * Directive 8.8.4-C.14.D: Actually DELETE records instead of just expiring them
   */
  async clearQueue(mode: TradingMode): Promise<number> {
    // Delete ALL RTB signals for this mode (not just queued ones)
    const deleted = await storage.deleteRtbSignals({ mode });
    
    // A3.R9.0: Track queue clears in performance metrics
    if (deleted > 0) {
      performanceMonitor.recordQueueRemove(deleted);
    }
    
    console.log(`[A3.R9.2][RTB] Deleted ${deleted} signals from ${mode} queue`);
    return deleted;
  }

  /**
   * Phase 8.8.4-C.5: Queue an SQE-qualified signal into the unified RTB pool
   * Directive 8.8.4-A3.R8.5: Enforce SQE await before insert
   * 
   * Unlike queueSignal(), this method:
   * - Accepts ALL SQE-qualified signals regardless of capacity blocks
   * - Uses pre-computed FinalScore from SQE instead of re-calculating
   * - Supports TCL warm-up tracking
   * 
   * Directive 8.8.4-A3.R2: Supports skipSelfCheck flag for reconfirmation
   * When skipSelfCheck=true, skips the existing RTB signal check to allow
   * re-queuing during refresh cycles without self-rejection
   * 
   * Directive 8.8.4-A3.R8.5: Explicit SQE validation before insert
   * Defense-in-depth: Validates NGC threshold even for pre-computed signals
   * 
   * @param input - SQE-qualified signal with pre-computed metrics
   * @returns The queued signal record or null if rejected
   */
  async queueSQESignal(input: SQESignalInput): Promise<RtbSignal | null> {
    const now = new Date();
    // R9.3-C: TTL removed - lifecycle governed by SQE results only
    
    // Directive 8.8.4-A3.R1: Normalize pair key to uppercase BASE/QUOTE format
    const normalizedSymbol = normalizePairKey(input.symbol);

    // Directive 8.8.4-A3.R8.5: Trust upstream SQE result
    // SQE evaluation already happened upstream before calling queueSQESignal
    // Log trace for audit trail without re-running evaluation
    console.log(`[A3.R8.5][SQE][GATE] pair=${normalizedSymbol} TRUSTED confidence=${input.confidence.toFixed(4)} FinalScore=${(input.finalScore).toFixed?.(4) || '0'}`);

    // Directive 8.8.4-A3: Pair-level duplicate validation
    // Check if this pair already exists in active trades (duplicate_pair_active)
    // NOTE: Always check active positions even with skipSelfCheck (trade may have opened)
    const hasActivePosition = await storage.hasActivePair(normalizedSymbol, input.mode);
    if (hasActivePosition) {
      console.log(`[8.8.4-A3][SQE][Validation] pair=${normalizedSymbol} status=duplicate_pair_active`);
      // P19-B-FEEVIABILITY OBJ-1b (2026-08-11): persist the pair-exclusivity rejection.
      // This block was a bare console.log — 122 blocks in 5.2h existed ONLY in a stdout
      // line that rotates out in ~2 days, invisible to the archive (0 rows against a
      // 4,010-row positive control) AND to the shadow layer (no pool entry ⇒ no shadow
      // row ⇒ the counterfactual is unobtainable retrospectively). The marked window
      // cannot distinguish "did not qualify" from "could not enter" without this.
      // Sink = signal_eval_archive (the durable ledger), NOT rtb_signals.block_reason —
      // that column's designed population structurally cannot reach it (pre-audit part 4:
      // blocked signals return null BEFORE upsert; rule-24 outcome 3). Includes the
      // HOLDING strategy so contention is attributable per strategy (Langston's two
      // global channels). Fire-and-forget: the archive write must never block admission.
      try {
        const { archiveSignalEval } = await import('../../services/data-archive/signal-eval-archiver.js');
        const { asValidAssetClass, safeResolveAssetClass } = await import('../../../shared/asset-classes.js');
        const _blkClass = asValidAssetClass((input as any).assetClass) ?? safeResolveAssetClass(normalizedSymbol, 'kraken');
        if (_blkClass !== null) {
          let _holdingStrategy: string | null = null;
          let _lookupFailed = false;
          try {
            const _open = await storage.getActiveOpenPositions(input.mode);
            _holdingStrategy = _open.find(p => p.symbol === normalizedSymbol)?.strategyName ?? null;
          } catch { _lookupFailed = true; /* holder lookup is best-effort — the block record matters more than the attribution */ }
          // Step-4 CHANGE-3: hasActivePair returned TRUE one line above, so a holder exists
          // by construction — a null here means .find() missed (symbol-form drift or the
          // non-activeOpenPositions fall-through) and must be LOUD, not a silent null
          // indistinguishable from the catch branch. (Note: getActiveOpenPositions ignores
          // its mode arg today — bare global select; harmless paper-only, do not build on it.)
          if (_holdingStrategy === null && !_lookupFailed) { // Step-4 NEW-2: a thrown lookup must not masquerade as drift
            console.warn(`[OBJ-1b][HOLDER_MISS] pair=${normalizedSymbol} blocked as duplicate but holder lookup found no position — symbol-form drift or store fall-through`);
          }
          archiveSignalEval({
            mode: tradingModeToRunMode(input.mode),
            symbol: normalizedSymbol,
            exchange: 'kraken',
            assetClass: _blkClass,
            source: 'signal-orchestrator',
            strategy: input.strategy,
            rejectStage: 'sqe',
            finalScore: input.finalScore,
            gateDecision: {
              gate: 'pair_exclusivity', accepted: false, reason: 'duplicate_pair_active',
              path: 'rtb-queue-admission', holdingStrategy: _holdingStrategy,
            },
          });
        }
      } catch (b70Err) {
        console.warn(`[OBJ-1b][ARCH] pair-exclusivity archive enqueue failed:`, b70Err instanceof Error ? b70Err.message : b70Err);
      }
      return null;
    }

    // Directive 8.8.4-A3.R2: Skip self-dedupe check when reconfirming existing RTB signals
    if (input.skipSelfCheck) {
      console.log(`[A3.R2][RTB] skipSelfCheck=true for ${normalizedSymbol}/${input.strategy}`);
    }

    // Check for existing queued signal with same symbol+strategy
    // Directive 8.8.4-A3.R2: Skip this check when reconfirming (skipSelfCheck=true)
    const existingSignal = input.skipSelfCheck 
      ? null 
      : await this.getQueuedSignal(input.mode, normalizedSymbol, input.strategy);
    
    if (existingSignal) {
      // ★ B-RETIRED-SCORE-REMOVAL (#558, A1) — Kyle-ruled tiebreaker (2026-07-24): a duplicate
      // symbol+strategy collision is decided on the LIVE RANK KEY (expected R-multiple), not the
      // retired finalScore. Both sides go through the SAME rMultipleCore the ranker + open-gate
      // use (zero divergence). The old `parseFloat(existingSignal.finalScore || '0')` coerce is
      // GONE — it fabricated a comparable number out of a nulling column (#574).
      const _tbClass = asValidAssetClass(existingSignal.assetClass as unknown as string)
        ?? asValidAssetClass(input.assetClass)
        ?? undefined;
      const existingR = this.signalRMultiple(existingSignal, _tbClass).r;
      const _im = (input.metadata ?? {}) as Record<string, any>;
      const newR = this.rMultipleCore({
        symbol: normalizedSymbol,
        entry: input.entryPrice,
        stop: input.stopPrice,
        target: input.targetPrice ?? null,
        di: input.diAtQueue != null ? Number(input.diAtQueue) : undefined,
        dbs: input.dbsScoreAtQueue != null ? Number(input.dbsScoreAtQueue) : undefined,
        chosenNetEv: input.chosenNetEv,
        VolNoise: _im.VolNoise,
        prices: _im.prices,
        sourcePool: input.sourcePool ?? _im.sourcePool,
        assetClass: asValidAssetClass(input.assetClass) ?? _tbClass,
      }).r;

      // Explicit COUNTED keep-first when either side is UNPRICEABLE (-Infinity — degenerate
      // geometry / missing price). We cannot rank honestly, so keep the incumbent — logged, never
      // a silent coerce-to-0 (the exact fabricated-input path the old finalScore coerce created).
      if (!Number.isFinite(existingR) || !Number.isFinite(newR)) {
        console.log(`[8.8.4-C.5][RTB_TIEBREAK][UNPRICEABLE] ${normalizedSymbol}/${input.strategy}: keeping incumbent (existingR=${existingR}, newR=${newR}) — not scored on a fabricated tiebreak`);
        return existingSignal;
      }
      if (existingR >= newR) {
        console.log(`[8.8.4-C.5][RTB_TIEBREAK][KEEP] ${normalizedSymbol}/${input.strategy}: incumbent R=${existingR.toFixed(4)} >= new R=${newR.toFixed(4)}`);
        return existingSignal;
      }

      // New signal ranks higher - expire the old one
      console.log(`[8.8.4-C.5][RTB_TIEBREAK][REPLACE] ${normalizedSymbol}/${input.strategy}: new R=${newR.toFixed(4)} > incumbent R=${existingR.toFixed(4)} — replacing`);
      await this.expireSignal(existingSignal.id, 'Replaced by higher-R-multiple SQE signal');
    }

    // P19-B4a stamp-at-source (Langston Q4 backstop): the orchestrator stamps assetClass
    // at the per-pipe dispatch chokepoint (sizingContext.assetClass), so a missing
    // assetClass on this single caller path is a real bug — an `as any` / JSON-boundary /
    // future-caller bypass that defeated the required-field type. FAIL LOUD rather than
    // re-derive from the symbol: re-derivation mislabels the collision-set tickers (exist
    // as BOTH xStock and crypto with identical canonical form, so only the pipe is correct).
    // The QUEUE_FALLBACK warn stays as the zero-target tripwire for the A4 SET-NOT-NULL gate.
    if (!input.assetClass) {
      console.warn(`[B79.0n.RTB][QUEUE_FALLBACK] queueSQESignal received NO assetClass — upstream stamp bug. symbol=${normalizedSymbol} strategy=${input.strategy} signalId=${input.signalId}`);
      throw new Error(
        `[B79.0n.RTB][STAMP_MISSING] queueSQESignal requires a stamped assetClass (stamp-at-source); ` +
        `none supplied for symbol=${normalizedSymbol} strategy=${input.strategy} signalId=${input.signalId}.`,
      );
    }
    const resolvedAssetClass = input.assetClass; // string, narrowed non-undefined by the throw above

    // P19-B6.5b (F1b / RUNNING_ISSUES #320 — defense-in-depth): queueSQESignal is the SINGLE live RTB
    // admission chokepoint. The per-asset-class active gate is enforced upstream at the entry points
    // (fx5 crypto scan + xstock active-dispatch, now structurally hardened in F1), but a per-class reject
    // HERE is the durable B7b / Phase-21 co-run guarantee: a signal whose stamped class is NOT active for
    // its mode never enters the queue. Reads the SAME isAssetClassActiveInContext the entry gate uses (so
    // it can never reject a legitimately-active class) and witnesses any breach via the #321 hard-breach
    // hook (LIVENESS_SPLIT) so an isolation failure is observable, never silent.
    const admissionContext = await storage.getSystemContext(input.mode);
    if (!isAssetClassActiveInContext(admissionContext, resolvedAssetClass as AssetClass)) {
      tradingStateSync.witnessAssetClassEmissionWhileInactive(input.mode, resolvedAssetClass as AssetClass);
      console.warn(
        `[P19-B6.5b][#320][RTB_GATE_REJECT] ${resolvedAssetClass} signal reached queueSQESignal while its ` +
        `per-class active gate is OFF in ${input.mode} — REJECTED (defense-in-depth). ` +
        `symbol=${normalizedSymbol} strategy=${input.strategy} signalId=${input.signalId}`,
      );
      return null;
    }

    // ── P19-B8.5 (soak fix C / #509) — POST-STOP RE-ENTRY COOLDOWN ────────────────────
    // A symbol+strategy that just STOPPED OUT is evidence AGAINST the thesis; re-queuing
    // the same signal shape minutes later is thesis-blind churn (observed live: the
    // XRP/GBP loop re-entered 5 times in 37 minutes — phantom-priced that day, but the
    // churn pattern is real with honest prices too). The general symbol-cooldown guardrail
    // (5 min) is shorter than the gen cadence and close-reason-blind; this guard is
    // per-(symbol,strategy,class), DB-knobbed per class, keyed to close_reason='stop_hit'
    // ONLY (a target hit or timeout is not anti-thesis evidence). Fail-open on knob/query
    // error: the cooldown is churn hygiene, not a safety gate — never block the queue on
    // its own failure, loudly.
    try {
      const { getCachedConstant } = await import('../../services/module-constants-service.js');
      const _cooldownMin = getCachedConstant<number>('exit_integrity', 'post_stop_reentry_cooldown_minutes',
        { exchange: '*', assetClass: resolvedAssetClass, strategy: '*', regime: '*' });
      if (typeof _cooldownMin === 'number' && Number.isFinite(_cooldownMin) && _cooldownMin > 0) {
        const { db } = await import('../../db.js');
        const { sql } = await import('drizzle-orm');
        const r = await db.execute(sql`
          SELECT closed_at FROM closed_trades
          WHERE symbol = ${normalizedSymbol}
            AND strategy_name = ${input.strategy}
            AND close_reason = 'stop_hit'
            AND closed_at >= now() - make_interval(mins => ${_cooldownMin})
          ORDER BY closed_at DESC LIMIT 1`);
        const _lastStop = (r as any).rows?.[0]?.closed_at;
        if (_lastStop) {
          console.log(`[P19-B8.5][REENTRY_COOLDOWN] ${normalizedSymbol}/${input.strategy}: stopped out at ${_lastStop} — re-entry blocked for ${_cooldownMin}min post-stop (#509)`);
          return null;
        }
      }
    } catch (cooldownErr) {
      console.warn(`[P19-B8.5][REENTRY_COOLDOWN] guard errored (queue proceeds — churn hygiene, not a safety gate):`, cooldownErr instanceof Error ? cooldownErr.message : cooldownErr);
    }

    // Phase 14.5: Persist routing and ranking metadata for auditability
    const enrichedMetadata = {
      ...(input.metadata || {}),
      sourcePool: input.sourcePool || undefined,
      signalType: input.signalType || 'QUANT',
      assetClass: resolvedAssetClass, // P19-B4a (A1.5): resolve-or-throw, no silent default
      // P19-B8.10 (OBJ-5b): the `?? finalScore` fallback is REMOVED — the retired
      // metric (#525 fence) was silently masquerading as the ranking score on every
      // row (the orchestrator never passes rankingScore). Absent stays absent; the
      // RTB display attaches its rank key at read time (getDisplayRankKey), and the
      // open table shows the promote-frozen rankAtPromote stamp.
      rankingScore: input.rankingScore,
      // ★ B-RANKING-COMPONENT-CAPTURE (#555, 2026-07-22): born-populated ranking components.
      // Without these, a row carries them in NEITHER store until its first refresh (~30s),
      // so `captureShadowPool` running on a pre-first-refresh row recorded NULLs even after
      // the read was re-pointed to metadata. Written HERE (metadata), never to the columns —
      // the columns are dropped by this batch, so populating them would resurrect the exact
      // two-location split-brain we are removing.
      //   • regimeWeight — honest state-at-admission (same lineage the refresh recomputes).
      //   • decayPenalty — `0` is the TRUE admission value, not a placeholder: the formula is
      //     λ × ageMinutes (see calculateDecayPenalty above), and a just-queued signal has
      //     age 0. The first refresh overwriting it is the value EVOLVING with age, not
      //     disagreeing with a fabricated seed.
      // ⚠️ hybridScore is DELIBERATELY ABSENT (Langston-ruled honest-null, carved out): its
      // admission source substitutes `confidence` via `?? extendedMetrics.confidence`
      // (signal-orchestrator.ts:1051) and BOTH refresh paths repeat the same fallback and
      // write it back — so a substituted confidence is indistinguishable from a real hybrid
      // score at every downstream point, including here. Capturing it would bake that
      // substitution into the calibration record. Removing the fallback changes ADMISSION
      // behaviour and is its own scoped item; absent stays absent until then.
      regimeWeight: input.regimeWeight,
      decayPenalty: input.decayPenalty,
    };

    // Insert new signal with pre-computed metrics from SQE
    // Directive 8.8.4-A3.R1: Store with normalized pair key
      // R9.3-C: expiresAt removed - lifecycle governed by SQE, not TTL
    const insertData: InsertRtbSignal = {
      mode: input.mode,
      signalId: input.signalId,
      symbol: normalizedSymbol,
      strategy: input.strategy as any,
      entryPrice: input.entryPrice.toString(),
      stopPrice: input.stopPrice.toString(),
      targetPrice: input.targetPrice?.toString(),
      quantity: input.quantity?.toString(),
      notional: input.notional?.toString(),
      confidence: input.confidence.toString(), // P19-B3b: deterministic confidence (NGC retired, Directive 12.3.3)
      riskScore: input.riskScore.toString(),
      expectedReturn: input.profitRate.toString(),
      // ★ B-RETIRED-SCORE-REMOVAL (#558, A1): finalScore column write REMOVED (column is now
      // nullable; dropped in Phase B). Ranking is the live r_multiple key, not this stored score.
      // P19-B3b: removed dead `ngc:` write — rtb_signals has NO ngc column (NGC
      // retired; the column was dropped). The write targeted a nonexistent column
      // (suppressed TS2353 in baseline). `confidence` captures the metric.
      currentPrice: input.currentPrice?.toString(), // Directive 8.8.4-C.14.A
      // B.1.5 (2026-05-30, pre-audit §5.2 Row-8): for xstock_spot the input's
      // `volume24h` is the UNDERLYING equity's share volume, not the token's —
      // a landmine for any future RTB-vs-volume admission/ranking wiring.
      // Skip-write null for xstock so the column is explicitly empty rather
      // than carrying a misleading value. Crypto path unchanged.
      volume24h: input.assetClass === 'xstock_spot' ? null : input.volume24h?.toString(), // Directive 8.8.4-C.14.A

      status: 'active', // Directive 8.8.4-A3.R8: Use 'active' for new signals pending first refresh
      queuedAt: now,
      // R9.3-C: expiresAt omitted - field is now optional
      blockReason: 'SQE_QUALIFIED', // Mark as SQE-qualified, not capacity-blocked
      metadata: enrichedMetadata as any,
      // B79.0n.RTB (2026-05-27, Phase 1 dual-write): populate first-class
      // asset_class column alongside metadata.assetClass. P19-B4a (A1.5): uses the
      // resolve-from-symbol-OR-THROW result computed above — no silent crypto_spot
      // default (CLAUDE.md §10). This is the column the A4 Phase-4 SET NOT NULL guards.
      assetClass: resolvedAssetClass,
      // reorg-B3 (#233): persist the at-queue Net-Expectancy EV inputs to the typed columns (NOT
      // metadata) so the open-gate reads the routing-time FX5 survivor snapshot directly. NULL-safe:
      // the input scalars are number|null|undefined → write NULL when absent. For crypto these come
      // from the FX5 pool entry; for xstock_spot the symbol is not in the crypto FX5 pool so both
      // are NULL → kernel documented defaults (an xstock-native EV-input source is future work, not
      // this batch — the columns are class-agnostic per D1, only the crypto source is wired here).
      diAtQueue: input.diAtQueue != null ? input.diAtQueue.toString() : null,
      dbsScoreAtQueue: input.dbsScoreAtQueue != null ? input.dbsScoreAtQueue.toString() : null,
      // P19-B7.2: persist the best-of-both maker/taker snapshot to the typed
      // rtb_signals columns (class-agnostic per D1 — both classes share the
      // decision). chosenNetEv is what the [11.8B] open-gate + B7.1 ranker read.
      chosenEntryMode: input.chosenEntryMode ?? 'taker',
      chosenNetEv: input.chosenNetEv != null ? input.chosenNetEv.toString() : null,
      takerNetEv: input.takerNetEv != null ? input.takerNetEv.toString() : null,
      makerNetEvAdjusted: input.makerNetEvAdjusted != null ? input.makerNetEvAdjusted.toString() : null,
    };

    // Directive 8.8.4-A3.R8: Log trace event for new signal insertion
    this.logRtbTrace(input.mode, normalizedSymbol, input.strategy, 'queued', 'active', 'insertion');

    // Phase 8.8.4-C.13.B: Use upsert to prevent duplicate key errors
    const signal = await storage.upsertRtbSignal(insertData);

    // P19-B8.5 (SWITCH-ON fix, found live 2026-07-15): warm the Kraken WS book at
    // QUEUE time for crypto. The [11.8B→#295] depth gate requires a live two-sided
    // mini-book BEFORE a position can open, but the only new-symbol subscription was
    // i8cSubscribeNewTrade AFTER trade creation — a strict ordering inversion: any
    // symbol not already subscribed (not an open position, not a broadcast staple)
    // fails DEPTH_GATE no_book on every promotion, forever (observed live: SYN/USD
    // organic + TRX/USD exploration both died there). The RTB queue IS the candidate
    // set for opens, and first promotion eligibility is ≥1 refresh (~30s) away — so
    // subscribing here gives the gate a warm book by the time it asks. Deduped via
    // the adapter's own live subscription state (getSubscribedSymbols — reconnect
    // clears it, so a post-reconnect re-queue re-subscribes correctly); xstock_spot
    // reads depth from the DB ticker snapshots instead (no WS book to warm);
    // fire-and-forget, never throws into the queue path.
    if (resolvedAssetClass === 'crypto_spot') {
      try {
        const { krakenWebSocketAdapter } = await import('../../exchanges/kraken/kraken-websocket-adapter.js');
        if (!krakenWebSocketAdapter.getSubscribedSymbols().includes(normalizedSymbol)) {
          krakenWebSocketAdapter.i8cSubscribeNewTrade(normalizedSymbol, 'rtb_queued');
        }
      } catch (subErr) {
        console.warn(`[P19-B8.5][RTB_BOOK_WARM] queue-time book subscribe failed for ${normalizedSymbol} (open will depth-gate on no_book until subscribed):`, subErr instanceof Error ? subErr.message : subErr);
      }
    }

    // A3.R9.0: Record queue add for performance metrics
    performanceMonitor.recordQueueAdd(1);
    
    // Directive 8.8.4-A3.R9.0.D: Trace RTB queue insertion
    diagnosticTrace.traceRTB(
      normalizedSymbol,
      input.strategy,
      true, // inserted
      { mode: input.mode, signalId: input.signalId }
    );


    // Get current pool size for warm-up tracking
    const poolSize = await this.getPoolSize(input.mode);

    console.log(`[8.8.4-C.5][RTB_INSERT] ${normalizedSymbol}/${input.strategy}: FinalScore=${(input.finalScore).toFixed?.(4) || '0'}, confidence=${input.confidence.toFixed(4)}, poolSize=${poolSize}`);
    
    // Directive 8.8.4-A3.R9.3-D: Simplified TCL - always check threshold on enqueue
    // Global barrier removed per R9.3-A (per-signal refresh model)
    await tclWatchdog.checkSignalThresholdLive(input.mode);
    
    return signal;
  }

  /**
   * Phase 8.8.4-C.5: Get the current pool size for a mode
   * Directive 8.8.4-A3.R8: Include active/reconfirmed/queued statuses
   * @returns Number of signals in RTB queue
   */
  async getPoolSize(mode: TradingMode): Promise<number> {
    const signals = await this.getQueuedSignals(mode);
    return signals.length;
  }

  /**
   * Phase 8.8.4-C.5 + C.6: Check if TCL (Trading Capacity Limit) is active
   * TCL activates when:
   * - Pool has accumulated ≥100 signals (normal activation), OR
   * - 5 minutes have passed since engine start (failsafe activation)
   * 
   * @param mode - Trading mode to check
   * @returns true if TCL is active
   */
  async isTCLActive(mode: TradingMode): Promise<boolean> {
    const poolSize = await this.getPoolSize(mode);
    const tclWarmupThreshold = getTclWarmupThreshold();

    // Normal activation: ≥threshold signals
    if (poolSize >= tclWarmupThreshold) {
      console.log(`[8.8.4-C.5][TCL_ACTIVATE] mode=${mode}, poolSize=${poolSize} >= ${tclWarmupThreshold}, TCL is active`);
      return true;
    }

    // Phase 8.8.4-C.6: Check 5-minute failsafe
    const engineStartTime = this.engineStartTimes.get(mode);
    if (engineStartTime) {
      const elapsedMs = Date.now() - engineStartTime;
      if (elapsedMs >= TCL_FAILSAFE_MS) {
        // Failsafe triggered
        if (!this.tclFailsafeTriggered.get(mode)) {
          this.tclFailsafeTriggered.set(mode, true);
          console.log(`[8.8.4-C.6][TCL_FALLBACK_TRIGGER] mode=${mode}, elapsed=${(elapsedMs/1000).toFixed(0)}s >= 300s, activating TCL via failsafe`);
        }
        console.log(`[8.8.4-C.6][TCL_FALLBACK_ACTIVATE] mode=${mode}, poolSize=${poolSize}, TCL active via 5-minute failsafe`);
        return true;
      } else {
        const remainingMs = TCL_FAILSAFE_MS - elapsedMs;
        console.log(`[8.8.4-C.5][TCL_WARMUP] mode=${mode}, poolSize=${poolSize}/${tclWarmupThreshold}, failsafe in ${(remainingMs/1000).toFixed(0)}s`);
      }
    } else {
      console.log(`[8.8.4-C.5][TCL_WARMUP] mode=${mode}, poolSize=${poolSize}/${tclWarmupThreshold}, TCL not yet active (no engine start time)`);
    }
    
    return false;
  }

  /**
   * Phase 8.8.4-C.5 + C.6: Get TCL warm-up status
   * @returns Object with pool size, threshold, active status, and failsafe info
   */
  async getTCLStatus(mode: TradingMode): Promise<{
    poolSize: number;
    threshold: number;
    isActive: boolean;
    progressPercent: number;
    failsafeEnabled: boolean;
    failsafeTriggered: boolean;
    failsafeRemainingMs: number | null;
  }> {
    const poolSize = await this.getPoolSize(mode);
    const engineStartTime = this.engineStartTimes.get(mode);
    const failsafeTriggered = this.tclFailsafeTriggered.get(mode) || false;
    
    let failsafeRemainingMs: number | null = null;
    let isActiveViaFailsafe = false;
    
    if (engineStartTime) {
      const elapsedMs = Date.now() - engineStartTime;
      if (elapsedMs >= TCL_FAILSAFE_MS) {
        isActiveViaFailsafe = true;
        failsafeRemainingMs = 0;
      } else {
        failsafeRemainingMs = TCL_FAILSAFE_MS - elapsedMs;
      }
    }
    
    const tclWarmupThreshold = getTclWarmupThreshold();
    const isActiveViaThreshold = poolSize >= tclWarmupThreshold;
    const isActive = isActiveViaThreshold || isActiveViaFailsafe;
    const progressPercent = Math.min(100, (poolSize / tclWarmupThreshold) * 100);

    return {
      poolSize,
      threshold: tclWarmupThreshold,
      isActive,
      progressPercent: Math.round(progressPercent * 10) / 10,
      failsafeEnabled: engineStartTime !== undefined,
      failsafeTriggered,
      failsafeRemainingMs,
    };
  }
}

export const readyToBuyService = new ReadyToBuyService();

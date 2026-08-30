/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.0E — Paper Execution Engine
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * DIRECTIVE 11.0E: FinalScore Unification
 * - Signal quality checks use FinalScore exclusively
 * - MIN_FINAL_SCORE threshold is the canonical quality gate
 * 
 * ============================================================================
 * PRICE PIPELINE DOCUMENTATION (Goal A1)
 * ============================================================================
 * 
 * This file documents how live prices flow from Kraken into active trade
 * exit evaluation and the Active Trades UI.
 * 
 * 1. PRICE SOURCE (Kraken WebSocket)
 *    - KrakenWebSocketAdapter connects to wss://ws.kraken.com
 *    - Subscribes to ticker channel for each active trade symbol
 *    - On tick arrival: calls livePricingAdapter.updateCache(symbol, price, source)
 *    - Updates priceCache Map in LivePricingAdapter
 * 
 * 2. PRICE CACHING (LivePricingAdapter.priceCache)
 *    - Map<symbol, CachedPrice> where CachedPrice includes:
 *      { symbol, price, timestamp, source, cachedAt }
 *    - source can be: 'kraken_ws' | 'kraken_rest' | 'binance' | 'coingecko' | 'last_known_good'
 *    - Cache TTL is 1 second for open-trade symbols (CACHE_TTL_MS = 1000)
 * 
 * 3. ENGINE CONSUMPTION (checkOpenPositions)
 *    - Runs every 1.5 seconds via monitoringInterval
 *    - For each open position, calls:
 *        livePricingAdapter.getPriceWithFallback(symbol, 2000)
 *    - Uses WebSocket cache if fresh (≤2s)
 *    - Falls back to Kraken REST if cache stale
 *    - Evaluates SL/TP against fetched price
 * 
 * 4. API EXPOSURE (/api/active-engine/active-trades)
 *    - For each position, calls:
 *        livePricingAdapter.getPriceWithFallback(symbol, 5000)
 *    - Returns: currentPrice, priceSource, priceAgeMs
 *    - Frontend polls this endpoint every 10 seconds
 * 
 * 5. FRONTEND REFRESH (active-trades-v2.tsx)
 *    - Uses useQuery with refetchInterval: 10000 (10 seconds)
 *    - Displays currentPrice from API response
 * 
 * ============================================================================
 */

import { storage } from '../storage';
import { tradingModeToRunMode } from './run-mode-controller.js'; // ITEM-4 step 2: single-site mode map
import { PaperOrderPlacer } from './execution/order-placer.js'; // P19-B3a: typed order-placement port
import type { OrderPlacer } from './execution/types.js'; // P19-B3a: FillResult/port contract
import { KrakenService } from '../exchanges/kraken/kraken.js';
// B72 (2026-05-05): MONITOR_INTERVAL_MS + CONTINUOUS_PROMOTION_INTERVAL_MS
// moved to module='active_execution'.
import { getCachedNumberRequired, getCachedConstant, GLOBAL_KEY } from './module-constants-service.js';
// B65.2: centralized exit-decision primitive shared with VTS
import { evaluateTECExit } from './tec-evaluator';
// P19-B4a (C4): top-level resolveAssetClass dropped — all sites now prefer the
// stamp (asValidAssetClass) then fall through to safeResolveAssetClass (skip on null).
import { asValidAssetClass, safeResolveAssetClass, type AssetClass } from '../../shared/asset-classes.js';
// B-WS-SUBSCRIBE-CLASS-FILTER OBJ-2 (#559): per-process dedup for the class-less-row WARN in the
// I8C open-positions provider, so a persistently class-less row surfaces once, not every 5s audit.
const wsSubClasslessWarned = new Set<string>();
// P19-B8.4b: active-path funnel — the `promoted` counter (signal promoted out of the RTB queue to an open
// attempt). Single home for `promoted` (the refresh reconfirmed/rejected live in ready_to_buy_service).
import { recordActiveRtbRefresh } from '../core/observability/active-funnel-tracker.js';
import { StrategyEngine, type StrategySignal, type TechnicalIndicators } from './strategy-engine';
import { checkGuardrailRisk, type TradeCandidate, type TradeSafetyResultCode } from './trade-safety';
import { buildSettingsFromGuardrails, calculateRiskAmount } from './guardrail-settings';
import type { TradingSettings, PriceData, InsertExecutionAttemptAudit, GuardrailsV2 } from '@shared/schema';
import { contextBridge } from './context-bridge';
import { activeFilterPool, type ActiveFilteredPair } from './active-filter-pool';
import { sizeActivePositionForSignal, validateActivePortfolioValue, type StrategyType } from './active-position-sizing';
// B67.3 follow-up: re-export the cohort-hash function under a clearer name for use
// at trade-open. Same FNV-1a hash the admission gate uses — keeping a single source.
import { assignCohortHash as assignCohortHashForPersistence } from './per-underlying-cap';
// B67.2.1: read regime confidence + macro modifier + phase from MCE at trade-open
import { getMarketContextEngine } from './market-context-engine';
import { aj16Diagnostic } from './aj16-rtb-diagnostic';
import { aj17DiagnosticRunner } from './aj17-diagnostic-runner';
import { aj18Diagnostic } from './aj18-rtb-diagnostic';
import { aj19bDiagnostic } from './aj19b-lifecycle-diagnostic';
import { aj19Diagnostic } from './aj19-max-position-diagnostic';
import { livePricingAdapter, isKrakenVenueSource, type PriceProducer } from './live-pricing-adapter';
import { krakenWebSocketAdapter } from '../exchanges/kraken/kraken-websocket-adapter.js';
import { b4Diagnostics } from './b4-diagnostics.js';
import { b5SizingAudit } from './b5-sizing-audit.js';
import { i1RtbDiagnostics } from './i1-rtb-diagnostics-service.js';
import { i1TradeLifecycleDiagnostics } from './i1-trade-lifecycle-diagnostics.js';
import { rtbMetricsService, type OpenFailStage } from './rtb-metrics-service.js';
// [11.8B] shadow conversion: pure disposition routing, unit-fenced label integrity.
import { resolveEvBlockDisposition } from './ev-block-disposition.js';
import { emitEvReject } from './data-archive/switch-on-evidence-sink.js';

/**
 * P19-B6.5e: the typed result of an open attempt. Replaces `executeSimulatedTrade`'s
 * silent `void` + `executePromotedSignal`'s brittle trade-count-delta success inference.
 * Every post-guardrail early-exit now returns a labelled `{opened:false, stage, reason}`,
 * so a sized signal can NEVER again vanish unaccounted (the I3 invariant reconciles).
 */
export type OpenOutcome =
  | { opened: true; tradeId: string }
  | { opened: false; stage: OpenFailStage; reason: string };
import { normalizeToInternalSymbol, getKrakenRestPair } from '../markets/kraken-symbol-resolver.js';
import { priceTraceService } from './price-trace-service.js';
import { marketVolumeCache } from './market-volume-cache.js';
import { c5FinancialDiagnostics } from './c5-financial-diagnostics.js';

import { readyToBuyService } from '../core/rtb/ready_to_buy_service.js';
import { tclWatchdog } from '../core/rtb/tcl_watchdog.js';
import { eventBus, type TCLActivatedEvent, type TradeClosedEvent } from '../lib/event-bus.js';
import { dataAggregator } from './data-aggregator.js';
// P19-B4b.1: the flat-slippage constant is retired from the fill seam — the active
// paper fill now depth-walks the real book (Langston C-Q5: RNG-free, no magic %).
import { resolveFillDepthGateConfig } from './execution/depth-gate-config.js';
// P19-B8.5 (OBJ-8): real-venue well-formedness vetting for paper opens (paper-only leg).
import { roundQuantityForVenue } from '../core/calculations/venue-price-grid.js';
import { resolveVenueSizeLimits } from '../markets/venue-grid-resolver.js';
import { validatePaperOrderWithVenue } from './execution/venue-validate.js';
import {
  getDepthSnapshot,
  assessWarmth,
  assessSufficiency,
  getTickerWitness,
  recordDepthGateBlock,
  type DepthSnapshot,
} from './execution/depth-source.js';
// P19-B6.6 (#236): xStock price-discovery-liveness — the 2nd half of the fill-time
// "is the book real?" guard, called at the open seam AFTER the depth gate passes.
import { evaluateXstockPriceLiveness } from '../asset_classes/xstock_spot/price-liveness.js';
// B-4.5: fees are DB-governed per asset class — resolved per symbol at the
// fill sites via the single cost-model merge (no static fee field).
import { getFrictionForAssetClass } from '../core/math/cost-model.js';
// B-COST-MATH-CONSOLIDATION: the SINGLE source of trade P&L arithmetic (was inlined here).
import { computeRealizedPnl } from '../core/math/trade-pnl.js';
// P19-B7.2c: the pending-maker hard-drop timeout (per-class, fail-hard, load-time invariant).
import { resolveMakerMaxPendingMs } from './maker-taker-config.js';
// P19-B7.2c (R3): the xStock hard-drop must not fire inside the weekend-closed window.
import { isXstockMarketOpenUTC } from '../asset_classes/xstock_spot/market-hours.js';
// P19-B7.2c: the shared PURE pending-maker fill/drop decision (paper+VTS parity — R2).
import { evaluatePendingMaker, makerFillPrice, isMarketableAtPlacement } from '../core/trading/pending-maker-logic.js';
import { getLatestEquityTick } from './passive-archive/equity-spot-archiver.js'; // P19-B8.5 xstock marks — the equities-feed venue leg
import { markKindOf } from './market-data/mark-kind.js'; // B-EXIT-BOOK-AGE-STAMP P1 — the one mid-or-last predicate
// P19-B8.5e (`#548`) — risk-derived per-symbol mark-staleness ceiling. The POLICY is pure
// (`mark-staleness`); the σ MEASUREMENT is cached (`sigma-rate-cache`) so the exit path
// never awaits a DB read to decide whether a mark is trustworthy.
import { computeStalenessCeiling, type MarkStalenessConfig } from '../asset_classes/xstock_spot/mark-staleness.js';
import { getCachedSigma, ensureSigmaFresh, type SigmaCacheConfig } from '../asset_classes/xstock_spot/sigma-rate-cache.js';

/**
 * PURE — chooses the price-skip alert copy. Extracted so the BRANCH is testable without a
 * database or an engine instance (Analyst's ruling 2026-07-22: *"don't pin the wording, DO
 * pin the branch"* — a test asserting exact message text fights the next person who
 * improves it and fails for the RIGHT change; the branch is the part that carries meaning).
 *
 * ★ THE DISTINCTION THIS EXISTS TO PRESERVE: a staleness REJECTION (a price exists, it is
 * older than the ceiling) and a genuine ABSENCE (no price at all) are different facts and
 * must not share wording. The old copy asserted the absence case for BOTH, claiming *"the
 * position cannot be exited"* while the venue was quoting at 40-156s — a capability claim
 * the evidence falsified, which sent readers hunting a feed that was not broken.
 */
export function buildPriceSkipAlertCopy(input: {
  symbol: string; mode: string; streak: number; reason: string; detail?: string;
}): { title: string; body: string; isStaleReject: boolean } {
  const isStaleReject = input.reason.startsWith('equity_tick_stale');
  const cause = isStaleReject
    ? `the most recent mark was older than this symbol's freshness ceiling${input.detail ? ` (${input.detail})` : ''}, so it was not trusted for a stop/target decision`
    : `neither the Kraken live feed nor the Kraken direct query returned a usable price (${input.reason})`;
  const consequence = isStaleReject
    // TRUE: we declined to act on THIS tick. NOT "cannot be exited" — the venue may well be
    // quoting, just not recently enough for the ceiling.
    ? `Exit evaluation resumes automatically on the next tick inside the ceiling. This does NOT mean the venue is down or the position is unexitable — check the mark age against the ceiling before investigating the feed.`
    : `The position cannot be evaluated against a venue price until the venue quotes again. If this persists, investigate the feed/subscription for this pair.`;
  return {
    isStaleReject,
    title: isStaleReject
      ? `Exit checks skipped — mark older than ceiling for ${input.symbol}`
      : `Open position unmanageable — no Kraken price for ${input.symbol}`,
    body: `The exit monitor has skipped ${input.streak} consecutive ticks for the open ${input.mode} position on ${input.symbol} because ${cause}. ${consequence}`,
  };
}
import { covarianceEngine } from '../utils/covariance-engine.js';
import { recordPaperTrade, type PaperTradeRecord } from './vts-live-comparison-audit.js';
import { evaluateTradeExpectancy } from '../core/calculations/expectancy.js';
// HF9: applyGovernance + getGovernanceStateForUI removed (dead imports — never called in function body)
import { getCachedStability, computeGlobalStability } from '../core/governance/regime-stability.js';
import { isStrategyEligible, logGovernanceBlock } from '../core/governance/strategy-eligibility.js';
import { getStrategyDependency, type RegimeStability } from '../config/strategy-governance.js';
import { INTERIM_NO_POSTURE_MODE, type StrategyMode, type StrategyModeOverlay } from '../core/governance/strategy-modes.js';

interface ExitCondition {
  type: 'target_hit' | 'stop_hit' | 'trailing_stop_hit' | 'max_holding_period' | 'guardrail' | 'manual_stop';
  price?: number;
  reason: string;
}

// Phase 8.8.3-AJ8: Session tracking for RTB metrics reset
// Metrics only count from session start - resetting when engine stops
const engineSessionStart: Map<string, Date | null> = new Map();

export function getEngineSessionStart(mode: 'live' | 'paper'): Date | null {
  return engineSessionStart.get(mode) || null;
}

export class ActiveExecutionEngine {
  private mode: 'live' | 'paper'; // Phase 27.F.15.B.2: Mode-based only, global per mode
  private isRunning: boolean = false;
  private isCycleRunning: boolean = false; // Re-entrancy guard
  private krakenService: KrakenService;
  private strategyEngine: StrategyEngine;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private priceHistory: Map<string, PriceData[]> = new Map();
  private lastCycleSummary: any = {}; // Phase 27.F.14.DIAG: Cache last cycle for telemetry
  // P19-B3a: typed order-placement boundary (paper = atomic slippage+fee fill). The ONLY
  // thing that differs paper↔live is HOW an order fills; see execution/types.ts + order-placer.ts.
  private readonly orderPlacer: OrderPlacer;

  // Configuration
  // P19-B4b.1: the flat SLIPPAGE_PERCENT (0.05%) is RETIRED from the fill seam — the
  // active paper fill depth-walks the real order book (no flat constant on the active
  // path; Langston C-Q5 RNG-free / no-magic-% discipline).
  // B-4.5: FEE_PERCENT static field RETIRED — per-class DB-resolved per symbol.
  private feePercentFor(symbol: string, assetClass?: AssetClass): number {
    // P19-B6.5d (OBJ-4): prefer the CARRIED stamp threaded by the caller (collision-correct
    // fee tier); safe-resolve from the symbol only as a fallback. Money-boundary leaf —
    // sites 7/8/9 skip BEFORE a position can open, so a null here (neither stamp nor resolve)
    // is a broken invariant (stamp lost between sizing and fill): assert-unreachable, never
    // silently return fee=0.
    const _cls = assetClass ?? safeResolveAssetClass(symbol, 'kraken');
    if (_cls === null) {
      throw new Error('[P19-B4a][C4][INVARIANT] feePercentFor reached with unclassifiable ' + symbol + ' — sites 7/8/9 should have skipped upstream (stamp lost between sizing and fill)');
    }
    return getFrictionForAssetClass(_cls).feeRateTaker * 100;
  }

  /**
   * P19-B4b.1 (#295): the 24/5 book-depth-sufficiency + warmth gate for an OPEN,
   * replacing the B4a-C3 RTH liquid-fill-window clock proxy. Per-class, DB-resolved,
   * FAIL-CLOSED: missing config / no book / stale book / thin book / insufficient
   * depth → block the open (the caller skips loudly). On pass, returns the depth
   * snapshot so the placer walks the SAME book the gate just measured (single fetch).
   */
  private async _evaluateOpenDepthGate(
    symbol: string,
    assetClass: AssetClass,
    orderNotional: number,
  ): Promise<{ pass: boolean; reason: string; snapshot: DepthSnapshot | null }> {
    const config = await resolveFillDepthGateConfig(assetClass);
    if (!config) return { pass: false, reason: 'depth_gate_config_missing', snapshot: null };
    const snapshot = await getDepthSnapshot(symbol, assetClass);
    const warmth = assessWarmth(snapshot, 'asks', config);
    if (!warmth.warm || !snapshot) return { pass: false, reason: warmth.reason, snapshot: null };
    const suff = assessSufficiency(snapshot, 'asks', orderNotional, config);
    if (!suff.sufficient) return { pass: false, reason: suff.reason, snapshot };
    return { pass: true, reason: 'ok', snapshot };
  }
  // B72: monitoring interval read at setInterval start from module='active_execution'.
  private get MONITOR_INTERVAL_MS(): number {
    return getCachedNumberRequired('active_execution', 'monitoring_interval_ms',
      { exchange: '*', assetClass: '*', strategy: '*', regime: '*' });
  }
  private readonly MAX_PRICE_HISTORY = 100; // Keep last 100 candles per symbol
  private readonly RTB_TTL_SECONDS = 30; // REB 8.8.3-I: RTB signals expire after one FX5 cycle (30 seconds)
  
  // Phase 8.8.3-B3.5: Diagnostic counter for price tick cadence verification
  private readonly MAX_PRICE_TICK_LOGS = 100;
  private priceTickLogs: Array<{ symbol: string; refreshedAt: string; diffMs: number }> = [];
  private lastPriceTickTime: Map<string, number> = new Map();

  // ── P19-B8.5 (venue-only pricing, Langston condition 1 — the SKIP-THIS-TICK safety
  // rail). Skipping a tick when the venue quotes nothing is correct; a position whose
  // venue feed stays dark on BOTH WS and REST is genuinely unmanageable for that
  // window, and that must not fail silently. Per-position consecutive-skip streak;
  // crossing the DB-knobbed threshold raises a §10.5 system alert (deduped per
  // symbol), not a buried log line. Streak resets on the first venue price.
  private _priceSkipStreak: Map<string, number> = new Map();

  /**
   * P19-B8.5e — σ-cache tuning, DB-governed like the policy knobs it serves.
   *
   * These are NOT cosmetic: `sigma_window_ms` materially determines the σ the ceiling is
   * derived from, and `sigma_max_age_ms` is the fail-closed bound (past it a cached σ is
   * DROPPED, so the ceiling falls to the floor rather than widening off a stale statistic).
   * No hardcoded fallbacks — a missing knob throws to the caller's fail-safe skip (§5).
   */
  private _sigmaCacheCfg(minObservations: number): SigmaCacheConfig {
    const at = { exchange: '*', assetClass: 'xstock_spot' as const, strategy: '*', regime: '*' };
    return {
      windowMs: getCachedNumberRequired('mark_staleness', 'sigma_window_ms', at),
      refreshAfterMs: getCachedNumberRequired('mark_staleness', 'sigma_refresh_after_ms', at),
      maxAgeMs: getCachedNumberRequired('mark_staleness', 'sigma_max_age_ms', at),
      minObservations,
      classwidePercentile: getCachedNumberRequired('mark_staleness', 'sigma_classwide_percentile', at),
      queryTimeoutMs: getCachedNumberRequired('mark_staleness', 'sigma_query_timeout_ms', at),
    };
  }

  /**
   * ★ THE MESSAGE MUST NOT CLAIM MORE THAN IT KNOWS (Analyst + Langston, 2026-07-22).
   * This alert previously asserted two things that were FALSE for the staleness case:
   * *"neither the live feed nor the direct query returned a usable price"* and *"the
   * position cannot be exited until the venue quotes again."* Measured while it was firing
   * on six symbols: every one had a mark **40-156s old** — the venue WAS quoting, and a
   * price DID exist. It was REJECTED as too old, which is a different fact with a different
   * response. **"Cannot be exited" is a claim about CAPABILITY; "the mark is older than the
   * ceiling" is what is actually known** — and an operator who reads the first one goes
   * hunting a dead feed that isn't dead. `detail` carries the two numbers (mark age and the
   * ceiling it crossed) so the reader can judge without re-querying.
   */
  private async _recordPriceSkip(position: { id: string; symbol: string; assetClass?: unknown }, reason: string, detail?: string): Promise<void> {
    const streak = (this._priceSkipStreak.get(position.id) ?? 0) + 1;
    this._priceSkipStreak.set(position.id, streak);
    let threshold = 40; // fail-safe default if the knob is cold — ~1 min at the monitor cadence
    try {
      const _cls = asValidAssetClass(position.assetClass) ?? safeResolveAssetClass(position.symbol, 'kraken') ?? 'crypto_spot';
      threshold = getCachedNumberRequired('exit_integrity', 'max_consecutive_price_skips',
        { exchange: '*', assetClass: _cls, strategy: '*', regime: '*' });
    } catch { /* knob cold — the default above stands; the alert still fires */ }
    if (streak === threshold) {
      // A staleness REJECTION and a genuine ABSENCE are different facts and get different
      // words. `reason` already discriminates them, so branch on it rather than asserting
      // the worse of the two for both.
      const _copy = buildPriceSkipAlertCopy({ symbol: position.symbol, mode: this.mode, streak, reason, detail });
      console.error(`[P19-B8.5][PRICE_SKIP_ESCALATION] ${position.symbol}: ${streak} consecutive exit-monitor ticks not evaluated (${reason}${detail ? `; ${detail}` : ''}) — raising system alert`);
      try {
        const { addAlert } = await import('./system-alerts.js');
        await addAlert({
          triggers_at: new Date(),
          category: 'breakage',
          severity: 'warning',
          title: _copy.title,
          body: _copy.body,
          dedupe_key: `price-skip-${this.mode}-${position.symbol}`,
        });
      } catch (alertErr) {
        console.error(`[P19-B8.5][PRICE_SKIP_ESCALATION] alert raise failed (the loud log above stands):`, alertErr instanceof Error ? alertErr.message : alertErr);
      }
    }
  }

  // I7-ROOT-FIX: minimal engine status diagnostics
  private lastEvaluateAt: number | null = null;
  private lastCycleAt: number | null = null; // Phase 8.8.3-I7-PM-FOCUS: Track monitoring cycle tick
  private lastExitChecks: {
    symbol: string;
    slotNumber?: number;
    price: number;
    priceSource: string;
    evaluatedAt: string;
    triggeredExit: boolean;
  }[] = [];

  // Phase 8.8.4-C.12: Event handler references for cleanup
  private tclActivatedHandler: ((event: TCLActivatedEvent) => void) | null = null;
  private tradeClosedHandler: ((event: TradeClosedEvent) => void) | null = null;

  // Directive 8.8.8: Continuous promotion loop interval (30 seconds)
  private continuousPromotionInterval: NodeJS.Timeout | null = null;
  // B72: RTB-promotion loop interval from module='active_execution'.
  private get CONTINUOUS_PROMOTION_INTERVAL_MS(): number {
    return getCachedNumberRequired('active_execution', 'rtb_promotion_loop_interval_ms',
      { exchange: '*', assetClass: '*', strategy: '*', regime: '*' });
  }

  constructor(mode: 'live' | 'paper') {
    this.mode = mode;
    this.krakenService = new KrakenService();
    this.strategyEngine = new StrategyEngine();
    // P19-B4b.1: inject ONLY the per-class fee resolver — the placer depth-walks the
    // real book passed on each request (no flat slippage% to inject anymore), so the
    // port stays decoupled from this engine.
    this.orderPlacer = new PaperOrderPlacer((s, ac) => this.feePercentFor(s, ac)); // P19-B6.5d (OBJ-4): thread the carried class to the fill-fee resolver
  }

  /**
   * Phase 8.8.4-C.12: Bind event listeners for TCL activation and trade close
   * These events trigger RTB queue promotion checks
   */
  private bindTCLEventListeners(): void {
    // Handler for TCL_ACTIVATED - triggers first promotion check
    this.tclActivatedHandler = async (event: TCLActivatedEvent) => {
      if (event.mode !== this.mode) return;
      console.log(`[8.8.4-C.12][EVENT_RECEIVED] TCL_ACTIVATED for ${this.mode}, reason=${event.reason}`);
      await this.checkRtbPromotion();
    };

    // Handler for TRADE_CLOSED - triggers promotion when capacity freed
    this.tradeClosedHandler = async (event: TradeClosedEvent) => {
      if (event.mode !== this.mode) return;
      console.log(`[8.8.4-C.12][EVENT_RECEIVED] TRADE_CLOSED for ${this.mode}, symbol=${event.symbol}`);

      // P19-B6: daily loss-budget evaluation on every closed trade. TICK-DEFERRED (setImmediate,
      // not merely no-await) so it runs AFTER this event frame unwinds + any close-path locks
      // release — and FIRE-AND-FORGET so it can never block or throw into the close/event path.
      // The evaluator is gated on isEngineActive (dormant in VTS/passive) and self-guards
      // re-entrancy via the in-memory killInProgress latch (the kill flatten re-emits TRADE_CLOSED).
      const _dlbMode = this.mode;
      setImmediate(() => {
        void import('./daily-loss-budget.js')
          .then(({ evaluateDailyLossBudgetOnClose }) => evaluateDailyLossBudgetOnClose(_dlbMode))
          .catch((err: any) => console.error('[DailyLossBudget] hook dispatch error:', err?.message ?? err));
      });

      await this.checkRtbPromotion();
    };

    eventBus.onTCLActivated(this.tclActivatedHandler);
    eventBus.onTradeClosed(this.tradeClosedHandler);
    console.log(`[8.8.4-C.12][EVENT_BIND] Bound TCL_ACTIVATED and TRADE_CLOSED listeners for ${this.mode}`);

    // Directive 8.8.8: Start continuous promotion loop
    this.startContinuousPromotionLoop();
  }

  /**
   * Directive 8.8.8: Continuous Promotion Loop
   * Runs every 30 seconds to check for RTB promotion when TCL is active
   * Ensures signals are promoted even when no TRADE_CLOSED events occur
   */
  private startContinuousPromotionLoop(): void {
    if (this.continuousPromotionInterval) {
      clearInterval(this.continuousPromotionInterval);
    }

    this.continuousPromotionInterval = setInterval(async () => {
      if (!this.isRunning) return;

      const tclActive = tclWatchdog.isActive(this.mode);
      if (!tclActive) return;

      const openPositions = await storage.getActiveOpenPositions(this.mode);
      const modeSettings = await buildSettingsFromGuardrails(this.mode);
      // P19-B8.7 (OBJ-3, Langston safe-degrade constraint): the `|| 15` fallback is
      // GONE — a failed guardrails read must never silently substitute a concurrency
      // cap. Unreadable cap → HALT admissions for this tick, loudly, and the loop
      // stays alive (skip, not throw).
      const maxTrades = Number(modeSettings.maxOpenTrades);
      if (!Number.isFinite(maxTrades) || maxTrades <= 0) {
        console.error(`[P19-B8.7][GUARDRAIL_READ_FAIL:${this.mode}] max_open_positions unreadable (${maxTrades}) — ADMISSIONS HALTED this tick (safe-degrade, no fabricated cap). Seed/repair guardrails_v2.`);
        return;
      }
      const openSlots = maxTrades - openPositions.length;

      const rtbCount = await readyToBuyService.getPoolSize(this.mode);

      if (openSlots > 0 && rtbCount > 0) {
        console.log(`[8.8.8][TCL_LOOP] ${openSlots} slots free, checking ${rtbCount} RTB signals for promotion`);
        await this.checkRtbPromotion();
      }
    }, this.CONTINUOUS_PROMOTION_INTERVAL_MS);

    console.log(`[8.8.8][TCL_LOOP] Started continuous promotion loop (${this.CONTINUOUS_PROMOTION_INTERVAL_MS / 1000}s interval) for ${this.mode}`);
  }

  /**
   * Directive 8.8.8: Stop continuous promotion loop
   */
  private stopContinuousPromotionLoop(): void {
    if (this.continuousPromotionInterval) {
      clearInterval(this.continuousPromotionInterval);
      this.continuousPromotionInterval = null;
      console.log(`[8.8.8][TCL_LOOP] Stopped continuous promotion loop for ${this.mode}`);
    }
  }

  /**
   * Phase 8.8.4-C.12: Unbind event listeners on engine stop
   */
  private unbindTCLEventListeners(): void {
    if (this.tclActivatedHandler) {
      eventBus.offTCLActivated(this.tclActivatedHandler);
      this.tclActivatedHandler = null;
    }
    if (this.tradeClosedHandler) {
      eventBus.offTradeClosed(this.tradeClosedHandler);
      this.tradeClosedHandler = null;
    }
    // Directive 8.8.8: Stop continuous promotion loop on engine stop
    this.stopContinuousPromotionLoop();
    console.log(`[8.8.4-C.12][EVENT_UNBIND] Unbound TCL event listeners for ${this.mode}`);
  }

  async start(source: 'api' | 'internal' | 'unknown' = 'unknown'): Promise<void> {
    // Phase 8.8.3-B9.FIX-WS-START: Diagnostic log on start
    console.log('[DEBUG-B9][ENGINE_START_CALLED]', {
      mode: this.mode,
      wasAlreadyRunning: this.isRunning,
      timestamp: new Date().toISOString(),
      source,
    });
    
    // Directive 8.8.4-A3.R9.0.B: Prevent redundant engine starts
    if (this.isRunning) {
      console.warn(`[A3.R9.0.B][GUARD] Engine already active for mode=${this.mode}. Skipping redundant start.`);
      console.log(`[PaperExecution:${this.mode}] Already running`);
      // Phase 8.8.3-I6-FIX: Ensure mode is correct even on idempotent call
      livePricingAdapter.setTradingMode(this.mode);
      return;
    }

    this.isRunning = true;
    
    // Directive 8.8.4-A3.R9.0.B: Log valid activation with accurate provenance
    console.log(`[A3.R9.0.B][ENGINE_START] Activated (source=${source}, PID=${process.pid}, mode=${this.mode})`)
    
    // Phase 8.8.3-I6-FIX: Set trading mode for correct WebSocket broadcasts
    livePricingAdapter.setTradingMode(this.mode);
    console.log(`[8.8.3-I6-FIX][ENGINE_START] Trading mode set to ${this.mode}`);
    
    // Phase 8.8.3-AJ8: Set session start timestamp for RTB metrics
    // Metrics only count from this point forward (reset behavior)
    const sessionStartTime = new Date();
    engineSessionStart.set(this.mode, sessionStartTime);
    console.log(`[AJ8][SESSION_START] mode=${this.mode}, sessionStart=${sessionStartTime.toISOString()}`);
    
    // Phase 8.8.3-AJ17: Start diagnostic session to capture all AJ16 logs
    aj17DiagnosticRunner.startSession(this.mode);
    
    // Phase 8.8.3-AJ18: Start starvation diagnostic session
    aj18Diagnostic.startSession(this.mode);
    
    console.log(`[PaperExecution:${this.mode}] Starting paper trading engine`);

    // Phase 8.8.3-B3.6: Start Kraken WebSocket adapter for real-time prices
    try {
      await krakenWebSocketAdapter.start();
      console.log(`[PaperExecution:${this.mode}] Kraken WebSocket adapter started`);
      
      // Phase 8.8.3-I8C: Set up open positions provider for reconnect and audit
      const mode = this.mode;
      krakenWebSocketAdapter.setI8COpenPositionsProvider(async () => {
        const positions = await storage.getActiveOpenPositions(mode);
        // ★ B-WS-SUBSCRIBE-CLASS-FILTER OBJ-2 (#559): the CRYPTO Kraken WS feed serves ONLY
        // crypto_spot. This provider is the ONE confirmed source of the 5s subscription storm —
        // i8cRunSubscriptionAudit reads it, and before this filter it returned ALL open positions
        // incl. xStocks, which can never map on the crypto feed, so each was flagged
        // missing_subscription and re-subscribed every 5s (~133k futile SUBSCRIBE_SKIPPED/day).
        // Filter here using the AUTHORITATIVE stored asset_class — NOT re-resolved from the bare
        // symbol, which is ambiguous for plain-form xStock (e.g. `C/USD` carries no x-suffix and is
        // indistinguishable from crypto by string alone; the trustworthy class is stamped on the row
        // at insert with the correct exchange context). Idiom matches :308/:1030 (stamp → resolve →
        // default) EXCEPT the null/unresolvable branch emits a deduped WARN instead of silently
        // defaulting to crypto: a class-less crypto row must be surfaced, not guessed (Langston OBJ-2).
        const cryptoSymbols: string[] = [];
        for (const p of positions) {
          let cls = asValidAssetClass(p.assetClass) ?? safeResolveAssetClass(p.symbol, 'kraken');
          if (!cls) {
            cls = 'crypto_spot';
            if (!wsSubClasslessWarned.has(p.symbol)) {
              wsSubClasslessWarned.add(p.symbol);
              console.warn(`[B-WS-SUBSCRIBE-CLASS-FILTER][CLASSLESS] symbol=${p.symbol} mode=${mode} has no valid asset_class and did not resolve — defaulting to crypto_spot for WS subscription; this row should be class-stamped`);
            }
          }
          if (cls === 'crypto_spot') cryptoSymbols.push(p.symbol);
        }
        return cryptoSymbols;
      });
      
      // Phase 8.8.3-I8C: Subscribe ALL open positions on trading START using I8C helper
      const i8cResult = await krakenWebSocketAdapter.i8cSubscribeAllOpenPositions();
      if (i8cResult.count > 0) {
        console.log(`[8.8.3-I6-FIX][WS_SUB_AUDIT] openPositionCount=${i8cResult.count} subscribedSymbols=${JSON.stringify(i8cResult.subscribed)}`);
        console.log(`[PaperExecution:${this.mode}] Subscribed to ${i8cResult.count} open position symbols via I8C`);
      } else {
        console.log(`[8.8.3-I6-FIX][WS_SUB_AUDIT] openPositionCount=0 (no subscriptions needed at start)`);
      }
      
      // Phase 8.8.3-I8C: Start 5-second subscription health audit
      krakenWebSocketAdapter.startI8CSubscriptionAudit();
      console.log(`[PaperExecution:${this.mode}] I8C subscription audit started`);
    } catch (error) {
      console.error(`[PaperExecution:${this.mode}] WebSocket adapter start failed (continuing with REST fallback):`, error);
    }

    // Directive 8.8.4-A3.R2 #6: Clean up expired signals before starting refresh cycle
    try {
      const expiredCount = await readyToBuyService.cleanupExpiredSignals(this.mode);
      if (expiredCount > 0) {
        console.log(`[A3.R2][PaperExecution:${this.mode}] Cleaned ${expiredCount} expired signals on startup`);
      }
    } catch (cleanupError) {
      console.warn(`[A3.R2][PaperExecution:${this.mode}] Expired signal cleanup failed:`, cleanupError);
    }

    // ★ B-RTB-REFRESH-CONSOLIDATE OBJ-1 (#532, 2026-07-22): the 30s per-signal refresh cycle
    // (Mechanism A) is RETIRED — this starter is removed, not disabled (rule 18).
    // The RTB refresh is now driven SOLELY by the bucketed RTBRefreshService, which was built
    // (7a029f390, 2025-12-23) to REPLACE this path — decoupled from the scan loop for load,
    // with the longer refresh gap a weighed + accepted trade at that time (Kyle, 2026-07-22).
    // Running both was never the plan; A simply never got unplugged.

    // Directive 8.8.4-A3.R2: Set engine start time for TCL 2-minute failsafe (was 5 min)
    readyToBuyService.setEngineStartTime(this.mode);
    console.log(`[PaperExecution:${this.mode}] TCL failsafe timer started (2min failsafe)`);

    // Phase 8.8.4-C.12: Start TCL Watchdog with event-driven activation
    // R9.3.HF-1: Added explicit startup confirmation
    tclWatchdog.start(this.mode);
    console.log(`[A3.R9.3.HF-1][PaperExecution:${this.mode}] TCL Watchdog started (event-driven)`);
    console.log(`[A3.R9.3.HF-1] TCL and RTB subsystems initialized for mode=${this.mode}`);

    // Phase 8.8.4-C.12: Bind event listeners for TCL activation and trade close
    this.bindTCLEventListeners();

    // Directive 9.4: Initialize covariance engine with OHLC data for active symbols
    try {
      const watchlist = activeFilterPool.getActivePool(this.mode);
      const topSymbols = watchlist.slice(0, 20).map((p: ActiveFilteredPair) => p.symbol);
      let loadedCount = 0;
      if (topSymbols.length > 0) {
        for (const symbol of topSymbols) {
          try {
            // Convert internal symbol to Kraken REST pair format
            const krakenPair = getKrakenRestPair(symbol);
            const ohlcResult = await this.krakenService.getOHLCData(krakenPair, 60);
            if (ohlcResult?.ohlc?.length > 0) {
              const closes = ohlcResult.ohlc.map((c: any) => parseFloat(c.close));
              covarianceEngine.updateFromPrices(symbol, closes);
              loadedCount++;
            }
          } catch (err) {
            // Silently skip - individual symbol failures are not critical
          }
        }
        if (loadedCount >= 2) {
          covarianceEngine.computeCovarianceMatrix();
          covarianceEngine.computeCorrelationMatrix();
          // Import and call recalculateScores to update concentration metrics
          const { riskConcentrationAnalyzer } = await import('./risk-concentration.js');
          riskConcentrationAnalyzer.recalculateScores(this.mode); // P19-B4b D5: per-mode scores
          console.log(`[9.4][COV] Engine initialized with ${loadedCount}/${topSymbols.length} symbols`);
        } else {
          console.log(`[9.4][COV] Insufficient data (${loadedCount} symbols) - need >= 2 for correlation`);
        }
      }
    } catch (covError) {
      console.warn(`[9.4][COV] Engine initialization warning:`, covError);
    }

    // Broadcast engine start
    contextBridge.broadcast({
      type: 'trading_pipeline_event' as any,
      payload: {
        mode: this.mode,
        eventType: 'engine_started',
        message: `${this.mode} paper trading engine started`,
        timestamp: sessionStartTime.toISOString()
      }
    });

    // Start monitoring loop
    this.monitoringInterval = setInterval(async () => {
      await this.monitoringCycle();
    }, this.MONITOR_INTERVAL_MS);

    // Run initial cycle
    await this.monitoringCycle();
  }

  async stop(): Promise<void> {
    // Phase 8.8.3-B9.FIX-WS-START: Diagnostic log on stop
    console.log('[DEBUG-B9][ENGINE_STOP_CALLED]', {
      mode: this.mode,
      wasRunning: this.isRunning,
    });
    
    this.isRunning = false;

    // B-PROMOTION-RACE-FIX (#508, Langston N1): clear the single-flight latch fields on stop.
    // The isRunning guard already DECLINES a re-run on a stopped engine, but leaving
    // promotionRerunRequested=true lets the flag survive stop→start and fire one spurious
    // coalesced pass after the first promotion on the restarted engine. Harmless (idempotent,
    // every gate re-checked) but exactly the lifecycle residue §11 says not to leave.
    this.promotionInProgress = false;
    this.promotionRerunRequested = false;

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    // Phase 8.8.3-AJ8: Clear session start - RTB metrics reset to zero
    // When engine stops, session is cleared, next query returns 0 metrics
    console.log(`[AJ8][SESSION_STOP] mode=${this.mode}, sessionCleared=true`);
    engineSessionStart.set(this.mode, null);

    // Phase 8.8.3-AJ17: Stop diagnostic session and generate report bundle
    aj17DiagnosticRunner.stopSessionAndGenerateReport().catch(err => {
      console.error(`[AJ17] Failed to generate diagnostic report:`, err);
    });
    
    // B-RTB-REFRESH-CONSOLIDATE OBJ-1: stopRefreshCycle removed with Mechanism A (nothing to stop).
    
    // Phase 8.8.4-C.6: Clear engine start time for TCL failsafe
    readyToBuyService.clearEngineStartTime(this.mode);

    // Phase 8.8.4-C.12: Stop TCL Watchdog
    tclWatchdog.stop(this.mode);
    console.log(`[PaperExecution:${this.mode}] TCL Watchdog stopped`);

    // Phase 8.8.4-C.12: Unbind event listeners
    this.unbindTCLEventListeners();
    
    // Phase 8.8.3-I8C: Stop subscription health audit
    try {
      krakenWebSocketAdapter.stopI8CSubscriptionAudit();
      console.log(`[PaperExecution:${this.mode}] I8C subscription audit stopped`);
    } catch (error) {
      console.error(`[PaperExecution:${this.mode}] Error stopping I8C audit:`, error);
    }
    
    // Phase 8.8.3-B9.FIX-WS-START: Stop WebSocket adapter on engine stop
    try {
      krakenWebSocketAdapter.stop();
      console.log(`[PaperExecution:${this.mode}] Kraken WebSocket adapter stopped`);
    } catch (error) {
      console.error(`[PaperExecution:${this.mode}] Error stopping WebSocket adapter:`, error);
    }

    console.log(`[PaperExecution:${this.mode}] Stopped paper trading engine`);
  }

  // I7-ROOT-FIX: Expose engine status for diagnostics
  public getEngineStatusSnapshot() {
    return {
      mode: this.mode,
      isRunning: this.isRunning,
      lastCycleAt: this.lastCycleAt, // Phase 8.8.3-I7-PM-FOCUS: Tick timestamp
      lastCycleAtIso: this.lastCycleAt
        ? new Date(this.lastCycleAt).toISOString()
        : null,
      lastEvaluateAt: this.lastEvaluateAt,
      lastEvaluateAtIso: this.lastEvaluateAt
        ? new Date(this.lastEvaluateAt).toISOString()
        : null,
      lastExitChecks: this.lastExitChecks.slice(-20),
    };
  }

  /**
   * Phase 8.8.3-I7-PRICE-FIX (A2): Get detailed price status for diagnostics
   * Returns per-position pricing info for the i7-price/status endpoint
   */
  public async getI7PriceStatus(): Promise<{
    isRunning: boolean;
    lastTickAt: string | null;
    lastExitEvalAt: string | null;
    positions: Array<{
      symbol: string;
      priceSource: string;
      priceAgeMs: number;
      lastPriceAt: string | null;
      lastExitEvalPrice: number | null;
      sl: number | null;
      tp: number | null;
      slTriggered: boolean;
      tpTriggered: boolean;
    }>;
  }> {
    const openPositions = await storage.getActiveOpenPositions(this.mode);
    const now = Date.now();
    
    const positions = await Promise.all(openPositions.map(async (pos) => {
      const priceResult = await livePricingAdapter.getPriceWithFallback(pos.symbol, 5000);
      const sl = pos.stopLoss ? parseFloat(pos.stopLoss) : null;
      const tp = pos.takeProfit ? parseFloat(pos.takeProfit) : null;
      const currentPrice = priceResult?.price ?? null;
      
      // Check if exit would trigger at current price
      const slTriggered = sl !== null && currentPrice !== null && currentPrice <= sl;
      const tpTriggered = tp !== null && currentPrice !== null && currentPrice >= tp;
      
      return {
        symbol: pos.symbol,
        priceSource: priceResult?.source ?? 'none',
        priceAgeMs: priceResult ? now - new Date(priceResult.timestamp).getTime() : -1,
        lastPriceAt: priceResult?.timestamp ?? null,
        lastExitEvalPrice: currentPrice,
        sl,
        tp,
        slTriggered,
        tpTriggered
      };
    }));
    
    return {
      isRunning: this.isRunning,
      lastTickAt: this.lastCycleAt ? new Date(this.lastCycleAt).toISOString() : null,
      lastExitEvalAt: this.lastEvaluateAt ? new Date(this.lastEvaluateAt).toISOString() : null,
      positions
    };
  }

  /**
   * Phase 8.8.3: Force-close a position for manual stop
   * Public wrapper for private closePosition with manual_stop exit condition.
   * Used by ActivePortfolioManager.forceCloseAllOpenPositionsOnStop()
   * 
   * @param positionId - The position ID to close
   * @param exitPrice - Current market price for the position
   * @param priceSource - Source of the exit price (e.g., 'manual_stop', 'live_pricing')
   * @returns Success status and any error message
   */
  async forceClosePosition(
    positionId: string,
    exitPrice: number,
    priceSource: string = 'manual_stop',
    // ── B-EXIT-PROVENANCE P6 (CONDITION-1) — THE SPLIT, MADE AT THE CALL SITE.
    // Callers used to pass a COMPOSED string (`manual_stop_${source}`), which an enumerated
    // -vocabulary fence must reject outright. Widening the vocabulary to admit a prefix would
    // re-open the exact door OBJ-5 exists to shut, so the parts travel separately instead:
    // the PRODUCER lands in the provenance column, and the close CONDITION lands in
    // `closeReason` — where it already belongs, and already is (`ExitCondition.type`).
    // ⛔ REQUIRED, NOT OPTIONAL — corrected at Step 4, and the inconsistency was mine: twelve
    // lines above argue `_processPendingMaker`'s stamp must be required, and then this one shipped
    // with a `?`. Both production callers already pass it and there are no test callers, so the
    // character was free. It matters more than usual because the derived call-site fence matches
    // the literal `exitProvenance` inside this method's span and passes green whether or not the
    // value was `undefined` at runtime — the one hole the fence structurally cannot see.
    provenance: { producer: PriceProducer; source: string; observedAtMs: number | null },
  ): Promise<{ success: boolean; error?: string }> {
    console.log('[DEBUG-B9][ENGINE_FORCE_CLOSE]', {
      positionId,
      exitPrice,
      priceSource,
      mode: this.mode,
    });

    try {
      const exitCondition: ExitCondition = {
        type: 'manual_stop',
        price: exitPrice,
        reason: 'Manual stop requested by user',
      };

      await this.closePosition(positionId, exitPrice, exitCondition, priceSource, {
        exitProvenance: {
          // A force-close IS the decision — there is no separate driving price to record.
          decisionPrice: exitPrice,
          producer: provenance.producer,
          source: provenance.source,
          observedAtMs: provenance.observedAtMs,
          // ⛔ NULL, not zero and not `diffMs`: this path runs OUTSIDE the evaluation loop, so no
          // inter-tick cadence exists for it. A zero here would read as "instantaneous" — a
          // fabricated measurement, which is worse than an absent one.
          tickCadenceMs: null,
          bookMid: null, bookAgeMs: null, tickerBid: null, tickerAsk: null,
        },
      });
      
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[DEBUG-B9][ENGINE_FORCE_CLOSE_FAILED]', {
        positionId,
        error: errorMessage,
      });
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Phase 8.8.3-B7.A: Reset all in-memory session state
   * Called during hard reset to ensure no ghost state from previous sessions.
   * Clears: running state, intervals, price history, diagnostics, WebSocket subscriptions
   */
  resetSessionState(): void {
    console.log(`[B7.A][ENGINE] Resetting session state for mode=${this.mode}`);
    
    // B7.MDR: Capture pre-reset cache sizes for verification (Directive Section F)
    const prePriceHistory = this.priceHistory.size;
    const preTickLogs = this.priceTickLogs.length;
    const preTickTime = this.lastPriceTickTime.size;
    console.log(`[ENGINE][RESET][PRE] priceHistory=${prePriceHistory}, tickLogs=${preTickLogs}, lastPriceTickTime=${preTickTime}`);
    
    // Clear running state
    this.isRunning = false;
    this.isCycleRunning = false;
    // B-PROMOTION-RACE-FIX (#508, Langston N1): the promotion latch is running state too — clear
    // it here as well as in stop(), so a session reset cannot carry re-run residue forward.
    this.promotionInProgress = false;
    this.promotionRerunRequested = false;

    // Clear monitoring interval
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    // Clear price history cache
    this.priceHistory.clear();
    
    // Clear session start timestamp (zeroes RTB metrics)
    engineSessionStart.set(this.mode, null);
    
    // Clear price tick diagnostics
    this.priceTickLogs = [];
    this.lastPriceTickTime.clear();
    
    // Clear last cycle summary
    this.lastCycleSummary = {};
    
    // B7.MDR: Log post-reset verification (Directive Section D)
    console.log(`[ENGINE][RESET] Cleared price snapshot and bar caches (priceHistory=${this.priceHistory.size}, tickLogs=${this.priceTickLogs.length}, lastPriceTickTime=${this.lastPriceTickTime.size})`);
    
    // B7.A Enhancement: Clear WebSocket subscriptions to prevent stale price feeds
    try {
      krakenWebSocketAdapter.clearAllSubscriptions();
      console.log(`[B7.A][ENGINE] WebSocket subscriptions cleared`);
    } catch (wsErr) {
      console.warn(`[B7.A][ENGINE] WebSocket clear warning:`, wsErr);
    }
    
    // B7.A Enhancement: Stop AJ17 diagnostic session
    try {
      aj17DiagnosticRunner.stopSessionAndGenerateReport().catch(err => {
        console.warn(`[B7.A][ENGINE] AJ17 stop warning:`, err);
      });
      console.log(`[B7.A][ENGINE] AJ17 diagnostics stopped`);
    } catch (diagErr) {
      console.warn(`[B7.A][ENGINE] AJ17 diagnostics warning:`, diagErr);
    }
    
    // B-RTB-REFRESH-CONSOLIDATE OBJ-1: stopRefreshCycle removed with Mechanism A (nothing to stop).
    
    // Phase 8.8.4-C.6: Clear engine start time for TCL failsafe during reset
    readyToBuyService.clearEngineStartTime(this.mode);
    
    console.log(`[B7.A][ENGINE] Session state reset complete for mode=${this.mode}`);
  }

  private async monitoringCycle(): Promise<void> {
    // Re-entrancy guard: skip if previous cycle is still running
    if (this.isCycleRunning) {
      console.log(`[PaperExecution:${this.mode}] Skipping cycle - previous cycle still running`);
      return;
    }

    // Skip if engine has been stopped
    if (!this.isRunning) {
      console.log(`[PaperExecution:${this.mode}] Skipping cycle - engine stopped`);
      return;
    }

    this.isCycleRunning = true;
    
    // Phase 8.8.3-I7-PM-FOCUS: Track cycle timestamp
    this.lastCycleAt = Date.now();
    
    try {
      // Phase 8.8.3-I7-PM-FOCUS: Get current open positions count for ENGINE_TICK log
      const openPositions = await storage.getActiveOpenPositions(this.mode);
      console.log(`[I7-PM-FOCUS][ENGINE_TICK] mode=${this.mode} positions=${openPositions.length} ts=${new Date().toISOString()}`);
      
      // Step 1: Check open positions for exit conditions
      await this.checkOpenPositions();

      // Note: Signal scanning removed by Directive 8.8.4-A3.R9.3
      // Trade creation flows through: FX5 → SignalOrchestrator → SQE → RTB → TCL
    } catch (error) {
      console.error(`[PaperExecution:${this.mode}] Monitoring cycle error:`, error);
      
      // Log error to trade logs (Phase 27.F.15.B.2: Global mode-based)
      await storage.createActiveTradeLog(this.mode, {
        tradeId: null,
        positionId: null,
        eventType: 'error',
        message: `Monitoring cycle error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        metadata: {
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.stack : undefined,
          mode: this.mode
        }
      });
    } finally {
      this.isCycleRunning = false;
    }
  }

  /**
   * P19-B7.2c — process one PENDING maker position per monitor tick (Kyle model,
   * SIMPLIFIED 2026-07-02). A pending is a resting maker order: it holds a slot but has
   * no fill. Two outcomes, FILL WINS in the same tick (R2):
   *  1. FILL — honest side-aware trade-through: the real price traded through the resting
   *     limit (buy: price ≤ limit) → state 'pending'→'open' at the limit + the maker fee
   *     already reserved at placement. The position then enters the normal exit path on
   *     subsequent ticks.
   *  2. HARD-DROP — past `maker_deadline` (~1h, `maker_max_pending_ms`) → DROPPED, period
   *     (no convert re-evaluation — an unfilled maker buy means price never came to us).
   *     The open position is deleted (slot freed) and its closed_trades row is closed
   *     as closeReason='never_filled' (the TYPED discriminator; visible in the closed
   *     records with no P&L, EXCLUDED from win-rate/expectancy aggregates + learning,
   *     but COUNTED in the maker fill-rate denominator).
   *  R3: for xStock the hard-drop must NOT fire while the market is closed
   *     (weekend window) — a shut book can't honestly fill, so the drop waits for the
   *     first open tick (conservative approximation, documented in the scope).
   */
  private async _processPendingMaker(
    position: any,
    currentPrice: number,
    // ⛔ B-EXIT-PROVENANCE LINE 3 — REQUIRED, NEVER OPTIONAL. An optional parameter would let a
    // future call site omit the stamp, and that absence is indistinguishable from a missed stamp
    // (#546) — the same argument that made `producer` required on the tick itself.
    // ★ IT IS PASSED, NOT RE-DERIVED. The only variable in scope at the call site is `priceSource`,
    // which on the crypto WS leg is `'kraken_ws'` — the exact stamp #741 proves CANNOT discriminate
    // a book midpoint from a ticker print. A producer derived from it would be a tick producer BY
    // NAME and would pass the fence GREEN, so the fence would RATIFY the defect rather than catch it.
    provenance: { producer: PriceProducer; source: string; observedAtMs: number | null },
  ): Promise<void> {
    const limit = position.makerLimitPrice != null ? parseFloat(position.makerLimitPrice) : NaN;
    if (!Number.isFinite(limit)) {
      console.error(`[P19-B7.2c][PENDING_INVALID:${this.mode}] ${position.symbol} pending with no maker_limit_price — leaving untouched (investigate)`);
      return;
    }
    // ONE outcome per tick via the shared PURE logic (paper + VTS parity by construction;
    // side-aware comparator, FILL WINS over the deadline in the same tick — R2).
    // Zero/garbage-price guard (Langston Step-4): a non-positive tick (feed glitch) would
    // satisfy `0 <= limit` and spuriously FILL a buy — treat it as no-price (null), exactly
    // like the VTS resolve loop's `price > 0 ? price : null`. A null price can still hard-drop.
    const safePrice = Number.isFinite(currentPrice) && currentPrice > 0 ? currentPrice : null;
    const side = (position.side ?? 'buy') as 'buy' | 'sell';
    const deadlineMs = position.makerDeadline ? new Date(position.makerDeadline).getTime() : null;
    const outcome = evaluatePendingMaker({ side, currentPrice: safePrice, limit, nowMs: Date.now(), deadlineMs });
    if (outcome === 'fill') {
      // NOTE: openedAt stays stamped at PLACEMENT, not at this fill — resting time is
      // included in any holding-duration analytic (cosmetic; EV/expectancy unaffected
      // since entry price is the limit either way). A true in-market duration needs a
      // filledAt stamp — Phase-25 fill-rate report card decides if it wants one.
      await storage.updateActiveOpenPosition(this.mode, position.id, {
        state: 'open',
        currentPrice: currentPrice.toString(),
        lastUpdated: new Date(),
      } as any);
      // ── B-EXIT-PROVENANCE P4 (R5-2 LINE 2) — THE DURABLE ENTRY STAMP, AT THE FILL SEAM.
      // The write above targets `active_open_positions`, which the census shows is deleted from
      // SEVEN independent paths including a timer-driven orphan sweep — so a stamp there is
      // unrecoverable forensics by construction. `closed_trades` is the only durable target.
      // ★ NOT A NEW MECHANISM: the DROP branch below already proves this exact route from inside
      // this method to the durable row. The drop branch had it; the fill branch did not.
      const _fillTradeId = (position.metadata as any)?.tradeId;
      if (_fillTradeId) {
        // ⛔ RIDER-1 (Langston Step 4): the RETURN IS CAPTURED. `updateClosedTrade` destructures
        // `.returning()` off a possibly-empty array, so a MISSING ROW yields `undefined` and
        // throws nothing. The guard above covers a missing tradeId; it does NOT cover a tradeId
        // that resolves to no row — a silent no-op that would leave the stamp absent while every
        // log line says it was written. Same class as #704.
        const _fillStamped = await storage.updateClosedTrade(this.mode, _fillTradeId, {
          entryPriceProducer: provenance.producer,
          entryPriceSource: provenance.source,
          entryObservedAtMs: provenance.observedAtMs,
          entryDecisionPrice: makerFillPrice(limit).toString(),
          // ⛔ NULL BY CONSTRUCTION, not by omission: a maker fill consults NO book — its decision
          // instrument is the price tick. The column comment carries the same statement.
          entryBookAgeMs: null,
        } as any);
        if (!_fillStamped) {
          console.warn(`[P19-B7.2c][MAKER_FILL_STAMP_NOROW:${this.mode}] ${position.symbol}: tradeId ${_fillTradeId} matched no closed_trades row — entry provenance NOT written (silent no-op made visible)`);
        }
      } else {
        // ⛔ CONDITION-2 (Langston): the absence is LOGGED, never silent. A silent skip makes the
        // fill-rate instrument show a gap indistinguishable from a non-fill — the #546 shape
        // landing on the one instrument we do not otherwise have. The drop branch records its
        // own no-tradeId case for exactly this reason; the fill branch now matches it.
        console.warn(`[P19-B7.2c][MAKER_FILL_UNSTAMPED:${this.mode}] ${position.symbol}: filled at ${makerFillPrice(limit)} but metadata carries no tradeId — entry provenance left NULL rather than fabricated (position opened normally)`);
      }
      console.log(`[P19-B7.2c][MAKER_FILLED:${this.mode}] ${position.symbol}: price ${currentPrice} traded through limit ${limit} — pending→open at ${makerFillPrice(limit)} + maker fee (reserved at placement)`);
      return;
    }
    if (outcome === 'drop') {
      // R3: xStock — never fire the drop inside the weekend-closed window.
      if ((position.assetClass ?? 'crypto_spot') === 'xstock_spot' && !isXstockMarketOpenUTC(position.symbol, new Date())) {
        return; // market shut — wait for the first open tick
      }
      const tradeId = (position.metadata as any)?.tradeId;
      if (tradeId) {
        await storage.updateClosedTrade(this.mode, tradeId, {
          closedAt: new Date(),
          // ⛔ B-EXIT-PROVENANCE OBJ-1 EXEMPTION, NAMED HERE RATHER THAN DISCOVERED AT STEP 8.
          // This row is written with NULL exit provenance ON PURPOSE: the order NEVER FILLED, so
          // no exit occurred and there is no price whose source could honestly be recorded.
          // OBJ-1's "every post-deploy row carries a non-null exit_price_source" MUST exclude
          // close_reason='never_filled'. Without that carve-out the coverage check reports a
          // false failure, and the obvious "fix" is to stamp a price that never existed — which
          // is worse than the gap it would be closing.
          closeReason: 'never_filled', // TYPED discriminator — visible, excluded from aggregates/learning
        } as any);
      }
      await storage.deleteActiveOpenPosition(this.mode, position.id);
      console.log(`[P19-B7.2c][MAKER_NEVER_FILLED:${this.mode}] ${position.symbol}: pending maker at ${limit} hit the hard-drop deadline unfilled — dropped (slot freed, never-filled record${tradeId ? '' : ' — no tradeId on metadata, position removed only'})`);
    }
    // 'rest' — still resting; nothing to do this tick.
  }

  private async checkOpenPositions(): Promise<void> {
    // I7-ROOT-FIX: Track evaluation timing
    this.lastEvaluateAt = Date.now();
    this.lastExitChecks = [];
    
    const openPositions = await storage.getActiveOpenPositions(this.mode);

    // ── P19-B8.5e (`#548`) — kick the σ refresh for xStock positions, NON-BLOCKING ──────
    // ★ DELIBERATELY NOT AWAITED. σ is a windowed DB aggregate; awaiting it here would put
    // a database read in front of every stop/target evaluation — the one path that must
    // never be late. This returns immediately and refreshes in the background; the loop
    // below reads whatever is already in memory. A refresh that is slow or failing cannot
    // delay an exit — it can only let entries age out, which fails CLOSED to the floor.
    try {
      const _xstockSymbols = openPositions
        .filter((p) => (asValidAssetClass((p as { assetClass?: unknown }).assetClass)
          ?? safeResolveAssetClass(p.symbol, 'kraken')) === 'xstock_spot')
        .map((p) => p.symbol);
      if (_xstockSymbols.length > 0) {
        const _minObs = getCachedNumberRequired('mark_staleness', 'sigma_min_observations',
          { exchange: '*', assetClass: 'xstock_spot', strategy: '*', regime: '*' });
        ensureSigmaFresh(_xstockSymbols, this._sigmaCacheCfg(_minObs));
      }
    } catch (sigmaKickErr) {
      // Knobs cold ⇒ no refresh kicked ⇒ cache ages out ⇒ per-position floor. The
      // per-position knob read below raises the loud, position-attributed refusal.
      console.warn('[P19-B8.5e][SIGMA_CACHE] refresh kick skipped (knobs cold — positions will floor):',
        sigmaKickErr instanceof Error ? sigmaKickErr.message : sigmaKickErr);
    }

    // Phase 8.8.3-I7-PRICE-FIX (A3): Aggregate exit evaluation stats
    let positionsEvaluated = 0;
    let withWsPrice = 0;
    let withRestPrice = 0;
    let withoutPrice = 0;
    let slHits = 0;
    let tpHits = 0;

    for (const position of openPositions) {
      try {
        let currentPrice: number;
        let priceSource: string;
        // ── B-EXIT-PROVENANCE P1 (R6-2) — DECLARED HERE, beside `priceSource`, because naming
        // only the CALL SITE was the same omission BLOCKER-3 found on the target table.
        // `priceSource` answers a POLICY question (may the engine act on this price?);
        // `priceProducer` answers a PROVENANCE question (which handler produced the number?).
        // Conflating them is #741: a ghost book MIDPOINT and a clean ticker PRINT both stamp
        // `kraken_ws`, so `priceSource` alone CANNOT discriminate them.
        // ⛔ ASSIGNED ON ALL THREE RESOLUTION BRANCHES BELOW — never derived from `priceSource`,
        // and `observedAtMs` is NEVER `diffMs` (`:1245` is inter-tick CADENCE, and the log at
        // `:1272` already mislabels it `ageMs=`; taking it would be a wrong-object stamp
        // wearing the right column name — R6-4).
        let priceProducer: PriceProducer;
        let priceObservedAtMs: number | null;

        // ── P19-B8.5 xSTOCK MARKS (Langston design-APPROVED 2026-07-16) ────────────────
        // Kraken spot REST carries NO tokenized equities (empirically proven: Ticker
        // pair=BIIBUSD AND BIIBxUSD both "EQuery:Unknown asset pair" while XBTUSD serves
        // — see KNOWN_NONEXISTENT_NAMES), and the crypto adapter has no equities
        // subscription. For xstock-class positions the VENUE is the Kraken WS-EQUITIES
        // feed: read the SAME in-memory latest-tick store the B74 archiver/scanner feed
        // maintains (single consumer, one subscription — the archiver's universe-wide
        // WS). STALENESS IS BLOCKING (Langston condition 1): a tick older than the
        // class-explicit max-age yields NO price — never evaluate a stop/target against
        // a stale mark; the skip rail escalates a feed that stays dark. The crypto
        // venue chain below is untouched (additive, class-keyed).
        const _posClass = asValidAssetClass((position as { assetClass?: unknown }).assetClass) ?? safeResolveAssetClass(position.symbol, 'kraken');
        if (_posClass === 'xstock_spot') {
          const _eqTick = getLatestEquityTick(position.symbol);
          // ── P19-B8.5e (`#548`): the max mark age is now RISK-DERIVED PER SYMBOL ──────
          // WAS: one global `exit_integrity.max_equity_tick_age_ms` = 90s for every xStock
          // alike. Measured, that single number was simultaneously TOO LOOSE on the fastest
          // name (blind to ~4% of adverse movement) and TOO TIGHT on the safest (refused to
          // manage it 49×/24h on ordinary quiet trading). One number cannot serve symbols
          // whose risk-per-second differs ~11×. The knob is RETIRED (§18) — not left inert.
          //
          // NOW: `ceiling = clamp(budget / σ_rate, floor, cap)` where `budget` is a fraction
          // of THIS position's remaining room to its stop — so tolerance shrinks as danger
          // rises, and a position near its stop gets the tightest window.
          let _msCfg: MarkStalenessConfig;
          let _sigmaMinObs: number;
          try {
            const _at = { exchange: '*', assetClass: 'xstock_spot' as const, strategy: '*', regime: '*' };
            _msCfg = {
              budgetK: getCachedNumberRequired('mark_staleness', 'budget_k', _at),
              nullStopBudgetPct: getCachedNumberRequired('mark_staleness', 'null_stop_budget_pct', _at),
              floorMs: getCachedNumberRequired('mark_staleness', 'floor_ms', _at),
              capMs: getCachedNumberRequired('mark_staleness', 'cap_ms', _at),
              // σ younger than one refresh period is as fresh as the design allows; past
              // that, σ is inflated with age so stale evidence cannot buy a wide window.
              sigmaFullCreditMs: getCachedNumberRequired('mark_staleness', 'sigma_refresh_after_ms', _at),
            };
            _sigmaMinObs = getCachedNumberRequired('mark_staleness', 'sigma_min_observations', _at);
          } catch (knobErr) {
            console.error(`[P19-B8.5e][EQUITY_MARK] mark_staleness knobs unavailable — xstock mark NOT actionable for ${position.symbol} (fail-safe skip):`, knobErr instanceof Error ? knobErr.message : knobErr);
            withoutPrice++;
            await this._recordPriceSkip(position, 'equity_age_knob_missing');
            continue;
          }
          if (!_eqTick || !Number.isFinite(_eqTick.price) || _eqTick.price <= 0) {
            withoutPrice++;
            await this._recordPriceSkip(position, 'equity_tick_missing');
            continue;
          }
          const _eqAge = Date.now() - _eqTick.tsMs;
          // σ read is pure-memory here; the refresh was kicked (non-blocking) before the
          // loop. A cache miss yields `null` ⇒ the policy lands on the FLOOR — fail-closed.
          const _sigma = getCachedSigma(position.symbol, this._sigmaCacheCfg(_sigmaMinObs));
          const _ceiling = computeStalenessCeiling(
            {
              currentPrice: _eqTick.price,
              stopPrice: position.stopLoss ? parseFloat(position.stopLoss) : null,
              sigmaRatePerSec: _sigma?.sigmaRatePerSec ?? null,
              // null age ⇒ maximally stale ⇒ tightest window (fail-closed, matches null σ).
              sigmaAgeMs: _sigma?.ageMs ?? null,
            },
            _msCfg,
          );
          if (_eqAge > _ceiling.ceilingMs) {
            console.warn(`[P19-B8.5e][EQUITY_MARK] ${position.symbol}: mark is ${Math.round(_eqAge / 1000)}s old, ceiling ${Math.round(_ceiling.ceilingMs / 1000)}s (basis=${_ceiling.basis} σ=${_sigma ? _sigma.sigmaRatePerSec.toExponential(3) + '/s src=' + _sigma.source : 'UNAVAILABLE⇒floor'}${_ceiling.clamped ? ' clamped' : ''}${_ceiling.sigmaAgeInflation > 1 ? ` σ-age-inflated x${_ceiling.sigmaAgeInflation.toFixed(2)} (σ is ${Math.round((_sigma?.ageMs ?? 0) / 1000)}s old)` : ''}) — not actionable this tick`);
            withoutPrice++;
            // Skip reason carries the BASIS so the rail can distinguish "this symbol is
            // genuinely quiet" from "we never had a σ and are floored on every position".
            // A floor-bound near-stop skip gets its OWN countable reason — otherwise it is
            // indistinguishable from an ordinary calm-symbol floor, and #563's exposure stays
            // an argument instead of a number.
            await this._recordPriceSkip(position,
              _ceiling.floorBoundNearStop
                ? 'equity_tick_stale_floor_bound_near_stop'
                : `equity_tick_stale_${_ceiling.basis}`,
              // The two numbers Langston asked for, so the alert reader can judge without
              // re-querying: how old the mark is, and the ceiling it crossed.
              `mark ${Math.round(_eqAge / 1000)}s old, ceiling ${Math.round(_ceiling.ceilingMs / 1000)}s`);
            continue;
          }
          currentPrice = _eqTick.price;
          priceSource = 'kraken_equities_ws';
          // B-EXIT-PROVENANCE P2 (R6-3, xStock branch): LITERAL producer, HONESTLY — there is no
          // adapter quote object on this leg, so THE CODE AT THIS LINE IS THE PRODUCER. The stated
          // exemption to "stamps travel explicitly": a stamp is CARRIED wherever a quote exposes
          // provenance and is a LITERAL only where the emitting line itself IS the provenance.
          // B-EXIT-BOOK-AGE-STAMP P3: the producer now states the KIND, carried from the archiver's
          // tick map where it was decided. Still a LITERAL producer on this leg (there is no adapter
          // quote object here, so the code at this line IS the provenance) — only now it is a literal
          // that discriminates.
          priceProducer = _eqTick.kind === 'mid' ? 'kraken_equities_ws_mid' : 'kraken_equities_ws_last';
          // ★ A REAL venue observation stamp — `equity-spot-archiver.ts:137` writes `tsMs` only on a
          // genuine venue snap with a finite positive mark. NOT the time this object was built.
          priceObservedAtMs = _eqTick.tsMs;
          withWsPrice++;
          // Feed the shared cache so UI/summary reads see the same mark, then FALL
          // THROUGH into the shared evaluation pipeline below — the crypto venue
          // chain is skipped entirely (spot REST cannot serve this class).
          // ⛔ ONLY THE PRODUCER SPLITS. The third argument is the `source`, and
          // `isKrakenVenueSource` tests `source === 'kraken_equities_ws'` — splitting THAT would gate
          // real prices. Two axes, deliberately: source = policy, producer = provenance.
          livePricingAdapter.updateCache(normalizeToInternalSymbol(position.symbol), currentPrice, 'kraken_equities_ws', priceProducer);
        } else {

        // Phase 8.8.3-I7-WS-D (D5): Use WebSocket cache FIRST with 2-second stale threshold
        // Only fall back to REST if WS cache is stale > 2 seconds
        const priceResult = await livePricingAdapter.getPriceWithFallback(position.symbol, 2000);
        
        // ── P19-B8.5 (VENUE-ONLY ACTIONABLE PRICING — Kyle structural cut B, Langston-
        // endorsed 2026-07-15) ─────────────────────────────────────────────────────────
        // We fill against Kraken's book, so a non-Kraken tick is not actionable
        // information — it's a number that looks like one (Langston's phrasing; today's
        // phantom stops were the proof). The actionable chain is now EXACTLY:
        //   kraken_ws → kraken_rest → SKIP-THIS-TICK.
        // binance / coingecko / mock / last_known_good / entry_seed are OFF the
        // actionable path: any of them from the adapter routes into the direct Kraken
        // REST leg below, and if REST also fails the position is skipped this tick with
        // the consecutive-skip escalation rail (further down) watching for a feed that
        // stays dark. This supersedes the same-day C prong-2 sanity gate, which existed
        // to referee heterogeneous sources — with a homogeneous venue chain there is
        // nothing left to referee (its observe-only WS-vs-REST divergence log survives
        // in the REST leg).
        // P19-B8.9a: venue PREDICATE, not the WS literal — a fresh same-venue REST/equities
        // entry is actionable without wearing a false WS badge. Provenance ruled here; freshness
        // is getPriceWithFallback's 2000ms window (stale re-serves now arrive as
        // last_known_good and are rejected → the skip-rail engages as designed).
        if (priceResult !== null && priceResult.price !== null && isKrakenVenueSource(priceResult.source)) {
          currentPrice = priceResult.price;
          priceSource = priceResult.source;
          // B-EXIT-PROVENANCE P2 (R6-3, crypto adapter branch): ★ THE ONLY GENUINE CARRY OF THE
          // THREE — a real quote object with a real provenance field. `observedAt` is the ORIGINAL
          // venue observation time, carried through last-known-good re-serves unrefreshed (#743),
          // which is exactly why it is the honest freshness measure and `timestamp` is not.
          priceProducer = priceResult.producer;
          priceObservedAtMs = priceResult.observedAt;
          withWsPrice++;
          console.log(`[I7-WS-D][ENGINE_WS_PRICE] symbol=${position.symbol} price=${currentPrice}`);
        } else {
          if (priceResult?.price != null && priceResult.source !== 'no_reliable_price' && !isKrakenVenueSource(priceResult.source)) {
            console.warn(`[P19-B8.5][VENUE_ONLY] ${position.symbol}: adapter offered non-venue source '${priceResult.source}' (${priceResult.price}) — not actionable, going to Kraken REST directly`);
          }
          // Phase 8.8.3-I7: Fallback to Kraken REST if the WS cache is unavailable/stale.
          // P19-B8.5 (venue-only): this is now the ONLY fallback — REST is the same venue
          // we fill against. On REST failure the position is SKIPPED this tick and the
          // consecutive-skip rail below counts toward escalation.
          try {
            const restPair = getKrakenRestPair(position.symbol);
            console.log(`[I7][REST_FALLBACK] symbol=${position.symbol} -> restPair=${restPair}`);

            const ticker = await this.krakenService.getTicker(restPair);
            const tickerData = Object.values(ticker)[0];
            if (!tickerData) {
              console.warn(`[B9.PRICING][SKIP_DUE_TO_NO_PRICE] ${position.symbol}: No Kraken REST data, skipping position check`);
              withoutPrice++;
              await this._recordPriceSkip(position, 'rest_no_data');
              continue;
            }

            // 8.9.2: Calculate midpoint from bid/ask, fallback to last trade
            const ask = parseFloat(tickerData.a[0]);
            const bid = parseFloat(tickerData.b[0]);
            const lastTrade = parseFloat(tickerData.c[0]);
            // B-EXIT-BOOK-AGE-STAMP P1/P4: one predicate, one home — and the kind is decided right
            // here, where `ask`/`bid` are in scope, so this leg needs no plumbing at all.
            const _restKind = markKindOf(bid, ask);
            currentPrice = _restKind === 'mid' ? (ask + bid) / 2 : lastTrade;
            priceSource = 'kraken_rest';
            // B-EXIT-PROVENANCE P2 (R6-3, crypto direct-REST branch): LITERAL producer, honestly —
            // direct `krakenService.getTicker`, mid computed inline, so the line is the producer.
            priceProducer = _restKind === 'mid' ? 'kraken_rest_engine_fallback_mid' : 'kraken_rest_engine_fallback_last';
            // ⛔ NULL, and NULL IS THE HONEST VALUE: the REST ticker carries no per-quote venue
            // observation time. Fabricating one from `Date.now()` would record fetch time as
            // observation time — precisely the #743 defect this column exists to make visible.
            priceObservedAtMs = null;
            withRestPrice++;

            console.log(`[8.9.2][REST_TICK] ${position.symbol} bid=${bid} ask=${ask} mid=${currentPrice.toFixed(8)}`);

            // P19-B8.5 (Langston condition 3, observe-only): a WS cache that diverges hard
            // from same-venue REST is a real stale-feed signal worth telemetry — logged,
            // never gated (REST is the truth in this leg either way).
            const _wsStale = priceResult?.price != null && priceResult.price > 0 ? priceResult.price : null;
            if (_wsStale !== null && currentPrice > 0) {
              const _div = Math.abs(_wsStale - currentPrice) / currentPrice;
              if (_div > 0.02) {
                console.warn(`[P19-B8.5][WS_REST_DIVERGENCE] ${position.symbol}: adapter cache ${_wsStale} (source '${priceResult?.source}') vs REST ${currentPrice} = ${(100 * _div).toFixed(1)}% — stale-feed telemetry, observe-only`);
              }
            }

            // Phase 8.8.3-I7: Broadcast this REST price to frontend
            // Normalize to internal format for consistent cache keys
            const internalSymbol = normalizeToInternalSymbol(position.symbol);
            livePricingAdapter.updateCache(internalSymbol, currentPrice, 'kraken_rest', priceProducer);
            console.log(`[I7][REST_BROADCAST] symbol=${internalSymbol} price=${currentPrice}`);
          } catch (krakenError) {
            console.warn(`[B9.PRICING][SKIP_DUE_TO_NO_PRICE] ${position.symbol}: Kraken REST failed, skipping position check`, krakenError);
            withoutPrice++;
            await this._recordPriceSkip(position, 'rest_failed');
            continue;
          }
        }
        } // ← closes the P19-B8.5 xstock/crypto pricing-leg split (else = the crypto chain)
        // A position that reaches here has a VENUE price — reset its skip streak.
        this._priceSkipStreak.delete(position.id);
        
        // P19-B8.5 (venue-only): the same-day C prong-2 FALLBACK-PRICE SANITY GATE that
        // lived here was DELETED — it refereed heterogeneous price sources, and the
        // venue-only chain above makes non-Kraken sources structurally unreachable at
        // this point (Kyle: "if Kraken pricing isn't available, that's a trade we cannot
        // act on"). Its observe-only WS-vs-REST divergence log survives in the REST leg.
        // Its exit_integrity.max_fallback_deviation_pct knob is retired with it (rows
        // removed in the venue-only migration; the module keeps its cooldown +
        // skip-escalation knobs).

        // Phase 8.8.3-B3.5: Log PRICE_TICK for cadence verification
        const now = Date.now();
        const lastTick = this.lastPriceTickTime.get(position.symbol) || now;
        const diffMs = now - lastTick;
        this.lastPriceTickTime.set(position.symbol, now);

        // ── P19-B7.2c: PENDING maker pre-pass — a resting maker order holds a slot but
        // has NO fill, so it never enters the TEC exit path. Fill (honest trade-through)
        // wins over the deadline in the same tick (R2). Handled then `continue`d.
        if ((position as any).state === 'pending') {
          await this._processPendingMaker(position, currentPrice, {
            producer: priceProducer,
            source: priceSource,
            observedAtMs: priceObservedAtMs,
          });
          positionsEvaluated++;
          continue;
        }

        // ── B-EXIT-PROVENANCE P3 — THE EXIT STAMP, BUILT ONCE PER POSITION.
        // Built here rather than at each close site on purpose: the two in-loop close sites are
        // the SAME fact, and two constructions of one fact is how they drift apart (#641).
        // ⛔ `tickCadenceMs` takes `diffMs` and `observedAtMs` NEVER does. `diffMs` is
        // `now - lastTick` — the engine's INTER-TICK CADENCE for this symbol — and the log below
        // already prints it as `ageMs=`, which is exactly why it is the value an implementer
        // reaches for. Putting it in `observedAtMs` would be a wrong-object stamp wearing the
        // right column's name. The rename is half the prohibition; this comment is the other half.
        const _bookX = _posClass === 'xstock_spot'
          ? null
          : krakenWebSocketAdapter.getBookForFill(normalizeToInternalSymbol(position.symbol));
        const _exitProvenanceBase = {
          producer: priceProducer,
          source: priceSource,
          observedAtMs: priceObservedAtMs,
          tickCadenceMs: diffMs,
          // NULL BY CONSTRUCTION on xStock — `getBookForFill` is the crypto WS mini-book and has no
          // xStock equivalent, so a null here is the honest value and not a missed read
          // (OBJ-4/OBJ-8's discipline, applied).
          // ⛔ BOUNDED 2026-08-30 (B-EXIT-BOOK-AGE-STAMP): this is true of `bookMid`/`bookAgeMs` and
          // is NOT a class-level claim that xStock "has no book". The FILL-time `getDepthSnapshot`
          // DOES return an xStock ladder — synthesised from one `xstock_spot_ticker_snap` row — and
          // `exit_fill_depth_age_ms` is populated on xStock from it. Two different reads.
          // ⛔ AND THESE TWO ARE DECISION-TIME: this payload is built ONCE PER POSITION, above the
          // exit-condition evaluation, for every position on every tick — not at the close.
          bookMid: _bookX ? (_bookX.bids[0].price + _bookX.asks[0].price) / 2 : null,
          bookAgeMs: _bookX ? _bookX.ageMs : null,
          // ⛔ NULL ON EVERY BRANCH TODAY, AND STATED RATHER THAN QUIETLY DROPPED. OBJ-3 asks for
          // the TICKER bid/ask as a second independent feed. The ticker handler COMPUTES both
          // (`kraken-websocket-adapter.ts:682-683`) and then DISCARDS them — they reach only a
          // debug ring buffer, and no per-symbol retention exists for the engine to read at close.
          // ⛔ THE BOOK'S top-of-book IS NOT THE TICKER'S. Filling these from `_bookX` would store
          // one feed under the other feed's name — the precise wrong-object substitution this whole
          // batch exists to make impossible, committed inside the instrument built to catch it.
          // Retention is a real mechanism on a shared component and therefore a SCOPE decision,
          // not an implementer's call: raised at Step 4 with the OBJ-3 gap named.
          tickerBid: null as number | null,
          tickerAsk: null as number | null,
        };

        const tickEntry = {
          symbol: position.symbol,
          refreshedAt: new Date().toISOString(),
          diffMs: diffMs
        };
        
        // Keep last 100 entries (ring buffer behavior)
        if (this.priceTickLogs.length >= this.MAX_PRICE_TICK_LOGS) {
          this.priceTickLogs.shift();
        }
        this.priceTickLogs.push(tickEntry);
        
        console.log(`[PRICE_TICK] symbol=${position.symbol} refreshed_at=${tickEntry.refreshedAt} diff_ms=${diffMs} source=${priceSource}`);
        
        // Phase 8.8.3-I7-PM-FOCUS: ENGINE_PRICE_READ diagnostic
        console.log(`[I7-PM-FOCUS][ENGINE_PRICE_READ] symbol=${position.symbol} source=${priceSource} ageMs=${diffMs} price=${currentPrice}`);
        
        // Phase 8.8.3-I6 B1: Diagnostic logging for trade engine live price usage
        console.log(`[8.8.3-I6][ENGINE_LIVE_PRICE] symbol=${position.symbol} price=${currentPrice} source=${priceSource} age=${diffMs}ms`);
        
        positionsEvaluated++;
        const avgPrice = parseFloat(position.avgPrice);
        const stopLoss = position.stopLoss ? parseFloat(position.stopLoss) : null;
        const takeProfit = position.takeProfit ? parseFloat(position.takeProfit) : null;
        
        // Phase 8.8.3-I7-WS-C (C2 Stage 7): Generate trace ID and log engine price read
        const engineTraceId = priceTraceService.generateTraceId(position.symbol.replace('/', ''));
        priceTraceService.recordStage(engineTraceId, 7, 'ENGINE_PRICE_READ', {
          internal_symbol: position.symbol,
          engine_price: currentPrice,
          source: priceSource
        });

        // Phase 8.8.3-I6 B3: Calculate current P/L using LIVE price
        const pnl = (currentPrice - avgPrice) * parseFloat(position.quantity);
        const pnlPercent = ((currentPrice - avgPrice) / avgPrice) * 100;
        
        // Phase 8.8.3-I6 B3: Diagnostic logging for P/L calculation
        console.log(`[8.8.3-I6][ENGINE_PNL_CALC] symbol=${position.symbol} entry=${avgPrice} live=${currentPrice} pnl=${pnl.toFixed(4)} pnlPct=${pnlPercent.toFixed(4)}%`);

        // Update position with current P/L
        await storage.updateActiveOpenPosition(this.mode, position.id, {
          currentPrice: currentPrice.toString(),
          unrealizedPnl: pnl.toString(),
          unrealizedPnlPercent: pnlPercent.toString()
        });

        // Check for exit conditions
        // Phase 8.8.3-I7-WS-C: Pass trace ID for Stage 8 logging
        const evalStartedAt = Date.now();
        const exitCondition = await this.checkExitConditions(
          position,
          currentPrice,
          avgPrice,
          stopLoss,
          takeProfit,
          engineTraceId
        );

        // I7-ROOT-FIX: Track exit evaluation for diagnostics
        this.lastExitChecks.push({
          symbol: position.symbol,
          slotNumber: (position as any).slotNumber,
          price: currentPrice,
          priceSource: priceSource,
          evaluatedAt: new Date(evalStartedAt).toISOString(),
          triggeredExit: exitCondition !== null
        });

        // ── P19-B8.6 — MAKER TARGET-EXIT rest lifecycle (paper only) ────────────────────
        // A live rest is evaluated FIRST; placement happens when a fresh target_hit fires
        // with no rest up. STOP PRECEDENCE is absolute: any stop-class condition closes
        // taker immediately, rest or no rest. The stop-over-target precedence on a tick
        // that gapped through BOTH is enforced STRUCTURALLY, not by a comparator here:
        // evaluateTECExit's hard-floor path checks the stop BEFORE the target
        // (tec-evaluator.ts), and the TARGET-only placement gate (D2 below) excludes the
        // moonbag stop-above-target state — so a both-breached tick surfaces as a
        // stop-class condition and never reaches the rest evaluation (OBJ-3).
        const _exitRestLimit = (position as any).exitLimitPrice != null ? parseFloat(String((position as any).exitLimitPrice)) : null;
        const _isStopClass = exitCondition !== null && exitCondition.type !== 'target_hit';
        // Langston Step-4 ①: rest-cohort stamps travel EXPLICITLY via closePosition's
        // options — closePosition re-fetches the DB row, so stamps must never depend on
        // which rest fields happen to survive in the DB at close time.
        const _restPlacedAtMs = (position as any).exitRestPlacedAt ? new Date((position as any).exitRestPlacedAt).getTime() : null;
        let _exitRestStamp: { restedAtPrice: number; placedAtMs: number | null; outcome: 'fill' | 'convert' } | null = null;
        if (_isStopClass && _exitRestLimit !== null && Number.isFinite(_exitRestLimit)) {
          // Stop-during-rest: the rest is cancelled by the stop-class taker close below;
          // it stamps as a CONVERT — a maker miss for the AC-6 denominator.
          _exitRestStamp = { restedAtPrice: _exitRestLimit, placedAtMs: _restPlacedAtMs, outcome: 'convert' };
        }

        if (this.mode === 'paper' && _exitRestLimit !== null && Number.isFinite(_exitRestLimit) && !_isStopClass) {
          // A rest is LIVE and no stop fired: the rest IS the exit order this tick.
          // Reuses the B7.2c pure logic with the side flipped — tradedThrough('sell')
          // = price >= limit, the same honest never-optimistic comparator entries use.
          // D1 (Langston-approved INTENTIONAL divergence from entry semantics): entries
          // route a marketable order to the stored-taker check; the exit RESTS the
          // marketable price and requires a LATER venue tick at/through the limit —
          // same-tick place-and-fill is prohibited as an optimistic touch-fill. Do not
          // "fix" this into entry-parity.
          const _restDeadline = (position as any).exitDeadline ? new Date((position as any).exitDeadline).getTime() : null;
          const _restOutcome = evaluatePendingMaker({
            side: 'sell', currentPrice, limit: _exitRestLimit, nowMs: Date.now(), deadlineMs: _restDeadline,
          });
          if (_restOutcome === 'fill') {
            tpHits++;
            console.log(`[P19-B8.6][EXIT_REST_FILLED] ${position.symbol}: venue price ${currentPrice} traded through the resting exit ${_exitRestLimit} — closing at the limit + MAKER fee`);
            await this.closePosition(position.id, _exitRestLimit, {
              type: 'target_hit',
              price: _exitRestLimit,
              reason: `Resting maker exit filled at ${_exitRestLimit} (venue traded through)`,
            }, priceSource, {
              makerExitFill: { limit: _exitRestLimit },
              exitRest: { restedAtPrice: _exitRestLimit, placedAtMs: _restPlacedAtMs, outcome: 'fill' },
              // ★ THIS IS THE OBJ-2 CASE, AND IT IS THE WHOLE REASON THE COLUMN EXISTS.
              // The trade CLOSES at `_exitRestLimit` (the resting limit), but what DROVE the close
              // is `currentPrice` — the venue tick that traded through it. Recording only the exit
              // price leaves the number that actually caused the exit with no trace at all, which
              // is exactly what made #741 hard to measure after the fact.
              exitProvenance: { ..._exitProvenanceBase, decisionPrice: currentPrice },
            });
            continue;
          }
          if (_restOutcome === 'drop') {
            // CONVERT (deadline fired): clear the rest; the tick's own evaluation decides —
            // condition still target_hit → taker close below (books the convert friction,
            // AC-2/OBJ-5 via the normal path); condition null → position simply continues.
            console.log(`[P19-B8.6][EXIT_REST_CONVERT] ${position.symbol}: rest at ${_exitRestLimit} hit the deadline unfilled — converting (taker path governs this tick)`);
            await storage.updateActiveOpenPosition(this.mode, position.id, {
              exitLimitPrice: null, exitRestPlacedAt: null, exitDeadline: null,
            } as any);
            // ALL rest fields are cleared in DB (nothing load-bearing survives for a
            // future cleanup to break — Langston ①); the same-tick taker close gets its
            // stamps via the explicit exitRest option below, never from the DB row.
            _exitRestStamp = { restedAtPrice: _exitRestLimit, placedAtMs: _restPlacedAtMs, outcome: 'convert' };
            if (!exitCondition) continue;
            // fall through to the close block with the (taker) target_hit condition
          } else if (_restOutcome === 'rest') {
            // Still resting: a concurrent target_hit condition is SWALLOWED — the rest is
            // the exit order; no taker close while it stands.
            continue;
          }
        } else if (this.mode === 'paper' && exitCondition?.type === 'target_hit' && _exitRestLimit === null) {
          // PLACEMENT: fresh target_hit, no rest up. D2 (Langston): the TEC guard —
          // resting is only defined for plain TARGET mode; any other engine state falls
          // back to the EXISTING immediate taker exit (never a stranded position).
          const _tecMode = (position as any).tradeMode ?? 'TARGET';
          if (_tecMode === 'TARGET') {
            let _restBudgetMs: number | null = null;
            try {
              const _restClass = asValidAssetClass((position as { assetClass?: unknown }).assetClass) ?? safeResolveAssetClass(position.symbol, 'kraken') ?? 'crypto_spot';
              _restBudgetMs = getCachedNumberRequired('maker_taker', 'exit_maker_max_pending_ms',
                { exchange: '*', assetClass: _restClass, strategy: '*', regime: '*' });
            } catch (knobErr) {
              console.warn(`[P19-B8.6][EXIT_REST_SKIP] ${position.symbol}: exit_maker_max_pending_ms knob unavailable — falling back to the immediate taker exit (never strand):`, knobErr instanceof Error ? knobErr.message : knobErr);
            }
            const _restTarget = position.takeProfit != null ? parseFloat(String(position.takeProfit)) : NaN;
            if (_restBudgetMs !== null && Number.isFinite(_restTarget) && _restTarget > 0) {
              const _placedAt = new Date();
              await storage.updateActiveOpenPosition(this.mode, position.id, {
                exitLimitPrice: _restTarget.toString(),
                exitRestPlacedAt: _placedAt,
                exitDeadline: new Date(_placedAt.getTime() + _restBudgetMs),
              } as any);
              console.log(`[P19-B8.6][EXIT_REST_PLACED] ${position.symbol}: target ${_restTarget} touched at ${currentPrice} — resting the exit as a maker sell (deadline +${Math.round(_restBudgetMs / 60000)}min); fill requires a LATER tick at/through the limit (D1)`);
              continue; // no close this tick — the rest is the exit order
            }
            // knob/target unusable → fall through to the immediate taker exit (D2)
          } else {
            console.warn(`[P19-B8.6][EXIT_REST_REFUSED] ${position.symbol}: TEC state '${_tecMode}' is non-TARGET — rest undefined under ratcheting; falling back to the immediate taker exit (D2 fail-closed, never strand)`);
          }
        }

        if (exitCondition) {
          // Phase 8.8.3-I7-PRICE-FIX: Track exit types
          if (exitCondition.type === 'stop_hit') slHits++;
          if (exitCondition.type === 'target_hit') tpHits++;

          // P19-B8.6 (stop precedence): a stop-class close while a rest was up cancels
          // the rest implicitly — the position row is consumed by the close; the convert
          // stamps travel via the explicit exitRest option set above (Langston ①).

          // [B8.PNL][EXIT_SOURCE] - Log price source before calling closePosition
          console.log(`[B8.PNL][EXIT_SOURCE]`, JSON.stringify({
            symbol: position.symbol,
            side: position.side,
            currentPrice: currentPrice,
            entryPrice: avgPrice,
            priceSource: priceSource,
            closeReason: exitCondition.type
          }));

          await this.closePosition(position.id, currentPrice, exitCondition, priceSource, {
            ...(_exitRestStamp ? { exitRest: _exitRestStamp } : {}),
            // Taker close: the decision price IS the exit price, so these two agree by
            // construction here — and that agreement is itself the evidence that separates a
            // taker close from the maker case above, where they must differ.
            exitProvenance: { ..._exitProvenanceBase, decisionPrice: currentPrice },
          });
        }
      } catch (error) {
        console.error(`[PaperExecution:${this.mode}] Error checking position ${position.symbol}:`, error);
      }
    }
    
    // Phase 8.8.3-I7-PRICE-FIX (A3): Enhanced EVAL_EXIT aggregate log with price stats
    console.log(`[I7-PRICE-FIX][EVAL_EXIT] cycleId=${this.lastCycleAt} positionsEvaluated=${positionsEvaluated} withWsPrice=${withWsPrice} withRestPrice=${withRestPrice} withoutPrice=${withoutPrice} slHits=${slHits} tpHits=${tpHits}`);
  }

  /**
   * P19-B8.5j — the max-hold master switch for the ACTIVE lane (paper/live).
   * Resolves `enabled_paper` / `enabled_live` from `module_constants.max_hold_switch`
   * by `this.mode`. FAIL-SAFE: a cold module makes `getCachedConstant` THROW and an
   * absent key returns `undefined`; both resolve to OFF. ★ OFF is fail-safe ONLY BECAUSE
   * non-enforcement is NON-DESTRUCTIVE for THIS switch (a force-close is irreversible;
   * not-closing is not). Do NOT copy this default-off pattern to a switch whose OFF is the
   * destructive direction (Langston caveat, 2026-07-24). Seeded FALSE (paper+live), so the
   * max_holding_period branch never fires today.
   */
  private isMaxHoldEnabled(): boolean {
    const key = this.mode === 'live' ? 'enabled_live' : 'enabled_paper';
    try {
      return getCachedConstant<boolean>('max_hold_switch', key, GLOBAL_KEY) === true;
    } catch {
      return false; // module not warm → treat as OFF (fail-safe)
    }
  }

  private async checkExitConditions(
    position: any,
    currentPrice: number,
    avgPrice: number,
    stopLoss: number | null,
    takeProfit: number | null,
    traceId?: string
  ): Promise<ExitCondition | null> {
    // Phase 8.8.3-I6 B2: Calculate distance to SL/TP using live price
    const distanceToTP = takeProfit ? ((takeProfit - currentPrice) / currentPrice) * 100 : null;
    const distanceToSL = stopLoss ? ((currentPrice - stopLoss) / currentPrice) * 100 : null;
    
    // Phase 8.8.3-I7-WS-C (C2 Stage 8): Log exit evaluation
    if (traceId) {
      priceTraceService.recordStage(traceId, 8, 'EXIT_EVAL', {
        symbol: position.symbol,
        distSL: distanceToSL,
        distTP: distanceToTP
      });
    }
    
    // Phase 8.8.3-I6 B2: Diagnostic logging for SL/TP evaluation
    console.log(`[8.8.3-I6][EXIT_EVAL] symbol=${position.symbol} livePrice=${currentPrice} tp=${takeProfit} sl=${stopLoss} distTP=${distanceToTP?.toFixed(4)}% distSL=${distanceToSL?.toFixed(4)}%`);

    // B65.2 (2026-04-23): paper engages the full ATR-based trailing engine.
    // Break-even lock on 1×ATR gain, target-lock + moonbag on target hit (if
    // strategy qualifies), trailing stop in moonbag mode, 4h duration cap,
    // concurrency cap via reserved-slots policy. The legacy percentage-based
    // trailing block below is GONE (it fought the ATR engine). Max-holding-
    // period metadata is preserved as a separate per-position override.
    const metadata = position.metadata as Record<string, any>;
    const atrAtOpen = metadata?.atr_at_open ? parseFloat(metadata.atr_at_open) : 0;
    const diAtOpen = metadata?.di_at_open ? parseFloat(metadata.di_at_open) : 50;
    const volNoiseAtOpen = metadata?.vol_noise_at_open ? parseFloat(metadata.vol_noise_at_open) : 0.3;

    if (stopLoss !== null || takeProfit !== null) {
      // Current open-position count drives the concurrency cap for paper.
      // Reading size from storage once per exit-check is cheap enough; if
      // this becomes a hot path we'll cache at the service level.
      const currentOpenPositions = await storage.getActiveOpenPositions(this.mode);
      const currentSlotTotal = currentOpenPositions.length;

      // B79.TEC (2026-05-08): assetClass MUST come from the position record,
      // not a hardcoded literal. active_open_positions.asset_class has
      // been populated since B69 — we read it directly. If a row somehow
      // lacks it (legacy data), throw rather than silently default to
      // crypto_spot (CLAUDE.md §11 NO_FALLBACK doctrine).
      const positionAssetClass = (position as any).assetClass as AssetClass | undefined;
      if (!positionAssetClass) {
        throw new Error(
          `[TEC_PE_MISSING_ASSET_CLASS] paper position id=${position.id} symbol=${position.symbol} ` +
          `has no assetClass. Backfill via the B69 schema migration before retrying.`,
        );
      }
      // B80 (2026-05-13): Option C+ rehydrate seed. Built once on the first
      // exit-cycle for an open position post-deploy. Subsequent cycles: the
      // engine state is in memory, seed is ignored (only fires when state
      // doesn't exist yet). Per Langston rev2 §4.4.
      const { getTrailingState: _getTSForSeed } = await import('./trailing-exit-controller.js');
      const existingTecStatePE = _getTSForSeed(position.id);
      const tecSeedPE = existingTecStatePE
        ? undefined
        : {
            tradeMode: ((position as any).tradeMode === 'TRAILING_TAKE'
              ? 'TRAILING_TAKE'
              : 'TARGET') as 'TARGET' | 'TRAILING_TAKE',
            ladderRung: (position as any).ladderRungsHit ?? 0,
            originalStopPrice:
              (position as any).originalStopPrice ?? (stopLoss ?? undefined),
          };

      const decision = await evaluateTECExit({
        // B80 (2026-05-13): per-trade keying. paper/live positions key by
        // the DB row id (active_open_positions.id).
        tradeId: position.id,
        symbol: position.symbol,
        entryPrice: avgPrice,
        stopPrice: stopLoss ?? -Infinity,
        targetPrice: takeProfit ?? Infinity,
        currentPrice,
        atr: atrAtOpen,
        holdDurationMs: 0,   // paper handles metadata.maxHoldingMs inline below (W2.1)
        maxHoldMs: Infinity, // disable global timeout branch here
        context: {
          exchange: 'kraken',
          assetClass: positionAssetClass,
          strategy: position.strategyName,
          // B-TEC-REGIME-PARAM-REMOVAL (2026-08-07): the `regime` key is REMOVED
          // here, not defaulted. `activeOpenPositions` has no `regime` column
          // (38-column enumeration) and `getActiveOpenPositions` returns the bare
          // row type, so `(position as any).regime` could only ever be undefined —
          // a reader whose writer never existed. The `as any` cast on an already
          // `any` parameter silenced nothing, which is why tsc/CI/caller-census
          // all passed over it (see #676 for typing this parameter properly).
          //
          // BEHAVIOUR-IDENTICAL, and the evidence is the census, NOT the compiler:
          // `TECExitInput.context.regime` is OPTIONAL (`tec-evaluator.ts:100`), so
          // tsc stays green either way. Its three readers (`tec-evaluator.ts:314`
          // isMoonbagQualifier, `:321` canEnterMoonbag, `:337` PositionUpdate) all
          // use plain property access — zero `'regime' in` / `hasOwnProperty`
          // hits — so an ABSENT key is indistinguishable from `undefined` here.
          //
          // ⚠️ THIS REMOVES *A* WRITER, NOT *THE* WRITER: `evaluateTECExit` has
          // three callers; the two VTS ones (`vts-runner.ts:3042`/`:3822`) pass
          // REAL `trade.regime` values. Do NOT read this deletion as licence to
          // drop `regime?: string` or its readers — they are live for VTS.
        },
        useTrailing: true,
        DI: diAtOpen,
        volNoise: volNoiseAtOpen,
        callerMode: this.mode === 'live' ? 'live' : 'paper',
        sourcePool: (position as any).sourcePool ?? null,
        currentSlotTotal,
        // B80: Option C+ seed (only on first cycle post-restart).
        seed: tecSeedPE,
      });

      // B65.2: if the engine ratcheted the stop (break-even lock, target
      // lock, or trailing), write the new stop back to the open-position
      // row so the next exit-check cycle sees it AND the UI shows the
      // ratcheted stop instead of the static entry-time stop.
      if (decision.newStopPrice !== undefined && stopLoss !== null && decision.newStopPrice > stopLoss) {
        await storage.updateActiveOpenPosition(this.mode, position.id, {
          stopLoss: decision.newStopPrice.toString(),
        });
      }

      // B80 (2026-05-13, Langston rev2 #1): runtime invariant assertion on
      // every exit-cycle iteration. Per-trade keying means displayed stop
      // (position.stopLoss) MUST equal engine state's currentStopPrice
      // (decision.newStopPrice). Divergence indicates a keying contract
      // break; surface for next pre-audit.
      if (decision.newStopPrice !== undefined && stopLoss !== null && avgPrice > 0) {
        const epsilon = Math.max(0.00001, 0.0001 * avgPrice);
        // Compare the engine's reported stop against the value we'd just
        // written back (post-ratchet). If the engine returned a stop that's
        // LOWER than the current displayed stop, that's a violation —
        // engine should never ratchet downward.
        const effectiveDisplayedStop =
          decision.newStopPrice > stopLoss ? decision.newStopPrice : stopLoss;
        const delta = Math.abs(effectiveDisplayedStop - decision.newStopPrice);
        if (delta > epsilon) {
          console.error(
            `[B80][TEC_KEYING_INVARIANT_VIOLATION] tradeId=${position.id} symbol=${position.symbol} ` +
            `displayed=${effectiveDisplayedStop.toFixed(6)} engine=${decision.newStopPrice.toFixed(6)} ` +
            `delta=${delta.toFixed(6)} epsilon=${epsilon.toFixed(6)}`
          );
        }
      }

      // B65.2: write trade_mode on mode change (TARGET → TRAILING_TAKE).
      if (decision.modeChanged) {
        await storage.updateActiveOpenPosition(this.mode, position.id, {
          tradeMode: 'TRAILING_TAKE',
        });
      }

      if (decision.shouldExit) {
        switch (decision.exitReason) {
          case 'target_hit':
            console.log(`[8.8.3-I6][EXIT_TRIGGER] symbol=${position.symbol} type=target_hit price=${currentPrice}`);
            return {
              type: 'target_hit',
              price: currentPrice,
              reason: `Price ${currentPrice.toFixed(2)} reached target ${(takeProfit ?? 0).toFixed(2)}`,
            };
          case 'stop_hit':
            console.log(`[8.8.3-I6][EXIT_TRIGGER] symbol=${position.symbol} type=stop_hit price=${currentPrice}`);
            return {
              type: 'stop_hit',
              price: currentPrice,
              reason: `Price ${currentPrice.toFixed(2)} hit stop ${(stopLoss ?? 0).toFixed(2)}`,
            };
          case 'break_even_stop':
            // B65.2-HF3: BE-lock-ratcheted stop was hit before trade reached
            // target. Reuse the existing stop_hit ExitCondition type on the
            // paper side to keep downstream P&L math identical; the reason
            // string carries the BE-protect semantics.
            // P19-B8.5 (Langston Step-4 note, comment corrected): the closed-trade
            // row records 'stop_hit' in closeReason (closeReason: exitCondition.type
            // — the literal returned below), NOT 'break_even_stop' as this comment
            // previously claimed. Consequence: a BE-ratchet scratch (near-neutral,
            // not thesis-invalidating) is indistinguishable from a real stop-out in
            // close_reason, and trips the #509 post-stop re-entry cooldown too —
            // conservative-safe, accepted; distinguishing them = a closeReason
            // taxonomy question for the Phase-25 learning reads.
            console.log(`[B65.2][EXIT_TRIGGER] symbol=${position.symbol} type=break_even_stop price=${currentPrice} ratcheted_stop=${decision.newStopPrice?.toFixed(4)}`);
            return {
              type: 'stop_hit',
              price: currentPrice,
              reason: `Break-even protection: ratcheted stop at ${decision.newStopPrice?.toFixed(2)} hit before target`,
            };
          case 'trailing_stop_hit':
            console.log(`[B65.2][EXIT_TRIGGER] symbol=${position.symbol} type=trailing_stop_hit price=${currentPrice} ratcheted_stop=${decision.newStopPrice?.toFixed(4)}`);
            return {
              type: 'trailing_stop_hit',
              price: currentPrice,
              reason: `Trailing stop at ${decision.newStopPrice?.toFixed(2)} hit after moonbag ratchet`,
            };
          case 'moonbag_timeout':
            console.log(`[B65.2][EXIT_TRIGGER] symbol=${position.symbol} type=moonbag_timeout price=${currentPrice}`);
            return {
              // Reuse the existing trailing_stop_hit exit bucket on the DB
              // side so we don't need a new enum — the close reason will
              // be suffixed (see closePosition). Callers reading the
              // ExitCondition.type can still distinguish via the reason string.
              type: 'trailing_stop_hit',
              price: currentPrice,
              reason: `Moonbag duration cap reached (4h) — forced close at ${currentPrice.toFixed(2)}`,
            };
        }
      }
    }

    // Per-position max holding period (separate from the global 4h moonbag
    // cap above — this is a position-level operator override that typically
    // targets much longer holds, e.g. a "close this swing trade after 7d"
    // rule). Unchanged by B65.2.
    //
    // W2.1 (2026-06-06): the hold is now carried as an explicit MILLISECONDS
    // value in `metadata.maxHoldingMs`. Previously this read
    // `metadata.maxHoldingPeriod` and treated it as HOURS, which silently
    // enforced a bar-count of 24 as 24 HOURS. We now compare elapsed ms to the
    // hold ms directly (no unit guessing); the reason string still shows
    // hours-held for readability.
    const maxHoldingMs =
      typeof metadata?.maxHoldingMs === 'number' && isFinite(metadata.maxHoldingMs)
        ? metadata.maxHoldingMs
        : undefined;
    // P19-B8.5j (2026-07-24, Kyle directive): the max-hold force-close is GOVERNED
    // by a per-lane master switch and ships OFF. It stays off until the max-hold
    // policy is debated. `isMaxHoldEnabled()` resolves `enabled_paper`/`enabled_live`
    // (by this.mode) FAIL-SAFE: absent/cold-cache → OFF, the non-destructive
    // direction (a force-close is irreversible; not-closing is not). Gating the
    // ENFORCEMENT (not the stamp) protects every already-open position immediately.
    if (maxHoldingMs !== undefined && this.isMaxHoldEnabled()) {
      const openTime = new Date(position.openedAt).getTime();
      const elapsedMs = Date.now() - openTime;

      if (elapsedMs >= maxHoldingMs) {
        const hoursHeld = elapsedMs / (1000 * 60 * 60);
        const maxHours = maxHoldingMs / (1000 * 60 * 60);
        return {
          type: 'max_holding_period',
          price: currentPrice,
          reason: `Max holding period of ${maxHours.toFixed(1)}h exceeded (held ${hoursHeld.toFixed(1)}h)`
        };
      }
    }

    return null;
  }

  private async closePosition(
    positionId: string,
    exitPrice: number,
    exitCondition: ExitCondition,
    priceSource?: string,
    // P19-B8.6: makerExitFill — a resting maker TARGET-exit that genuinely traded
    // through fills AT the limit with the MAKER fee and zero slippage BY CONSTRUCTION
    // (the same fill=limit semantics as the B7.2c entry rest — no depth walk; the order
    // was resting, the market came to it). Absent = the normal depth-walked taker close.
    // exitRest — the rest-cohort stamp payload, passed EXPLICITLY by the caller
    // (Langston Step-4 ①): this method re-fetches the position row, so stamps must not
    // be reconstructed from whichever rest fields survive in the DB at close time.
    options?: {
      makerExitFill?: { limit: number };
      exitRest?: { restedAtPrice: number; placedAtMs: number | null; outcome: 'fill' | 'convert' };
      // ── B-EXIT-PROVENANCE P5 — the EXIT stamp, carried on the SAME explicit-payload
      // mechanism Langston authored for `exitRest`, not a parallel one. Same constraint,
      // and it is his: this method RE-FETCHES the position row, so a stamp must never be
      // reconstructed from whichever fields happen to survive in the DB at close time.
      exitProvenance?: {
        /** The value that actually DROVE the exit — NOT always the recorded exit price. */
        decisionPrice: number;
        /** WHICH HANDLER produced it. `source` alone cannot discriminate the two `kraken_ws`
         *  producers — both stamp `kraken_ws`. That is #741.
         *  ⛔ CORRECTED 2026-08-30: this said "a book midpoint from a ticker PRINT". THE TICKER LEG
         *  IS ALSO A MIDPOINT (`kraken-v2-translator.ts` overwrites `c` with `(bid+ask)/2` whenever
         *  both sides exist) — they differ by WHICH BBO, not by kind (#952/#941). The KIND is now
         *  carried in the producer's own `_mid`/`_last` suffix; WHICH BBO remains #952's open
         *  question and the suffix does not answer it. */
        producer: PriceProducer;
        /** The POLICY label: may the engine act on this price? Kept ALONGSIDE `producer`,
         *  never merged — merging them is what created the defect. */
        source: string;
        /** Venue OBSERVATION time. NULL where the leg genuinely has none.
         *  ⛔ `diffMs` MUST NOT feed this on ANY branch — it is inter-tick CADENCE, and the
         *  engine already logs it as `ageMs=`, so it is exactly the value an implementer
         *  reaches for. Any use of it here is a wrong-object stamp and the fence fails it. */
        observedAtMs: number | null;
        /** RENAMED from `priceAgeMs`, which never held an age. The rename is half the
         *  prohibition above: the old name was the invitation. */
        tickCadenceMs: number | null;
        /** Independent cross-check. `bookMid`/`bookAgeMs` are NULL BY CONSTRUCTION on xStock —
         *  `getBookForFill` is the crypto WS mini-book with no xStock equivalent — not by omission.
         *  ⛔ BOUNDED 2026-08-30: NOT a claim that xStock has no book anywhere. The FILL-time
         *  `getDepthSnapshot` returns a synthesised xStock ladder and `exit_fill_depth_age_ms` is
         *  populated from it on that class.
         *  ⛔ AND BOTH ARE DECISION-TIME — this payload is built once per position, above the
         *  exit-condition evaluation. `exit_fill_depth_age_ms` is the FILL-time one. */
        bookMid: number | null;
        bookAgeMs: number | null;
        tickerBid: number | null;
        tickerAsk: number | null;
      };
    }
  ): Promise<void> {
    const position = await storage.getActiveOpenPosition(this.mode, positionId);
    if (!position) {
      console.warn(`[PaperExecution:${this.mode}] Position ${positionId} not found`);
      return;
    }

    // [B8.PNL][CLOSE_ATTEMPT] - Log before any math is done
    console.log(`[B8.PNL][CLOSE_ATTEMPT]`, JSON.stringify({
      symbol: position.symbol,
      strategy: position.strategyName,
      side: position.side,
      quantity: position.quantity,
      entryPrice: position.avgPrice,
      rawExitPriceParam: exitPrice,
      // B-EXIT-PROVENANCE: RENAMED from `exitPriceSource`, which is now a real COLUMN. This is the
      // `priceSource` PARAMETER — and when it is defaulted it holds a close CONDITION, not a
      // provenance. Sharing the column's name with a log field is what cost a full review round:
      // a grep for `exitPriceSource` found THIS LINE and read it as the writer, when it persists
      // nothing. The name now says which of the two it is.
      priceSourceParam: priceSource ?? 'unknown',
      mode: this.mode,
      positionOpenedAt: position.openedAt,
      now: new Date().toISOString()
    }));

    const avgPrice = parseFloat(position.avgPrice); // Actual entry price (with slippage)
    const quantity = parseFloat(position.quantity);
    const entryValue = avgPrice * quantity;
    
    // Phase 8.8.3-C2: Get intended entry price for gross P/L calculation
    const intendedEntryPrice = position.intendedEntryPrice 
      ? parseFloat(position.intendedEntryPrice) 
      : avgPrice; // Fallback for old positions
    // B-COST-ACCOUNTING-HONESTY: `intendedEntryValue` (the old netPnlPercent denominator) was
    // removed with the actual-fill gross — the percentage now divides by capital ACTUALLY deployed.
    // `intendedEntryPrice` itself is RETAINED: it is still persisted on the row (:2002) and is the
    // benchmark the retained slippage telemetry is measured against.

    // Apply exit slippage and fees
    const _b45FeePct = this.feePercentFor(position.symbol, asValidAssetClass((position as { assetClass?: unknown }).assetClass) ?? undefined); // P19-B6.5d (OBJ-4): prefer the position stamp; B-4.5 per-class
    // P19-B4b.1: exit fill via the DEPTH-WALKED OrderPlacer port. The close ALWAYS
    // full-fills (R2 — a market exit always gets out, never a phantom stuck position);
    // the placer walks the live bid snapshot and prices any beyond-book remainder with
    // the DB-resolved per-class penalty (no magic constant; Langston Q-A). Cold book →
    // requestedPrice worsened by the penalty, loudly. Closes are NOT depth-gated (you
    // must always be able to exit), so there is no skip path here.
    const _closeClass = asValidAssetClass((position as any).assetClass) ?? safeResolveAssetClass(position.symbol, 'kraken');
    let actualExitPrice: number;
    let exitFee: number;
    let _exitSlippageOverride: number | null = null;
    let _takerCloseSlippage = 0;
    // ── B-EXIT-BOOK-AGE-STAMP OBJ-1 / P7 — THE AGE OF THE DEPTH THE FILL ACTUALLY WALKED.
    // DECLARED HERE, ABOVE THE IF/ELSE, FOR THE REASON THE `_witness` BELOW IS PLACED BELOW IT: the
    // MAKER leg fetches no depth at all (it filled at a resting limit — no book was consulted), so a
    // NULL on that leg is the honest value and is discriminable by `exit_fee_mode = 'maker'`.
    // ⛔ `_closeSnap` is `const`-scoped to the else block and the persist is ~280 lines below it, so
    // it is NOT in scope there — hence a hoisted `let` rather than a read at the write site.
    let _fillDepthAgeMs: number | null = null;
    if (options?.makerExitFill) {
      // P19-B8.6 MAKER fill leg: the resting exit filled at its limit — price = the
      // limit exactly (makerFillPrice semantics, same CI-guarded fill=limit rule as
      // entries), fee = notional × the per-class MAKER rate, slippage = 0 by
      // construction. No depth walk — the market traded through a resting order.
      const _mLimit = options.makerExitFill.limit;
      const _mNotional = _mLimit * quantity;
      const _mRate = _closeClass ? getFrictionForAssetClass(_closeClass).feeRateMaker : getFrictionForAssetClass('crypto_spot').feeRateMaker;
      actualExitPrice = _mLimit;
      exitFee = _mNotional * _mRate;
      _exitSlippageOverride = 0;
      console.log(`[P19-B8.6][MAKER_EXIT_FILL:${this.mode}] ${position.symbol}: filled the resting exit at ${_mLimit} (maker rate ${(100 * _mRate).toFixed(2)}%, fee ${exitFee.toFixed(4)}, slippage 0 by construction)`);
    } else {
      const _closeCfg = _closeClass ? await resolveFillDepthGateConfig(_closeClass) : null;
      const _closeSnap = _closeClass ? await getDepthSnapshot(position.symbol, _closeClass) : null;
      // OBJ-1: the FILL-time depth age — taken two lines before the walk that consumes it, with no
      // await in between. ⛔ NOT the same instant as `exit_book_age_ms`, which is built once per
      // position ABOVE the exit-condition evaluation; and NOT the same instant as
      // `entry_book_age_ms`, which is the depth-GATE reading with three awaits before its own walk.
      // Three different instants; the column comments name which is which.
      _fillDepthAgeMs = _closeSnap ? _closeSnap.ageMs : null;
      const _closeFill = await this.orderPlacer.closeOrder({
        symbol: position.symbol, side: 'sell', quantity, requestedPrice: exitPrice, mode: this.mode, positionId,
        assetClass: _closeClass ?? undefined,
        bookBids: _closeSnap?.bids,
        beyondDepthPenaltyBps: _closeCfg?.beyondDepthPenaltyBps,
      });
      if (_closeFill.status !== 'filled') {
        // C3 CLOSE-SEAM STATE RULE: a non-filled close leaves the position OPEN (close NOT
        // recorded), retried next exit-monitor cycle — never half-closed. Nothing above this
        // point has mutated the position. Paper always fills; this guards live.
        console.error(`[PaperExecution:${this.mode}][CLOSE_FILL_NONFILLED] ${position.symbol} pos=${positionId} status=${_closeFill.status} — position left OPEN, retry next cycle (paper fills must be atomic)`);
        return;
      }
      actualExitPrice = _closeFill.fillPrice;
      exitFee = _closeFill.feeQuote;
      _takerCloseSlippage = _closeFill.slippageQuote;
      // OBJ-1 verification leg (paired log): crypto cannot be reconstructed after the fact — nothing
      // persists the WS mini-book, and the nearby ticker archive is a DIFFERENT feed off a separate
      // socket. This is the contemporaneous record the column is checked against.
      // ⛔ PLACED HERE, BELOW THE FILL, DELIBERATELY. It was first written between the depth read and
      // the walk that consumes it — i.e. INSIDE the very interval this column exists to measure. A
      // console.log to a PM2-piped stdout can block under backpressure, so the instrument would have
      // perturbed its own measurement. The value is captured above; the reporting waits.
      console.log(`[B-EXIT-BOOK-AGE-STAMP][FILL_DEPTH_AGE] symbol=${position.symbol} class=${_closeClass ?? 'none'} depthSource=${_closeSnap?.source ?? 'none'} ageMs=${_fillDepthAgeMs ?? 'null'}`);
    }
    
    // ── B-EXIT-PROVENANCE OBJ-3 / #911 — THE INDEPENDENT WITNESS, STAMPED ON BOTH LEGS.
    // Placed HERE, below the if/else, deliberately: the MAKER leg never fetches a depth snapshot
    // at all (it filled at a resting limit — no book was consulted), so a witness taken inside the
    // taker branch would be silently absent on exactly the cohort that produced this batch's first
    // OBJ-2 specimen. One call, after both legs, covers both.
    // ⛔ NOT taken from `_closeSnap`: on crypto that IS the book the fill walked — the suspect —
    // and a cross-check against the suspect's own testimony agrees by construction and proves
    // nothing. The archiver's ticker snapshot is a separate socket, hence a real second opinion.
    // ⚠️ On xStock it is NOT independent (same table the fill reads) — a CONSISTENCY record only.
    // Fail-OPEN: a null witness stamps NULL and never blocks the close.
    const _witness = _closeClass ? await getTickerWitness(position.symbol, _closeClass) : null;

    // Get entry costs from position (persisted at entry time)
    const entryFee = position.entryFee ? parseFloat(position.entryFee) : (entryValue * (_b45FeePct / 100));
    const entrySlippage = position.entrySlippage ? parseFloat(position.entrySlippage) : 0;
    // P19-B3a: from the close FillResult (== exitSlippagePerUnit * quantity); P19-B8.6:
    // a maker exit-fill overrides to 0 by construction (filled at the resting limit).
    const exitSlippage = _exitSlippageOverride ?? _takerCloseSlippage;

    // B-COST-ACCOUNTING-HONESTY (Kyle 2026-07-28): gross is measured on the prices we ACTUALLY
    // traded at, and the cost line carries EXPLICIT costs only.
    //
    // WHY (industry basis, researched): Harris, *Trading and Exchanges* Ch.21 splits EXPLICIT costs
    // (fees/commissions — real accounting entries) from IMPLICIT costs (spread/impact/slippage —
    // estimates against a counterfactual benchmark, not bookable entries). Zipline, the reference
    // backtest engine, bakes slippage INTO the fill price and models commissions separately — never
    // both. Slippage is already inside actualEntryPrice/actualExitPrice, so ALSO subtracting it
    // would DOUBLE-COUNT it.
    //
    // ★ NET IS UNCHANGED BY THIS EDIT — this is the safety property, and it is algebraic, not luck.
    // The previous form was gross=(E_req − B_int)q with cost=fees+(B_act−B_int)q+(E_req−E_act)q,
    // which telescopes to exactly (E_act − B_act)q − fees. The new form computes that directly.
    // Verified on the live population: net matched true economics on 293/293 closed trades under
    // the OLD formula, and the new formula IS that expression. No money figure moves.
    //
    // Slippage is RETAINED on the row as signed execution-quality telemetry (positive = cost) —
    // reported, not deducted. Sign convention is stated explicitly because NO industry standard
    // exists (Talos, Anboto and retail-FX conventions mutually contradict).
    // B-COST-MATH-CONSOLIDATION — SITE 1 of 3, now a CALL rather than a copy.
    // This arithmetic used to be hand-synchronised across three sites; the comments said "must
    // stay in lockstep" and the copies drifted anyway. There is now ONE implementation
    // (core/math/trade-pnl.ts), which carries the F1/F2/F3 provenance resolution and the sign
    // convention. Verified bit-identical to the retired inline form before the re-point.
    const { grossPnl, totalCost, netPnl, netPnlPercent } = computeRealizedPnl({
      actualEntryPrice: avgPrice,
      actualExitPrice,
      quantity,
      entryFee,
      exitFee,
    });
    // Same quantity under its persistence-payload name (the row below writes `fees`/`totalFee`).
    const totalFees = totalCost;
    
    // Legacy fields for backward compatibility
    const totalSlippage = entrySlippage + exitSlippage;
    const pnlPercent = netPnlPercent; // For backward compatibility

    // [B8.PNL] Anomaly guard: Check for >100% price move within 5 minutes
    const priceMoveRatio = avgPrice > 0 ? Math.abs((actualExitPrice - avgPrice) / avgPrice) : 0;
    if (priceMoveRatio > 1 && position.openedAt) {
      const msOpen = Date.now() - new Date(position.openedAt).getTime();
      if (msOpen < 5 * 60 * 1000) {
        console.error(`[B8.PNL][ANOMALOUS_CLOSE]`, JSON.stringify({
          symbol: position.symbol,
          strategy: position.strategyName,
          side: position.side,
          quantity: quantity,
          entryPrice: avgPrice,
          actualExitPrice: actualExitPrice,
          priceMoveRatio: priceMoveRatio,
          priceMovePercent: (priceMoveRatio * 100).toFixed(2) + '%',
          msOpen: msOpen,
          closeReason: exitCondition.type,
          priceSource: priceSource ?? 'unknown'
        }));
      }
    }

    // [B8.PNL][CLOSE_COMPUTED] - Log computed values before DB write
    console.log(`[B8.PNL][CLOSE_COMPUTED]`, JSON.stringify({
      symbol: position.symbol,
      strategy: position.strategyName,
      side: position.side,
      quantity: quantity,
      entryPrice: avgPrice,
      actualExitPrice: actualExitPrice,
      profit: netPnl,
      profitPct: pnlPercent,
      closeReason: exitCondition.type,
      mode: this.mode
    }));

    // Phase 8.8.3-C5-5: Consolidated close log (reduced from verbose C2 debug logs)
    console.log(`[PaperExecution:${this.mode}] Position closed ${position.symbol}: Entry $${avgPrice.toFixed(2)} -> Exit $${actualExitPrice.toFixed(2)}, Net P/L: $${netPnl.toFixed(2)} (${netPnlPercent.toFixed(2)}%), Costs: $${totalCost.toFixed(2)}, Reason: ${exitCondition.type}`);
    
    // Directive 8.8.4-L1: Capture trade outcome data for learning aggregation
    const holdDurationMs = position.openedAt ? Date.now() - new Date(position.openedAt).getTime() : 0;
    dataAggregator.capture('TRADE_OUTCOME', {
      symbol: position.symbol,
      strategy: position.strategyName || 'unknown',
      profit: netPnl,
      profitPct: netPnlPercent,
      duration: holdDurationMs,
      stopLossHit: exitCondition.type === 'stop_hit',
      takeProfitHit: exitCondition.type === 'target_hit',
      closeReason: exitCondition.type,
      entryPrice: avgPrice,
      exitPrice: actualExitPrice,
      quantity: quantity
    }).catch(() => {});

    // B70 Step 3.5: exit-decision archive — actual active-engine exit. Fire-and-
    // forget, try/catch wrapped — must never block closePosition.
    try {
      const { archiveExitDecision } = await import('./data-archive/exit-decision-archiver.js');
      const { asValidAssetClass, safeResolveAssetClass } = await import('../../shared/asset-classes.js');
      const exitReasonMap: Record<string, 'BE_stop' | 'SL_hit' | 'TP_target_hit' | 'TRAIL_hit' | 'time_stop' | 'manual' | 'other'> = {
        stop_hit: 'SL_hit',
        target_hit: 'TP_target_hit',
        trailing_stop_hit: 'TRAIL_hit',
        break_even_stop: 'BE_stop',
        timeout: 'time_stop',
        manual_stop: 'manual',
      };
      const mappedReason = exitReasonMap[exitCondition.type] ?? 'other';
      const exchange = (position as any).exchange ?? 'kraken';
      // P19-B4a (C4): prefer the position's authoritative stamp; cold-resolve only
      // if the stamp is missing/invalid. archiveExitDecision requires a non-null
      // asset_class, so on a null resolution we skip the archive write entirely
      // (archive-only, fire-and-forget) rather than persist a wrong/blank class.
      const assetClass =
        asValidAssetClass((position as any).assetClass) ?? safeResolveAssetClass(position.symbol, exchange);
      const rMultiple =
        position.stopLoss && position.avgPrice && position.avgPrice !== position.stopLoss
          ? (actualExitPrice - avgPrice) /
            Math.abs(avgPrice - parseFloat(String(position.stopLoss)))
          : undefined;
      // P19-B4a (C4): asset_class is REQUIRED on the archive row — skip the write
      // on an unclassifiable symbol rather than persist a wrong/blank class.
      if (assetClass === null) {
        console.warn(`[B70][ARCH] paper exit-decision archive skipped — unclassifiable ${position.symbol} (no valid asset class)`);
      } else {
      archiveExitDecision({
        mode: tradingModeToRunMode(this.mode), // ITEM-4 step 2 (D1): this engine's OWN mode
        tradeId: positionId,
        symbol: position.symbol,
        exchange,
        assetClass,
        source: 'active-execution-engine',
        strategy: position.strategyName ?? undefined,
        exitReason: mappedReason,
        entryPrice: avgPrice,
        exitPrice: actualExitPrice,
        pnlPct: netPnlPercent,
        rMultiple,
        durationMin: holdDurationMs / 60000,
        stateSnapshot: {
          mode: this.mode,
          quantity,
          entryFee,
          exitFee,
          entrySlippage,
          exitSlippage,
          totalCost,
          grossPnl,
          netPnl,
          priceSource,
          sourcePool: (position as any).sourcePool,
        },
      });
      } // P19-B4a (C4): end assetClass-present guard
    } catch (b70Err) {
      console.warn(
        `[B70][ARCH] paper exit-decision archive enqueue failed:`,
        b70Err instanceof Error ? b70Err.message : b70Err,
      );
    }

    // Find the corresponding trade record
    const trades = await storage.getClosedTradesBySymbol(this.mode,  position.symbol);
    const trade = trades.find(t => t.openedAt && !t.closedAt);

    // ★ #620: the PERSISTED net, hoisted to this scope on purpose. The write below lives inside
    // `if (trade)` while the reconciliation call sits OUTSIDE it, so a const declared in the block
    // is NOT in scope at the call — measured, tsc +2 on the first attempt. Stays `undefined` when
    // no trade row was found, which the diagnostic reports as "not checked" rather than as a pass.
    let _persistedNetPnl: number | undefined;

    if (trade) {
      // B65.2: read the final trailing-engine state for this symbol so the
      // closed-trade row preserves whether the trade ended in moonbag mode.
      // If no state exists (trade opened before the engine started tracking
      // it, or cleared already), default to TARGET.
      // B65.4: also capture ladder rung count from the same state.
      // B65.4.2 (2026-04-28): also capture observability fields for the
      // closed-trade record (originalStopPrice, latchTriggerPrice,
      // rungTargetHistory). All optional; null on persisted trades that
      // closed before this state was tracked.
      const { getTrailingState: _getTES } = await import('./trailing-exit-controller.js');
      // B80 (2026-05-13): per-trade keying — look up engine state by position.id.
      const _finalState = _getTES(position.id);
      const finalTradeMode: 'TARGET' | 'TRAILING_TAKE' = _finalState?.tradeMode ?? 'TARGET';
      const finalLadderRung: number = _finalState?.ladderRung ?? 0;
      const finalOriginalStop: number | null = _finalState?.originalStopPrice ?? null;
      const finalLatchTrigger: number | null = _finalState?.latchTriggerPrice ?? null;
      const finalRungHistory: number[] | null = _finalState?.rungTargetHistory ?? null;

      // Update trade record - Phase 8.8.3-C2: Include all cost/P&L breakdown fields
      // ★ #620: the return value is CAPTURED, not discarded. `updateClosedTrade` already does
      // `.returning()`, so the PERSISTED row is in hand with NO extra read — which is why the
      // engine-vs-persisted round-trip check (the one P&L invariant never checked) costs nothing.
      const _persistedTrade = await storage.updateClosedTrade(this.mode, trade.id, {
        exitPrice: actualExitPrice.toString(),
        pnl: netPnl.toString(),
        pnlPercent: pnlPercent.toString(),
        fees: totalFees.toString(),
        slippage: totalSlippage.toString(),
        closeReason: exitCondition.type,
        closedAt: new Date(),
        // Phase 8.8.3-C2: New cost transparency fields
        entryFee: entryFee.toString(),
        exitFee: exitFee.toString(),
        totalFee: totalFees.toString(),
        intendedEntryPrice: intendedEntryPrice.toString(),
        actualEntryPrice: avgPrice.toString(),
        entrySlippage: entrySlippage.toString(),
        targetExitPrice: exitPrice.toString(),
        actualExitPrice: actualExitPrice.toString(),
        exitSlippage: exitSlippage.toString(),
        // P19-B8.6 exit-side cohort stamps (AC-6/AC-7 — the denominator lives here),
        // sourced EXCLUSIVELY from the caller's explicit exitRest option (Langston ①):
        // maker fill → 'maker'/'fill'; any taker close of a position that had a rest
        // (deadline convert, stop-during-rest) → 'taker'/'convert' with the rested-at
        // price PRESERVED — the convert cohort is the maker-miss half the denominator
        // measures; never-rested taker closes → 'taker'/NULL.
        exitFeeMode: options?.makerExitFill ? 'maker' : 'taker',
        exitRestOutcome: options?.exitRest?.outcome ?? null,
        exitRestedAtPrice: options?.exitRest ? options.exitRest.restedAtPrice.toString() : null,
        exitRestDurationMs: options?.exitRest?.placedAtMs != null
          ? Math.max(0, Date.now() - options.exitRest.placedAtMs)
          : null,
        // ── B-EXIT-PROVENANCE P5 — persist the exit stamp (OBJ-1/2/3).
        // ⛔ `exit_price_source` falls back to the `priceSource` PARAMETER, never to a literal
        // string. `closePosition`'s `priceSource` DEFAULTS to `'manual_stop'` upstream, which is
        // a close CONDITION and not a provenance — it satisfies "not null" perfectly while
        // asserting nothing. The OBJ-5 fence keys on the ENUMERATED vocabulary precisely so a
        // value like that FAILS rather than passing green.
        exitDecisionPrice: options?.exitProvenance
          ? options.exitProvenance.decisionPrice.toString()
          : null,
        exitPriceProducer: options?.exitProvenance?.producer ?? null,
        // ⛔ NO FALLBACK TO `priceSource`, DELIBERATELY. That parameter DEFAULTS to
        // `'manual_stop'` upstream — a close CONDITION, not a provenance — and writing it here
        // would satisfy a non-null fence perfectly while asserting nothing about where the price
        // came from. An unstamped close must land NULL so the fence SEES it; a green fence over a
        // condition string is the exact failure OBJ-5 was rewritten to catch.
        exitPriceSource: options?.exitProvenance?.source ?? null,
        exitObservedAtMs: options?.exitProvenance?.observedAtMs ?? null,
        exitTickCadenceMs: options?.exitProvenance?.tickCadenceMs ?? null,
        exitBookMid: options?.exitProvenance?.bookMid != null
          ? options.exitProvenance.bookMid.toString()
          : null,
        exitBookAgeMs: options?.exitProvenance?.bookAgeMs ?? null,
        // ── B-EXIT-BOOK-AGE-STAMP OBJ-1 — the age of the depth the FILL walked. NOT from
        // `exitProvenance`: that payload is built once per position above the exit-condition
        // evaluation, so it carries a DECISION-time age. This one is taken at the fill.
        // ⛔ A NULL HERE IS FOUR-VALUED, NOT TWO. `exit_fee_mode` alone does NOT separate them —
        // that column has exactly ONE writer, at :2296 inside this function, so every close that does
        // NOT come through here lands NULL/NULL:
        //   fee_mode='maker'  → a resting fill consulted no depth. The honest structural null.
        //   fee_mode='taker'  → the taker branch ran and `getDepthSnapshot` returned null
        //                       (cold or one-sided book). Also honest, and a different fact.
        //   fee_mode IS NULL  → the row was NOT written by `closePosition` at all — `never_filled`,
        //                       `closeAllPositions`, `engine_stop_cleanup`, `hard_reset`, or the two
        //                       routes.ts manual paths — OR it predates this column.
        //                       ⇒ USE `close_reason` AND `closed_at`, NOT `exit_fee_mode`.
        // ⛔ NOT the same QUANTITY across classes: crypto = live WS mini-book age; xStock =
        // `xstock_spot_ticker_snap` ROW age. Never pool them. `DepthSnapshot.source` is the
        // discriminator and the column comment says so.
        exitFillDepthAgeMs: _fillDepthAgeMs,
        // OBJ-3 (#911): the caller's payload wins if it ever carries one; otherwise the witness
        // read above. Both may legitimately be absent — a NULL here now means "no witness row",
        // which is a DIFFERENT fact from the pre-#911 "not instrumented" and the column comment
        // has been corrected to say so.
        exitTickerBid: options?.exitProvenance?.tickerBid != null
          ? options.exitProvenance.tickerBid.toString()
          : (_witness ? _witness.bid.toString() : null),
        exitTickerAsk: options?.exitProvenance?.tickerAsk != null
          ? options.exitProvenance.tickerAsk.toString()
          : (_witness ? _witness.ask.toString() : null),
        totalCost: totalCost.toString(),
        grossPnl: grossPnl.toString(),
        netPnl: netPnl.toString(),
        netPnlPercent: netPnlPercent.toString(),
        tradeMode: finalTradeMode, // B65.2
        ladderRungsHit: finalLadderRung, // B65.4
        // B65.4.2: ladder mechanics observability columns. Drizzle schema
        // has these as numeric/jsonb so we pass strings/array/null directly.
        originalStopPrice: finalOriginalStop !== null ? finalOriginalStop.toString() : null,
        latchTriggerPrice: finalLatchTrigger !== null ? finalLatchTrigger.toString() : null,
        rungTargetHistory: finalRungHistory,
      });
      // Capture the round-trip value at the OUTER scope (see the hoist above).
      _persistedNetPnl = _persistedTrade?.netPnl != null
        ? parseFloat(_persistedTrade.netPnl.toString())
        : undefined;

      // Log the exit event with C2 breakdown
      await storage.createActiveTradeLog(this.mode, {
        tradeId: trade.id,
        positionId: positionId,
        eventType: 'position_closed',
        message: `Position closed: ${position.symbol} - ${exitCondition.reason}`,
        metadata: {
          exitPrice: actualExitPrice,
          slippage: totalSlippage,
          fees: totalFees,
          pnl: netPnl,
          pnlPercent: pnlPercent,
          closeReason: exitCondition.type,
          // C2 breakdown
          grossPnl,
          netPnl,
          entryFee,
          exitFee,
          entrySlippage,
          exitSlippage,
          totalCost
        }
      });
      
      // Directive 8.8.4-M5C.1: Record paper trade for VTS comparison audit
      try {
        const paperTradeRecord: PaperTradeRecord = {
          symbol: position.symbol,
          strategy: position.strategyName || 'unknown',
          entryPrice: avgPrice,
          exitPrice: actualExitPrice,
          di: parseFloat((trade as any).di || '0'),
          gsi: parseFloat((trade as any).gsi || '0.5'),
          profit: netPnl > 0 ? netPnl : 0,
          loss: netPnl < 0 ? Math.abs(netPnl) : 0,
          positionSize: quantity * avgPrice,
          timestamp: new Date().toISOString()
        };
        recordPaperTrade(paperTradeRecord);
        console.log(`[M5C.1][ACTIVE_TRADE_RECORDED] ${position.symbol}/${position.strategyName} profit=${netPnl.toFixed(2)}`);
      } catch (recordErr) {
        console.warn(`[M5C.1][ACTIVE_RECORD_FAILED] ${position.symbol}:`, recordErr);
      }
    }

    // B67.4 (2026-05-01): per-(regime, strategy) outcome feedback EMA update.
    // Mirrors the same hook in vts-service:persistRealPriceTrade — both close
    // paths feed the same singleton OutcomeFeedbackStore so signal evaluation
    // (active or VTS) reads a unified per-tuple history.
    try {
      // B-OUTCOME-FEEDBACK-WIRE (#602, 2026-08-06): read the at-open canonical
      // regime from position metadata (stamped at createActiveOpenPosition beside
      // the sibling _b67_2_1_* fields). The old any-cast of position.regime
      // read a column that never existed — activeOpenPositions declares none —
      // so this gate failed on EVERY close and the active path never wrote the
      // outcome-learning store (store measured 13/13 entries vts_, zero paper_sim).
      const regimeAtOpen = (position.metadata as Record<string, unknown> | null)?.['regimeAtOpen'] as string | undefined;
      const strategyName = position.strategyName;
      if (regimeAtOpen && strategyName && Number.isFinite(netPnlPercent)) {
        const { outcomeFeedbackStore } = await import('../core/metrics/outcome-feedback-store.js');
        const { getMarketContextEngine } = await import('./market-context-engine.js');
        const cfg = getMarketContextEngine().getCurrentOutcomeFeedbackConfig();
        if (cfg !== null) {
          // B79.0n.EXECUTION CHUNK B (2026-05-27): position-record SSOT.
          // Read assetClass directly from the position record (canonical SSOT
          // write at createActiveOpenPosition L2147). Defensive fallback to
          // safeResolveAssetClass is BELT-AND-SUSPENDERS, NOT load-bearing —
          // L922 B79.TEC NO_FALLBACK hard-fails on a position missing
          // assetClass before flow ever reaches this hook. The fallback locks
          // safe behavior against future drift (e.g., new caller paths that
          // bypass L922 invariants). Per-class isolation prevents crypto
          // outcome contamination of xstock signals and vice-versa.
          // [Pre-B79.0n.EXECUTION: re-resolved from symbol via
          // safeResolveAssetClass(position.symbol, 'kraken') — drift cleanup
          // per Langston Step 1.a Q4-B audit + Step 2 B2 reframe.]
          const { safeResolveAssetClass } = await import('../../shared/asset-classes.js');
          const _assetClass = (position as any).assetClass ?? safeResolveAssetClass(position.symbol, 'kraken');
          if (_assetClass !== null) {
            // ITEM-4 step 2 (D9): this per-mode engine writes ITS OWN partition
            // (carried mode → RunMode via the single mapping site) — a paper_sim
            // close can never blend into the vts-trained aggregate (#210/D9 fix).
            const { getCalibrationEpoch } = await import('../core/metrics/calibration-epoch.js');
            const _learnSource = tradingModeToRunMode(this.mode);
            outcomeFeedbackStore.updateEma(
              _learnSource,
              _assetClass,
              regimeAtOpen,
              strategyName,
              netPnlPercent,
              cfg.alpha,
              Date.now(),
              // B-5 (Obj-12): class-scoped epoch (most-specific-wins; wildcard
              // when no class row exists for this source).
              getCalibrationEpoch(_learnSource, _assetClass),
            );
          }
        }
      } else {
        // B-OUTCOME-FEEDBACK-WIRE (#602) fold-2: instrument the skip. A silent
        // fall-through here is what hid the dead gate for three months. Plain
        // else (Langston Step-4 F): an else-if gated on regimeAtOpen alone left the
        // non-finite-netPnlPercent leg silent — name WHICH condition failed.
        // (strategyName is notNull on the row type; that leg is unreachable.)
        const why = !regimeAtOpen
          ? 'no regimeAtOpen (pre-deploy position or cold MCE at open)'
          : 'non-finite netPnlPercent';
        console.log(
          `[B67.4][feedback] skip: ${why} symbol=${position.symbol} strategy=${strategyName ?? 'n/a'}`,
        );
      }
    } catch (err) {
      console.warn(
        '[B67.4][paper-execution] outcome feedback update failed:',
        err instanceof Error ? err.message : err,
      );
    }

    // [AJ19-B] Trade lifecycle CLOSE event - track slot counts before/after delete
    const slotCountBefore = (await storage.getActiveOpenPositions(this.mode)).length;
    let deleteSuccessful = false;
    let deleteError: string | undefined;
    
    // B65.2 / B80 (2026-05-13): clear trailing engine state after close-row
    // is updated with the final tradeMode. Decrements the concurrent-moonbag
    // counter if this trade was in TRAILING_TAKE mode. Pre-B80 keyed by
    // symbol — wiped state for ALL concurrent positions on the symbol.
    // Post-B80 keyed by position.id — only this position's state is cleared,
    // other concurrent positions on the same symbol are untouched.
    try {
      const { clearTrailingState } = await import('./trailing-exit-controller.js');
      clearTrailingState(position.id);
    } catch (err) {
      console.error(`[B65.2][TEC] Failed to clear trailing state for positionId=${position.id} symbol=${position.symbol}:`, err);
    }

    // Delete open position with error handling for AJ19-B
    try {
      await storage.deleteActiveOpenPosition(this.mode, positionId);
      deleteSuccessful = true;
      console.log(`[AJ19-B][DELETE_SUCCESS] positionId=${positionId} | symbol=${position.symbol}`);
      
      // Phase 8.8.3-B3.6: Unsubscribe from Kraken WebSocket after position close
      // Phase 8.8.3-I6-FIX: Enhanced diagnostic logging for unsubscription audit
      try {
        krakenWebSocketAdapter.unsubscribeFromSymbols([position.symbol]);
        console.log(`[8.8.3-I6-FIX][WS_UNSUB] closedSymbol=${position.symbol} | action=unsubscribe`);
        console.log(`[KrakenWS] Unsubscribed from ${position.symbol} after position close`);
      } catch (wsUnsubError) {
        console.warn(`[8.8.3-I6-FIX][WS_UNSUB_FAILED] symbol=${position.symbol} error=${wsUnsubError}`);
        console.warn(`[KrakenWS] Failed to unsubscribe from ${position.symbol}:`, wsUnsubError);
      }
    } catch (delErr: any) {
      deleteError = delErr.message || 'Unknown delete error';
      console.error(`[AJ19-B][DELETE_FAILED] positionId=${positionId} | symbol=${position.symbol} | error=${deleteError}`);
    }
    
    // Get slot count after delete attempt
    const slotCountAfter = (await storage.getActiveOpenPositions(this.mode)).length;
    
    // Map exit condition to close reason enum
    const closeReasonMap: Record<string, 'SL' | 'TP' | 'TRAILING_STOP' | 'MAX_HOLD' | 'MANUAL' | 'KILL_SWITCH' | 'ENGINE_STOP' | 'UNKNOWN'> = {
      'stop_hit': 'SL',
      'target_hit': 'TP',
      'trailing_stop_hit': 'TRAILING_STOP',
      // P19-B8.5f (OBJ-5): was 'UNKNOWN'. Correct now that OBJ-1 makes this exit actually
      // fire — see the MAX_HOLD note on AJ19BCloseEvent.closeReason.
      'max_holding_period': 'MAX_HOLD',
      'guardrail': 'KILL_SWITCH'
    };
    
    // Log AJ19-B close event
    try {
      await aj19bDiagnostic.logClose({
        tradeId: trade?.id,
        positionId: positionId,
        symbol: position.symbol,
        closeReason: closeReasonMap[exitCondition.type] || 'UNKNOWN',
        closedValue: actualExitPrice * quantity,
        pnl: netPnl,
        slotCountBefore,
        slotCountAfter,
        deleteSuccessful,
        deleteError,
        mode: this.mode
      }, this.mode);
    } catch (aj19bErr) {
      console.error('[AJ19-B] Error logging close event:', aj19bErr);
    }

    // [8.8.3-F][CLOSE] REB 8.8.3-F: Lifecycle log for trade closed
    console.log(`[8.8.3-F][CLOSE]`, JSON.stringify({
      tradeId: trade?.id || null,
      symbol: position.symbol,
      strategy: position.strategyName,
      direction: position.side,
      entryPrice: avgPrice,
      exitPrice: actualExitPrice,
      size: quantity,
      grossPnl: grossPnl,
      netPnl: netPnl,
      pnlPercent: pnlPercent,
      fees: totalFees,
      closeReason: exitCondition.type,
      timestamp: new Date().toISOString()
    }));
    
    // [AJ18] Trade lifecycle - CLOSE event
    const openTime = position.openedAt ? new Date(position.openedAt).getTime() : Date.now();
    const holdingMinutes = (Date.now() - openTime) / 60000;
    aj18Diagnostic.logTradeLifecycle({
      cycleId: aj18Diagnostic.getCycleId(),
      eventType: 'CLOSE',
      tradeId: trade?.id,
      symbol: position.symbol,
      strategy: position.strategyName,
      entryPrice: avgPrice,
      exitPrice: actualExitPrice,
      pnl: netPnl,
      closeReason: exitCondition.type,
      holdingDurationMinutes: holdingMinutes
    });

    // [8.8.3-I1] Trade lifecycle close event
    const isForceClose = exitCondition.type === 'manual_stop' || exitCondition.type === 'guardrail';
    if (isForceClose) {
      i1TradeLifecycleDiagnostics.logForceClose(
        trade?.id || positionId,
        position.symbol,
        position.strategyName || 'unknown',
        actualExitPrice,
        netPnl
      );
    } else {
      const closeReason = exitCondition.type as any;
      i1TradeLifecycleDiagnostics.logClose(
        trade?.id || positionId,
        position.symbol,
        position.strategyName || 'unknown',
        closeReason,
        actualExitPrice,
        netPnl,
        'normal'
      );
    }

    console.log(`[PaperExecution:${this.mode}] Position ${position.symbol} closed successfully`);
    
    // Phase 8.8.3-C5-3: P/L Sanity Check - verify P/L calculations match
    c5FinancialDiagnostics.logPnlReconciliation(
      this.mode,
      trade?.id || positionId,
      position.symbol,
      grossPnl,
      entryFee,
      entrySlippage,
      exitFee,
      exitSlippage,
      netPnl,
      // ★ #620: the PERSISTED net, straight from the write's own `.returning()` row. This is the
      // one hop where drift genuinely lives (numeric column round-trip / decimal precision) and
      // it has never been checked — `dbNetPnl` existed as a parameter and was passed by NOBODY
      // (presence-evidence: zero occurrences repo-wide outside the diagnostics file).
      _persistedNetPnl
    );
    
    // Phase 8.8.3-C5-1: Balance Reconciliation after trade close
    const isManualClose = exitCondition.type === 'manual_stop';
    await c5FinancialDiagnostics.logBalanceReconciliation(
      this.mode,
      isManualClose ? 'manual_close' : 'trade_close'
    );

    // Phase 8.8.4-C.12: Emit TRADE_CLOSED event (triggers RTB promotion via event handler)
    // B79.0n.EXECUTION CHUNK A (2026-05-27): populate assetClass from position
    // record (canonical SSOT write at L2147 createActiveOpenPosition). Same
    // C-7 doctrine as PromotionEvent — additive optional field, zero handler
    // breakage. See TradeClosedEvent interface in server/lib/event-bus.ts.
    const _tcAssetClass = (position as any).assetClass as string | undefined;
    // B79.0n.EXECUTION CHUNK A canary (per Langston Step 2 B2) — runtime probe
    // for operators to confirm assetClass populates correctly per class once
    // xstock active trading lights up at WIRE-IN (#14). Optional, no-cost.
    console.log(
      `[B79.0n.EXECUTION][EMIT_TRADE_CLOSED] mode=${this.mode} class=${_tcAssetClass ?? 'undefined'} symbol=${position.symbol} tradeId=${trade?.id || positionId}`
    );
    eventBus.emitTradeClosed({
      mode: this.mode,
      symbol: position.symbol,
      strategy: position.strategyName || 'unknown',
      tradeId: trade?.id || positionId,
      pnl: netPnl,
      timestamp: new Date().toISOString(),
      assetClass: _tcAssetClass,
    });
  }

  // B-PROMOTION-RACE-FIX (#508): single-flight state for checkRtbPromotion (below). Its three
  // triggers (TCL_ACTIVATED :380 / TRADE_CLOSED :400 / setInterval :444) were unlocked; two firing
  // near-simultaneously ran two concurrent promotion passes over the same queue that double-opened
  // the same signal (the orphan race). Per-instance (per-mode) booleans; single event loop.
  private promotionInProgress = false;
  private promotionRerunRequested = false;

  /**
   * Phase 8.8.4-B + C.5 + C.12 + C.14.B: Check for RTB Queue Promotion
   * Called via event handlers (TCL_ACTIVATED, TRADE_CLOSED) when promotion may be possible
   * Phase C.12: Uses tclWatchdog for event-driven TCL state management
   * Phase C.14.B: Multi-signal promotion - promotes all eligible signals up to openSlots limit
   * B-PROMOTION-RACE-FIX (#508): single-flight (1b coalescing re-run) — guard below + finally.
   */
  private async checkRtbPromotion(): Promise<void> {
    // Single-flight: if a pass is already running, request a coalesced re-run and return. The
    // running pass re-runs once when it finishes (catches a slot freed mid-pass by a TRADE_CLOSED).
    if (this.promotionInProgress) {
      this.promotionRerunRequested = true;
      return;
    }
    this.promotionInProgress = true;
    try {
      // Phase 8.8.4-C.12: Check TCL activation state via watchdog
      const tclActive = tclWatchdog.isActive(this.mode);
      if (!tclActive) {
        const tclStatus = tclWatchdog.getStatus(this.mode);
        console.log(`[8.8.4-C.12][TCL_WARMUP] mode=${this.mode}, state=${tclStatus.state}, elapsed=${(tclStatus.elapsedMs/1000).toFixed(0)}s - skipping promotion`);
        return;
      }

      // Phase 8.8.4-C.14.B: Calculate available slots for multi-signal promotion
      const openPositions = await storage.getActiveOpenPositions(this.mode);
      const modeSettings = await buildSettingsFromGuardrails(this.mode);
      // P19-B8.7 (OBJ-3): same safe-degrade as the promotion-interval site — no
      // fabricated cap; unreadable → halt this promotion pass loudly, loop survives.
      const maxTrades = Number(modeSettings.maxOpenTrades);
      if (!Number.isFinite(maxTrades) || maxTrades <= 0) {
        console.error(`[P19-B8.7][GUARDRAIL_READ_FAIL:${this.mode}] max_open_positions unreadable (${maxTrades}) — promotion pass HALTED (safe-degrade, no fabricated cap). Seed/repair guardrails_v2.`);
        return;
      }
      let openSlots = maxTrades - openPositions.length;

      if (openSlots <= 0) {
        console.log(`[RTB-Promotion:${this.mode}] At capacity (${openPositions.length}/${maxTrades}), skipping promotion`);
        return;
      }

      console.log(`[8.8.4-C.14.B][MULTI_PROMOTE] mode=${this.mode}, openSlots=${openSlots}, maxTrades=${maxTrades}`);

      // Phase 8.8.4-C.14.B: Get all ranked signals and promote up to openSlots
      const rankedSignals = await readyToBuyService.getRankedSignals(this.mode, openSlots);

      if (!rankedSignals || rankedSignals.length === 0) {
        console.log(`[RTB-Promotion:${this.mode}] No queued signals available for promotion`);
        return;
      }

      let promotedCount = 0;
      let failedCount = 0;

      // B-PROMOTION-RACE-FIX (#508): the SAME-PASS half of the double-promotion. `openPositions`
      // above is a snapshot taken BEFORE this loop and never refreshed, so the guards that read it
      // are blind to opens made EARLIER IN THIS SAME PASS — two same-symbol signals (e.g. consecutive
      // gen cycles) both promote, and the second open hits the unique(symbol) dedup. That is the
      // 2026-07-15 06:16:46Z MET/USD case recorded in #508. The single-flight latch fixes the
      // CROSS-pass race; this set fixes the IN-pass one. (The open-path compensation would catch
      // the survivor either way, but promoting a signal we already know is a duplicate wastes the
      // slot decision and burns the queue row.)
      const promotedSymbolsThisPass = new Set<string>(openPositions.map(p => p.symbol));

      // Phase 8.8.4-C.14.B: Loop through ranked signals and promote all eligible
      for (const signal of rankedSignals) {
        if (openSlots <= 0) {
          console.log(`[8.8.4-C.14.B][SLOT_LIMIT] No more open slots, stopping promotion loop`);
          break;
        }

        // B-PROMOTION-RACE-FIX (#508): skip a symbol already open OR already promoted in THIS pass.
        // Left in the queue (not failed) — it is re-evaluated next pass like any deferred signal.
        if (promotedSymbolsThisPass.has(signal.symbol)) {
          console.log(`[DUP-OPEN-RACE][${this.mode}] ${signal.symbol}: already open or promoted earlier in this pass — deferring (in-pass duplicate guard)`);
          continue;
        }

        // Phase 14.1 HF8 (B1): Duplicate FinalScore check REMOVED — SQE already enforces FinalScore >= 0.35
        // (signal_quality_evaluator.ts line 130). Signals reaching this point have already passed SQE.
        const finalScore = parseFloat(signal.finalScore || '0');
        console.log(`[11.0E][TCL_PROMOTE] ${signal.symbol}/${signal.strategy} with FinalScore ${finalScore.toFixed(4)}`);

        // B-5 AMR (Obj-6, pre-audit §2 site 2): promotion-time RE-CHECK —
        // queue residency means admission-time checks can stale; hard-pause
        // and slot-cap are re-asked per signal here. Under enforce a block
        // DEFERS the signal (stays in queue); shadow records the would-block.
        {
          // P19-B6.5d: prefer the carried signal stamp (collision-correct); safe-resolve
          // only as fallback, and flag a missing stamp — a stamp absent on the active
          // promotion path is a pipe-entry bug (Langston §B stamp-missing-active).
          const _promoStamp = asValidAssetClass(signal.metadata?.assetClass);
          const _promoClass = _promoStamp ?? safeResolveAssetClass(signal.symbol, 'kraken');
          if (!_promoStamp && _promoClass) {
            console.warn(`[P19-B6.5d][STAMP_MISSING_ACTIVE] rtb_promotion re-derived asset class for ${signal.symbol} — the sizing stamp should have been carried`);
          }
          if (_promoClass !== null) {
            try {
              const { evaluateAmrGates } = await import('../core/governance/amr-gates.js');
              const sameClassCount = openPositions.filter(p => (asValidAssetClass((p as { assetClass?: unknown }).assetClass) ?? safeResolveAssetClass(p.symbol, 'kraken')) === _promoClass).length;
              const gate = evaluateAmrGates({
                assetClass: _promoClass,
                site: 'rtb_promotion',
                strategy: signal.strategy,
                openPositionCountForClass: sameClassCount,
              });
              if (!gate.allowed) {
                console.log(`[B-5][RTB][AMR_GATE] DEFER ${signal.symbol}: ${gate.blocks.map(b => b.gate).join(',')} (mode=${gate.mode})`);
                continue;
              }
            } catch (gateErr) {
              console.warn(`[B-5][RTB] AMR gate error (promotion continues): ${gateErr instanceof Error ? gateErr.message : gateErr}`);
            }
          }
        }

        // P19-B7.2b (Kyle model 2026-07-01): a maker-chosen signal is NOT posted as a
        // resting order in the RTBQ (the B7.2 make-then-take-POST branch was removed —
        // wrong stage; the signal carries a decision only while queued). At promotion it
        // proceeds to open. The real Kraken maker resting-order placement + fill/timeout/
        // convert lifecycle is post-promotion = Phase-21 (RUNNING_ISSUES + Phase-21 plan);
        // dormant in Phase-19, so a promoted maker-chosen signal opens through the normal
        // path below with its chosen mode carried on the signal for the [11.8B] gate.

        // P19-B8.10 (OBJ-5a): stamp the promote-time R-multiple — the number that
        // actually won the slot — onto the signal metadata via the SAME
        // getDisplayRankKey formula the RTB display uses (one formula, two
        // surfaces). Shown as "Promote R" on the open table. Display telemetry
        // only: selection is already made; absent stays absent, never fabricated.
        try {
          const _rankStampClass = asValidAssetClass(signal.metadata?.assetClass) ?? undefined;
          const _promoteRank = readyToBuyService.getDisplayRankKey(signal, _rankStampClass);
          if (_promoteRank.value != null && Number.isFinite(_promoteRank.value)) {
            (signal as { metadata?: Record<string, unknown> | null }).metadata =
              { ...((signal.metadata as Record<string, unknown> | null) ?? {}), rankAtPromote: _promoteRank.value };
          }
        } catch (rankErr) {
          console.warn(`[P19-B8.10][RANK_STAMP] rankAtPromote stamp failed for ${signal.symbol} (open proceeds, cell stays absent):`, rankErr instanceof Error ? rankErr.message : rankErr);
        }

        // Directive 8.8.4-A3.R1: RTB removal must precede trade creation to prevent double-activation
        // Step 1: Remove signal from RTB queue BEFORE attempting trade execution
        await readyToBuyService.promoteSignal(signal.id, 'pending');
        console.log(`[8.8.4-A3.R1][PROMOTION_ORDER] RTB signal ${signal.symbol} removed before trade creation`);
        
        // Step 2: Execute the promoted signal (create trade)
        const tradeResult = await this.executePromotedSignal(signal);

        if (tradeResult.success && tradeResult.tradeId) {
          // B-PROMOTION-RACE-FIX (#508): this symbol now holds a position — record it so a LATER
          // signal for the same symbol in THIS pass is deferred by the in-pass guard above (the
          // pre-loop openPositions snapshot cannot know about it).
          promotedSymbolsThisPass.add(signal.symbol);

          // Step 3: Update signal with actual trade ID
          await readyToBuyService.promoteSignal(signal.id, tradeResult.tradeId);
          
          // Step 4: Emit PROMOTION event for diagnostics (after both removal and trade creation succeed)
          eventBus.emitPromotion({
            mode: this.mode,
            symbol: signal.symbol,
            strategy: signal.strategy,
            signalId: signal.signalId,
            tradeId: tradeResult.tradeId,
            timestamp: new Date().toISOString(),
          });
          
          console.log(`[RTB-Promotion:${this.mode}] ✅ Successfully promoted ${signal.symbol}/${signal.strategy} -> Trade ${tradeResult.tradeId}`);
          promotedCount++;
          openSlots--;
          // P19-B8.4b: active-path funnel — signal promoted out of the RTB queue to an open attempt.
          // Re-derive the funnel class from the signal stamp (the AMR-block _promoClass is scoped above).
          // Dormant until paper-active (B8.5); this loop only runs when the active engine is promoting.
          const _fProm = asValidAssetClass(signal.metadata?.assetClass) ?? safeResolveAssetClass(signal.symbol, 'kraken');
          if (_fProm === 'crypto_spot' || _fProm === 'xstock_spot') {
            recordActiveRtbRefresh(this.mode, _fProm, { promoted: 1 });
          }
        } else {
          // Trade execution failed - signal already removed from RTB, log warning
          console.warn(`[RTB-Promotion:${this.mode}] ⚠️ Failed to execute promoted signal: ${tradeResult.error || 'unknown error'}`);
          console.warn(`[8.8.4-A3.R1][PROMOTION_ORDER] Signal ${signal.symbol} was removed from RTB but trade failed - signal not restored`);
          failedCount++;
        }
      }

      console.log(`[8.8.4-C.14.B][PROMOTION_SUMMARY] mode=${this.mode}, promoted=${promotedCount}, failed=${failedCount}, remainingSlots=${openSlots}`);
    } catch (error) {
      console.error(`[RTB-Promotion:${this.mode}] Error during promotion check:`, error);
    } finally {
      // B-PROMOTION-RACE-FIX (#508): release the single-flight latch on EVERY exit path (incl. the
      // early returns above: TCL-warmup, guardrail-read-fail, at-capacity) or promotion wedges
      // permanently. Then honour ONE coalesced re-run if a trigger arrived mid-pass.
      this.promotionInProgress = false;
      // ★ `isRunning` is REQUIRED here (Langston Step-4 blocker): the coalesced re-run is the only
      // promotion trigger without one — the interval self-guards (`:422`) and the two event handlers
      // are unbound in stop(). Without it, a trigger arriving mid-pass while stop() lands fires a
      // fresh pass on a STOPPED engine, which pulls ranked signals, REMOVES them from RTB, then
      // fails at processSignal ('engine not running') — and a failed promotion leaves the signal
      // removed and NOT restored. A coordinated deploy restart is exactly that interleaving.
      if (this.promotionRerunRequested && this.isRunning) {
        this.promotionRerunRequested = false;
        void this.checkRtbPromotion();
      }
    }
  }

  /**
   * Phase 8.8.4-B: Execute a promoted RTB signal
   */
  private async executePromotedSignal(signal: any): Promise<{ success: boolean; tradeId?: string; error?: string }> {
    try {
      const entryPrice = parseFloat(signal.entryPrice);
      const stopPrice = parseFloat(signal.stopPrice);
      const targetPrice = signal.targetPrice ? parseFloat(signal.targetPrice) : entryPrice * 1.02; // Default 2% target
      const quantity = signal.quantity ? parseFloat(signal.quantity) : undefined;
      const notional = signal.notional ? parseFloat(signal.notional) : undefined;

      // Build a StrategySignal compatible object for processSignal
      const promotedSignal: StrategySignal = {
        symbol: signal.symbol,
        strategy: signal.strategy,
        type: 'LONG',
        entryPrice: entryPrice,
        stopPrice: stopPrice,
        targetPrice: targetPrice,
        confidence: parseFloat(signal.confidence),
        timestamp: new Date(),
        reason: `RTB Promoted (FinalScore: ${signal.finalScore || '0'})`,
        signalId: signal.signalId,
        quantity: quantity,
        estimatedValue: notional,
        preComputedNotional: notional,
        // reorg-B3 (#233): carry the at-queue EV inputs from the rtb row's TYPED columns onto the
        // promoted StrategySignal (typed top-level fields, NOT metadata) so the open-gate Net-
        // Expectancy kernel reads the routing-time FX5 survivor snapshot. Parsed string→number here
        // (decimal columns arrive as strings); NULL stays NULL → kernel documented defaults at the
        // gate (DI=50 / strong-trend 0.40 floor). The DB columns remain the queryable SSOT for the
        // OBJ-4 rtb-metrics EV-reject breakdown; this object field is only the in-memory carrier.
        diAtQueue: signal.diAtQueue != null ? parseFloat(signal.diAtQueue) : null,
        dbsScoreAtQueue: signal.dbsScoreAtQueue != null ? parseFloat(signal.dbsScoreAtQueue) : null,
        // P19-B7.2 (OBJ-3): carry the best-of-both maker/taker snapshot onto the promoted
        // signal so the [11.8B] open-gate reads the CHOSEN-mode netEV (the single-consistent
        // number), not a taker-only recompute — this is what lets a maker-chosen crypto
        // opener (taker-EV<0, maker-adjusted-EV>0) pass the gate. NULL (pre-B7.2 rows) →
        // the gate falls back to its taker recompute (no behavior change).
        chosenEntryMode: (signal.chosenEntryMode as 'taker' | 'maker' | undefined) ?? 'taker',
        chosenNetEv: signal.chosenNetEv != null ? parseFloat(signal.chosenNetEv) : null,
        // P19-B7.2c: the gen-time TAKER-leg netEV (produced by the kernel inside
        // decideMakerTaker at signal-gen — taker-priced by construction). Read by the
        // marketable-at-placement stored-taker check: if a maker order can't be rested
        // (market already through the limit), takerNetEv>0 → open as taker now, else drop.
        takerNetEv: signal.takerNetEv != null ? parseFloat(signal.takerNetEv) : null,
        // P19-B8.5 (SWITCH-ON fix, found live 2026-07-15): carry the rtb row's ENTIRE persisted
        // metadata through the promotion conversion, promotion fields layered on top. This
        // conversion previously REBUILT metadata from scratch, silently dropping every stamp the
        // queue path persisted: metadata.assetClass (→ the [P19-B6.5d][STAMP_MISSING_ACTIVE]
        // execution_entry warning + safe-resolve fallback on EVERY promoted signal), and the
        // exploration lane's 4-field cohort stamp (→ the [11.8B] EXPLORATION_OPEN bypass never
        // saw admissionBasis, so every lane admit died at EV_REJECT — observed on the first
        // live admit, TRX/USD 05:18Z — AND the open-position/closed-trade rows would have been
        // stamped organic, breaking the lane's budget-conservation count + anneal driver).
        // The rtb metadata is small + structured (queueSQESignal enrichedMetadata: the
        // orchestrator stamp block + sourcePool/signalType/assetClass/rankingScore) — no bulk
        // arrays. reorg-B3 (#233) sourcePool note preserved: the open-gate Net-Expectancy kernel
        // reads signal.metadata?.sourcePool for the STRONG-TREND pWin branch — now carried by
        // the spread along with everything else.
        metadata: {
          ...((signal.metadata as any) ?? {}),
          source: 'RTB_PROMOTION',
          originalSignalId: signal.signalId,
          rtbQueueId: signal.id,
          queuedAt: signal.queuedAt,
        }
      } as any;

      // P19-B6.5e: read the typed open outcome directly from processSignal — no more
      // brittle trade-count-delta inference (which silently mapped EVERY post-guardrail
      // failure to a generic "no new trade created" and hid the actual stage). The
      // openFailed stage+reason now flow straight through to the promote-loop log.
      const outcome = await this.processSignal(promotedSignal);
      if (outcome.opened) {
        return { success: true, tradeId: outcome.tradeId };
      }
      return { success: false, error: `${outcome.stage}: ${outcome.reason}` };
    } catch (error: any) {
      return { success: false, error: error.message || 'Exception during promoted signal execution' };
    }
  }

  // Directive 8.8.4-A3.R9.3: Deprecated methods removed
  // - scanForSignals() - removed
  // - checkSymbolForSignal() - removed  
  // - injectForcedTrade() - removed
  // All signal generation now flows through: FX5 → SignalOrchestrator → SQE → RTB → TCL

  // Phase 8.8.3-J7: Added cycleContext parameter for paper-mode sizing
  // Phase 8.8.4-A: Added signalId for SLAL lifecycle tracking
  private async executeSimulatedTrade(
    // reorg-B3 (#233): diAtQueue/dbsScoreAtQueue are the at-queue EV inputs carried onto the
    // promoted signal (already parsed string→number at the rtb-row→StrategySignal conversion).
    // Optional → a non-promotion-path signal (FX5/orchestrator direct) simply has them undefined
    // → kernel documented defaults.
    signal: StrategySignal & { quantity?: number; estimatedValue?: number; signalId?: string; diAtQueue?: number | null; dbsScoreAtQueue?: number | null; chosenEntryMode?: 'taker' | 'maker'; chosenNetEv?: number | null; takerNetEv?: number | null },
    settings: TradingSettings,
    cycleContext?: { portfolioValue: number; guardrails: GuardrailsV2 | null }
  ): Promise<OpenOutcome> {
    // P19-B6.5e: returns a typed OpenOutcome. Every post-guardrail early-exit below
    // records an `openFailed` (so the I3 invariant reconciles) AND returns a labelled
    // `{opened:false,stage,reason}` — the open can no longer silently vanish.
    console.log(`[PaperExecution:${this.mode}] Signal detected for ${signal.symbol}:`);
    console.log(`  Strategy: ${signal.strategy}, Confidence: ${(signal.confidence * 100).toFixed(1)}%`);
    console.log(`  Entry: ${signal.entryPrice.toFixed(2)}, Stop: ${signal.stopPrice.toFixed(2)}, Target: ${signal.targetPrice.toFixed(2)}`);

    // [AJ19] Log signal generated for diagnostic tracking
    aj19Diagnostic.logSignalGenerated({
      symbol: signal.symbol,
      strategy: signal.strategy,
      entryPrice: signal.entryPrice,
      stopPrice: signal.stopPrice,
      targetPrice: signal.targetPrice,
      confidence: signal.confidence,
      estimatedValue: signal.estimatedValue,
      quantity: signal.quantity,
      mode: this.mode
    });

    // [AJ19] DryRunNoGuardrails mode: Skip guardrails and trade creation, just log
    if (aj19Diagnostic.isDryRunNoGuardrails()) {
      aj19Diagnostic.logWouldBeTrade({
        symbol: signal.symbol,
        strategy: signal.strategy,
        entryPrice: signal.entryPrice,
        stopPrice: signal.stopPrice,
        targetPrice: signal.targetPrice,
        confidence: signal.confidence,
        estimatedValue: signal.estimatedValue,
        quantity: signal.quantity,
        portfolioValue: cycleContext?.portfolioValue,
        mode: this.mode,
        reason: 'Signal passed filters and strategies - would open trade in normal mode'
      });
      
      console.log(`[AJ19][DRY_RUN_NO_GUARDRAILS] Skipping guardrails and trade creation for ${signal.symbol}`);
      // P19-B6.5e: pre-attempt skip (no recordAttempt yet) → NOT recorded as openFailed.
      return { opened: false, stage: 'DRY_RUN', reason: 'dry-run-no-guardrails' };
    }

    // Phase 8.8.3-H4: Pre-trade guardrail checks (replaces legacy RiskManager)
    // AJ10.1: Include pre-computed notional from P2 sizing so MAX_POSITION check trusts it
    // Phase 8.8.4-A: Include signalId for SLAL lifecycle tracking
    const tradeCandidate: TradeCandidate = {
      symbol: signal.symbol,
      strategy: signal.strategy,
      entryPrice: signal.entryPrice,
      stopPrice: signal.stopPrice,
      targetPrice: signal.targetPrice,
      // AJ10.1: Pass the pre-sized estimatedValue so checkPositionSizeCap trusts it
      preComputedNotional: signal.estimatedValue,
      // Phase 8.8.4-A: SLAL lifecycle tracking ID
      signalId: signal.signalId,
    };

    // [B4] Log funnel attempt - signal generated, entering guardrail check
    b4Diagnostics.logFunnelEvent({
      symbol: signal.symbol,
      strategy: signal.strategy,
      stage: 'attempt',
      block_reason: null
    });

    const riskCheck = await checkGuardrailRisk(this.mode, tradeCandidate);

    if (!riskCheck.ok) {
      // [B4] Log funnel attempt blocked by guardrails
      b4Diagnostics.logFunnelEvent({
        symbol: signal.symbol,
        strategy: signal.strategy,
        stage: 'attempt',
        block_reason: riskCheck.code || riskCheck.reason || 'GUARDRAIL_BLOCK'
      });
      console.log(`[PaperExecution:${this.mode}] Paper trade rejected by guardrails: ${riskCheck.reason}`);
      
      // [8.8.3-H4][GUARDRAIL_BLOCK] Lifecycle log for guardrail rejection
      console.log(`[8.8.3-H4][GUARDRAIL_BLOCK]`, JSON.stringify({
        symbol: signal.symbol,
        strategy: signal.strategy,
        direction: 'long',
        entryPrice: signal.entryPrice,
        reason: riskCheck.reason,
        code: riskCheck.code,
        timestamp: new Date().toISOString()
      }));
      
      // [27.F.14.B] INSTRUMENTATION: Risk check failed
      console.log(`[27.F.14.B][ActiveEngine] risk_check_failed {symbol:"${signal.symbol}", reason:"${riskCheck.reason}"}`);
      contextBridge.broadcast({
        type: 'trading_pipeline_event' as any,
        payload: {
          mode: this.mode,
          eventType: 'risk_check_failed',
          message: `${signal.symbol} rejected: ${riskCheck.reason}`,
          timestamp: new Date().toISOString(),
          metadata: {
            symbol: signal.symbol,
            reason: riskCheck.reason,
            code: riskCheck.code,
            signal: tradeCandidate
          }
        }
      });
      
      // Log rejection
      await storage.createActiveTradeLog(this.mode, {
        tradeId: null,
        positionId: null,
        eventType: 'trade_rejected',
        message: `Trade rejected: ${signal.symbol} - ${riskCheck.reason}`,
        metadata: {
          signal: tradeCandidate,
          rejectionReason: riskCheck.reason,
          code: riskCheck.code
        }
      });
      
      // Phase 8.8.3-J: Execution Attempt Audit - BLOCKED decision (non-blocking)
      this.logExecutionAttempt({
        mode: this.mode,
        symbol: signal.symbol,
        strategy: signal.strategy,
        decision: 'BLOCKED',
        blockReason: riskCheck.code as any,
        blockDetail: riskCheck.reason,
        entryPrice: signal.entryPrice.toString(),
        stopPrice: signal.stopPrice.toString(),
        targetPrice: signal.targetPrice.toString(),
        confidence: (signal.confidence * 100).toString(),
      }).catch(err => console.error('[8.8.3-J][AUDIT_ERROR] Failed to log blocked execution attempt:', err));

      // P19-B6.5e: guardrail block already counted via checkGuardrailRisk→recordBlock;
      // label the outcome but do NOT recordOpenFailed (would double-count).
      return { opened: false, stage: 'GUARDRAIL_BLOCK', reason: riskCheck.reason || riskCheck.code || 'guardrail_block' };
    }

    // Directive 11.8B: Net Expectancy Gate
    // Check if trade has positive mathematical expectancy after fees & slippage
    //
    // P19-B8.5a (OBJ-3, Kyle-ratified precedence — STILL-BLOCKS backstop): net-EV ADMISSION now
    // lives in the SQE (the authority — gen + refresh + batch-refresh all sign-check chosenNetEv
    // before a signal can queue or survive). THIS gate is DEMOTED to the drift BACKSTOP: it still
    // BLOCKS (Kyle default — real capital moves between final refresh and open), but a reject here
    // now means the gates DRIFTED (a signal admitted net-EV-positive went non-positive before open)
    // — expected ~0. The existing recordOpenFailed('EV_REJECT') metric IS the GATES-DRIFTED alarm:
    // any non-zero rate post-B8.5a triggers investigation, not silent acceptance. Legacy rows with
    // a NULL chosen_net_ev still get the taker-leg fallback below (no ungated lifecycle).
    // B63: Forward sourcePool + dbsScore so the kernel uses DBS-based pWin for Path D signals.
    //
    // reorg-B3 (#233): DI + dbsScore now come from the TYPED rtb_signals columns (di_at_queue /
    // dbs_score_at_queue) — the routing-time FX5 survivor snapshot frozen at queue — NOT from
    // metadata (where they were never populated → kernel defaults, the #233 bug). Decimal columns
    // arrive as strings; parse them. NULL → pass `undefined` and let the kernel apply its DOCUMENTED
    // default (expectancy.ts `DI = DI ?? 50`; net-expectancy-kernel.ts `dbsScore ?? 0` → strong-trend
    // 0.40 floor). NO coerce at THIS layer (Kyle #10): a NULL column reproduces today's default-path
    // behavior exactly, deterministically. We deliberately do NOT add a metadata fallback for these
    // two — they were never in metadata, so a fallback could only ever return undefined→default.
    //
    // NULL-on-strong-trend reachability (Langston conditions 3+4): for CRYPTO the floor default is
    // belt-and-suspenders, NOT load-bearing — a strong-trend signal (sourcePool 'quant-strong_trend',
    // |DBS|>=0.35) can ONLY originate from the FX5 scanner path, which ALWAYS carries dbsScore into
    // the pool, so dbs_score_at_queue is provably non-null for crypto strong-trend. For XSTOCK there
    // is no crypto FX5 source yet, so an xstock strong-trend signal reaches here with a NULL
    // dbs_score_at_queue → the floor handler IS load-bearing there and fails SAFE (lower pWin, fewer
    // entries). That xstock EV-input gap is surfaced (RUNNING_ISSUES), not papered over.
    // VolNoise/prices remain metadata reads (unpopulated → kernel defaults; VolNoise is not a kernel
    // EV input — ranking-only — so reorg-B3 deliberately does not thread it).
    const expectancyResult = evaluateTradeExpectancy(signal.symbol, {
      entryPrice: signal.entryPrice,
      targetPrice: signal.targetPrice,
      stopPrice: signal.stopPrice,
      DI: signal.diAtQueue ?? undefined,
      VolNoise: signal.metadata?.VolNoise,
      prices: signal.metadata?.prices,
      sourcePool: (signal as any).sourcePool ?? signal.metadata?.sourcePool,
      dbsScore: signal.dbsScoreAtQueue ?? undefined,
      // P19-B6.5d (OBJ-4): thread the carried stamp so EV friction is priced by the
      // signal's actual class, not re-derived from a (possibly collision) symbol.
    }, asValidAssetClass(signal.metadata?.assetClass) ?? undefined);

    // reorg-B3 (#233, OBJ-4): record the EV inputs that just reached the kernel — the OBJ-6 proof
    // surface. A sample with dbsScore non-null + usedStrongTrendBranch=true proves the routing-time
    // dbsScore reached evaluateTradeExpectancy and took the strong-trend pWin branch (the #233 fix
    // working), vs defaulting to the floor. Forward-instrumentation: only fills on the active path.
    const _evSourcePool = (signal as any).sourcePool ?? signal.metadata?.sourcePool;
    rtbMetricsService.recordEvInputSample({
      symbol: signal.symbol,
      strategy: signal.strategy,
      assetClass: asValidAssetClass(signal.metadata?.assetClass) ?? undefined,
      DI: signal.diAtQueue ?? null,
      dbsScore: signal.dbsScoreAtQueue ?? null,
      sourcePool: _evSourcePool,
      usedStrongTrendBranch: _evSourcePool === 'quant-strong_trend',
      netEV: expectancyResult.netEV,
      isTradeable: expectancyResult.isTradeable,
      rejectionReason: expectancyResult.rejectionReason,
      timestamp: Date.now(),
    });

    // ── P19-B7.2 (OBJ-3): honor the best-of-both chosen-mode netEV ────────────
    // evaluateTradeExpectancy recomputes the TAKER leg (its only rejection is the
    // EV sign, netEV>0). The best-of-both decision was made once at signal-gen and
    // snapshotted as chosen_net_ev (the single-consistent number — for maker it is
    // the haircut-adjusted, pFill-weighted maker netEV). Take the EV-SIGN pass/fail
    // from that snapshot so a maker-chosen crypto opener (taker netEV<0, chosen
    // netEV>0) passes while its taker recompute would reject. The taker recompute
    // still supplies score/pWin/diagnostics. NULL snapshot (pre-B7.2 rows / a
    // non-snapshotted path) → fall back to the taker isTradeable (no change).
    // The chosen-leg taker branch equals this recompute exactly (same at-queue DI,
    // same kernel, same friction), so a taker-chosen signal is unaffected.
    const _b72ChosenNetEv = (signal as any).chosenNetEv != null ? Number((signal as any).chosenNetEv) : null;
    const _b72ChosenMode: 'taker' | 'maker' = ((signal as any).chosenEntryMode as 'taker' | 'maker') ?? 'taker';
    let _b72IsTradeable = _b72ChosenNetEv != null ? (_b72ChosenNetEv > 0) : expectancyResult.isTradeable;
    const _b72EffectiveNetEv = _b72ChosenNetEv != null ? _b72ChosenNetEv : expectancyResult.netEV;

    // ── [11.8B] SHADOW CONVERSION (Kyle override 2026-07-16; Langston ruling AMENDED —
    // "an alarm whose stated job is drift detection has no business blocking") ────────
    // The blocking backstop is RETIRED on the primary (snapshot) path. Proof of safety
    // (Langston's GO/NO-GO, cited at code): the RTB refresh re-runs every signal
    // through the SQE — where the NetEV admission lives since B8.5a — and DELETES the
    // row on failure (ready_to_buy_service.ts :946 evaluate / :959 deleteRtbSignals);
    // the only NetEV-negative survivors are exploration-stamped rows, which this gate
    // already passed by design. And this gate reads the SAME stored chosen_net_ev the
    // SQE last passed on — same operand, same standard, no fresher data: strictly
    // redundant as a block. As an ALARM it stays: an organic signal reaching here
    // negative means SQE-passed-positive-went-negative = refresh-eviction drift —
    // logged decision-reconstructable, counted, durable-sunk, alerted on first fire.
    // NEVER blocked — IN PAPER MODE. LIVE keeps the block (Langston risk flag,
    // Step-4 2026-07-16): converting a real-money fail-safe from block→shadow rests
    // on "drift is impossible," and the alarm exists because we are not certain it
    // is; a live drift-open is an unrecoverable negative-EV fill an after-the-fact
    // alarm cannot undo. Kyle ratifies the live disposition at the #522 pre-live
    // gate (the documented-exception mechanism of his own fix-on-find rule).
    // Routing is FENCED by resolveEvBlockDisposition (pure, unit-pinned) — the
    // shadow leg and both block labels flow from the one function, so a live
    // snapshot-present negative can never wear the snapshot-missing labels.
    const _b72Disposition = resolveEvBlockDisposition(_b72ChosenNetEv, this.mode);
    const _exploOpen = this.mode === 'paper' && (signal.metadata as any)?.admissionBasis === 'exploration';
    if (!_b72IsTradeable && _b72Disposition === 'SHADOW') {
      if (_exploOpen) {
        // Known-negative exploration admit (lane-budgeted at gen, stamp-honored at
        // refresh) — expected, NOT drift; excluded from the alarm.
        console.log(`[P19-B8.5][EXPLORATION_OPEN] ${signal.symbol}: known-negative exploration admit (netEV=${_b72EffectiveNetEv.toFixed(6)}) — stamp honored, not gates-drifted`);
      } else {
        const _b72ShadowReason = `chosen ${_b72ChosenMode} NetEV=${_b72EffectiveNetEv.toFixed(6)} (best-of-both non-positive after friction + haircut)`;
        console.warn(`[11.8B][EV_REJECT_SHADOW] ${signal.symbol}: ${_b72ShadowReason} — DRIFT ALARM (SQE passed this signal positive; refresh eviction should have removed it) — shadow-only, NOT blocking (Kyle override 2026-07-16)`);
        // B-EVIDENCE-SINK: the durable alarm record (rate numerator + the offending netEV).
        emitEvReject(
          {
            symbol: signal.symbol,
            strategy: signal.strategy,
            assetClass: asValidAssetClass(signal.metadata?.assetClass) ?? safeResolveAssetClass(signal.symbol, 'kraken') ?? 'unknown',
            regime: (signal.metadata?.regime as string | undefined) ?? null,
            sourcePool: (signal.metadata?.sourcePool as string | undefined) ?? null,
            mode: this.mode,
          },
          { chosenNetEv: _b72EffectiveNetEv, rejectReason: `SHADOW ${_b72ShadowReason}` },
        );
        rtbMetricsService.recordEvRejectShadow(signal.symbol, this.mode, _b72EffectiveNetEv);
      }
      _b72IsTradeable = true; // shadow: observe, never gate
    }

    if (!_b72IsTradeable) {
      // Two distinct blocking cases land here — label integrity fenced by
      // resolveEvBlockDisposition (Langston delta-GO condition, 2026-07-16):
      //   BLOCK_SNAPSHOT_MISSING — chosen_net_ev NULL: a DATA-INTEGRITY fault (a
      //     queued row missing its stored decision), legitimately outside the SQE.
      //   BLOCK_EV_REJECT — LIVE mode, snapshot present + non-positive: the live
      //     block retained byte-equivalent pending Kyle's #522 pre-live ratification;
      //     the reject names the chosen netEV, never the snapshot-missing labels.
      const _snapshotMissing = _b72Disposition === 'BLOCK_SNAPSHOT_MISSING';
      const _b72RejReason = _snapshotMissing
        ? `chosen_net_ev SNAPSHOT MISSING on the queued row; open-time taker recompute non-positive (${expectancyResult.rejectionReason ?? 'negative net expectancy'})`
        : `chosen ${_b72ChosenMode} NetEV=${_b72EffectiveNetEv.toFixed(6)} (best-of-both non-positive after friction + haircut; LIVE block retained pending #522 ratification)`;
      const _b72Code = _snapshotMissing ? 'EV_SNAPSHOT_MISSING' : 'EV_REJECT';
      b4Diagnostics.logFunnelEvent({
        symbol: signal.symbol,
        strategy: signal.strategy,
        stage: 'attempt',
        block_reason: _b72Code
      });
      console.error(`[11.8B][${_b72Code}] ${signal.symbol} refused: ${_b72RejReason}`);
      await storage.createActiveTradeLog(this.mode, {
        tradeId: null,
        positionId: null,
        eventType: 'trade_rejected',
        message: `Trade refused (${_b72Code}): ${signal.symbol} - ${_b72RejReason}`,
        metadata: {
          signal: tradeCandidate,
          rejectionReason: _b72RejReason,
          code: _b72Code,
          ev: _b72EffectiveNetEv,
          chosenEntryMode: _b72ChosenMode,
          takerNetEv: expectancyResult.netEV,
          score: expectancyResult.score
        }
      });
      rtbMetricsService.recordOpenFailed(signal.symbol, signal.strategy, 'EV_REJECT', _b72RejReason);
      return { opened: false, stage: 'EV_REJECT', reason: _b72RejReason };
    }

    // Log expectancy gate pass with score for future analytics
    // P19-B7.2: report the chosen entry mode + its effective (best-of-both) EV.
    console.log(`[11.8B][EV_PASS] ${signal.symbol} mode=${_b72ChosenMode} EV=${_b72EffectiveNetEv.toFixed(6)} (taker=${expectancyResult.netEV.toFixed(6)}) Score=${expectancyResult.score.toFixed(1)}`);

    // [B4] Log funnel RTB - signal passed all guardrails, ready to buy
    b4Diagnostics.logFunnelEvent({
      symbol: signal.symbol,
      strategy: signal.strategy,
      stage: 'rtb',
      block_reason: null
    });

    // [27.F.14.B] INSTRUMENTATION: Risk check passed
    console.log(`[27.F.14.B][ActiveEngine] risk_check_passed {symbol:"${signal.symbol}"}`);
    contextBridge.broadcast({
      type: 'trading_pipeline_event' as any,
      payload: {
        mode: this.mode,
        eventType: 'risk_check_passed',
        message: `${signal.symbol} passed all risk checks`,
        timestamp: new Date().toISOString(),
        metadata: { symbol: signal.symbol }
      }
    });

    // Phase 8.8.3-J7: Use pre-sized quantity from signal (computed at P2)
    // For paper mode, use the pre-computed quantity; for live mode, use fallback calculation
    let quantity: number;
    let portfolioValue: number;
    let riskAmount: number;
    
    if (this.mode === 'paper' && signal.quantity && signal.quantity > 0) {
      // J7: Use pre-sized quantity from P2
      quantity = signal.quantity;
      portfolioValue = cycleContext?.portfolioValue || 0;
      const riskPct = parseFloat(String(cycleContext?.guardrails?.portfolioRiskPerTradePct || '1.50'));
      riskAmount = (portfolioValue * riskPct) / 100;
      console.log(`[J7][EXEC_P3] Using pre-sized quantity: ${quantity.toFixed(8)} (portfolio: $${portfolioValue.toFixed(2)})`);
    } else {
      // Fallback for live mode or if no pre-sized quantity (should not happen in paper mode after J7)
      portfolioValue = parseFloat(settings.portfolioValue || '0');
      if (portfolioValue <= 0) {
        console.error(`[J7][EXEC_P3_ERROR] No valid portfolio value for ${this.mode} mode - cannot size position`);
        rtbMetricsService.recordOpenFailed(signal.symbol, signal.strategy, 'SIZING_INVALID', `no valid portfolio value (${portfolioValue})`);
        return { opened: false, stage: 'SIZING_INVALID', reason: `no valid portfolio value (${portfolioValue})` };
      }
      const riskPerTradePct = parseFloat(settings.riskPerTradePct || '4.0');
      riskAmount = (portfolioValue * riskPerTradePct) / 100;
      const stopDistance = Math.abs(signal.entryPrice - signal.stopPrice);
      quantity = stopDistance > 0 ? riskAmount / stopDistance : 0;
      console.log(`[J7][EXEC_P3_FALLBACK] Calculated quantity: ${quantity.toFixed(8)} (mode: ${this.mode})`);
    }
    
    if (quantity <= 0) {
      console.log(`[8.8.3-F][RISK_REJECT] Invalid position size (quantity=${quantity}) - skipping trade`);
      rtbMetricsService.recordOpenFailed(signal.symbol, signal.strategy, 'SIZING_INVALID', `invalid position size (quantity=${quantity})`);
      return { opened: false, stage: 'SIZING_INVALID', reason: `invalid position size (quantity=${quantity})` };
    }

    // P19-B4b.1: resolve the position class BEFORE the depth gate + fill — an
    // unclassifiable symbol skips here rather than reaching the fill with no class.
    const _openClass = asValidAssetClass(signal.metadata?.assetClass) ?? safeResolveAssetClass(signal.symbol, 'kraken');
    if (_openClass === null) {
      console.warn('[P19-B4b.1][OPEN_SKIP] unclassifiable ' + signal.symbol + ' — refusing to open without a class');
      rtbMetricsService.recordOpenFailed(signal.symbol, signal.strategy, 'UNCLASSIFIABLE', 'unclassifiable symbol at open');
      return { opened: false, stage: 'UNCLASSIFIABLE', reason: 'unclassifiable symbol at open' };
    }

    // P19-B4b.1 (#295): 24/5 book-depth-sufficiency + warmth gate BEFORE the fill,
    // replacing the B4a-C3 RTH liquid-fill-window clock proxy. Fail-closed — a missing
    // config / cold / thin / insufficient book skips the open loudly (observable counter).
    const _gate = await this._evaluateOpenDepthGate(signal.symbol, _openClass, signal.entryPrice * quantity);
    if (!_gate.pass || !_gate.snapshot) {
      console.warn(`[P19-B4b.1][DEPTH_GATE_BLOCK:${this.mode}] ${signal.symbol} (${_openClass}) ${_gate.reason} — skipping open`);
      recordDepthGateBlock(_openClass, _gate.reason); // fine-grained per-class counter (unchanged)
      // P19-B6.5e: ALSO fold into the I3 invariant so the open no longer vanishes from attempts=opened+blocked+openFailed.
      rtbMetricsService.recordOpenFailed(signal.symbol, signal.strategy, 'DEPTH_GATE', _gate.reason);
      return { opened: false, stage: 'DEPTH_GATE', reason: _gate.reason };
    }

    // P19-B6.6 (#236): price-discovery-LIVENESS — the 2nd half of the fill-time "is the
    // book real?" guard. Runs AFTER the depth gate (cheap single top-of-book row) passes —
    // depth-first ordering, explicit. xStock-ONLY (crypto trades 24/7, no holiday/halt
    // analog → a liveness gate would false-block a quiet altcoin). Fail-closed: the token's
    // `last` must have actually MOVED within the window, else the book is dead-but-quoted
    // (holiday / LULD halt / glitch / feed death) → block. Same recordDepthGateBlock
    // telemetry path; the reason codes (flat_last vs no_data/sparse/liveness_*) distinguish
    // a genuine dead market from a feed/config outage. Dormant until B7b (§9.1).
    if (_openClass === 'xstock_spot') {
      const _live = await evaluateXstockPriceLiveness(signal.symbol);
      if (!_live.live) {
        console.warn(`[P19-B6.6][LIVENESS_BLOCK:${this.mode}] ${signal.symbol} (${_openClass}) ${_live.reason} — skipping open`);
        recordDepthGateBlock(_openClass, _live.reason); // distinct reason bucket from the depth gate
        rtbMetricsService.recordOpenFailed(signal.symbol, signal.strategy, 'LIVENESS_GATE', _live.reason);
        return { opened: false, stage: 'LIVENESS_GATE', reason: _live.reason };
      }
    }

    // ── P19-B7.2c: post-promotion PENDING maker order (Kyle model, SIMPLIFIED 2026-07-02).
    // A maker-chosen promotion does NOT fill now — it RESTS as a state='pending' position
    // (holds a slot) at the maker limit (= the signal entry) until the real price trades
    // through it (monitor pre-pass → 'open' at limit + maker fee) or the hard-drop deadline
    // fires (→ DROPPED, period — no convert re-evaluation). EXCEPT: if the market is ALREADY
    // through the limit at placement (best ask ≤ limit for a buy), a real post-only would
    // REJECT — so run the stored-taker check instead: the gen-time takerNetEv (the kernel's
    // taker leg inside decideMakerTaker — taker-priced by construction; gate is a gen
    // snapshot ≤~30s stale via the promotion loop, the fill is live — documented
    // approximation) → >0 falls through to the NORMAL taker fill below with the record
    // flipped to taker (accounting-only; the EV kernel never reads the mode), else DROP
    // (maker_marketable_dropped — a non-trade, never a closed-trade P&L).
    let _b72cEffectiveMode: 'taker' | 'maker' = _b72ChosenMode;
    let _b72cPendingMaker = false;
    const _b72cLimit = signal.entryPrice;
    if (_b72ChosenMode === 'maker') {
      const _b72cBestAsk = _gate.snapshot.asks[0]?.price;
      if (_b72cBestAsk != null && isMarketableAtPlacement('buy', _b72cBestAsk, _b72cLimit)) {
        const _b72cStoredTakerEv = signal.takerNetEv;
        if (_b72cStoredTakerEv != null && _b72cStoredTakerEv > 0) {
          _b72cEffectiveMode = 'taker';
          console.log(`[P19-B7.2c][MARKETABLE_TAKER_FALLBACK:${this.mode}] ${signal.symbol}: maker limit ${_b72cLimit} already marketable (bestAsk=${_b72cBestAsk}) — stored takerNetEv=${_b72cStoredTakerEv.toFixed(6)}>0 → opening as taker now`);
        } else {
          console.log(`[P19-B7.2c][MAKER_MARKETABLE_DROPPED:${this.mode}] ${signal.symbol}: maker limit ${_b72cLimit} already marketable (bestAsk=${_b72cBestAsk}) and stored takerNetEv=${_b72cStoredTakerEv ?? 'null'} not positive — dropped (non-trade)`);
          rtbMetricsService.recordOpenFailed(signal.symbol, signal.strategy, 'MAKER_MARKETABLE_DROPPED', 'maker limit marketable at placement; stored taker EV not positive');
          return { opened: false, stage: 'MAKER_MARKETABLE_DROPPED', reason: 'maker marketable at placement; taker EV not positive' };
        }
      } else {
        _b72cPendingMaker = true;
      }
    }

    // ══════════════════════════════════════════════════════════════════════════════
    // P19-B8.5 (OBJ-8): real-venue WELL-FORMEDNESS vetting — the recorded rule-20
    // design, wired. Every paper open (immediate fill AND pending maker alike) is
    // sent to Kraken AddOrder validate=true (executes NOTHING) BEFORE any internal
    // fill/rest, so paper never fills an order the venue would refuse.
    // PAPER-ONLY BY CONSTRUCTION (Kyle 2026-07-14 "same pipes"): in live mode the
    // REAL order is the venue contact — this block must never run there.
    // FAIL-MODE (Langston Step-2 ruling): DEFINITIVE parseable rejection → drop
    // loudly (VALIDATE_REJECTED, counted + archived); EVERY ambiguity (timeout /
    // outage / rate-limit / unparseable / unknown code / missing pair map) →
    // VISIBLE skip + proceed — fill honesty is the depth-walk's and never this leg's.
    // ══════════════════════════════════════════════════════════════════════════════
    if (this.mode === 'paper') {
      // F-G-1 (OBJ-7b kind (i), Kyle 2026-08-28): THE VPG FEEDS THIS PROBE.
      // The two services do different jobs and must work as a pair: the VPG establishes what the
      // venue can EXPRESS, and this leg asks the venue whether it would ACCEPT it. Asking about a
      // quantity the venue could never take wastes the question and returns a "no" we could have
      // answered ourselves -- exactly the STRK/USD case (2026-08-17,
      // "EGeneral:Invalid arguments:volume minimum not met"), which cost a network round-trip to
      // learn something `ordermin` already said.
      // ⛔ THE VENUE REMAINS THE AUTHORITY. This is a PRE-FILTER, not a replacement: a local
      // check can be stale, the venue cannot. It only ever refuses what the venue would also
      // refuse; anything it passes still goes to the venue for the real verdict.
      // ⛔ USE `_openClass` (:3278) — ALREADY RESOLVED AND ALREADY NULL-GUARDED, 92 lines up in
      // this same function. My first version read `(signal as any).assetClass`, which the
      // promoted-signal literal at :2826-2881 NEVER SETS — it carries the class in
      // `metadata.assetClass` (:2874-2875), as the 12 other readers in this file do. So that arm
      // was DEAD on the RTB-promotion path and every resolution fell through to
      // `safeResolveAssetClass(signal.symbol, …)` — THE SYMBOL INFERENCE I EXPLICITLY SAID I WAS
      // AVOIDING BECAUSE TICKERS COLLIDE. Langston, verified at the ref.
      const _sizeLimits = resolveVenueSizeLimits(signal.symbol, _openClass);
      const _venueQty = roundQuantityForVenue(
        quantity, signal.entryPrice,
        _sizeLimits.lotDecimals, _sizeLimits.ordermin, _sizeLimits.costmin,
      );
      // ⛔ A MISSING LIMIT IS NOT A REJECTION. If the venue metadata is absent we SKIP the local
      // pre-filter and let the venue answer — refusing here would block a live trade on a DATA
      // GAP, which is the same "drop arm on missing data" defect Langston refused for the VTS
      // lane. The no-fallback rule is right for a PRICE (an invented tick emits an unplaceable
      // order); it is wrong for a pre-filter whose only job is to save a round-trip.
      const _sizeKnown = _sizeLimits.lotDecimals != null
        && (_sizeLimits.ordermin != null || _sizeLimits.costmin != null);
      if (_sizeKnown && _venueQty === null) {
        console.error(
          `[PaperExecution:${this.mode}][VPG_SIZE_REJECT] ${signal.symbol} qty=${quantity} @ ${signal.entryPrice} ` +
          `is not placeable at this venue (lotDecimals=${_sizeLimits.lotDecimals} ordermin=${_sizeLimits.ordermin} ` +
          `costmin=${_sizeLimits.costmin}) — refused locally, no pretend fill.`,
        );
        rtbMetricsService.recordOpenFailed(signal.symbol, signal.strategy, 'VALIDATE_REJECTED',
          'VPG: rounded size below venue minimum');
        return { opened: false, stage: 'VALIDATE_REJECTED', reason: 'VPG: rounded size below venue minimum' };
      }
      // ⛔ WRITE THE ROUNDED SIZE BACK, so the probe, the fill, the fee and the position record
      // are ONE number. My first version sent the venue the ROUNDED quantity at :3398 and then
      // filled with the RAW one at :3426 — reproducing, on the size axis and in the same commit,
      // the exact defect I had just fixed on the price axis: asking the venue about an order we
      // do not place. It is self-sealing for the same reason too — a size-precision rejection can
      // never surface, because the probe is pre-corrected. Langston caught it 28 lines below the
      // fix. The rounded size is the one the venue can actually accept, so it is the one we fill.
      if (_venueQty !== null) quantity = _venueQty.quantity;
      const _venueCheck = await validatePaperOrderWithVenue({
        symbol: signal.symbol,
        quantity,
        limitPrice: _b72cLimit,
        addOrder: (p) => this.krakenService.addOrder(p),
      });
      if (_venueCheck.outcome === 'rejected') {
        console.error(`[PaperExecution:${this.mode}][VALIDATE_REJECTED] ${signal.symbol} venue said no: ${_venueCheck.detail} — skipping trade (no pretend fill on an order the venue would refuse)`);
        rtbMetricsService.recordOpenFailed(signal.symbol, signal.strategy, 'VALIDATE_REJECTED', `venue validate rejected: ${_venueCheck.detail}`);
        return { opened: false, stage: 'VALIDATE_REJECTED', reason: `venue validate rejected: ${_venueCheck.detail}` };
      }
      if (_venueCheck.outcome === 'skipped') {
        rtbMetricsService.recordValidateSkipped(signal.symbol, _venueCheck.detail);
      }
    }

    // P19-B4b.1: entry fill via the DEPTH-WALKED OrderPlacer port — the placer walks the
    // gate's ask snapshot → VWAP fill (replaces the flat 0.05% slippage). `partial` = the
    // book thinned between gate and fill (size the position down); `rejected` = no fillable book.
    // P19-B7.2c: SKIPPED for a pending maker — no fill happens now; the position rests at
    // the limit with the maker fee RESERVED (charged only if/when the monitor pre-pass fills it).
    let actualEntryPrice: number;
    let entryFee: number;
    let totalSlippage: number;
    if (_b72cPendingMaker) {
      actualEntryPrice = _b72cLimit;
      entryFee = _b72cLimit * quantity * getFrictionForAssetClass(_openClass).feeRateMaker;
      totalSlippage = 0; // a maker fill at the resting limit pays no taker slippage
    } else {
    const _openFill = await this.orderPlacer.openOrder({
      symbol: signal.symbol, side: 'buy', quantity, intendedPrice: signal.entryPrice,
      mode: this.mode, assetClass: _openClass, bookAsks: _gate.snapshot.asks,
    });
    if (_openFill.status === 'rejected') {
      console.error(`[PaperExecution:${this.mode}][OPEN_FILL_REJECTED] ${signal.symbol} reason=${_openFill.reason} — skipping trade`);
      rtbMetricsService.recordOpenFailed(signal.symbol, signal.strategy, 'FILL_REJECTED', `fill rejected: ${_openFill.reason ?? 'no fillable book'}`);
      return { opened: false, stage: 'FILL_REJECTED', reason: `fill rejected: ${_openFill.reason ?? 'no fillable book'}` };
    }
    if (_openFill.status !== 'filled' && _openFill.status !== 'partial') {
      // `delayed` is a live-only outcome paper never produces; any other status → skip.
      console.error(`[PaperExecution:${this.mode}][OPEN_FILL_NONFILLED] ${signal.symbol} status=${_openFill.status} — skipping trade`);
      rtbMetricsService.recordOpenFailed(signal.symbol, signal.strategy, 'FILL_REJECTED', `fill non-filled status=${_openFill.status}`);
      return { opened: false, stage: 'FILL_REJECTED', reason: `fill non-filled status=${_openFill.status}` };
    }
    // P19-B4b.1 (Langston hold #1): SIZE DOWN to the ACTUAL filled qty. Reassigning
    // `quantity` here is the SINGLE point that makes every downstream consumer — trade +
    // open-position record writes, portfolio heat, risk-concentration weights, broadcasts,
    // SLAL — use the filled qty, never the requested qty (the partial-open exposure
    // split-brain). The EV/risk pre-checks ran earlier on the requested size, correctly.
    if (_openFill.status === 'partial') {
      console.warn(`[P19-B4b.1][OPEN_PARTIAL:${this.mode}] ${signal.symbol} requested=${quantity} filled=${_openFill.fillQty} remaining=${_openFill.remainingQty} — sizing position to filled qty`);
    }
    quantity = _openFill.fillQty;
    if (!(quantity > 0)) {
      console.error(`[PaperExecution:${this.mode}][OPEN_FILL_ZERO] ${signal.symbol} filledQty=0 — skipping`);
      rtbMetricsService.recordOpenFailed(signal.symbol, signal.strategy, 'FILL_REJECTED', 'filled quantity = 0');
      return { opened: false, stage: 'FILL_REJECTED', reason: 'filled quantity = 0' };
    }
    actualEntryPrice = _openFill.fillPrice;
    entryFee = _openFill.feeQuote;
    totalSlippage = _openFill.slippageQuote;
    }
    const positionValue = actualEntryPrice * quantity;

    console.log(`  Quantity: ${quantity.toFixed(4)}, Position Value: $${positionValue.toFixed(2)}`);
    console.log(`  Entry Slippage: $${totalSlippage.toFixed(2)}, Entry Fee: $${entryFee.toFixed(2)}`);

    // [27.F.14.B] INSTRUMENTATION: Order computed
    console.log(`[27.F.14.B][ActiveEngine] order_computed {symbol:"${signal.symbol}", quantity:${quantity.toFixed(4)}, entry:${actualEntryPrice.toFixed(2)}, stop:${signal.stopPrice.toFixed(2)}, target:${signal.targetPrice.toFixed(2)}}`);
    contextBridge.broadcast({
      type: 'trading_pipeline_event' as any,
      payload: {
        mode: this.mode,
        eventType: 'order_computed',
        message: `Order ready: ${quantity.toFixed(4)} ${signal.symbol} @ $${actualEntryPrice.toFixed(2)}`,
        timestamp: new Date().toISOString(),
        metadata: {
          symbol: signal.symbol,
          quantity: quantity,
          entryPrice: actualEntryPrice,
          stopPrice: signal.stopPrice,
          targetPrice: signal.targetPrice,
          positionValue: positionValue,
          slippage: totalSlippage,
          fees: entryFee
        }
      }
    });

    // Phase 8.8.3-I7-PM-FOCUS (C1): Check for duplicate BEFORE creating trade
    // This prevents orphan trade records when duplicate is detected
    const existingPositions = await storage.getActiveOpenPositions(this.mode);
    const existingPositionForSymbol = existingPositions.find(p => p.symbol === signal.symbol);
    if (existingPositionForSymbol) {
      const existingCount = existingPositions.filter(p => p.symbol === signal.symbol).length;
      console.log(`[I7-PM-FOCUS][DUP_GUARD_BLOCK] symbol=${signal.symbol} existingCount=${existingCount} action="skip_new_position"`);
      // P19-B5a: TCL duplicate-position reject capture (active path; the paper
      // engine open only runs when paper-active → dormant by construction).
      // This is the ONLY active-path TCL reject: max_open_trades is a cycle-level
      // promotion DEFER (signals stay queued), not a per-signal reject, so it is
      // NOT captured (would be semantically-false telemetry). finalScore is not
      // threaded to the engine here; confidence_modulated (signal.confidence) is.
      try {
        // P19-B6.5d (OBJ-5): prefer the carried stamp; safe-resolve fallback; on a
        // genuinely-unclassifiable symbol SKIP the archive row rather than mislabel it
        // crypto_spot (the old silent tail-default would pollute per-class reject telemetry).
        const _evalClass = asValidAssetClass(signal.metadata?.assetClass) ?? safeResolveAssetClass(signal.symbol, 'kraken');
        if (_evalClass !== null) {
          const { archiveSignalEval } = await import('./data-archive/signal-eval-archiver.js');
          archiveSignalEval({
            mode: tradingModeToRunMode(this.mode),
            symbol: signal.symbol,
            exchange: 'kraken',
            assetClass: _evalClass,
            source: 'active-execution-engine',
            strategy: signal.strategy,
            rejectStage: 'tcl',
            confidenceModulated: signal.confidence,
            gateDecision: { gate: 'tcl', accepted: false, reason: 'duplicate_position', existingCount },
          });
        } else {
          console.warn(`[P19-B6.5d][ARCH] TCL-reject signal-eval archive SKIPPED for ${signal.symbol} — unclassifiable (no crypto_spot mislabel)`);
        }
      } catch (b70Err) {
        console.warn(`[B70][ARCH] TCL-reject signal-eval archive enqueue failed:`, b70Err instanceof Error ? b70Err.message : b70Err);
      }
      rtbMetricsService.recordOpenFailed(signal.symbol, signal.strategy, 'DUP_POSITION', `duplicate position (existingCount=${existingCount})`);
      return { opened: false, stage: 'DUP_POSITION', reason: `duplicate position (existingCount=${existingCount})` }; // Exit early - do not create trade or position
    }

    // [27.F.14.DIAG] Create trade record with comprehensive error handling
    // AJ10.3: Diagnostic logging for Open Trades vs Opened metrics mismatch
    console.log(`[AJ10.3][TRADE_CREATE_START] symbol=${signal.symbol} | strategy=${signal.strategy} | qty=${quantity.toFixed(8)} | estimatedValue=$${(signal.estimatedValue || 0).toFixed(2)}`);
    
    try {
      // Directive 10.3: Extract signal type fields for persistence.
      // P19-B3b: signalType/patternType/patternStrength are not first-class on
      // StrategySignal — they are carried in signal.metadata (set by the pattern
      // recognizer; see pattern-recognizer.test metadata.patternType). Read from
      // there with the same top-level-then-metadata fallback the signal
      // orchestrator uses (signal-orchestrator.ts:666), defaulting to QUANT/null.
      const sigMeta = signal.metadata ?? {};
      const signalType = sigMeta.signalType || 'QUANT';
      const patternType = sigMeta.patternType || null;
      const patternStrength = sigMeta.patternStrength?.toString() || null;
      
      console.log(`[10.3] Trade Execute: ${signal.symbol} | Type=${signalType} | Pattern=${patternType || 'N/A'} | Strength=${patternStrength || 'N/A'}`);
      
      // B65.1-HF2 (2026-04-23): baseCurrency is NOT NULL on closed_trades. Derive from symbol.
      const baseCurrency = signal.symbol.split('/')[0] || signal.symbol;

      // B67.3 follow-up: persist cohort hash on trade record at trade-open. Used at
      // end-of-observation cohort comparison to group closed trades by capped (0)
      // vs uncapped (1). Cohort assignment is deterministic on symbol via FNV-1a
      // — same hash function the gate uses, computed inline here at trade-open.
      const pairIdHash = assignCohortHashForPersistence(signal.symbol);

      // B67.2.1: capture regime classifier confidence + macro modifier + phase
      // at trade-open per Kyle directive 2026-04-29 (master plan §0.11.D). Read
      // from MCE's cached snapshot for this symbol; values may be undefined if
      // MCE cache is cold for this pair (rare).
      const _b67_2_1_mce = (() => { try { return getMarketContextEngine(); } catch { return null; } })();
      // B79.0n.MCE: append required assetClass — the cache is keyed by (symbol, assetClass).
      // P19-B4a (C4): prefer the signal stamp; cold-cache (null context) on an
      // unclassifiable symbol — enrichment-only, never skip the trade for it.
      const _b67Class = asValidAssetClass(signal.metadata?.assetClass) ?? safeResolveAssetClass(signal.symbol, 'kraken');
      const _b67_2_1_ctx = (_b67Class && _b67_2_1_mce) ? (_b67_2_1_mce.getCachedContext(signal.symbol, _b67Class) ?? null) : null;
      const _b67_2_1_macro = _b67_2_1_mce?.getCurrentMacroContext() ?? null;
      const _b67_2_1_phaseWeights = _b67_2_1_mce?.getCurrentPhaseWeights() ?? null;
      const _b67_2_1_phase = _b67_2_1_ctx?.regime.phase ?? null;
      const _b67_2_1_phaseWeight = (_b67_2_1_phase && _b67_2_1_phaseWeights)
        ? _b67_2_1_phaseWeights[`${signal.strategy}_${_b67_2_1_phase}`] ?? null
        : null;
      const _b67_2_1_modulatedConf = _b67_2_1_ctx?.regime.confidence ?? null;
      const _b67_2_1_modifierValue = _b67_2_1_macro?.modifier.value ?? null;
      // confidence_raw = modulated / modifier_value (reverse-derived; same approach as ablation row)
      const _b67_2_1_rawConf = (_b67_2_1_modulatedConf !== null && _b67_2_1_modifierValue !== null && _b67_2_1_modifierValue > 0)
        ? _b67_2_1_modulatedConf / _b67_2_1_modifierValue
        : _b67_2_1_modulatedConf;

      // P19-B4a (C4): authoritative position class — prefer the signal stamp, cold-resolve
      // only if absent/invalid. Computed BEFORE any DB write so an unclassifiable symbol
      // skips the trade entirely rather than opening a position with no/blank class.
      const _stampedClass = asValidAssetClass(signal.metadata?.assetClass);
      const _tradeClass = _stampedClass ?? safeResolveAssetClass(signal.symbol, 'kraken');
      if (_tradeClass === null) {
        console.warn('[B79.TEC][TRADE_SKIP] unclassifiable ' + signal.symbol + ' — refusing to open a position without a class');
        rtbMetricsService.recordOpenFailed(signal.symbol, signal.strategy, 'UNCLASSIFIABLE', 'unclassifiable symbol at trade-create');
        return { opened: false, stage: 'UNCLASSIFIABLE', reason: 'unclassifiable symbol at trade-create' };
      }
      // ★ mark-2 fence (P19-B-FEEVIABILITY, Langston-spec 2026-08-17): fire ONLY on the SILENT hazard —
      // the fallback re-resolution returning a VALID-but-possibly-WRONG class on a collision ticker.
      // The null branch above is already loud and refuses the open; a fence keyed on it would measure
      // the path that cannot hurt us. The venue pin 'kraken' is a second input to the re-resolution
      // and is inside this fence's scope. This row will carry a gateConstantsVersion hash (:~3590)
      // whose partition key came from re-resolution, not the stamp — that is what makes it loud-worthy.
      if (_stampedClass === null) {
        console.warn(`[P19-FEEV][CLASS_FALLBACK_NONNULL] ${signal.symbol}/${signal.strategy}: carried class stamp absent/invalid; venue-pinned fallback returned '${_tradeClass}' — gate-hash partition key derived from re-resolution, not the stamp`);
      }

      // ── P19-B7.2b (OBJ-B): the maker/taker entry fee-mode + its per-side fee RATE for
      // this trade's asset class, carried onto the paper-active open-position + closed-trade
      // records so the UI can show WHICH fee the ENTRY paid. _b72ChosenMode is the decision
      // snapshot (from rtb_signals.chosen_entry_mode via the promoted signal; defaults taker).
      // The rate is the class's per-side rate for that mode (fail-hard via cost-model). Once
      // the B7.2c pending maker-fill sim lands, a maker-chosen promotion fills at the maker
      // rate; a taker-chosen fills immediately at taker — so the recorded rate matches the
      // actual entry fill by construction (this code doesn't run until active trading is ON,
      // which is after B7.2c). Entry-leg only — the exit pays taker for both classes today.
      const _b72Friction = getFrictionForAssetClass(_tradeClass);
      // P19-B7.2c: keyed on the EFFECTIVE mode — the marketable-at-placement taker
      // fallback flips maker→taker, and the record must show the fee actually paid.
      const _b72EntryFeeRate = _b72cEffectiveMode === 'maker' ? _b72Friction.feeRateMaker : _b72Friction.feeRateTaker;

      // ── P19-B8.2 (OBJ-4): the balance-ratio calibration stamp — computed ONCE
      // here, written to BOTH the closed-trade and open-position rows below.
      // ratio = current balance / the latest anchor event's balance, stamped
      // TOGETHER with that anchor's value + version so a later re-anchor can never
      // reinterpret this row. No anchor event (legacy-continue state) → HONEST
      // NULLs, never a guessed 1.0. A stamp failure never blocks the open.
      let _b82RatioStamp: { balanceRatioAtOpen: string; anchorBalanceAtOpen: string; anchorVersionAtOpen: number } | {} = {};
      try {
        const { getRatioStampInputs } = await import('./portfolio-anchor-service.js');
        const stampInputs = await getRatioStampInputs(this.mode as 'paper' | 'live');
        if (stampInputs) {
          _b82RatioStamp = {
            balanceRatioAtOpen: (stampInputs.currentBalance / stampInputs.anchorBalance).toFixed(6),
            anchorBalanceAtOpen: stampInputs.anchorBalance.toFixed(2),
            anchorVersionAtOpen: stampInputs.anchorVersion,
          };
        }
      } catch (stampErr: any) {
        console.error(`[B8.2][ratio-stamp] stamp failed (open proceeds, NULLs recorded): ${stampErr?.message}`);
      }

      const trade = await storage.createClosedTrade(this.mode, {
        symbol: signal.symbol,
        baseCurrency,
        // P19-B8.5 (Langston Step-4 ②): the honest class — WITHOUT this the column
        // fell to its schema default 'crypto_spot' for EVERY trade (xStock rows
        // misclassed; the exploration anneal + any per-class read off this table
        // was crypto-only by accident). Same _tradeClass the open-position row gets.
        assetClass: _tradeClass,
        strategyName: signal.strategy,
        side: 'buy',
        quantity: quantity.toString(),
        entryPrice: actualEntryPrice.toString(),
        stopLoss: signal.stopPrice.toString(),
        takeProfit: signal.targetPrice.toString(),
        fees: entryFee.toString(),
        slippage: totalSlippage.toString(),
        confidence: (signal.confidence * 100).toString(),
        openedAt: new Date(),
        signalType: signalType as 'QUANT' | 'PATTERN' | 'HYBRID',
        patternType: patternType as any,
        patternStrength: patternStrength,
        // ── B-EXIT-PROVENANCE OBJ-6/OBJ-7 — THE TAKER ENTRY STAMP, AT THE FILL SEAM.
        // ⛔ ADDED 2026-08-26 AFTER STAGING CAUGHT IT: the Step-2 plan wired the MAKER fill and
        // silently dropped this leg, so the first post-deploy taker entry (PLTR/USD) opened with
        // NULL provenance while every fence passed green. OBJ-6 asks for a non-null entry source
        // on EVERY new row; a plan covering one of two entry paths cannot deliver that.
        // The taker fill is a DEPTH WALK, so the producer names the walk and NOT the mid — a walk
        // consumes book LEVELS; a mid is (bestBid+bestAsk)/2. Two feeds, two producers.
        entryPriceProducer: _gate.snapshot.source === 'crypto_ws_book'
          ? 'crypto_ws_book_walk'
          : 'xstock_ticker_snap_walk',
        entryPriceSource: _gate.snapshot.source,
        // ★ A REAL depth age — the value `entry_book_age_ms` was created for. It exists here,
        // unlike on the maker path where NULL is the honest value because a resting fill consults
        // no depth at all.
        // ⛔ CORRECTED 2026-08-30 (B-EXIT-BOOK-AGE-STAMP): this said "at the REAL fill instant".
        // It is the DEPTH-GATE instant. `_gate` is taken by `_evaluateOpenDepthGate` far above and
        // the walk that consumes its snapshot is ~150 lines and THREE awaits later — one of them
        // `validatePaperOrderWithVenue`, a venue round-trip. Close to the fill, not at it.
        // ⛔ AND ON xSTOCK THIS IS A TICKER-SNAP ROW AGE, not an order-book age — `getDepthSnapshot`
        // computes it in SQL as `NOW() - captured_at`. Do not compare it across classes.
        entryBookAgeMs: _gate.snapshot.ageMs,
        // The price the SIGNAL intended, kept beside the walked entry price above, so slippage is
        // reconstructable from the row alone without re-deriving it from a second table (OBJ-7).
        entryDecisionPrice: signal.entryPrice.toString(),
        // ⛔ NULL: the depth snapshot carries an AGE, not a venue observation timestamp. Deriving
        // one as `Date.now() - ageMs` would manufacture a precision the feed never provided.
        entryObservedAtMs: null,
        // Batch 19E: Persist sourcePool from signal metadata
        sourcePool: (signal as any)?.metadata?.sourcePool || (signal as any)?.sourcePool || null,
        // B67.3: cohort marker (0=capped treatment / 1=uncapped control)
        pairIdHash,
        // B67.2.1: regime classifier confidence + macro modifier + phase
        regimeConfidenceRaw: _b67_2_1_rawConf,
        macroModifierValue: _b67_2_1_modifierValue,
        phase: _b67_2_1_phase,
        phaseAgeSeconds: _b67_2_1_ctx?.regime.phaseAgeSeconds ?? null,
        strategyPhaseWeight: _b67_2_1_phaseWeight,
        regimeConfidenceModulated: _b67_2_1_modulatedConf,
        // P19-B7.2b (OBJ-B): the maker/taker entry fee-mode + per-side rate.
        chosenEntryMode: _b72cEffectiveMode,
        entryFeeRate: _b72EntryFeeRate.toString(),
        // P19-B8.2 (OBJ-4): the balance-ratio calibration stamp (or honest NULLs).
        ..._b82RatioStamp,
        metadata: signal.metadata || {}
      });

      // AJ10.3: Diagnostic - trade record created
      console.log(`[AJ10.3][TRADE_RECORD_OK] tradeId=${trade.id} | symbol=${signal.symbol}`);

      // [B4] Log funnel opened - trade successfully created
      b4Diagnostics.logFunnelEvent({
        symbol: signal.symbol,
        strategy: signal.strategy,
        stage: 'opened',
        block_reason: null
      });

      // Note: Duplicate guard moved to BEFORE trade creation (I7-PM-FOCUS C1)
      // Old I7-ROOT-FIX (C) removed - duplicate guard now prevents orphan trades

      // Phase 8.8.3-I10: Get volume data (FX5 first, then cache/Kraken fallback)
      let volume24h = 0;
      let volumeBucket: 'High' | 'Medium' | 'Low' | 'Very Low' = 'Very Low';
      
      // Try FX5 metadata first (authoritative source at trade creation)
      if (signal.metadata?.volume24h && signal.metadata.volume24h > 0) {
        volume24h = signal.metadata.volume24h;
        volumeBucket = marketVolumeCache.classifyVolume(volume24h);
        console.log(`[I10-VOLUME] Using FX5 volume for ${signal.symbol}: $${(volume24h/1000000).toFixed(2)}M (${volumeBucket})`);
      } else {
        // Try active filter pool
        const poolEntry = activeFilterPool.getSymbolVolumeInfo(signal.symbol, this.mode);
        if (poolEntry.volume24h > 0) {
          volume24h = poolEntry.volume24h;
          volumeBucket = poolEntry.volumeBucket;
          console.log(`[I10-VOLUME] Using pool volume for ${signal.symbol}: $${(volume24h/1000000).toFixed(2)}M (${volumeBucket})`);
        } else {
          // Fallback: Fetch from Kraken via cache (async but non-blocking for position creation)
          try {
            const cachedVolume = await marketVolumeCache.getVolume(signal.symbol);
            volume24h = cachedVolume.volume24h;
            volumeBucket = cachedVolume.volumeBucket;
            console.log(`[I10-VOLUME] Using Kraken fallback for ${signal.symbol}: $${(volume24h/1000000).toFixed(2)}M (${volumeBucket})`);
          } catch (volError) {
            console.warn(`[I10-VOLUME] Failed to get volume for ${signal.symbol}:`, volError);
          }
        }
      }

      // Create open position - Phase 8.8.3-C-FINAL: Include entryFee
      // Directive 10.3: Include signal type fields
      const { position: openPosition, created: _posCreated } = await storage.createActiveOpenPosition(this.mode, {
        symbol: signal.symbol,
        strategyName: signal.strategy,
        side: 'buy',
        quantity: quantity.toString(),
        avgPrice: actualEntryPrice.toString(),
        currentPrice: actualEntryPrice.toString(),
        stopLoss: signal.stopPrice.toString(),
        takeProfit: signal.targetPrice.toString(),
        unrealizedPnl: '0',
        unrealizedPnlPercent: '0',
        confidence: (signal.confidence * 100).toString(),
        volume24h: volume24h.toString(),
        volumeBucket: volumeBucket,
        entryFee: entryFee.toString(),
        intendedEntryPrice: signal.entryPrice.toString(),
        entrySlippage: totalSlippage.toString(),
        signalType: signalType as 'QUANT' | 'PATTERN' | 'HYBRID',
        patternType: patternType as any,
        patternStrength: patternStrength,
        // B69: asset class dimensions — explicit, not DB-default-reliant (Kyle §11)
        // B79.TEC (2026-05-08, Langston Finding 2): resolve from symbol+exchange
        // instead of hardcoding 'crypto_spot'. Otherwise the new per-class TEC
        // dispatch (line ~927) becomes a silent no-op the moment any non-crypto
        // symbol enters paper — exactly the latent failure mode this batch fights.
        exchange: 'kraken',
        // P19-B4a (C4): use the class resolved + skip-guarded above (stamp-preferred).
        assetClass: _tradeClass,
        // P19-B8.5 note: the exploration 4-field stamp reaches this row via the
        // EXISTING `metadata: { ...signal.metadata, ... }` spread below — the budget
        // governor's middle conservation term (open-but-not-yet-closed) reads it.
        // Batch 19E: Persist sourcePool from signal metadata
        sourcePool: (signal as any)?.metadata?.sourcePool || (signal as any)?.sourcePool || null,
        // P19-B7.2b (OBJ-B): the maker/taker entry fee-mode + per-side rate.
        chosenEntryMode: _b72cEffectiveMode,
        entryFeeRate: _b72EntryFeeRate.toString(),
        // P19-B8.2 (OBJ-4): the same stamp as the closed-trade row (one compute,
        // two writes — same-vintage by construction).
        ..._b82RatioStamp,
        // P19-B7.2c: a maker-chosen promotion RESTS as state='pending' at the limit,
        // holding a slot, until the monitor pre-pass fills it (real trade-through) or
        // the hard-drop deadline fires (dropped — never a closed trade). Taker/filled
        // positions keep the default state='open' with NULL maker fields.
        ...(_b72cPendingMaker ? {
          state: 'pending',
          makerLimitPrice: _b72cLimit.toString(),
          makerDeadline: new Date(Date.now() + resolveMakerMaxPendingMs(_openClass)),
        } : {}),
        metadata: {
          ...signal.metadata,
          tradeId: trade.id,
          highWaterMark: actualEntryPrice.toString(), // retained for legacy dashboards; no longer consumed by exit logic
          expectancyScore: expectancyResult.score, // Directive 11.8B: Trade quality score
          expectancyEV: expectancyResult.ev, // Directive 11.8B: Net expectancy
          // B65.2 (2026-04-23): volatility snapshot at open, consumed by the
          // trailing-exit engine at every subsequent exit-check cycle.
          atr_at_open: (signal as any)?.metadata?.atr ?? 0,
          // reorg-B3.1 (#378): read the at-queue DI carried on the promoted signal (reorg-B3) so the
          // trailing-exit engine sees the REAL routing-time DI, not the constant 50 that the dead
          // metadata.DI read always produced. Falls back to the legacy metadata.DI then 50 for any
          // non-promotion-path signal. (vol_noise_at_open stays metadata-based: VolNoise is not a
          // kernel EV input and was deliberately not threaded by reorg-B3.)
          di_at_open: (signal as any)?.diAtQueue ?? (signal as any)?.metadata?.DI ?? 50,
          vol_noise_at_open: (signal as any)?.metadata?.VolNoise ?? 0.3,
          // B-OPEN-TRADES-DISPLAY (item 5, 2026-07-25): carry the SAME at-entry regime
          // classifier detail the createClosedTrade write above stamps (3229-3234) so the
          // Open Trades tab's Regime column can render the three parts (label + confidence
          // + EARLY/PRIME/LATE phase) the shared OpenTradesTable already supports, instead
          // of only the label. active_open_positions has no columns for these, so they ride
          // in metadata (no migration); the open adapter reads them back via metaNum/metaStr.
          // Honest-absent: the vars are null when the MCE context was unavailable at open.
          regimeConfidenceRaw: _b67_2_1_rawConf,
          macroModifierValue: _b67_2_1_modifierValue,
          phase: _b67_2_1_phase,
          phaseAgeSeconds: _b67_2_1_ctx?.regime.phaseAgeSeconds ?? null,
          strategyPhaseWeight: _b67_2_1_phaseWeight,
          regimeConfidenceModulated: _b67_2_1_modulatedConf,
          // B-OUTCOME-FEEDBACK-WIRE (#602, 2026-08-06): the at-open canonical regime
          // label for the B67.4 close-hook. SAME accessor the orchestrator's read
          // side uses (signal-orchestrator.ts:1264 symbolCtx?.regime.regime) — key
          // parity by construction. Deliberately a NEW key: metadata.regime (the
          // ...signal.metadata spread above) is display-consumed and carries
          // strategy-stamped pseudo-labels ('decorrelated-hedge', 'counter-trend')
          // that no read side constructs. This key is canonical-or-null, and the
          // spread sits ABOVE this block so it can never pre-pollute it (ordering
          // is load-bearing — Langston Step-1 r3).
          // ⚠️ Known asymmetry, written down so it isn't rediscovered as a bug
          // (Langston Step-4 E): the read side coerces a cold context to
          // 'UNKNOWN' (signal-orchestrator.ts:1264) while this stamp is null.
          // Harmless today — nothing writes 'UNKNOWN', so a cold-context signal
          // peeks a partition that can never exist and gets the cold-start
          // factor. If a future change ever writes UNKNOWN-keyed tuples,
          // reconcile the two sides first.
          regimeAtOpen: _b67_2_1_ctx?.regime.regime ?? null,
        }
      });

      // B-PROMOTION-RACE-FIX (#508): if a concurrent open won this symbol's single position slot,
      // createActiveOpenPosition returned the WINNER's row with created=false (the I8E dedup-return).
      // Our closed_trades record (createClosedTrade above) is now orphaned — its "position" is the
      // winner's row (linked to the winner's tradeId). Delete our record and bail. Balance-neutral:
      // the computed paper balance sums only closed_at-populated rows + live positions, and this
      // record has neither. Without this, the un-serialized promotion race strands the record.
      if (!_posCreated) {
        console.warn(`[DUP-OPEN-RACE][${this.mode}] ${signal.symbol}: lost the concurrent position race (dedup-return) — deleting orphaned trade record ${trade.id}`);
        try {
          await storage.deleteClosedTrade(this.mode, trade.id);
        } catch (delErr: any) {
          console.error(`[DUP-OPEN-RACE][${this.mode}] failed to delete orphaned record ${trade.id}: ${delErr?.message}`);
        }
        return { opened: false, stage: 'DUP_POSITION', reason: `lost concurrent position race for ${signal.symbol}; orphaned trade record ${trade.id} deleted` };
      }

      // AJ10.3: Diagnostic - open position created
      console.log(`[AJ10.3][OPEN_POSITION_OK] positionId=${openPosition.id} | symbol=${signal.symbol} | tradeId=${trade.id}`);

      // P19-B8.2 (OBJ-3): the ONE friction-divergence evaluation seam — compares
      // THIS open's real notional against the risk-equivalent live-balance order
      // and executes the auto re-anchor on a bound breach (outside the cooldown).
      // Fire-and-forget: an evaluation failure NEVER affects the open (B3b).
      (async () => {
        try {
          const { evaluateDivergenceAtOpen } = await import('./friction-divergence-evaluator.js');
          await evaluateDivergenceAtOpen({
            mode: this.mode as 'paper' | 'live',
            assetClass: _tradeClass,
            paperNotionalUsd: quantity * actualEntryPrice,
            entryPrice: actualEntryPrice,
            atr: Number((signal as any)?.metadata?.atr ?? 0),
            liquidityUsd: volume24h,
          });
        } catch (divErr: any) {
          console.error(`[B8.2][divergence] seam error (open unaffected): ${divErr?.message}`);
        }
      })();

      // P19-B5a: terminal ADMIT capture — the position ACTUALLY OPENED (survived
      // SQE, RTB confidence-revalidation, and the TCL dedup gate). Distinct from the
      // orchestrator 'admitted' row (which marks SQE-pass → queued); source
      // 'active-execution-engine' disambiguates the funnel endpoint. Dormant until
      // paper-active (the open path only runs then). Fire-and-forget, try/catch.
      try {
        const { archiveSignalEval } = await import('./data-archive/signal-eval-archiver.js');
        archiveSignalEval({
          mode: tradingModeToRunMode(this.mode),
          symbol: signal.symbol,
          exchange: 'kraken',
          assetClass: _tradeClass,
          source: 'active-execution-engine',
          strategy: signal.strategy,
          rejectStage: 'admitted',
          confidenceModulated: signal.confidence,
          gateDecision: { gate: 'admitted', accepted: true, path: 'paper-execution-open', entryPrice: actualEntryPrice, stopPrice: signal.stopPrice, targetPrice: signal.targetPrice,
            // ★ mark-2 precondition (Langston 2026-08-17): same expectancy_gates version stamp as the SQE reject row.
            gateConstantsVersion: (await import('./data-archive/decision-provenance.js')).gateConstantsVersionFor(_tradeClass, signal.strategy) },
          features: { entrySlippage: totalSlippage, entryFee },
        });
      } catch (b70Err) {
        console.warn(`[B70][ARCH] paper-open admit signal-eval archive enqueue failed:`, b70Err instanceof Error ? b70Err.message : b70Err);
      }

      // Phase 8.8.3-B3.6: Subscribe to Kraken WebSocket for real-time price updates
      // Phase 8.8.3-I8C: Subscribe each NEW trade immediately upon creation
      try {
        // I8C-ENGINE-SUBCALL: Subscribe to new trade with I8C logging
        krakenWebSocketAdapter.i8cSubscribeNewTrade(signal.symbol, 'new_trade');
        console.log(`[8.8.3-I6-FIX][WS_SUB_NEW] newSymbol=${signal.symbol} | action=subscribe`);
        console.log(`[KrakenWS] Subscribed to ${signal.symbol} for real-time price updates`);
      } catch (wsSubError) {
        console.warn(`[8.8.3-I6-FIX][WS_SUB_FAILED] symbol=${signal.symbol} error=${wsSubError}`);
        console.warn(`[KrakenWS] Failed to subscribe to ${signal.symbol} (REST fallback active):`, wsSubError);
      }

      // Phase 8.8.3-B9: Seed price cache with entry price to prevent mock fallback
      livePricingAdapter.seedLastKnownGoodPrice(signal.symbol, actualEntryPrice);
      console.log(`[B9.PRICING][ENTRY_SEED] ${signal.symbol}: Seeded at entry price $${actualEntryPrice.toFixed(2)}`)

      // [AJ19-B] Trade lifecycle OPEN event - log slot counts
      try {
        const openPositionsAfter = await storage.getActiveOpenPositions(this.mode);
        await aj19bDiagnostic.logOpen({
          tradeId: trade.id,
          positionId: openPosition.id,
          symbol: signal.symbol,
          quantity: quantity.toString(),
          notionalValue: positionValue,
          openPrice: actualEntryPrice,
          slotCountBefore: openPositionsAfter.length - 1, // Before this position was added
          slotCountAfter: openPositionsAfter.length,
          mode: this.mode
        }, this.mode);
      } catch (aj19bErr) {
        console.error('[AJ19-B] Error logging open event:', aj19bErr);
      }

      // Log the entry event
      await storage.createActiveTradeLog(this.mode, {
        tradeId: trade.id,
        positionId: null,
        eventType: 'position_opened',
        message: `Position opened: ${signal.symbol} (${signal.strategy}) - Entry: $${actualEntryPrice.toFixed(2)}, Stop: $${signal.stopPrice.toFixed(2)}, Target: $${signal.targetPrice.toFixed(2)}`,
        metadata: {
          strategy: signal.strategy,
          entryPrice: actualEntryPrice,
          stopPrice: signal.stopPrice,
          targetPrice: signal.targetPrice,
          quantity: quantity,
          positionValue: positionValue,
          slippage: totalSlippage,
          fees: entryFee,
          confidence: signal.confidence
        }
      });

      console.log(`[PaperExecution:${this.mode}] Simulated trade opened: ${signal.symbol} (Trade ID: ${trade.id})`);

      // REB 8.8.3-I: Consume RTB signal when trade opens (remove from Ready-to-Buy)
      try {
        const consumedSignal = await storage.consumeSignalBySymbol(this.mode, signal.symbol);
        if (consumedSignal) {
          console.log(`[8.8.3-I][RTB_CONSUMED] Signal ${consumedSignal.id} consumed for ${signal.symbol}`);
        }
      } catch (consumeError) {
        console.warn(`[8.8.3-I][RTB_CONSUMED] Failed to consume signal for ${signal.symbol}:`, consumeError);
      }

      // [8.8.3-F][OPEN] REB 8.8.3-F: Lifecycle log for trade opened
      console.log(`[8.8.3-F][OPEN]`, JSON.stringify({
        tradeId: trade.id,
        symbol: signal.symbol,
        strategy: signal.strategy,
        direction: 'long',
        entryPrice: actualEntryPrice,
        size: quantity,
        stopLoss: signal.stopPrice,
        takeProfit: signal.targetPrice,
        confidence: signal.confidence,
        timestamp: new Date().toISOString()
      }));
      
      // [AJ18] Trade lifecycle - OPEN event
      aj18Diagnostic.logTradeLifecycle({
        cycleId: aj18Diagnostic.getCycleId(),
        eventType: 'OPEN',
        tradeId: trade.id,
        symbol: signal.symbol,
        strategy: signal.strategy,
        entryPrice: actualEntryPrice
      });

      // [8.8.3-I2] Record successful RTB open in central metrics service (source of truth)
      rtbMetricsService.recordOpen(signal.symbol, signal.strategy);
      
      // [8.8.3-I1] Also record in I1 diagnostics for detailed event history
      i1RtbDiagnostics.recordOpen(signal.symbol, signal.strategy, trade.id);
      i1TradeLifecycleDiagnostics.logOpen(trade.id, signal.symbol, signal.strategy, actualEntryPrice, 'normal');

      // [27.F.14.DIAG] DIAGNOSTIC: Trade insert successful
      console.log(`[DB] trade_insert_ok {tradeId:${trade.id}, symbol:${signal.symbol}}`);
      contextBridge.broadcast({
        type: 'active_trade_opened' as any,
        mode: this.mode,
        payload: {
          tradeId: trade.id,
          symbol: signal.symbol,
          strategy: signal.strategy,
          entryPrice: actualEntryPrice,
          quantity: quantity,
          timestamp: new Date().toISOString()
        }
      });
      
      // Phase 8.8.3-J: Execution Attempt Audit - OPENED decision (non-blocking)
      this.logExecutionAttempt({
        mode: this.mode,
        symbol: signal.symbol,
        strategy: signal.strategy,
        decision: 'OPENED',
        entryPrice: actualEntryPrice.toString(),
        stopPrice: signal.stopPrice.toString(),
        targetPrice: signal.targetPrice.toString(),
        confidence: (signal.confidence * 100).toString(),
        portfolioValue: portfolioValue.toString(),
        riskAmount: riskAmount.toString(),
        positionSize: quantity.toString(),
        tradeId: trade.id,
      }).catch(err => console.error('[8.8.3-J][AUDIT_ERROR] Failed to log opened execution attempt:', err));

      // P19-B6.5e: the position opened — return the typed success outcome (recordOpen
      // already fired at :2574). This replaces executePromotedSignal's trade-count-delta inference.
      return { opened: true, tradeId: trade.id };
    } catch (err: any) {
      // [27.F.14.DIAG] DIAGNOSTIC: Trade insert failed
      console.error(`[DB] trade_insert_err {symbol:${signal.symbol}, error:${err.message}}`);
      // P19-B6.5e: the trade/position insert threw — count it as a post-guardrail open
      // failure (TRADE_INSERT_ERROR) and return a typed outcome instead of re-throwing into
      // processSignal's swallowing catch. The open no longer vanishes on a DB error.
      rtbMetricsService.recordOpenFailed(signal.symbol, signal.strategy, 'TRADE_INSERT_ERROR', err?.message || 'trade/position insert threw');
      return { opened: false, stage: 'TRADE_INSERT_ERROR', reason: err?.message || 'trade/position insert threw' };
    }
  }

  private calculateVWAP(priceData: PriceData[]): number {
    if (priceData.length === 0) return 0;

    // Use most recent VWAP from price data
    const latest = priceData[priceData.length - 1];
    return latest.vwap ? parseFloat(latest.vwap) : parseFloat(latest.close);
  }

  private calculateSMA(priceData: PriceData[], period: number): number {
    if (priceData.length === 0) return 0;
    
    const relevantData = priceData.slice(-period);
    const sum = relevantData.reduce((acc, candle) => acc + parseFloat(candle.close), 0);
    return sum / relevantData.length;
  }

  // Public methods for external control
  async getStatus(): Promise<{ isRunning: boolean; openPositions: number }> {
    const openPositions = await storage.getActiveOpenPositions(this.mode);
    return {
      isRunning: this.isRunning,
      openPositions: openPositions.length
    };
  }

  async getOpenPositions() {
    return await storage.getActiveOpenPositions(this.mode);
  }

  async getTradeHistory(limit: number = 50) {
    return await storage.getClosedTrades(this.mode, { limit, closedOnly: true });
  }

  async getTradeLogs(limit: number = 100) {
    return await storage.getActiveTradeLogs(this.mode, { limit });
  }

  async getStats() {
    return await storage.getActiveEngineStats(this.mode);
  }

  // Phase 27.F.14.DIAG: Telemetry accessor for last cycle diagnostics
  getLastCycleSummary() {
    return this.lastCycleSummary;
  }

  /**
   * Phase 8.8.3-J: Log execution attempt to audit table (non-blocking)
   * Records every P3 decision (execution_attempt → OPENED or BLOCKED)
   * 
   * Phase 8.8.3-J7.5: Engine-gated - only logs when engine is ACTIVE
   * This matches Filter Insights behavior where metrics only accumulate while trading
   */
  private async logExecutionAttempt(audit: Omit<InsertExecutionAttemptAudit, 'createdAt'>): Promise<void> {
    // J7.5: Engine-gated logging - skip if engine not running
    if (!this.isRunning) {
      console.log(`[8.8.3-J7][AUDIT_SKIP] Engine not running - skipping execution audit for ${audit.symbol}`);
      return;
    }
    
    try {
      await storage.createExecutionAttemptAudit(audit);
      console.log(`[8.8.3-J][AUDIT] Execution attempt logged: ${audit.decision} for ${audit.symbol}`);
    } catch (err) {
      console.error(`[8.8.3-J][AUDIT_ERROR] Failed to log execution attempt:`, err);
    }
  }

  /**
   * Phase 37/B6: Process external signal from SignalOrchestrator
   * Public method for SignalOrchestrator to submit signals for execution
   * 
   * REB 8.8.3-F: Restored execution using guardrails_v2 + risk-manager path
   * B6: Trust pre-sized signals from orchestrator, only fall back if missing
   */
  async processSignal(signal: StrategySignal): Promise<OpenOutcome> {
    // P19-B6.5e: returns the typed OpenOutcome threaded from executeSimulatedTrade so
    // executePromotedSignal can read success directly (no trade-count-delta inference).
    // The pre-attempt guard-returns below happen BEFORE checkGuardrailRisk's recordAttempt,
    // so they DON'T touch the I3 invariant — they only label "did not open + why".
    if (!this.isRunning) {
      // Phase 8.8.3-I7-PM-FOCUS: BLOCK_AFTER_STOP diagnostic
      console.log(`[I7-PM-FOCUS][BLOCK_AFTER_STOP] symbol=${signal.symbol} reason="engine_stopped"`);
      console.log(`[PaperExecution:${this.mode}] Cannot process signal - engine not running`);
      return { opened: false, stage: 'OTHER', reason: 'engine not running' };
    }

    // Directive 8.8.4-C.3: Signal origin validation
    // All signals must come through the proper pipeline (SignalOrchestrator → RTB)
    const signalMetadata = (signal as any).metadata;
    const validSources = ['RTB_PROMOTION', 'FX5', 'SIGNAL_ORCHESTRATOR'];
    const signalSource = signalMetadata?.source;
    
    if (!signalSource || !validSources.includes(signalSource)) {
      console.warn(`[8.8.4-C.3][ORIGIN_REJECT] Signal rejected - invalid source: ${signalSource || 'none'}. Valid sources: ${validSources.join(', ')}`);
      console.warn(`[8.8.4-C.3][ORIGIN_REJECT] Symbol: ${signal.symbol}, Strategy: ${signal.strategy}`);
      // Allow processing but log warning - full enforcement after verification period
    }

    const signalAny = signal as any;
    const fieldsPresent: string[] = [];
    if (signal.symbol) fieldsPresent.push('symbol');
    if (signal.strategy) fieldsPresent.push('strategy');
    if (signal.entryPrice) fieldsPresent.push('entryPrice');
    if (signal.stopPrice) fieldsPresent.push('stopPrice');
    if (signal.targetPrice) fieldsPresent.push('targetPrice');
    if (signal.confidence) fieldsPresent.push('confidence');
    if (signalAny.quantity) fieldsPresent.push('quantity');
    if (signalAny.estimatedValue) fieldsPresent.push('estimatedValue');
    if (signalAny.preComputedNotional) fieldsPresent.push('preComputedNotional');
    
    b5SizingAudit.logSignalReceivedByEngine({
      strategy: signal.strategy,
      symbol: signal.symbol,
      entryPrice: signal.entryPrice,
      quantity: signalAny.quantity ?? null,
      estimatedValue: signalAny.estimatedValue ?? null,
      fieldsPresent,
    });

    try {
      const systemContext = await storage.getSystemContext(this.mode);
      if (!systemContext || !systemContext.lastStartedBy) {
        console.error(`[PaperExecution:${this.mode}] No system context or user for ${this.mode} mode`);
        return { opened: false, stage: 'OTHER', reason: 'no system context / user' };
      }

      const settings = await buildSettingsFromGuardrails(this.mode, systemContext.lastStartedBy);
      
      if (settings.killSwitchTripped) {
        console.log(`[8.8.3-F][RISK_REJECT] Kill switch tripped - signal rejected for ${signal.symbol}`);
        return { opened: false, stage: 'OTHER', reason: 'kill switch tripped' };
      }

      // ══════════════════════════════════════════════════════════════════════════════
      // Directive 11.7R-E: Governance gate MOVED to SQE (HF9 Item B)
      // SQE now enforces strategy eligibility before signals reach paper execution.
      // We KEEP the stability computation here because 11.7S mode modulation below
      // depends on regimeStability for sizing, stop, and target adjustments.
      // ══════════════════════════════════════════════════════════════════════════════
      const signalMetadata = signalAny.metadata || {};

      // Compute global stability from available metrics (needed by 11.7S mode modulation)
      // P19-B8.5a (OBJ-4, B1 SEVER — Kyle-ratified crew consensus 2026-07-13): the
      // `signal.confidence` fallback leg is REMOVED. It let the empirically anti-predictive
      // confidence axis (14%-vs-83% regime inversion; §4 probe rho<0) drive strategy mode →
      // positionSizeMultiplier 0.25–1.0× (+ stop/target scaling) — up to 4× bigger positions
      // on WORSE trades, and a paper-DATA-INTEGRITY hazard (distorted sizing pollutes the
      // calibration source). regimeConfidence (a REGIME metric, when present) still rides;
      // absent → the neutral 0.5 default, same as the other two stability inputs. The hybrid
      // sub-path propagation (hybridScore→confidence, signal-orchestrator.ts:2299) is severed
      // by the same cut. AMR-active continues to REPLACE this mode per class (unchanged).
      const stabilityResult = computeGlobalStability(
        signalMetadata.driftScore || 0.5,
        signalMetadata.volZ || 0,
        signalMetadata.regimeConfidence || 0.5
      );
      const regimeStability: RegimeStability = stabilityResult.stability;
      // ══════════════════════════════════════════════════════════════════════════════
      
      // ══════════════════════════════════════════════════════════════════════════════
      // Directive 11.7S — Strategy Mode Modulation
      // ══════════════════════════════════════════════════════════════════════════════
      // B-5 AMR (Obj-5 consumer swap): under the ACTIVE per-class flag the
      // class POSTURE replaces the per-signal stability mode. The legacy
      // stability inputs ride signal-metadata DEFAULTS (0.5/0/0.5) on many
      // signals (pre-audit §1) — the shadow ledger's would-vs-actual
      // divergence from this is expected, not a bug. disabled/shadow: the
      // legacy path below is bit-identical (parity gate A2).
      // ══════════════════════════════════════════════════════════════════════
      // 11.7S DELETED — B-SIZING-DEC-RESTORE obj-10 (Kyle-directed, 2026-08-07)
      // ══════════════════════════════════════════════════════════════════════
      // The class-less stability→posture seed is GONE, not disabled. INTERIM STATE
      // until the AMR flag flips: NO posture overlay unless the AMR supplies one.
      // `modeOverlay` is therefore NULLABLE by design — a null overlay means
      // "no posture modulation", and every consumer below branches on it rather
      // than multiplying by a neutral 1.0 left lying around.
      let strategyMode: StrategyMode = INTERIM_NO_POSTURE_MODE;
      let modeOverlay: StrategyModeOverlay | null = null;
      // P19-B6.5d: prefer the carried signal stamp (collision-correct); safe-resolve
      // fallback + flag a missing stamp (Langston §B stamp-missing-active).
      const _amrStamp = asValidAssetClass(signal.metadata?.assetClass);
      const _amrClass = _amrStamp ?? safeResolveAssetClass(signal.symbol, 'kraken');
      if (!_amrStamp && _amrClass) {
        console.warn(`[P19-B6.5d][STAMP_MISSING_ACTIVE] execution_entry re-derived asset class for ${signal.symbol} — the sizing stamp should have been carried`);
      }
      if (_amrClass !== null) {
        try {
          const { getActiveModeForClass } = await import('./amr-weather-report.js');
          const { getModeOverlayForClass } = await import('../core/governance/strategy-modes.js');
          const amrMode = getActiveModeForClass(_amrClass);
          if (amrMode !== null) {
            strategyMode = amrMode;
            modeOverlay = getModeOverlayForClass(amrMode, _amrClass);
            console.log(`[B-5][Paper][AMR_ACTIVE] ${signal.symbol}: class posture ${amrMode} (${_amrClass}) — the ONLY posture source now that 11.7S is deleted`);
          }
        } catch (amrErr) {
          console.warn(`[B-5][Paper] AMR posture read failed (legacy path): ${amrErr instanceof Error ? amrErr.message : amrErr}`);
        }

        // B-5 AMR (Obj-6): execution-entry gate — roster/floor/pause/slot-cap.
        // F3 precedence: the kill-switch checks upstream and TCL downstream
        // remain independent ANDs; this is solely the AMR question. Shadow =
        // dry-run onto the ledger; active = real block.
        // B1 (Langston Step-4): the slot-count fetch is ISOLATED — a storage
        // hiccup degrades to a count-less gate call (slot gate skips, the
        // roster/floor/pause gates still run + fail-closed under active),
        // never to skipping the whole gate.
        let _sameClassCount: number | undefined;
        try {
          const _gateOpenPositions = await storage.getActiveOpenPositions(this.mode);
          _sameClassCount = _gateOpenPositions.filter(p => (asValidAssetClass((p as { assetClass?: unknown }).assetClass) ?? safeResolveAssetClass(p.symbol, 'kraken')) === _amrClass).length;
        } catch (countErr) {
          console.warn(`[B-5][Paper] open-position count fetch failed (slot gate skips this signal): ${countErr instanceof Error ? countErr.message : countErr}`);
        }
        const { evaluateAmrGates } = await import('../core/governance/amr-gates.js');
        const gate = evaluateAmrGates({
          assetClass: _amrClass,
          site: 'execution_entry',
          strategy: signal.strategy,
          sourcePool: (signal as any).sourcePool ?? signal.metadata?.sourcePool,
          confidence: signalMetadata.regimeConfidence || signal.confidence || 0.5,
          openPositionCountForClass: _sameClassCount,
        });
        if (!gate.allowed) {
          console.log(`[B-5][Paper][AMR_GATE] BLOCK ${signal.symbol}: ${gate.blocks.map(b => b.gate).join(',')} (mode=${gate.mode})`);
          return { opened: false, stage: 'OTHER', reason: `AMR execution-entry gate block: ${gate.blocks.map(b => b.gate).join(',')}` };
        }
      }
      
      // 11.7S: Check if signal meets confidence floor for current mode
      const signalConfidence = signalMetadata.regimeConfidence || signal.confidence || 0.5;
      // B-5: floor read off the RESOLVED overlay — identical to the legacy
      // meetsConfidenceFloor(conf, stability) when AMR is not applied, and the
      // per-class floor when it is.
      // P19-B8.5 OBJ-6 (4th site, same Langston-approved design as the SQE HF8/HF9
      // retirement): this open-seam floor is the SAME contaminated confidence axis
      // through another door — the mode it reads derives from the fabricated
      // cold-start stability (#514). It blocked the FIRST promoted xStock signal
      // (GS/USD 2026-07-16 14:18Z, after SQE pass + queue + promotion + sizing).
      // SHADOW, never block: decision-reconstructable log; admission stays governed
      // by netEV>0 + [11.8B] + exploration. The overlay's size/stop/TP MULTIPLIERS
      // below are untouched (they modulate, not block — outside the #514 ruling).
      // Bury-or-resurrect rides #514 with the other instances.
      if (modeOverlay !== null && !(signalConfidence >= modeOverlay.confidenceFloor)) {
        console.log(`[P19-B8.5][CONF_FLOOR_SHADOW site=execution_entry] ${signal.symbol}/${signal.strategy}: would-SKIP — confidence ${signalConfidence.toFixed(2)} < floor ${modeOverlay.confidenceFloor} (mode=${strategyMode})`);
      }
      
      console.log(modeOverlay === null
        ? `[POSTURE][Paper] none (11.7S deleted; AMR inactive) — stamp=${strategyMode}`
        : `[POSTURE][Paper] AMR ${strategyMode} | Size×${modeOverlay.positionSizeMultiplier} | Stop×${modeOverlay.stopLossDistanceMultiplier} | TP×${modeOverlay.takeProfitDistanceMultiplier}`);
      
      // 11.7S: Apply mode overlay to stop/target distances
      // B63 Item 14: Strong-trend lane mode-overlay BYPASS (mirrored from vts-runner).
      // Signals routed via quant-strong_trend use native geometry to preserve the intended
      // archetype RR (2:1 for strong_bull_trend, 3:1 for vwap_pullback Variant E).
      const paperSourcePool = (signal as any).sourcePool ?? signal.metadata?.sourcePool;
      const useNativeGeometry = paperSourcePool === 'quant-strong_trend';
      if (signal.stopPrice && signal.targetPrice) {
        const stopDistance = signal.entryPrice - signal.stopPrice;
        const targetDistance = signal.targetPrice - signal.entryPrice;
        const adjustedStopDistance = useNativeGeometry
          ? stopDistance
          : stopDistance * (modeOverlay?.stopLossDistanceMultiplier ?? 1);
        const adjustedTargetDistance = useNativeGeometry
          ? targetDistance
          : targetDistance * (modeOverlay?.takeProfitDistanceMultiplier ?? 1);
        signalAny.stopPrice = signal.entryPrice - adjustedStopDistance;
        signalAny.targetPrice = signal.entryPrice + adjustedTargetDistance;
        const geomNote = useNativeGeometry ? ' [B63 Item 14 bypass]' : '';
        console.log(`[11.7S][Paper] ${signal.symbol}: Stop ${signal.stopPrice.toFixed(4)}→${signalAny.stopPrice.toFixed(4)} | TP ${signal.targetPrice.toFixed(4)}→${signalAny.targetPrice.toFixed(4)}${geomNote}`);
      }
      
      // 11.7S: Store mode info on signal for downstream logging
      signalAny.strategyMode = strategyMode;
      signalAny.modeOverlay = modeOverlay;
      signalAny.regimeStability = regimeStability;
      // ══════════════════════════════════════════════════════════════════════════════

      const hasQuantity = signalAny.quantity != null && signalAny.quantity > 0;
      const hasEstimatedValue = signalAny.estimatedValue != null && signalAny.estimatedValue > 0;
      
      if (hasQuantity && hasEstimatedValue) {
        // 11.7S: Apply mode overlay to pre-sized signals as well
        const originalQty = signalAny.quantity;
        const originalValue = signalAny.estimatedValue;
        signalAny.quantity = originalQty * (modeOverlay?.positionSizeMultiplier ?? 1);
        signalAny.estimatedValue = originalValue * (modeOverlay?.positionSizeMultiplier ?? 1);
        signalAny.preComputedNotional = signalAny.estimatedValue;
        console.log(`[B6][TRUST_SIZED] ${signal.symbol}: qty=${signalAny.quantity.toFixed(8)}, value=$${signalAny.estimatedValue.toFixed(2)} (mode=${strategyMode}, ×${modeOverlay?.positionSizeMultiplier ?? 1})`);
      } else {
        console.log(`[B6][FALLBACK_SIZING] Signal missing sizing fields for ${signal.symbol}, will size in executeSimulatedTrade`);
        const guardrails = await storage.getGuardrailsV2({ mode: this.mode });
        // [9.6.3] Use mode-only query (mode-based architecture - userId not needed for storage lookup)
        const portfolioState = await storage.getPortfolioState({ mode: this.mode });
        const portfolioValue = portfolioState ? parseFloat(String(portfolioState.balance)) : 0;
        
        if (portfolioValue > 0) {
          // P19-B4a (C4): prefer the signal stamp; reuse the _amrClass resolved
          // upstream (line ~2590) otherwise. Skip sizing on an unclassifiable
          // symbol rather than throw — mirrors the SIZING_FAILED skip-return below.
          const _sizeClass = asValidAssetClass(signal.metadata?.assetClass) ?? _amrClass;
          if (_sizeClass === null) {
            console.warn('[B6][SIZING_SKIP] unclassifiable ' + signal.symbol + ' — cannot size, skipping');
            return { opened: false, stage: 'OTHER', reason: 'unclassifiable symbol at fallback sizing' };
          }
          const sizingResult = sizeActivePositionForSignal({
            mode: this.mode, // P19-B4b D5: per-mode concentration sizing
            portfolioValue,
            guardrails,
            entryPrice: signal.entryPrice,
            stopPrice: signal.stopPrice,
            symbol: signal.symbol,
            strategy: signal.strategy as any,
            // B-NEW-43 chunk 3: thread the signal's source pool so Phase 14.5
            // pattern-pool reduced sizing applies (was an undeclared ref in TS2304).
            sourcePool: (signal as any)?.metadata?.sourcePool,
            // B79.0n.ORCHESTRATOR (2026-05-27): REQUIRED per-class dispatch key.
            // P19-B4a (C4): stamp-preferred / _amrClass-reuse, skip-guarded above —
            // no silent crypto_spot fallback (Langston Step 2 Probe 8 ACK).
            assetClass: _sizeClass,
          });

          if (sizingResult.quantity > 0 && sizingResult.estimatedValue > 0) {
            // P19-B7.1 (OBJ-5, Langston CHANGE-1): record the SIZED signal's effective-risk-fraction
            // for the clamp-bind watch — INSIDE the opened-gate so the population is EXACTLY opened
            // positions (per actually-SIZED signal, NOT per candidate). A clamped-to-zero-but-valid
            // result would otherwise stamp ratio=0 → bound=true and inflate boundRate with non-trades,
            // biasing the Phase-25 go/no-go (boundRate >~15-20% flips the ranker to realized-$EV).
            if (sizingResult.sizingDetails) {
              rtbMetricsService.recordSizingClampSample({
                symbol: signal.symbol,
                strategy: signal.strategy,
                assetClass: typeof _sizeClass === 'string' ? _sizeClass : undefined,
                effectiveRiskFractionRatio: sizingResult.sizingDetails.effectiveRiskFractionRatio,
                wasClamped: sizingResult.sizingDetails.wasClamped,
                timestamp: Date.now(),
              });
            }
            // 11.7S: Apply mode overlay to position size
            const adjustedQuantity = sizingResult.quantity * (modeOverlay?.positionSizeMultiplier ?? 1);
            const adjustedValue = sizingResult.estimatedValue * (modeOverlay?.positionSizeMultiplier ?? 1);
            signalAny.quantity = adjustedQuantity;
            signalAny.estimatedValue = adjustedValue;
            signalAny.preComputedNotional = adjustedValue;
            console.log(`[B6][FALLBACK_SIZED] ${signal.symbol}: qty=${adjustedQuantity.toFixed(8)}, value=$${adjustedValue.toFixed(2)} (mode=${strategyMode}, ×${modeOverlay?.positionSizeMultiplier ?? 1})`);
          } else {
            console.log(`[B6][SIZING_FAILED] Zero sizing result for ${signal.symbol} - skipping`);
            return { opened: false, stage: 'SIZING_INVALID', reason: 'zero sizing result (fallback)' };
          }
        } else {
          console.error(`[B6][SIZING_ERROR] Invalid portfolio value for fallback sizing: ${portfolioValue}`);
          return { opened: false, stage: 'SIZING_INVALID', reason: `invalid portfolio value for fallback sizing (${portfolioValue})` };
        }
      }

      // Note: Directive 11.7R-E hard governance filter applied before sizing (lines 2134-2160)
      // Note: Directive 11.7S mode overlay applied after governance (lines 2163-2193)
      // If we reach here, strategy is eligible for execution with mode overlay applied

      // 11.7S: Record mode execution for analytics
      // B-5 (F2): per-class counters when the class resolves; the class-aware
      // call also bumps the legacy aggregate.
      // obj-10: the class-less aggregate counter went with 11.7S. Per-class counters
      // survive (they feed the AMR, the surviving posture path). When the class does
      // not resolve there is nothing class-less left to count — and that is correct,
      // not a gap: a posture counter with no posture mechanism counts nothing.
      if (_amrClass !== null) {
        const { recordModeExecutionForClass } = await import('../core/governance/strategy-modes.js');
        recordModeExecutionForClass(strategyMode, _amrClass);
      }
      
      console.log(`[8.8.3-F][PROCESS] Processing signal for ${signal.symbol} via guardrails_v2 path`);
      // P19-B6.5e: thread the typed open outcome up to executePromotedSignal.
      return await this.executeSimulatedTrade(signal, settings);

    } catch (error) {
      console.error(`[PaperExecution:${this.mode}] Error processing signal for ${signal.symbol}:`, error);
      // P19-B6.5e: a setup-stage throw (settings/storage/AMR import) BEFORE the attempt —
      // not an open-stage openFailed (no recordAttempt fired); label it for the caller.
      return { opened: false, stage: 'OTHER', reason: `processSignal error: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
  
  /**
   * Phase 8.8.3-B3.5: Get price tick diagnostic logs
   * Returns last 100 PRICE_TICK entries for cadence verification
   */
  getPriceTickLogs(): Array<{ symbol: string; refreshedAt: string; diffMs: number }> {
    return [...this.priceTickLogs];
  }
  
  /**
   * Phase 8.8.3-B3.5: Get price tick diagnostic summary
   * Returns average interval and cadence health status
   */
  getPriceTickDiagnostics(): {
    logCount: number;
    avgIntervalMs: number;
    minIntervalMs: number;
    maxIntervalMs: number;
    isHealthy: boolean;
    lastTick: string | null;
    mode: 'live' | 'paper';
  } {
    if (this.priceTickLogs.length === 0) {
      return {
        logCount: 0,
        avgIntervalMs: 0,
        minIntervalMs: 0,
        maxIntervalMs: 0,
        isHealthy: false,
        lastTick: null,
        mode: this.mode
      };
    }
    
    const intervals = this.priceTickLogs.filter(l => l.diffMs > 0).map(l => l.diffMs);
    const avgIntervalMs = intervals.length > 0 
      ? Math.round(intervals.reduce((sum, i) => sum + i, 0) / intervals.length)
      : 0;
    const minIntervalMs = intervals.length > 0 ? Math.min(...intervals) : 0;
    const maxIntervalMs = intervals.length > 0 ? Math.max(...intervals) : 0;
    
    // Healthy if average interval is under 3 seconds (allowing for jitter)
    const isHealthy = avgIntervalMs > 0 && avgIntervalMs <= 3000;
    
    const lastLog = this.priceTickLogs[this.priceTickLogs.length - 1];
    
    return {
      logCount: this.priceTickLogs.length,
      avgIntervalMs,
      minIntervalMs,
      maxIntervalMs,
      isHealthy,
      lastTick: lastLog?.refreshedAt || null,
      mode: this.mode
    };
  }
}

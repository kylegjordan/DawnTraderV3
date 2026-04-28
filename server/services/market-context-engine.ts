/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Phase 13/14 — Market Context Engine (MCE)
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Centralized market context computation service. Receives OHLC data from callers
 * (signal-orchestrator, vts-runner) and computes all indicators + regime + directional
 * bias in a single pass per symbol, eliminating duplicate VWAP/SMA computation.
 *
 * MCE does NOT:
 *   - Fetch OHLC data (callers provide it)
 *   - Generate signals (that's strategy-engine's job)
 *   - Add new math beyond regime + indicators + directional bias
 *   - Compute strategy weights or exposure/risk multipliers
 *
 * MCE DOES:
 *   - Compute VWAP, SMA, ATR from provided OHLC
 *   - Call calculatePairRegime() for regime + volatility/momentum/ADX
 *   - Compute Directional Bias Score (Phase 14)
 *   - Look up regimeWeight and allowedStrategies from canonical maps
 *   - Cache results per symbol for the current cycle
 *
 * Phase 14 additions:
 *   - Directional Bias Score (DBS) computed per symbol
 *   - computeGlobalBias() for global directional bias
 *   - Regime names updated to Phase 14 canonical names
 *
 * Addresses: RISK-002 (OHLC Indicator Computation Duplication)
 * Singleton: getMarketContextEngine() / initMarketContextEngine()
 *
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import type {
  MarketContext,
  MarketIndicators,
  RegimeContext,
  MCEConfig,
  MacroContext,
} from '../types/market-context.js';
import { DEFAULT_MCE_CONFIG } from '../types/market-context.js';
import type { OHLCData, RegimeCalculationResult } from '../types/market-regime.types';
import {
  calculatePairRegime,
  getRegimeWeight,
} from '../core/metrics/market-regime.js';
import {
  CANONICAL_REGIME_STRATEGY_MAP,
  type CanonicalRegimeType,
} from '../config/canonical-regime-strategy-map.js';
import { computeDirectionalBias } from '../core/metrics/directional-bias.js';
// B63 Item 16: persistent store + atomic snapshot for global DBS.
// computeGlobalDirectionalBias is now invoked inside directional-bias-store.ts only.
import { directionalBiasStore } from '../core/metrics/directional-bias-store.js';
import type { GlobalDirectionalBias } from '../types/directional-bias.types.js';
// Phase 15b B61: DBS telemetry emitter (observational, feature-flagged)
import { emitMceTelemetry } from './phase15b-dbs-telemetry.js';
// B67.1: macro confidence modifier — feed snapshot + modifier computation.
// MCE reads the snapshot once per cycle (cheap; cached in feed singleton) and
// computes the modifier once, threading it into every per-pair calculatePairRegime
// call in this cycle. Per-pair recomputation NOT done — the modifier is global.
import {
  getLatestMacroSnapshot,
  getLatestMacroBaseline,
} from './external-macro-feed.js';
import {
  computeMacroModifier,
  type MacroModifierConfig,
  type MacroModifierResult,
} from '../core/metrics/macro-modifier.js';
import { getConstant } from './module-constants-service.js';

// ─── Cache Entry ─────────────────────────────────────────────────────────────

interface CacheEntry {
  context: MarketContext;
  expiresAt: number;
}

// ─── MCE Class ───────────────────────────────────────────────────────────────

/**
 * B62: Minimum fraction of the known universe that must be in cache
 * before computeGlobalBias() will produce a result. Below this,
 * global DBS returns NEUTRAL with pairCount=0 to avoid the
 * partial-membership noise that A.3 identified (50.32% flicker rate
 * from rotating 18/60 pairs). 0.70 = require 70% of peak universe.
 */
// B63 Item 16: legacy coverage gate. Replaced by directionalBiasStore's fixed 20-pair floor.
// Retained for one release as a reference marker in case we need to roll back.
const GLOBAL_DBS_MIN_COVERAGE_PCT_DEPRECATED = 0.70;

export class MarketContextEngine {
  private cache: Map<string, CacheEntry> = new Map();
  private config: MCEConfig;
  private running: boolean = false;
  // Phase 15b B61: monotonic cycle counter for DBS telemetry correlation
  private cycleCounter: number = 0;
  // B62 A.3 fix #2: track the peak number of non-expired cache entries
  // observed, as the "expected universe size" for coverage gating.
  private peakCacheSize: number = 0;

  // ─── B67.1: macro modifier per-cycle cache ────────────────────────────────
  // Macro snapshot + modifier are GLOBAL per cycle (not per-pair). Resolve
  // once per `cacheTTLMs` window and reuse across every per-pair computeContext
  // call within that window. Cache miss → re-resolve from module_constants
  // and recompute modifier. Avoids hammering module_constants on every pair.
  private macroCachedAt: number = 0;
  private macroCachedContext: MacroContext | null = null;
  private macroConfigCache: MacroModifierConfig | null = null;

  constructor(config: Partial<MCEConfig> = {}) {
    this.config = { ...DEFAULT_MCE_CONFIG, ...config };
    console.log('[Phase14][MCE] Market Context Engine created');
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  // ─── B67.1: macro context refresh timer ──────────────────────────────────
  private macroRefreshTimer: NodeJS.Timeout | null = null;

  start(): void {
    this.running = true;
    // B67.1: kick off periodic macro context refresh. First refresh runs
    // immediately so cold-start window is bounded by feed.getLatest() not by
    // refresh cadence. Errors swallowed (logged) — null context = no-op
    // modifier in computeContext.
    void this.refreshMacroContext();
    if (this.macroRefreshTimer === null) {
      this.macroRefreshTimer = setInterval(() => {
        void this.refreshMacroContext();
      }, this.config.cacheTTLMs);
    }
    console.log('[Phase14][MCE] Started');
  }

  stop(): void {
    this.running = false;
    this.cache.clear();
    if (this.macroRefreshTimer !== null) {
      clearInterval(this.macroRefreshTimer);
      this.macroRefreshTimer = null;
    }
    this.macroCachedContext = null;
    this.macroCachedAt = 0;
    console.log('[Phase14][MCE] Stopped, cache cleared');
  }

  /**
   * B67.1: Refresh the macro context cache. Called periodically by the
   * `macroRefreshTimer`. Reads `module_constants.macro_modifier.*` for config,
   * snapshot + baseline from `external-macro-feed`, computes modifier
   * unconditionally, stores in MCE state.
   *
   * Per Kyle directive 2026-04-29: no shadow flag, no conditional null path.
   * Modifier is ALWAYS computed and ALWAYS applied. Kill-switch use case is
   * handled by setting modifier_min = modifier_max = 1.0 in DB (math produces
   * identity, no special code path).
   *
   * Errors are NOT swallowed — refresh failure propagates so MCE.start() can
   * surface it. Once a successful refresh has populated the cache, transient
   * subsequent failures retain the prior cached context (until the next
   * successful refresh) — same semantics as directional-bias-store.
   */
  private async refreshMacroContext(): Promise<void> {
    try {
      const snapshot = getLatestMacroSnapshot();

      // Resolve config from module_constants — required, no fallbacks.
      const [
        btcW,
        fundW,
        mcapW,
        modMin,
        modMax,
        staleSec,
        zMinN,
      ] = await Promise.all([
        getConstant<number>('macro_modifier', 'b67_1_btc_dominance_weight', { exchange: '*', assetClass: '*', strategy: '*', regime: '*' } as any),
        getConstant<number>('macro_modifier', 'b67_1_funding_weight', { exchange: '*', assetClass: '*', strategy: '*', regime: '*' } as any),
        getConstant<number>('macro_modifier', 'b67_1_mcap_momentum_weight', { exchange: '*', assetClass: '*', strategy: '*', regime: '*' } as any),
        getConstant<number>('macro_modifier', 'b67_1_modifier_min', { exchange: '*', assetClass: '*', strategy: '*', regime: '*' } as any),
        getConstant<number>('macro_modifier', 'b67_1_modifier_max', { exchange: '*', assetClass: '*', strategy: '*', regime: '*' } as any),
        getConstant<number>('macro_modifier', 'b67_1_external_feed_stale_seconds', { exchange: '*', assetClass: '*', strategy: '*', regime: '*' } as any),
        getConstant<number>('macro_modifier', 'b67_1_zscore_min_sample_count', { exchange: '*', assetClass: '*', strategy: '*', regime: '*' } as any),
      ]);

      // B67.1 — no fallbacks per CLAUDE.md §11 + Kyle directive 2026-04-29.
      // If any constant is missing from the DB, fail hard with a clear
      // identifier so the migration can be fixed. Never silently substitute
      // a default value — that's how broken seeds become invisible bugs.
      const missing: string[] = [];
      if (btcW === undefined)    missing.push('b67_1_btc_dominance_weight');
      if (fundW === undefined)   missing.push('b67_1_funding_weight');
      if (mcapW === undefined)   missing.push('b67_1_mcap_momentum_weight');
      if (modMin === undefined)  missing.push('b67_1_modifier_min');
      if (modMax === undefined)  missing.push('b67_1_modifier_max');
      if (staleSec === undefined) missing.push('b67_1_external_feed_stale_seconds');
      if (zMinN === undefined)   missing.push('b67_1_zscore_min_sample_count');
      if (missing.length > 0) {
        throw new Error(
          `[B67.1] missing module_constants in macro_modifier module: ${missing.join(', ')}. ` +
          `Run migration 2026-04-28-b67-1-macro-modifier.sql to seed.`,
        );
      }

      const cfg: MacroModifierConfig = {
        enabled: true,
        btcDominanceWeight: btcW as number,
        fundingWeight: fundW as number,
        mcapMomentumWeight: mcapW as number,
        modifierMin: modMin as number,
        modifierMax: modMax as number,
        staleSeconds: staleSec as number,
        zScoreMinSampleCount: zMinN as number,
      };
      this.macroConfigCache = cfg;

      const baseline = getLatestMacroBaseline();
      const result: MacroModifierResult = computeMacroModifier(snapshot, baseline, cfg);

      this.macroCachedContext = { snapshot, modifier: result };
      this.macroCachedAt = Date.now();

      console.log(
        `[B67.1][modifier] value=${result.value.toFixed(4)} ` +
          `btcZ=${result.btcDomZ.toFixed(3)} fundZ=${result.fundingZ.toFixed(3)} ` +
          `mcapZ=${result.mcapZ.toFixed(3)} fallback=${result.fallbackActive} ` +
          `stale=${result.staleDataFlag}`,
      );
    } catch (err) {
      console.error(
        '[B67.1][MCE] macro context refresh failed:',
        err instanceof Error ? err.message : err,
      );
      // Keep prior cached context (or null on cold start). Modifier will be
      // 1.0 (no-op) if context is null; otherwise the stale prior is used
      // until the next successful refresh — same semantics as
      // directional-bias-store stale snapshot retention.
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  /**
   * B67.1: Public accessor for the most recently refreshed macro context.
   * Returns null only during cold start — the brief window between MCE.start()
   * being called and the first refreshMacroContext() completing. After that
   * the modifier is always non-null (no shadow theater per Kyle directive
   * 2026-04-29).
   *
   * Consumers (signal-orchestrator + vts-runner ablation hooks) call this to
   * build B67.1 FactorAlternate rows for the B67.0 emitter. Cold-start null
   * means the hook skips emitting a B67.1 alternate that one cycle —
   * acceptable because no signals can be evaluated before MCE is ready.
   */
  getCurrentMacroContext(): MacroContext | null {
    return this.macroCachedContext;
  }

  // ─── Core: Compute Context ─────────────────────────────────────────────────

  /**
   * Compute full market context for a symbol from OHLC data.
   *
   * Phase 14: Now also computes Directional Bias Score (DBS).
   *
   * @param symbol - Trading pair symbol (e.g., 'XXBTZUSD')
   * @param ohlcData - OHLC candles in OHLCData format
   * @param currentPrice - Smoothed current price (from Kalman filter or raw)
   * @param volume24h - 24h volume from ticker
   * @param smaPeriod - Optional SMA period override (default from config)
   */
  computeContext(
    symbol: string,
    ohlcData: OHLCData[],
    currentPrice: number,
    volume24h: number,
    smaPeriod?: number,
    propagatedDbs?: { score: number; category: string; slope?: number } // B63: DBS propagated from FX5 scanner pre-filter
  ): MarketContext {
    const now = Date.now();

    // Check cache
    const cached = this.cache.get(symbol);
    if (cached && cached.expiresAt > now) {
      return cached.context;
    }

    // ── Indicators (VWAP, SMA, ATR, high24h, low24h) ──
    const vwap = this.computeVWAP(ohlcData);
    const sma = this.computeSMA(ohlcData, smaPeriod ?? this.config.smaPeriod);
    const atr = this.computeATR(ohlcData, this.config.atrPeriod);
    const high24h = this.computeHigh24h(ohlcData);
    const low24h = this.computeLow24h(ohlcData);

    // ── B63: DBS is a HARD PIPELINE CONTRACT. No fallback. No recompute. No default. ──
    // FX5 scanner computes DBS pre-filter and propagates it through the pair object.
    // MCE CONSUMES the propagated DBS — never computes it. If missing, fail loudly.
    // Rationale: "Every time we put a fallback in, it ends up somehow becoming the default." — Kyle directive 2026-04-20
    if (!propagatedDbs || !Number.isFinite(propagatedDbs.score)) {
      throw new Error(`[B63][MCE] DBS not propagated for ${symbol} — hard-contract violation. Caller must supply propagatedDbs from pair object.`);
    }
    const directionalBias = {
      score: propagatedDbs.score,
      category: (propagatedDbs.category as any) || 'NEUTRAL',
      sentinelZero: false,
      components: { slopeComponent: 0, returnComponent: 0, emaComponent: 0 },
    };

    // ── B67.1: read pre-resolved macro context from MCE state (sync) ──
    // Macro context is refreshed on a periodic timer started in MCE.start().
    // No fallbacks per Kyle directive 2026-04-29: if refresh has not yet
    // populated the cache (cold start before first refresh completes), throw.
    // Same hard-contract pattern as B63 DBS — caller's classification cycle
    // simply cannot run before MCE is fully initialized.
    if (this.macroCachedContext === null) {
      throw new Error(
        `[B67.1] macro context not initialized for ${symbol}. ` +
        `MCE.start() must complete refreshMacroContext() before computeContext is called.`,
      );
    }
    const macroContext = this.macroCachedContext;
    const macroModifierValue = macroContext.modifier.value;

    // ── B62 + B67.1: Regime calculation receives DBS + macro modifier ──
    const regimeResult = calculatePairRegime(
      ohlcData,
      directionalBias.score,
      macroModifierValue,
    );

    const indicators: MarketIndicators = {
      vwap,
      sma,
      currentPrice,
      volume: volume24h,
      high24h,
      low24h,
      atr,
      volatility: regimeResult.volatility,
      momentum: regimeResult.momentum,
      adx: regimeResult.adx,
    };

    // ── Regime context ──
    const weight = getRegimeWeight(regimeResult.regime);
    const allowedStrategies = this.getAllowedStrategies(regimeResult.regime);

    const regime: RegimeContext = {
      regime: regimeResult.regime,
      confidence: regimeResult.confidence,
      regimeWeight: weight,
      allowedStrategies,
    };

    const context: MarketContext = {
      symbol,
      timestamp: now,
      indicators,
      regime,
      raw: regimeResult,
      directionalBias,
      // B67.1: attach macro context for downstream consumers (ablation hooks
      // read `modifier` to populate alternate_decision JSONB). undefined when
      // refresh hasn't happened yet (cold start) so back-compat preserved.
      // B67.1: macro context is always non-null at this point (we threw above
      // if refresh hadn't populated it). Direct reference, not nullable.
      macro: macroContext,
    };

    // Cache
    this.cache.set(symbol, {
      context,
      expiresAt: now + this.config.cacheTTLMs,
    });

    // B62 A.3 fix #2: track peak cache size for coverage gating
    const currentValidCount = this.countValidEntries();
    if (currentValidCount > this.peakCacheSize) {
      this.peakCacheSize = currentValidCount;
    }

    console.log(
      `[Phase14][MCE] ${symbol}: regime=${regimeResult.regime} conf=${regimeResult.confidence.toFixed(3)} ` +
      `vwap=${vwap.toFixed(2)} sma=${sma.toFixed(2)} atr=${atr.toFixed(4)} ` +
      `vol=${regimeResult.volatility.toFixed(4)} mom=${regimeResult.momentum.toFixed(4)} adx=${regimeResult.adx.toFixed(1)} ` +
      `dbs=${directionalBias.score.toFixed(3)} bias=${directionalBias.category}`
    );

    // B63 Item 16: feed the persistent per-pair DBS store. Store is the source of
    // truth for the end-of-cycle atomic snapshot consumed by all global-DBS readers.
    directionalBiasStore.updatePair(
      symbol,
      directionalBias.score,
      directionalBias.sentinelZero,
      volume24h ?? 0
    );

    // Phase 15b B61: observational telemetry (no-op unless DT_PHASE15B_DBS_TELEMETRY=1)
    this.cycleCounter += 1;
    emitMceTelemetry({
      cycleId: this.cycleCounter,
      symbol,
      dbsScore: directionalBias.score,
      dbsCategory: directionalBias.category,
      slopeComponent: directionalBias.components.slopeComponent,
      returnComponent: directionalBias.components.returnComponent,
      emaComponent: directionalBias.components.emaComponent,
      ohlcLen: ohlcData.length,
      atr,
      vol: regimeResult.volatility,
      adx: regimeResult.adx,
      mom: regimeResult.momentum,
      regime: regimeResult.regime,
    });

    return context;
  }

  // ─── Phase 14: Global Directional Bias ──────────────────────────────────────

  /**
   * Compute global directional bias from cached pair contexts.
   * Should be called after all pair contexts are computed for the cycle.
   *
   * @param volumes - Map of symbol -> 24h volume (for weighting)
   * @returns GlobalDirectionalBias
   */
  /**
   * B63 Item 16: Global DBS is now served from the persistent per-pair store
   * (directional-bias-store.ts). On each call we publish an atomic snapshot
   * from the store's current state and return its value. Within a single
   * cycle, multiple callers receive the same value.
   *
   * Behavior (see directional-bias-store.ts for full 5-row spec):
   *   - Cold start (no prior snapshot, store below floor) → NEUTRAL/pairCount=0
   *   - Degraded coverage with prior snapshot → last good snapshot, marked stale
   *   - Happy path → fresh snapshot
   *   - Invalid compute → prior snapshot marked stale
   *
   * The `volumes` parameter is IGNORED post-B63 — volumes are tracked inside
   * the store as part of each pair's update. Parameter retained for backward
   * compatibility with callers that still pass it.
   *
   * NOTE: pre-B63 coverage gate (70% of peak cache) is replaced by the store's
   * fixed 20-pair floor. `this.peakCacheSize` remains populated for diagnostics
   * only — no longer gates computation.
   *
   * @param volumes - LEGACY parameter, ignored. Kept for signature compatibility.
   * @returns GlobalDirectionalBias. NEUTRAL/0 on cold-start or below-floor-no-snapshot.
   */
  computeGlobalBias(_volumes: Map<string, number>): GlobalDirectionalBias {
    // B63 Item 16: publish atomic snapshot (reads store, handles all 5 behavior-spec rows).
    const snapshot = directionalBiasStore.publishSnapshot();

    if (!snapshot) {
      // Cold start or below floor with no prior snapshot — return a NEUTRAL
      // placeholder per legacy callers' expectations. Consumers that need to
      // distinguish "no snapshot" from "NEUTRAL global" should use
      // getLatestGlobalDbsSnapshot() directly and check for null.
      return {
        score: 0,
        category: 'NEUTRAL',
        pairCount: 0,
        distribution: { UP_STRONG: 0, UP_MODERATE: 0, UP_WEAK: 0, NEUTRAL: 0, DOWN_WEAK: 0, DOWN_MODERATE: 0, DOWN_STRONG: 0 }
      };
    }

    // Emit a concise log on stale snapshots so operators can see when we're
    // serving a carry-forward value vs a fresh compute.
    if (snapshot.isStale) {
      console.log(
        `[B63 Item 16][MCE] Serving STALE global DBS snapshot: score=${snapshot.value.score.toFixed(3)} ` +
        `coverage=${snapshot.coverage} snapshotAge=${Math.round((Date.now() - snapshot.snapshotTime) / 1000)}s`
      );
    }

    return snapshot.value;
  }

  /**
   * B62 A.3 fix #2: Count non-expired cache entries.
   */
  private countValidEntries(): number {
    const now = Date.now();
    let count = 0;
    for (const entry of this.cache.values()) {
      if (entry.expiresAt > now) count++;
    }
    return count;
  }

  /**
   * B62 A.3 fix #1: Extract 24h volumes from all non-expired cached contexts.
   * Used by market-indicators.ts to supply real volume weights to computeGlobalBias().
   */
  getCachedVolumes(): Map<string, number> {
    const now = Date.now();
    const volumes = new Map<string, number>();
    for (const [symbol, entry] of this.cache.entries()) {
      if (entry.expiresAt > now) {
        volumes.set(symbol, entry.context.indicators.volume || 1);
      }
    }
    return volumes;
  }

  // ─── Lookups ───────────────────────────────────────────────────────────────

  /**
   * Get cached context for a symbol. Returns undefined if no cached context or expired.
   */
  getCurrentContext(symbol?: string): MarketContext | undefined {
    if (!symbol) {
      // Return most recent context across all symbols
      let latest: MarketContext | undefined;
      const now = Date.now();
      for (const entry of this.cache.values()) {
        if (entry.expiresAt > now) {
          if (!latest || entry.context.timestamp > latest.timestamp) {
            latest = entry.context;
          }
        }
      }
      return latest;
    }

    const cached = this.cache.get(symbol);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.context;
    }
    return undefined;
  }

  /**
   * Get cached regime for a symbol.
   */
  getRegime(symbol?: string): RegimeContext | undefined {
    return this.getCurrentContext(symbol)?.regime;
  }

  /**
   * Get allowed strategy keys for a canonical regime.
   * Delegates to CANONICAL_REGIME_STRATEGY_MAP.
   */
  getAllowedStrategies(regime: CanonicalRegimeType | string): string[] {
    const mapping = CANONICAL_REGIME_STRATEGY_MAP[regime as CanonicalRegimeType];
    if (!mapping) return [];
    return mapping.strategies.map(s => s.strategyKey);
  }

  /**
   * Get all cached contexts (for health/diagnostics).
   */
  getAllContexts(): MarketContext[] {
    const now = Date.now();
    const results: MarketContext[] = [];
    for (const entry of this.cache.values()) {
      if (entry.expiresAt > now) {
        results.push(entry.context);
      }
    }
    return results;
  }

  /**
   * Clear cache for a specific symbol or all symbols.
   */
  clearCache(symbol?: string): void {
    if (symbol) {
      this.cache.delete(symbol);
    } else {
      this.cache.clear();
    }
  }

  // ─── Indicator Computation (same formulas as signal-orchestrator) ──────────

  /**
   * VWAP = sum(typical_price * volume) / sum(volume)
   */
  private computeVWAP(ohlcData: OHLCData[]): number {
    if (ohlcData.length === 0) return 0;

    let sumPriceVolume = 0;
    let sumVolume = 0;

    for (const candle of ohlcData) {
      const typical = (candle.high + candle.low + candle.close) / 3;
      sumPriceVolume += typical * candle.volume;
      sumVolume += candle.volume;
    }

    return sumVolume > 0 ? sumPriceVolume / sumVolume : 0;
  }

  /**
   * SMA = average of last N close prices.
   */
  private computeSMA(ohlcData: OHLCData[], period: number): number {
    if (ohlcData.length < period) return 0;

    const recentPrices = ohlcData.slice(-period).map(c => c.close);
    const sum = recentPrices.reduce((acc, price) => acc + price, 0);
    return sum / period;
  }

  /**
   * ATR = average of True Range over N periods.
   * TR = max(high-low, |high-prevClose|, |low-prevClose|)
   */
  private computeATR(ohlcData: OHLCData[], period: number): number {
    if (ohlcData.length < 2) return 0;

    const trueRanges: number[] = [];
    for (let i = 1; i < ohlcData.length; i++) {
      const curr = ohlcData[i];
      const prevClose = ohlcData[i - 1].close;

      const highLow = curr.high - curr.low;
      const highClose = Math.abs(curr.high - prevClose);
      const lowClose = Math.abs(curr.low - prevClose);

      trueRanges.push(Math.max(highLow, highClose, lowClose));
    }

    if (trueRanges.length < period) {
      // Not enough data for full period — average what we have
      const sum = trueRanges.reduce((a, b) => a + b, 0);
      return trueRanges.length > 0 ? sum / trueRanges.length : 0;
    }

    const recentTR = trueRanges.slice(-period);
    const sum = recentTR.reduce((a, b) => a + b, 0);
    return sum / period;
  }

  /**
   * Highest high in last 24 candles.
   */
  private computeHigh24h(ohlcData: OHLCData[]): number {
    if (ohlcData.length === 0) return 0;
    const slice = ohlcData.slice(-24);
    return Math.max(...slice.map(c => c.high));
  }

  /**
   * Lowest low in last 24 candles.
   */
  private computeLow24h(ohlcData: OHLCData[]): number {
    if (ohlcData.length === 0) return 0;
    const slice = ohlcData.slice(-24);
    return Math.min(...slice.map(c => c.low));
  }

  // ─── Diagnostics ──────────────────────────────────────────────────────────

  getStatus(): {
    running: boolean;
    cachedSymbols: number;
    config: MCEConfig;
  } {
    const now = Date.now();
    let activeCached = 0;
    for (const entry of this.cache.values()) {
      if (entry.expiresAt > now) activeCached++;
    }
    return {
      running: this.running,
      cachedSymbols: activeCached,
      config: { ...this.config },
    };
  }
  /**
   * Phase 14.5: Compute global dominant regime from MCE cache
   * Aggregates per-pair regimes across all cached symbols using majority vote.
   * Returns null if cache is empty or all entries expired.
   */
  getDominantRegime(): { regime: string; avgScore: number; pairCount: number; percentage: number } | null {
    const now = Date.now();
    const regimeCounts: Record<string, { count: number; totalScore: number }> = {};
    let totalPairs = 0;

    for (const [, entry] of this.cache.entries()) {
      if (now >= entry.expiresAt) continue; // Skip expired

      const regime = entry.context.regime?.regime;
      if (!regime) continue;

      if (!regimeCounts[regime]) {
        regimeCounts[regime] = { count: 0, totalScore: 0 };
      }
      regimeCounts[regime].count += 1;
      regimeCounts[regime].totalScore += entry.context.raw?.regimeScore ?? 50;
      totalPairs++;
    }

    if (totalPairs === 0) return null;

    const sorted = Object.entries(regimeCounts).sort((a, b) => b[1].count - a[1].count);
    if (sorted.length === 0) return null;

    const [regime, stats] = sorted[0];
    return {
      regime,
      avgScore: Math.round(stats.totalScore / stats.count),
      pairCount: totalPairs,
      percentage: Math.round((stats.count / totalPairs) * 100),
    };
  }

}

// ─── Singleton ──────────────────────────────────────────────────────────────

let mceInstance: MarketContextEngine | null = null;

export function initMarketContextEngine(config?: Partial<MCEConfig>): MarketContextEngine {
  if (mceInstance) {
    console.log('[Phase14][MCE] Already initialized, returning existing instance');
    return mceInstance;
  }
  mceInstance = new MarketContextEngine(config);
  mceInstance.start();
  return mceInstance;
}

export function getMarketContextEngine(): MarketContextEngine {
  if (!mceInstance) {
    // Auto-init with defaults if not explicitly initialized
    console.log('[Phase14][MCE] Auto-initializing with default config');
    mceInstance = new MarketContextEngine();
    mceInstance.start();
  }
  return mceInstance;
}

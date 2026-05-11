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
import type { OHLCData, RegimeCalculationResult, RegimeConfig } from '../types/market-regime.types';
import { REGIMES } from '../config/canonical-regime-strategy-map';
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
import { getConstant, getCachedConstant } from './module-constants-service.js';
// B67.2: phase dimension (EARLY/PRIME/LATE on existing 5 regimes).
// Per-pair age tracked by regimePhaseStore singleton; MCE ticks the store on
// every cycle and computes the phase from age + boundary constants. Phase
// preference application lives in signal-orchestrator + vts-runner via the
// shared applyPhasePreference utility (NOT in MCE — MCE only attaches the
// phase + age fields to RegimeContext for downstream consumers to read).
import {
  regimePhaseStore,
  computePhase,
  type RegimePhase,
} from '../core/metrics/regime-phase.js';
// B67.4 cheap-tier bundle: outcome feedback (B67.4) + regime age (B68.4) +
// Path B sustainability (B68.5). Three new config types resolved on the same
// refresh cadence as macro / phase / regime. See BATCH_67_4_PRE_AUDIT.md §D.4
// for the 6-method split rationale (clean error attribution, fault tolerance).
import {
  outcomeFeedbackStore,
  type OutcomeFeedbackConfig,
} from '../core/metrics/outcome-feedback-store.js';
// B68.2 (2026-05-02): volume regime as second confidence dimension.
// Pure-function module; no persistent state. Config resolved alongside the
// other 6 groups via `refreshVolumeRegimeConfig()`.
import type { VolumeRegimeConfig } from '../core/metrics/volume-regime.js';
// B68.3 (2026-05-02): pair correlation as third orthogonal confidence
// dimension. Pure-function module; no persistent state. BTC reference fetched
// on-demand from ohlcCache at emit hook (not pre-cached in MCE state).
import type { PairCorrelationConfig } from '../core/metrics/pair-correlation.js';
// B68.1 (2026-05-03): multi-timeframe agreement as 7th and final B68.x chain
// modulator. Higher-TF (240-min / 4h) regime classification reuses
// `calculatePairRegime` unchanged. Higher-TF OHLC fetched at emit hook from
// ohlcCache (new cache key `${symbol}_240`). No prefetch into MCE state at v1.
import type { MultiTfAgreementConfig } from '../core/metrics/multi-tf-agreement.js';

/** B68.4 — freshness factor config resolved from `regime_age` module. */
export interface RegimeAgeConfig {
  targetAgeHours: number;
  sensitivity: number;
  factorMin: number;
  factorMax: number;
}

/**
 * B68.5 — Path B gate config resolved from `path_b_sustainability` module.
 * B70.3 (2026-05-05): added `pathBMomentumMin`. The runtime classifier uses
 * the momentum gate. `dbsSlopeMin` retained as legacy field for back-compat
 * with the ablation counterfactual builder (set to 0.0 if not present in DB).
 */
export interface PathBSustainabilityConfig {
  pathBMomentumMin: number;
  dbsSlopeMin: number;
}

/** B68.2 — Re-export so consumers can import VolumeRegimeConfig from MCE
 *  alongside the other config types without crossing module boundaries. */
export type { VolumeRegimeConfig } from '../core/metrics/volume-regime.js';

/** B68.3 — Re-export PairCorrelationConfig same as VolumeRegimeConfig. */
export type { PairCorrelationConfig } from '../core/metrics/pair-correlation.js';

/** B68.1 — Re-export MultiTfAgreementConfig same pattern. */
export type { MultiTfAgreementConfig } from '../core/metrics/multi-tf-agreement.js';

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

  // ─── B67.2: phase dimension config cache ──────────────────────────────────
  // Phase boundaries + strategy-phase weights resolved on the same refresh
  // cadence as macro. The 54-cell weights blob is read ONCE per refresh and
  // exposed via getCurrentPhaseWeights() for signal-orchestrator + vts-runner
  // to read at admission time (no per-pair DB hit).
  private phaseEarlyMaxHours: number | null = null;
  private phasePrimeMaxHours: number | null = null;
  private phaseWeights: Record<string, number> | null = null;

  // ─── B67.3.5: TFS desaturation config ─────────────────────────────────────
  // Five tunable scales for the continuous TFS confidence formula. Resolved
  // alongside macro/phase on each refresh cycle. Null only during cold start.
  // B67.4 cheap-tier bundle (2026-05-01): RegimeConfig now also carries the
  // B68.5 `b68_5DbsSlopeMin` field. The two are populated by SEPARATE refresh
  // sub-methods (`refreshRegimeConfig` + `refreshPathBConfig`) per pre-audit
  // §D.4 — both must succeed before `regimeConfig` is non-null.
  private regimeConfig: RegimeConfig | null = null;
  // B67.3.5 desat scales (5 fields) and B68.5 slope min held privately so
  // a partial refresh failure can keep prior `regimeConfig` while individual
  // groups recover.
  private tfsDesatScales: Pick<
    RegimeConfig,
    'tfsDesatMin' | 'tfsDesatMax' | 'tfsMomentumScale' | 'tfsVolatilityScale' | 'tfsDbsScale'
  > | null = null;
  private pathBSlopeMin: number | null = null;
  // B67.5-prep (2026-05-03): post-composition floor, sourced from
  // module_constants regime_classifier.b67_5_post_composition_floor (regime=*).
  // Resolved alongside the 5 TFS desat scales in refreshRegimeConfig — same
  // module so it folds into the existing call without a 9th sub-method.
  private b67_5PostCompositionFloor: number | null = null;

  // ─── B67.4 cheap-tier bundle: 3 new config blocks ────────────────────────
  private outcomeFeedbackConfig: OutcomeFeedbackConfig | null = null;
  private regimeAgeConfig: RegimeAgeConfig | null = null;
  private pathBSustainabilityConfig: PathBSustainabilityConfig | null = null;

  // ─── B68.2: volume regime config block ────────────────────────────────────
  // Pure function over OHLC; no persistent state on the MCE side. Config
  // resolved with the other 6 groups via `refreshVolumeRegimeConfig()`.
  private volumeRegimeConfig: VolumeRegimeConfig | null = null;

  // ─── B68.3: pair correlation config block ─────────────────────────────────
  // Pure function over OHLC + BTC reference. BTC reference fetched at emit
  // hook from ohlcCache (cache read, not network — microsecond latency per
  // Langston cc-inbox #884 D.1). No prefetch into MCE state at v1.
  private pairCorrelationConfig: PairCorrelationConfig | null = null;

  // ─── B68.1: multi-TF agreement config block ──────────────────────────────
  // Pure function over OHLC; higher-TF series fetched at emit hook from
  // ohlcCache (new cache key `${symbol}_240`). No prefetch into MCE state at
  // v1. 7th and final B68.x chain modulator.
  private multiTfAgreementConfig: MultiTfAgreementConfig | null = null;

  /** True until the first successful `refreshAllConfigs()`. Used to enforce
   *  hard-fail-on-startup vs keep-prior-on-subsequent-failure (§D.4). */
  private firstRefreshPending: boolean = true;

  constructor(config: Partial<MCEConfig> = {}) {
    this.config = { ...DEFAULT_MCE_CONFIG, ...config };
    console.log('[Phase14][MCE] Market Context Engine created');
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  // ─── B67.1: macro context refresh timer ──────────────────────────────────
  private macroRefreshTimer: NodeJS.Timeout | null = null;

  start(): void {
    this.running = true;
    // B67.4 cheap-tier bundle (2026-05-01): orchestrator replaces the prior
    // monolithic refreshMacroContext. First refresh hard-fails on any missing
    // group's constants; subsequent refreshes per-group catch + keep prior.
    // See refreshAllConfigs() + the 6 sub-methods.
    void this.refreshAllConfigs();
    if (this.macroRefreshTimer === null) {
      this.macroRefreshTimer = setInterval(() => {
        void this.refreshAllConfigs();
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
    this.regimeConfig = null;
    this.tfsDesatScales = null;
    this.pathBSlopeMin = null;
    this.b67_5PostCompositionFloor = null;
    this.outcomeFeedbackConfig = null;
    this.regimeAgeConfig = null;
    this.pathBSustainabilityConfig = null;
    this.volumeRegimeConfig = null;
    this.pairCorrelationConfig = null;
    this.multiTfAgreementConfig = null;
    this.firstRefreshPending = true;
    console.log('[Phase14][MCE] Stopped, cache cleared');
  }

  /**
   * B67.4 cheap-tier bundle (2026-05-01) — Orchestrator that replaces the
   * prior monolithic `refreshMacroContext`. Per BATCH_67_4_PRE_AUDIT.md §D.4:
   *
   * - **First refresh** (firstRefreshPending=true): any sub-method failure
   *   throws to the caller (via Promise.all rejection). MCE.start() relies on
   *   this — a misconfigured DB at startup must surface immediately.
   * - **Subsequent refreshes**: each sub-method runs in its own try/catch.
   *   On failure the group keeps its prior cached value and logs an error.
   *   One missing constant in B68.5 doesn't take down the entire MCE refresh.
   *
   * Six sub-methods: macro modifier (B67.1), phase (B67.2), regime classifier
   * desat (B67.3.5), outcome feedback (B67.4), regime age (B68.4), Path B
   * sustainability (B68.5). Each is independently unit-testable.
   */
  private async refreshAllConfigs(): Promise<void> {
    if (this.firstRefreshPending) {
      // First refresh: log + retry on failure (same shape as the legacy
      // refreshMacroContext catch). Sub-methods still throw with explicit
      // migration hints so the failure is attributable, but we don't crash
      // the process — the timer keeps retrying every cacheTTLMs and the
      // firstRefreshPending guard remains true until a successful pass.
      // This preserves the §D.4 "no partial config" property without
      // surfacing unhandled rejections from MCE.start()'s void-call.
      try {
        await Promise.all([
          this.refreshMacroConfig(),
          this.refreshPhaseConfig(),
          this.refreshRegimeConfig(),
          this.refreshOutcomeFeedbackConfig(),
          this.refreshRegimeAgeConfig(),
          this.refreshPathBConfig(),
          this.refreshVolumeRegimeConfig(),     // B68.2 (2026-05-02): 7th group
          this.refreshPairCorrelationConfig(),  // B68.3 (2026-05-02): 8th group
          this.refreshMultiTfAgreementConfig(), // B68.1 (2026-05-03): 9th group
        ]);
        this.firstRefreshPending = false;
        this.assembleRegimeConfig();
        console.log('[Phase14][MCE] First refresh complete — all 9 config groups loaded');
      } catch (err) {
        console.error(
          '[Phase14][MCE] First refresh failed; will retry on next timer tick:',
          err instanceof Error ? err.message : err,
        );
      }
      return;
    }
    // Subsequent refreshes: per-group fault tolerance.
    const groups: Array<{ name: string; fn: () => Promise<void> }> = [
      { name: 'macro_modifier',         fn: () => this.refreshMacroConfig() },
      { name: 'regime_phase',           fn: () => this.refreshPhaseConfig() },
      { name: 'regime_classifier',      fn: () => this.refreshRegimeConfig() },
      { name: 'outcome_feedback',       fn: () => this.refreshOutcomeFeedbackConfig() },
      { name: 'regime_age',             fn: () => this.refreshRegimeAgeConfig() },
      { name: 'path_b_sustainability',  fn: () => this.refreshPathBConfig() },
      { name: 'volume_regime',          fn: () => this.refreshVolumeRegimeConfig() },    // B68.2
      { name: 'pair_correlation',       fn: () => this.refreshPairCorrelationConfig() }, // B68.3
      { name: 'multi_tf_agreement',     fn: () => this.refreshMultiTfAgreementConfig() }, // B68.1
    ];
    await Promise.all(groups.map(async (g) => {
      try {
        await g.fn();
      } catch (err) {
        console.error(
          `[B67/B68][MCE] refresh group "${g.name}" failed; keeping prior cached value:`,
          err instanceof Error ? err.message : err,
        );
      }
    }));
    this.assembleRegimeConfig();
  }

  /** B68.5 + B67.3.5 + B67.5-prep: assemble final RegimeConfig from sub-states. */
  private assembleRegimeConfig(): void {
    if (
      this.tfsDesatScales !== null &&
      this.pathBSlopeMin !== null &&
      this.b67_5PostCompositionFloor !== null
    ) {
      this.regimeConfig = {
        ...this.tfsDesatScales,
        // B70.3 (2026-05-05): pathBSlopeMin is now repurposed to carry the
        // momentum-min value (refreshPathBConfig writes momentumMin into it).
        // The classifier reads `b68_5PathBMomentumMin`. Old `b68_5DbsSlopeMin`
        // field is set for back-compat with ablation counterfactual builder.
        b68_5PathBMomentumMin: this.pathBSlopeMin,
        b68_5DbsSlopeMin: this.pathBSustainabilityConfig?.dbsSlopeMin ?? 0.0,
        b67_5PostCompositionFloor: this.b67_5PostCompositionFloor,
      };
    }
  }

  /** B67.1 — macro modifier (7 constants). */
  private async refreshMacroConfig(): Promise<void> {
    const snapshot = getLatestMacroSnapshot();
    const RES_KEY = { exchange: '*', assetClass: '*', strategy: '*', regime: '*' } as any;
    const [btcW, fundW, mcapW, modMin, modMax, staleSec, zMinN] = await Promise.all([
      getConstant<number>('macro_modifier', 'b67_1_btc_dominance_weight', RES_KEY),
      getConstant<number>('macro_modifier', 'b67_1_funding_weight', RES_KEY),
      getConstant<number>('macro_modifier', 'b67_1_mcap_momentum_weight', RES_KEY),
      getConstant<number>('macro_modifier', 'b67_1_modifier_min', RES_KEY),
      getConstant<number>('macro_modifier', 'b67_1_modifier_max', RES_KEY),
      getConstant<number>('macro_modifier', 'b67_1_external_feed_stale_seconds', RES_KEY),
      getConstant<number>('macro_modifier', 'b67_1_zscore_min_sample_count', RES_KEY),
    ]);
    const missing: string[] = [];
    if (btcW === undefined)     missing.push('b67_1_btc_dominance_weight');
    if (fundW === undefined)    missing.push('b67_1_funding_weight');
    if (mcapW === undefined)    missing.push('b67_1_mcap_momentum_weight');
    if (modMin === undefined)   missing.push('b67_1_modifier_min');
    if (modMax === undefined)   missing.push('b67_1_modifier_max');
    if (staleSec === undefined) missing.push('b67_1_external_feed_stale_seconds');
    if (zMinN === undefined)    missing.push('b67_1_zscore_min_sample_count');
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
  }

  /** B67.2 — phase boundaries + strategy-phase weights (3 constants). */
  private async refreshPhaseConfig(): Promise<void> {
    const RES_KEY = { exchange: '*', assetClass: '*', strategy: '*', regime: '*' } as any;
    const [earlyHrs, primeHrs, weightsBlob] = await Promise.all([
      getConstant<number>('regime_phase', 'b67_2_early_phase_max_hours', RES_KEY),
      getConstant<number>('regime_phase', 'b67_2_prime_phase_max_hours', RES_KEY),
      getConstant<Record<string, number>>('regime_phase', 'b67_2_strategy_phase_weights', RES_KEY),
    ]);
    const missing: string[] = [];
    if (earlyHrs === undefined)    missing.push('b67_2_early_phase_max_hours');
    if (primeHrs === undefined)    missing.push('b67_2_prime_phase_max_hours');
    if (weightsBlob === undefined) missing.push('b67_2_strategy_phase_weights');
    if (missing.length > 0) {
      throw new Error(
        `[B67.2] missing module_constants in regime_phase module: ${missing.join(', ')}. ` +
        `Run migration 2026-04-29-b67-2-phase-dimension.sql to seed.`,
      );
    }
    this.phaseEarlyMaxHours = earlyHrs as number;
    this.phasePrimeMaxHours = primeHrs as number;
    this.phaseWeights = weightsBlob as Record<string, number>;
  }

  /** B67.3.5 — TFS desaturation scales (5 constants). */
  private async refreshRegimeConfig(): Promise<void> {
    const REGIME_KEY = {
      exchange: '*',
      assetClass: '*',
      strategy: '*',
      regime: REGIMES.TREND_FRIENDLY_STABLE,
    } as any;
    const FLOOR_KEY = { exchange: '*', assetClass: '*', strategy: '*', regime: '*' } as any;
    const [tfsMin, tfsMax, tfsMomScale, tfsVolScale, tfsDbsScale, postCompFloor] = await Promise.all([
      getConstant<number>('regime_classifier', 'b67_3_5_tfs_desat_min', REGIME_KEY),
      getConstant<number>('regime_classifier', 'b67_3_5_tfs_desat_max', REGIME_KEY),
      getConstant<number>('regime_classifier', 'b67_3_5_tfs_momentum_scale', REGIME_KEY),
      getConstant<number>('regime_classifier', 'b67_3_5_tfs_volatility_scale', REGIME_KEY),
      getConstant<number>('regime_classifier', 'b67_3_5_tfs_dbs_scale', REGIME_KEY),
      // B67.5-prep (2026-05-03): regime=* (cross-cutting floor, not TFS-scoped)
      getConstant<number>('regime_classifier', 'b67_5_post_composition_floor', FLOOR_KEY),
    ]);
    const missing: string[] = [];
    if (tfsMin === undefined)      missing.push('b67_3_5_tfs_desat_min');
    if (tfsMax === undefined)      missing.push('b67_3_5_tfs_desat_max');
    if (tfsMomScale === undefined) missing.push('b67_3_5_tfs_momentum_scale');
    if (tfsVolScale === undefined) missing.push('b67_3_5_tfs_volatility_scale');
    if (tfsDbsScale === undefined) missing.push('b67_3_5_tfs_dbs_scale');
    if (postCompFloor === undefined) missing.push('b67_5_post_composition_floor');
    if (missing.length > 0) {
      throw new Error(
        `[B67.3.5/B67.5-prep] missing module_constants in regime_classifier module: ${missing.join(', ')}. ` +
        `Run migrations 2026-04-29-b67-3-5-tfs-desat.sql + 2026-05-03-b67-5-prep-floor.sql to seed.`,
      );
    }
    this.tfsDesatScales = {
      tfsDesatMin: tfsMin as number,
      tfsDesatMax: tfsMax as number,
      tfsMomentumScale: tfsMomScale as number,
      tfsVolatilityScale: tfsVolScale as number,
      tfsDbsScale: tfsDbsScale as number,
    };
    // B67.5-prep: store the floor separately so assembleRegimeConfig can
    // merge it alongside the TFS desat scales + B68.5 path B slope min.
    this.b67_5PostCompositionFloor = postCompFloor as number;
  }

  /** B67.4 — outcome feedback config (6 constants per §D.5). Also runs the
   *  `outcomeFeedbackStore` expiry sweep using the resolved expiry hours. */
  private async refreshOutcomeFeedbackConfig(): Promise<void> {
    const RES_KEY = { exchange: '*', assetClass: '*', strategy: '*', regime: '*' } as any;
    const [alpha, sensitivity, minSamples, factorMin, factorMax, expiryHours] = await Promise.all([
      getConstant<number>('outcome_feedback', 'b67_4_alpha', RES_KEY),
      getConstant<number>('outcome_feedback', 'b67_4_sensitivity', RES_KEY),
      getConstant<number>('outcome_feedback', 'b67_4_min_samples', RES_KEY),
      getConstant<number>('outcome_feedback', 'b67_4_factor_min', RES_KEY),
      getConstant<number>('outcome_feedback', 'b67_4_factor_max', RES_KEY),
      getConstant<number>('outcome_feedback', 'b67_4_expiry_hours', RES_KEY),
    ]);
    const missing: string[] = [];
    if (alpha === undefined)       missing.push('b67_4_alpha');
    if (sensitivity === undefined) missing.push('b67_4_sensitivity');
    if (minSamples === undefined)  missing.push('b67_4_min_samples');
    if (factorMin === undefined)   missing.push('b67_4_factor_min');
    if (factorMax === undefined)   missing.push('b67_4_factor_max');
    if (expiryHours === undefined) missing.push('b67_4_expiry_hours');
    if (missing.length > 0) {
      throw new Error(
        `[B67.4] missing module_constants in outcome_feedback module: ${missing.join(', ')}. ` +
        `Run migration 2026-05-01-b67-4-cheap-tier.sql to seed.`,
      );
    }
    this.outcomeFeedbackConfig = {
      alpha: alpha as number,
      sensitivity: sensitivity as number,
      minSamples: minSamples as number,
      factorMin: factorMin as number,
      factorMax: factorMax as number,
      expiryHours: expiryHours as number,
    };
    // §D.1 — sweep stale tuples on each refresh using DB-resolved expiry.
    const expiryMs = (expiryHours as number) * 60 * 60 * 1000;
    outcomeFeedbackStore.evictExpired(expiryMs, Date.now());
  }

  /** B68.4 — regime age / freshness factor config (4 constants). */
  private async refreshRegimeAgeConfig(): Promise<void> {
    const RES_KEY = { exchange: '*', assetClass: '*', strategy: '*', regime: '*' } as any;
    const [targetAgeHours, sensitivity, factorMin, factorMax] = await Promise.all([
      getConstant<number>('regime_age', 'b68_4_target_age_hours', RES_KEY),
      getConstant<number>('regime_age', 'b68_4_sensitivity', RES_KEY),
      getConstant<number>('regime_age', 'b68_4_min', RES_KEY),
      getConstant<number>('regime_age', 'b68_4_max', RES_KEY),
    ]);
    const missing: string[] = [];
    if (targetAgeHours === undefined) missing.push('b68_4_target_age_hours');
    if (sensitivity === undefined)    missing.push('b68_4_sensitivity');
    if (factorMin === undefined)      missing.push('b68_4_min');
    if (factorMax === undefined)      missing.push('b68_4_max');
    if (missing.length > 0) {
      throw new Error(
        `[B68.4] missing module_constants in regime_age module: ${missing.join(', ')}. ` +
        `Run migration 2026-05-01-b67-4-cheap-tier.sql to seed.`,
      );
    }
    this.regimeAgeConfig = {
      targetAgeHours: targetAgeHours as number,
      sensitivity: sensitivity as number,
      factorMin: factorMin as number,
      factorMax: factorMax as number,
    };
  }

  /** B68.3 — Pair correlation config (8 constants per Langston cc-inbox #883). */
  private async refreshPairCorrelationConfig(): Promise<void> {
    const RES_KEY = { exchange: '*', assetClass: '*', strategy: '*', regime: '*' } as any;
    const [
      lookbackBars,
      btcRefSymbol,
      factorMin,
      factorMax,
      sensitivity,
      minSamples,
      driftingThr,
      idiosyncraticThr,
    ] = await Promise.all([
      getConstant<number>('pair_correlation', 'b68_3_lookback_bars', RES_KEY),
      getConstant<string>('pair_correlation', 'b68_3_btc_reference_symbol', RES_KEY),
      getConstant<number>('pair_correlation', 'b68_3_factor_min', RES_KEY),
      getConstant<number>('pair_correlation', 'b68_3_factor_max', RES_KEY),
      getConstant<number>('pair_correlation', 'b68_3_sensitivity', RES_KEY),
      getConstant<number>('pair_correlation', 'b68_3_min_samples', RES_KEY),
      getConstant<number>('pair_correlation', 'b68_3_drifting_threshold', RES_KEY),
      getConstant<number>('pair_correlation', 'b68_3_idiosyncratic_threshold', RES_KEY),
    ]);
    const missing: string[] = [];
    if (lookbackBars === undefined)    missing.push('b68_3_lookback_bars');
    if (btcRefSymbol === undefined)    missing.push('b68_3_btc_reference_symbol');
    if (factorMin === undefined)       missing.push('b68_3_factor_min');
    if (factorMax === undefined)       missing.push('b68_3_factor_max');
    if (sensitivity === undefined)     missing.push('b68_3_sensitivity');
    if (minSamples === undefined)      missing.push('b68_3_min_samples');
    if (driftingThr === undefined)     missing.push('b68_3_drifting_threshold');
    if (idiosyncraticThr === undefined) missing.push('b68_3_idiosyncratic_threshold');
    if (missing.length > 0) {
      throw new Error(
        `[B68.3] missing module_constants in pair_correlation module: ${missing.join(', ')}. ` +
        `Run migration 2026-05-02-b68-3-pair-correlation.sql to seed.`,
      );
    }
    this.pairCorrelationConfig = {
      lookbackBars: lookbackBars as number,
      btcReferenceSymbol: btcRefSymbol as string,
      factorMin: factorMin as number,
      factorMax: factorMax as number,
      sensitivity: sensitivity as number,
      minSamples: minSamples as number,
      driftingThreshold: driftingThr as number,
      idiosyncraticThreshold: idiosyncraticThr as number,
    };
  }

  /**
   * B68.1 — Multi-timeframe agreement config (8 constants per Langston cc-inbox
   * #887). 7th and final B68.x chain modulator. Higher-TF (240-min / 4h)
   * regime classification reuses calculatePairRegime unchanged at the emit
   * hook. Per Langston cc-inbox #888: family map kept LOCAL to multi-tf-
   * agreement.ts; this MCE method only resolves the 8 config keys.
   */
  private async refreshMultiTfAgreementConfig(): Promise<void> {
    const RES_KEY = { exchange: '*', assetClass: '*', strategy: '*', regime: '*' } as any;
    const [
      higherTfInterval,
      minHigherTfSamples,
      factorMin,
      factorMax,
      sensitivity,
      compatibleScore,
      confirmedScore,
      conflictedScore,
    ] = await Promise.all([
      getConstant<number>('multi_tf_agreement', 'b68_1_higher_tf_interval_minutes', RES_KEY),
      getConstant<number>('multi_tf_agreement', 'b68_1_min_higher_tf_samples', RES_KEY),
      getConstant<number>('multi_tf_agreement', 'b68_1_factor_min', RES_KEY),
      getConstant<number>('multi_tf_agreement', 'b68_1_factor_max', RES_KEY),
      getConstant<number>('multi_tf_agreement', 'b68_1_sensitivity', RES_KEY),
      getConstant<number>('multi_tf_agreement', 'b68_1_compatible_score', RES_KEY),
      getConstant<number>('multi_tf_agreement', 'b68_1_confirmed_score', RES_KEY),
      getConstant<number>('multi_tf_agreement', 'b68_1_conflicted_score', RES_KEY),
    ]);
    const missing: string[] = [];
    if (higherTfInterval === undefined)   missing.push('b68_1_higher_tf_interval_minutes');
    if (minHigherTfSamples === undefined) missing.push('b68_1_min_higher_tf_samples');
    if (factorMin === undefined)          missing.push('b68_1_factor_min');
    if (factorMax === undefined)          missing.push('b68_1_factor_max');
    if (sensitivity === undefined)        missing.push('b68_1_sensitivity');
    if (compatibleScore === undefined)    missing.push('b68_1_compatible_score');
    if (confirmedScore === undefined)     missing.push('b68_1_confirmed_score');
    if (conflictedScore === undefined)    missing.push('b68_1_conflicted_score');
    if (missing.length > 0) {
      throw new Error(
        `[B68.1] missing module_constants in multi_tf_agreement module: ${missing.join(', ')}. ` +
        `Run migration 2026-05-03-b68-1-multi-tf-agreement.sql to seed.`,
      );
    }
    this.multiTfAgreementConfig = {
      higherTfIntervalMinutes: higherTfInterval as number,
      minHigherTfSamples: minHigherTfSamples as number,
      factorMin: factorMin as number,
      factorMax: factorMax as number,
      sensitivity: sensitivity as number,
      compatibleScore: compatibleScore as number,
      confirmedScore: confirmedScore as number,
      conflictedScore: conflictedScore as number,
    };
  }

  /** B68.2 — Volume regime config (8 constants per Langston cc-inbox #881). */
  private async refreshVolumeRegimeConfig(): Promise<void> {
    const RES_KEY = { exchange: '*', assetClass: '*', strategy: '*', regime: '*' } as any;
    const [
      lookbackBars,
      accumThr,
      distThr,
      factorMin,
      factorMax,
      sensitivity,
      minSamples,
      spikeMult,
    ] = await Promise.all([
      getConstant<number>('volume_regime', 'b68_2_lookback_bars', RES_KEY),
      getConstant<number>('volume_regime', 'b68_2_accumulation_threshold', RES_KEY),
      getConstant<number>('volume_regime', 'b68_2_distribution_threshold', RES_KEY),
      getConstant<number>('volume_regime', 'b68_2_factor_min', RES_KEY),
      getConstant<number>('volume_regime', 'b68_2_factor_max', RES_KEY),
      getConstant<number>('volume_regime', 'b68_2_sensitivity', RES_KEY),
      getConstant<number>('volume_regime', 'b68_2_min_samples', RES_KEY),
      getConstant<number>('volume_regime', 'b68_2_liquidation_spike_multiplier', RES_KEY),
    ]);
    const missing: string[] = [];
    if (lookbackBars === undefined) missing.push('b68_2_lookback_bars');
    if (accumThr === undefined)     missing.push('b68_2_accumulation_threshold');
    if (distThr === undefined)      missing.push('b68_2_distribution_threshold');
    if (factorMin === undefined)    missing.push('b68_2_factor_min');
    if (factorMax === undefined)    missing.push('b68_2_factor_max');
    if (sensitivity === undefined)  missing.push('b68_2_sensitivity');
    if (minSamples === undefined)   missing.push('b68_2_min_samples');
    if (spikeMult === undefined)    missing.push('b68_2_liquidation_spike_multiplier');
    if (missing.length > 0) {
      throw new Error(
        `[B68.2] missing module_constants in volume_regime module: ${missing.join(', ')}. ` +
        `Run migration 2026-05-02-b68-2-volume-regime.sql to seed.`,
      );
    }
    this.volumeRegimeConfig = {
      lookbackBars: lookbackBars as number,
      accumulationThreshold: accumThr as number,
      distributionThreshold: distThr as number,
      factorMin: factorMin as number,
      factorMax: factorMax as number,
      sensitivity: sensitivity as number,
      minSamples: minSamples as number,
      liquidationSpikeMultiplier: spikeMult as number,
    };
  }

  /**
   * B68.5 — Path B sustainability (1 constant). Resolved with regime=TFS.
   * B70.3 (2026-05-05): swapped slope gate → momentum gate. New constant name
   * is `b68_5_path_b_momentum_min` (default 0.002 = 0.2% momentum). Old
   * `b68_5_dbs_slope_min` is preserved as an optional read for back-compat
   * with the ablation counterfactual builder, but the runtime classifier
   * uses the momentum value.
   */
  private async refreshPathBConfig(): Promise<void> {
    const REGIME_KEY = {
      exchange: '*',
      assetClass: '*',
      strategy: '*',
      regime: REGIMES.TREND_FRIENDLY_STABLE,
    } as any;
    const [momentumMin, slopeMin] = await Promise.all([
      getConstant<number>(
        'path_b_sustainability',
        'b68_5_path_b_momentum_min',
        REGIME_KEY,
      ),
      // back-compat read for the ablation counterfactual builder; silent on miss
      getConstant<number>(
        'path_b_sustainability',
        'b68_5_dbs_slope_min',
        REGIME_KEY,
      ),
    ]);
    if (momentumMin === undefined) {
      throw new Error(
        `[B68.5] missing module_constant b68_5_path_b_momentum_min in path_b_sustainability module. ` +
        `Run migration 2026-05-05-b70-3-path-b-momentum-gate.sql to seed.`,
      );
    }
    this.pathBSustainabilityConfig = {
      pathBMomentumMin: momentumMin as number,
      // legacy field — populated for back-compat readers but unused at runtime
      dbsSlopeMin: (slopeMin as number) ?? 0.0,
    };
    this.pathBSlopeMin = momentumMin as number;
  }

  isRunning(): boolean {
    return this.running;
  }

  /**
   * B67.1: Public accessor for the cached MacroModifierConfig used in the
   * most recent refresh. Required by ablation hooks that build per-input
   * counterfactual alternates (the per-input split needs the weights/band
   * to recompute the formula without each input). Null only during cold
   * start.
   */
  getCurrentMacroConfig(): MacroModifierConfig | null {
    return this.macroConfigCache;
  }

  /**
   * B67.2: Sync read of the most recently computed MarketContext for a
   * symbol from MCE's per-symbol cache (60s TTL). Returns null if the cache
   * entry is missing or expired. Consumers (ablation hooks downstream of
   * computeContext) use this to read phase + age without re-computing.
   */
  getCachedContext(symbol: string): MarketContext | null {
    const entry = this.cache.get(symbol);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) return null;
    return entry.context;
  }

  /**
   * B67.2: Public accessor for the strategy-phase weights blob.
   * Returns null only during cold start (before first refresh completes) —
   * after that it's always populated. Consumers (signal-orchestrator + vts-
   * runner) call this at admission time to look up `<strategy>_<phase>` weight
   * via the shared `applyPhasePreference` utility.
   */
  getCurrentPhaseWeights(): Record<string, number> | null {
    return this.phaseWeights;
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

  /**
   * B67.3.5 + B68.5: Public accessor for the resolved RegimeConfig (TFS
   * desaturation scales + Path B slope min). Returns null only during cold
   * start. Diagnostic / observability reads.
   */
  getCurrentRegimeConfig(): RegimeConfig | null {
    return this.regimeConfig;
  }

  /** B67.4 — outcome feedback config accessor. Null only during cold start. */
  getCurrentOutcomeFeedbackConfig(): OutcomeFeedbackConfig | null {
    return this.outcomeFeedbackConfig;
  }

  /** B68.4 — regime age / freshness factor config accessor. */
  getCurrentRegimeAgeConfig(): RegimeAgeConfig | null {
    return this.regimeAgeConfig;
  }

  /** B68.5 — Path B sustainability config accessor. */
  getCurrentPathBSustainabilityConfig(): PathBSustainabilityConfig | null {
    return this.pathBSustainabilityConfig;
  }

  /** B68.2 — Volume regime config accessor. Null only during cold start. */
  getCurrentVolumeRegimeConfig(): VolumeRegimeConfig | null {
    return this.volumeRegimeConfig;
  }

  /** B68.3 — Pair correlation config accessor. Null only during cold start. */
  getCurrentPairCorrelationConfig(): PairCorrelationConfig | null {
    return this.pairCorrelationConfig;
  }

  /** B68.1 — Multi-TF agreement config accessor. Null only during cold start. */
  getCurrentMultiTfAgreementConfig(): MultiTfAgreementConfig | null {
    return this.multiTfAgreementConfig;
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
    propagatedDbs?: { score: number; category: string; slope?: number }, // B63: DBS propagated from FX5 scanner pre-filter (REQUIRED for crypto_spot; synthesized neutral for non-crypto per B79.0m.b)
    assetClass: string = 'crypto_spot', // B79.0m.b: asset-class param + conditional DBS + per-class macro modifier. Default crypto_spot preserves back-compat.
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

    // ── B63: DBS HARD CONTRACT for crypto_spot. ──
    // ── B79.0m.b: For non-crypto asset classes (xstock_spot etc.), DBS is
    //    not computed today. Synthesize neutral {score:0, slope:0, category:'NEUTRAL'}
    //    so the post-filter chain runs Path-A only (conservative; no DBS-based
    //    routing). Future Layer-3 batch may add per-asset-class DBS computation.
    //
    //    Crypto's hard-fail PRESERVED — Kyle directive: "Every time we put a
    //    fallback in, it ends up becoming the default." Per Langston Step 2 Q1
    //    answer: contract does not loosen for crypto in this batch.
    let directionalBias: { score: number; category: any; sentinelZero: boolean; components: any };
    if (assetClass === 'crypto_spot') {
      if (!propagatedDbs || !Number.isFinite(propagatedDbs.score)) {
        throw new Error(`[B63][MCE] DBS not propagated for ${symbol} (asset_class=crypto_spot) — hard-contract violation. Caller must supply propagatedDbs from pair object.`);
      }
      directionalBias = {
        score: propagatedDbs.score,
        category: (propagatedDbs.category as any) || 'NEUTRAL',
        sentinelZero: false,
        components: { slopeComponent: 0, returnComponent: 0, emaComponent: 0 },
      };
    } else {
      // Non-crypto: synthesize neutral DBS. Layer-1 starter; per-asset-class
      // DBS computation deferred to future Layer-3 batch (RUNNING_ISSUES candidate).
      directionalBias = propagatedDbs && Number.isFinite(propagatedDbs.score)
        ? {
            score: propagatedDbs.score,
            category: (propagatedDbs.category as any) || 'NEUTRAL',
            sentinelZero: false,
            components: { slopeComponent: 0, returnComponent: 0, emaComponent: 0 },
          }
        : {
            score: 0,
            category: 'NEUTRAL' as any,
            sentinelZero: true,
            components: { slopeComponent: 0, returnComponent: 0, emaComponent: 0 },
          };
    }

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
    // ── B79.0m.b: asset-class-aware macro modifier resolution ──
    // crypto_spot: use the CoinGecko-fed macroCachedContext value (existing path)
    // non-crypto: read `module_constants.mce_config.<assetClass>.macro_modifier`
    //   (xstock_spot seeded as 1.0 placeholder; B79.3 will populate with equity
    //   macro feed). Future asset classes follow same pattern.
    // RUNNING_ISSUES follow-up (Langston Q2 answer): unify crypto's macro source
    //   to module_constants for symmetric resolution; not in this batch.
    let macroModifierValue: number;
    if (assetClass === 'crypto_spot') {
      macroModifierValue = macroContext.modifier.value;
    } else {
      try {
        const v = getCachedConstant<number>('mce_config', 'macro_modifier', {
          exchange: '*',
          assetClass,
          regime: '*',
          strategy: '*',
        });
        macroModifierValue = typeof v === 'number' && Number.isFinite(v) ? v : 1.0;
      } catch {
        // Cold cache or missing row → safe neutral
        macroModifierValue = 1.0;
      }
    }

    // ── B62 + B67.1 + B67.3.5: Regime calculation receives DBS + macro
    //    modifier + tunable regime config. RegimeConfig must be loaded before
    //    computeContext runs (refreshMacroContext resolves it).
    if (this.regimeConfig === null) {
      throw new Error(
        `[B67.3.5] regime config not initialized for ${symbol}. ` +
        `MCE.start() must complete refreshMacroContext() before computeContext is called.`,
      );
    }
    // B68.5 (cheap-tier bundle 2026-05-01): thread per-pair DBS slope into
    // classifier so the Path B sustainability gate can be applied. `slope` is
    // already produced by directional-bias-store per B62/B63 Item 16; if the
    // caller didn't propagate it (legacy callers), default to 0.0 — which means
    // Path B admits at the seed `b68_5DbsSlopeMin=0.0` threshold (DBS slope
    // non-negative). When the gate is recalibrated to a positive threshold, a
    // missing slope here will correctly REJECT Path B.
    // B79.0m.b: null-safe — non-crypto may have undefined propagatedDbs (synthesized neutral above).
    const dbsSlope = propagatedDbs?.slope ?? 0;
    const regimeResult = calculatePairRegime(
      ohlcData,
      directionalBias.score,
      dbsSlope,
      macroModifierValue,
      this.regimeConfig,
    );

    // ── B67.2: tick regime-phase store + compute phase ────────────────────
    // No fallbacks per Kyle directive 2026-04-29: boundaries must be loaded
    // before computeContext runs. Throw if cold-start race produced null.
    if (this.phaseEarlyMaxHours === null || this.phasePrimeMaxHours === null) {
      throw new Error(
        `[B67.2] phase boundaries not initialized for ${symbol}. ` +
        `MCE.start() must complete refreshMacroContext() before computeContext is called.`,
      );
    }
    // B67.3.5: pass historical OHLC + current DBS + regime config so the
    // phase store can backfill `enteredAt` from history on FIRST observation
    // of the pair (cold-pair age inference). Subsequent ticks use the
    // persisted/tracked `enteredAt`. See regime-phase.ts:backfillFromHistory.
    const phaseAgeMs = regimePhaseStore.tick(symbol, regimeResult.regime, now, {
      ohlcData,
      dbsScore: directionalBias.score,
      regimeConfig: this.regimeConfig,
    });
    const phase: RegimePhase = computePhase(
      phaseAgeMs,
      this.phaseEarlyMaxHours,
      this.phasePrimeMaxHours,
    );
    const phaseAgeSeconds = Math.floor(phaseAgeMs / 1000);
    // Detect phase transitions (regime change OR boundary cross) and log.
    // ageMs near zero immediately after a non-zero tick = transition; the
    // store reset enteredAt. Logging is gated to avoid noise on every cycle.
    if (phaseAgeMs === 0) {
      console.log(
        `[B67.2][transition] ${symbol} regime=${regimeResult.regime} phase=${phase} (regime change reset)`,
      );
    }

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
      // B67.2 — phase dimension (per-pair age + computed phase)
      phase,
      phaseAgeSeconds,
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

    // B70 Step 3.4: pair-scan archive — fire-and-forget, try/catch wrapped.
    // Hot path; MUST NOT block the MCE 60s cycle. Defer the dynamic import
    // outcome via setImmediate so even module-resolution latency doesn't
    // touch the cycle.
    setImmediate(() => {
      (async () => {
        try {
          const { archivePairScan } = await import('./data-archive/pair-scan-archiver.js');
          const { resolveAssetClass } = await import('../../shared/asset-classes.js');
          const atrPct = atr && currentPrice ? (atr / currentPrice) * 100 : undefined;
          archivePairScan({
            capturedAt: now,
            symbol,
            exchange: 'kraken',
            assetClass: resolveAssetClass(symbol, 'kraken'),
            regimeLabel: regimeResult.regime,
            regimeConfidence: regimeResult.confidence,
            dbsScore: directionalBias.score,
            dbsCategory: directionalBias.category,
            atrPct,
            features: {
              vwap,
              sma,
              currentPrice,
              volatility: regimeResult.volatility,
              momentum: regimeResult.momentum,
              adx: regimeResult.adx,
              high24h,
              low24h,
              volume24h,
              phase,
              phaseAgeSeconds,
              ohlcLen: ohlcData.length,
            },
            modulators: {
              macro_modifier_value: macroModifierValue,
              dbs_slope: dbsSlope,
            },
            scanStageDecision: {
              stage: 'admitted_to_mce',
              admitted: true,
            },
          });
        } catch (err) {
          // Silent — never log on hot path
        }
      })();
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

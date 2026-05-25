/**
 * ══════════════════════════════════════════════════════════════════════════════
 * B67.1 — Macro Confidence Modifier (pure function)
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Computes a multiplier in [b67_1_modifier_min, b67_1_modifier_max] (default
 * [0.85, 1.05]) applied to the per-pair regime classifier's confidence number.
 * Inputs: BTC dominance, derivatives funding rates, total-mcap momentum.
 *
 * Architecture: Langston's Option C from REGIME_OVERHAUL_AND_EXTERNAL_DATA_PLAN
 * _2026_04_27.md §3. Label preserved; only confidence is modulated.
 *
 * Sign convention (verified against the canonical 04-22 case in master plan §7):
 *   - BTC dominance rising sharply → modifier < 1.0 (penalize alt confidence)
 *   - Funding rates extreme positive → modifier < 1.0 (crowded long, mean-revert
 *     risk)
 *   - Total mcap momentum rising → modifier > 1.0 (broad market breadth confirms
 *     directional confidence)
 *
 * Formula:
 *   modifier = clamp(min, max,
 *     1.0
 *     + btcDominanceWeight × (-btcDomZScore)
 *     + fundingWeight       × (-fundingZScore)
 *     + mcapMomentumWeight  × ( mcapMomentumZScore)
 *   )
 *
 * Cold-start safety: if the rolling baseline has fewer than
 * b67_1_zscore_min_sample_count samples (default 48), force `value = 1.0` and
 * `fallbackActive = true`. Prevents thin-baseline z-scores from producing
 * arbitrary modifier values during the first ~2 days post-restart.
 *
 * Stale-data safety: if the macro snapshot is older than
 * b67_1_external_feed_stale_seconds (default 300), force `value = 1.0` and
 * `staleDataFlag = true`. Distinct from `fallbackActive` so post-hoc analysis
 * can separate cold-start fallbacks from feed-failure fallbacks (Langston
 * cc-inbox #842 review point).
 *
 * Pure function — no I/O, no side effects, no module_constants reads. Caller
 * (MCE) reads constants once per cycle and threads them in. This keeps the
 * modifier deterministic + trivially unit-testable.
 *
 * Reference: BATCH_67_1_SCOPE.md §6, BATCH_67_1_PRE_AUDIT.md
 */

/**
 * Macro inputs for modifier computation. Fields optional because feed-fallback
 * paths may produce partial snapshots (e.g., CoinGecko reachable but Binance
 * funding rate-limited).
 */
export interface MacroSnapshot {
  /** UTC ISO timestamp when the snapshot was last refreshed. */
  utcIso: string;
  /** Snapshot age in seconds (used for stale-data check). */
  ageSeconds: number;
  /** BTC market-cap share (%, e.g. 54.2). */
  btcDominance?: number;
  /** Total crypto market cap (USD). Raw absolute value, e.g. 2.36e12. */
  totalMarketCapUsd?: number;
  /**
   * Period-over-period % change of `totalMarketCapUsd`, computed by the feed
   * (current_mcap − prev_mcap) / prev_mcap. Z-scored against its own rolling
   * baseline; consumed by the modifier as the "rising mcap reinforces"
   * input. Distinct from `totalMarketCapUsd` which carries the raw value
   * (kept for potential future consumers — regime severity scaling etc.).
   * Per Langston cc-inbox #845 — separate field per "no naming lie" rule.
   */
  mcapMomentum?: number;
  /** Aggregated funding rate (raw 8h, BTC + ETH perps weighted average). */
  fundingRate?: number;
  /** Whether ANY upstream input was unreachable on this snapshot. */
  partialFeed: boolean;
}

/**
 * Rolling baseline for z-score normalization. Caller maintains the windows and
 * passes the current state in. The modifier function does not mutate or store
 * the baseline.
 */
export interface MacroBaseline {
  /** Rolling sample count for BTC dominance baseline. */
  btcDominanceSampleCount: number;
  /** Rolling mean of BTC dominance over the lookback window. */
  btcDominanceMean: number;
  /** Rolling stddev of BTC dominance over the lookback window. */
  btcDominanceStdDev: number;
  /** Rolling sample count for funding rate baseline. */
  fundingSampleCount: number;
  fundingMean: number;
  fundingStdDev: number;
  /** Rolling sample count for mcap momentum baseline. */
  mcapMomentumSampleCount: number;
  mcapMomentumMean: number;
  mcapMomentumStdDev: number;
}

/**
 * Module-constants-resolved configuration. Caller resolves once per cycle and
 * passes in. All numeric except the per-class no-op flag.
 *
 * **B79.0n.CONFIDENCE-CHAIN (2026-05-25):** added `assetClassNoOpActive` flag.
 * When true, `computeMacroModifier` short-circuits at the top and returns
 * `value: 1.0` with `assetClassNoOpActive: true` in the result. Used for
 * asset classes where the crypto-native macro inputs (BTC dominance, funding
 * rates, crypto mcap momentum) are meaningless (e.g., `xstock_spot`). Long-
 * term equity macro inputs (VIX, DXY, SPY momentum) are deferred to a
 * Phase 24 macro-feed batch. NO PATCHES discipline (CLAUDE.md §5 #15) —
 * per-class disposition is an explicit DB-resolved value, not a hardcoded
 * conditional.
 */
export interface MacroModifierConfig {
  enabled: boolean;
  btcDominanceWeight: number;
  fundingWeight: number;
  mcapMomentumWeight: number;
  modifierMin: number;
  modifierMax: number;
  staleSeconds: number;
  zScoreMinSampleCount: number;
  /**
   * B79.0n.CONFIDENCE-CHAIN — when true, `computeMacroModifier` short-circuits
   * to factor=1.0 + `assetClassNoOpActive=true` in the result regardless of
   * inputs. Resolved from `module_constants.macro_modifier.<assetClass>.b67_1_asset_class_no_op_active`.
   */
  assetClassNoOpActive: boolean;
}

/**
 * Output shape — matches the agreed B67.1 ablation row JSONB
 * (cc-inbox #842 + #844). Persisted via factor-ablation-emitter.ts.
 */
export interface MacroModifierResult {
  /** Multiplier in [modifierMin, modifierMax]. 1.0 when fallback or stale. */
  value: number;
  /** BTC dominance z-score (or 0 when baseline insufficient). */
  btcDomZ: number;
  /** Funding rate z-score. */
  fundingZ: number;
  /** Mcap momentum z-score. */
  mcapZ: number;
  /** True when cold-start sample-count floor not yet met. */
  fallbackActive: boolean;
  /** True when snapshot age exceeds staleSeconds. */
  staleDataFlag: boolean;
  /**
   * B79.0n.CONFIDENCE-CHAIN — true when the modifier short-circuited because
   * the per-class config has `assetClassNoOpActive: true`. Distinct telemetry
   * dimension from `fallbackActive` (cold-start) and `staleDataFlag` (feed
   * failure) — this is a legitimate per-class design disposition, not a
   * runtime fault.
   */
  assetClassNoOpActive: boolean;
}

/**
 * Compute z-score for a single value with a sample-count floor check. Returns
 * null when the baseline doesn't yet have enough samples — caller treats null
 * as "trigger fallback path".
 */
function safeZScore(
  value: number | undefined,
  mean: number,
  stdDev: number,
  sampleCount: number,
  minSampleCount: number,
): number | null {
  if (value === undefined || !Number.isFinite(value)) return null;
  if (sampleCount < minSampleCount) return null;
  if (!Number.isFinite(stdDev) || stdDev <= 0) return null;
  return (value - mean) / stdDev;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Pure macro modifier function. See module header for formula + semantics.
 *
 * **B79.0n.CONFIDENCE-CHAIN (2026-05-25):** added REQUIRED `assetClass` for
 * downstream metadata stamping + new short-circuit at the top of the function
 * when `config.assetClassNoOpActive === true`. Used for asset classes where
 * crypto-native macro inputs are meaningless (e.g., `xstock_spot`).
 *
 * @param snapshot — current macro inputs (BTC dom / funding / mcap)
 * @param baseline — rolling-window stats for z-score normalization
 * @param config   — module_constants-resolved configuration (per-class)
 * @param assetClass — REQUIRED. The pair's asset class. Stamped into result
 *                     metadata downstream for ablation row auditability.
 * @returns        — modifier value + per-input z-scores + fallback flags
 */
import type { AssetClass } from '../../../shared/asset-classes';

export function computeMacroModifier(
  snapshot: MacroSnapshot,
  baseline: MacroBaseline,
  config: MacroModifierConfig,
  assetClass: AssetClass,
): MacroModifierResult {
  // B79.0n.CONFIDENCE-CHAIN per-class no-op: when the class's config has the
  // flag active, the modifier function short-circuits to identity. xstock_spot
  // disposition v1; equity-macro inputs follow in a Phase 24 batch.
  if (config.assetClassNoOpActive) {
    return {
      value: 1.0,
      btcDomZ: NaN,
      fundingZ: NaN,
      mcapZ: NaN,
      fallbackActive: false,
      staleDataFlag: false,
      assetClassNoOpActive: true,
    };
  }

  // Stale-data fallback: snapshot too old → modifier = 1.0 + flag.
  if (snapshot.ageSeconds > config.staleSeconds) {
    return {
      value: 1.0,
      btcDomZ: 0,
      fundingZ: 0,
      mcapZ: 0,
      fallbackActive: false,
      staleDataFlag: true,
      assetClassNoOpActive: false,
    };
  }

  const btcZ = safeZScore(
    snapshot.btcDominance,
    baseline.btcDominanceMean,
    baseline.btcDominanceStdDev,
    baseline.btcDominanceSampleCount,
    config.zScoreMinSampleCount,
  );
  const fundingZ = safeZScore(
    snapshot.fundingRate,
    baseline.fundingMean,
    baseline.fundingStdDev,
    baseline.fundingSampleCount,
    config.zScoreMinSampleCount,
  );
  // mcap momentum is the period-over-period % change of totalMarketCapUsd,
  // computed by the feed. Read from the dedicated `mcapMomentum` field per
  // Langston cc-inbox #845 — distinct from raw totalMarketCapUsd.
  const mcapZ = safeZScore(
    snapshot.mcapMomentum,
    baseline.mcapMomentumMean,
    baseline.mcapMomentumStdDev,
    baseline.mcapMomentumSampleCount,
    config.zScoreMinSampleCount,
  );

  // Cold-start fallback: any z-score unavailable → modifier = 1.0 + flag.
  // We require ALL THREE to be available before firing the modifier, so that
  // partial-baseline cases don't produce a half-formed signal. This is
  // conservative; alternative would be to fire with whatever's available and
  // zero out missing terms. Conservative chosen because cold-start is a known
  // brief window (~2 days post-restart at default 48-sample floor).
  //
  // Cold-start IS a fallback path, but it's a LEGITIMATE runtime state with
  // explicit telemetry (fallbackActive=true). Per Kyle directive 2026-04-29
  // this stays. The previously-`?? 0` z-score fields below were silent
  // substitution and have been replaced with NaN (explicit "not computed")
  // so downstream analysis can distinguish "z=0 by computation" from
  // "z couldn't be computed."
  if (btcZ === null || fundingZ === null || mcapZ === null) {
    return {
      value: 1.0,
      btcDomZ: btcZ === null ? NaN : btcZ,
      fundingZ: fundingZ === null ? NaN : fundingZ,
      mcapZ: mcapZ === null ? NaN : mcapZ,
      fallbackActive: true,
      staleDataFlag: false,
      assetClassNoOpActive: false,
    };
  }

  // Happy path: compute weighted modifier and clamp to band.
  // Sign convention (see header): rising BTC dominance penalizes (− sign);
  // crowded funding penalizes (− sign); rising mcap momentum reinforces (+ sign).
  const raw =
    1.0 +
    config.btcDominanceWeight * -btcZ +
    config.fundingWeight * -fundingZ +
    config.mcapMomentumWeight * mcapZ;

  const value = clamp(raw, config.modifierMin, config.modifierMax);

  return {
    value,
    btcDomZ: btcZ,
    fundingZ: fundingZ,
    mcapZ: mcapZ,
    fallbackActive: false,
    staleDataFlag: false,
    assetClassNoOpActive: false,
  };
}

/**
 * Per-input ablation alternate row builder for B67.1. Per Kyle directive
 * 2026-04-29: split the original single `b67_1_macro_modifier` factor into
 * three separate factor rows so each external input is independently
 * attributable on the dashboard.
 *
 * Each alternate represents: "what would the modifier value have been with
 * THIS specific input's contribution removed?" The formula's three additive
 * terms can be ablated independently because they're a weighted sum:
 *
 *   modifier = clamp(min, max, 1.0
 *     + btc_w × (-btc_z)
 *     + funding_w × (-funding_z)
 *     + mcap_w × (mcap_z))
 *
 * Per-input alternates:
 *   - `b67_1_btc_dominance`:   alternate = clamp(min, max, 1.0 + funding_term + mcap_term)
 *   - `b67_1_funding_rates`:   alternate = clamp(min, max, 1.0 + btc_term + mcap_term)
 *   - `b67_1_mcap_momentum`:   alternate = clamp(min, max, 1.0 + btc_term + funding_term)
 *
 * Each alternate's confidence_without is computed as
 * `modulatedConfidence × (alternate_modifier / actual_modifier)` — i.e., what
 * the regime confidence would have been if the alternate modifier had been
 * applied instead of the actual one.
 *
 * Cold-start / stale paths: when fallbackActive=true or staleDataFlag=true
 * the actual modifier is 1.0 and individual contributions are zero/NaN. In
 * that case all three alternates equal the actual modifier (1.0) → no
 * informational difference for that signal. The alternate row still emits
 * with the relevant flags so the dashboard can filter out cold-start
 * contamination.
 *
 * Returns an array of 3 FactorAlternate entries. Caller pushes these onto
 * the alternates array passed to emitAblationRecord.
 */
export function buildB67_1Alternates(
  modulatedConfidence: number,
  modifier: MacroModifierResult,
  regimeLabel: string,
  admissionPossible: boolean,
  config: MacroModifierConfig,
  assetClass: AssetClass,
): Array<{
  factorName: 'b67_1_btc_dominance' | 'b67_1_funding_rates' | 'b67_1_mcap_momentum';
  factorState: 'alternate_disabled';
  alternateDecision: {
    regimeLabel: string;
    confidence: number;
    admissionPossible: boolean;
    metadata: Record<string, unknown>;
  };
}> {
  // Compute each input's contribution to the actual modifier formula.
  // When fallback/stale is active the z-scores may be NaN; treat as 0 for
  // the per-term math. The per-input alternate value is the modifier
  // recomputed without that one term.
  const safeBtc = Number.isFinite(modifier.btcDomZ) ? modifier.btcDomZ : 0;
  const safeFunding = Number.isFinite(modifier.fundingZ) ? modifier.fundingZ : 0;
  const safeMcap = Number.isFinite(modifier.mcapZ) ? modifier.mcapZ : 0;

  const btcTerm = config.btcDominanceWeight * -safeBtc;
  const fundingTerm = config.fundingWeight * -safeFunding;
  const mcapTerm = config.mcapMomentumWeight * safeMcap;

  const clamp = (v: number) => Math.min(Math.max(v, config.modifierMin), config.modifierMax);

  // Counterfactual modifier values (one input removed at a time)
  const modifierWithoutBtc = modifier.fallbackActive || modifier.staleDataFlag
    ? modifier.value
    : clamp(1.0 + fundingTerm + mcapTerm);
  const modifierWithoutFunding = modifier.fallbackActive || modifier.staleDataFlag
    ? modifier.value
    : clamp(1.0 + btcTerm + mcapTerm);
  const modifierWithoutMcap = modifier.fallbackActive || modifier.staleDataFlag
    ? modifier.value
    : clamp(1.0 + btcTerm + fundingTerm);

  // For each, compute the regime confidence that would have resulted from
  // applying the counterfactual modifier instead of the actual one.
  // confidenceWith = modulatedConfidence (actual)
  // confidenceWithout = modulatedConfidence × (counterfactual_modifier / actual_modifier)
  // Edge case: actual modifier == 0 → use modulatedConfidence directly (no division)
  const ratio = (counterfactual: number) =>
    modifier.value > 0 ? modulatedConfidence * (counterfactual / modifier.value) : modulatedConfidence;

  const baseMeta = {
    confidence_with_modifier: modulatedConfidence,
    actual_modifier_value: modifier.value,
    fallback_active: modifier.fallbackActive,
    stale_data_flag: modifier.staleDataFlag,
    // B79.0n.CONFIDENCE-CHAIN: stamp asset class + no-op state in metadata for
    // dashboard / replay filterability.
    asset_class: assetClass,
    asset_class_no_op_active: modifier.assetClassNoOpActive,
  };

  return [
    {
      factorName: 'b67_1_btc_dominance' as const,
      factorState: 'alternate_disabled' as const,
      alternateDecision: {
        regimeLabel,
        confidence: ratio(modifierWithoutBtc),
        admissionPossible,
        metadata: {
          ...baseMeta,
          confidence_without_factor: ratio(modifierWithoutBtc),
          counterfactual_modifier_value: modifierWithoutBtc,
          input_z_score: modifier.btcDomZ,
          input_weight: config.btcDominanceWeight,
        },
      },
    },
    {
      factorName: 'b67_1_funding_rates' as const,
      factorState: 'alternate_disabled' as const,
      alternateDecision: {
        regimeLabel,
        confidence: ratio(modifierWithoutFunding),
        admissionPossible,
        metadata: {
          ...baseMeta,
          confidence_without_factor: ratio(modifierWithoutFunding),
          counterfactual_modifier_value: modifierWithoutFunding,
          input_z_score: modifier.fundingZ,
          input_weight: config.fundingWeight,
        },
      },
    },
    {
      factorName: 'b67_1_mcap_momentum' as const,
      factorState: 'alternate_disabled' as const,
      alternateDecision: {
        regimeLabel,
        confidence: ratio(modifierWithoutMcap),
        admissionPossible,
        metadata: {
          ...baseMeta,
          confidence_without_factor: ratio(modifierWithoutMcap),
          counterfactual_modifier_value: modifierWithoutMcap,
          input_z_score: modifier.mcapZ,
          input_weight: config.mcapMomentumWeight,
        },
      },
    },
  ];
}

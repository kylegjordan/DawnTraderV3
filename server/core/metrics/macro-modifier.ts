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
 * passes in. All numeric.
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
 * @param snapshot — current macro inputs (BTC dom / funding / mcap)
 * @param baseline — rolling-window stats for z-score normalization
 * @param config   — module_constants-resolved configuration
 * @returns        — modifier value + per-input z-scores + fallback flags
 */
export function computeMacroModifier(
  snapshot: MacroSnapshot,
  baseline: MacroBaseline,
  config: MacroModifierConfig,
): MacroModifierResult {
  // Stale-data fallback: snapshot too old → modifier = 1.0 + flag.
  if (snapshot.ageSeconds > config.staleSeconds) {
    return {
      value: 1.0,
      btcDomZ: 0,
      fundingZ: 0,
      mcapZ: 0,
      fallbackActive: false,
      staleDataFlag: true,
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
  if (btcZ === null || fundingZ === null || mcapZ === null) {
    return {
      value: 1.0,
      btcDomZ: btcZ ?? 0,
      fundingZ: fundingZ ?? 0,
      mcapZ: mcapZ ?? 0,
      fallbackActive: true,
      staleDataFlag: false,
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
  };
}

/**
 * Build the B67.0 ablation alternate row for B67.1 from a modulated confidence
 * and the modifier result. The alternate represents the counterfactual: "what
 * would the confidence have been without the macro modifier?"
 *
 * Reverse-derivation: `confidenceWithoutModifier = modulatedConfidence /
 * modifier.value`. Edge-case-safe: when modifier is 1.0 (shadow / fallback /
 * cold-start), the with/without are identical. The clamp boundaries in
 * calculatePairRegime can produce small reverse-derivation imprecision in
 * extreme cases; documented as acceptable for ablation telemetry purposes
 * (post-hoc trend analysis, not sub-percent calibration).
 *
 * Returns the FactorAlternate shape expected by factor-ablation-emitter.ts.
 * Caller pushes this onto the alternates array passed to emitAblationRecord.
 */
export function buildB67_1Alternate(
  modulatedConfidence: number,
  modifier: MacroModifierResult,
  regimeLabel: string,
  admissionPossible: boolean,
): {
  factorName: 'b67_1_macro_modifier';
  factorState: 'alternate_disabled';
  alternateDecision: {
    regimeLabel: string;
    confidence: number;
    admissionPossible: boolean;
    metadata: {
      confidence_with_modifier: number;
      confidence_without_modifier: number;
      modifier_value: number;
      btc_dom_z: number;
      funding_z: number;
      mcap_z: number;
      fallback_active: boolean;
      stale_data_flag: boolean;
    };
  };
} {
  const confidenceWithout =
    modifier.value > 0 ? modulatedConfidence / modifier.value : modulatedConfidence;

  return {
    factorName: 'b67_1_macro_modifier' as const,
    factorState: 'alternate_disabled' as const,
    alternateDecision: {
      regimeLabel,
      confidence: confidenceWithout,
      admissionPossible,
      metadata: {
        confidence_with_modifier: modulatedConfidence,
        confidence_without_modifier: confidenceWithout,
        modifier_value: modifier.value,
        btc_dom_z: modifier.btcDomZ,
        funding_z: modifier.fundingZ,
        mcap_z: modifier.mcapZ,
        fallback_active: modifier.fallbackActive,
        stale_data_flag: modifier.staleDataFlag,
      },
    },
  };
}

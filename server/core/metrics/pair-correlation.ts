/**
 * ══════════════════════════════════════════════════════════════════════════════
 * B68.3 — Pair Correlation as Confidence Dimension
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Adds per-pair Spearman rank correlation to BTC as an orthogonal signal in
 * the confidence chain. Distinguishes idiosyncratic alt moves from BTC-
 * correlated drift per master plan §5.4 #5:
 *
 *   - Pair correlated to BTC → no idiosyncratic edge (just leveraged BTC bet)
 *   - Pair decorrelated from BTC → genuine alpha; trade has unique signal
 *
 * Architecture mirrors B68.2 volume regime exactly: pure functions over OHLC
 * + narrow-band asymmetric confidence factor + ablation row schema.
 *
 *   raw × macro × phase × freshness × outcome × volume_regime
 *     × pair_correlation → clamp [0.4, 1.0]
 *
 * Per BATCH_68_3_SCOPE.md (Langston-approved cc-inbox #883) +
 * BATCH_68_3_PRE_AUDIT.md (Langston-approved cc-inbox #884):
 *   - Spearman over signed returns (vs Pearson — robust to crypto heavy tails;
 *     reuses existing `spearmanRankCorrelation` from strategy-helpers.ts
 *     already proven via `defensive-hedge.ts`)
 *   - 30-bar lookback (matches HF7 / B62 / B68.2 chain consistency)
 *   - Asymmetric factor range [0.95, 1.05] — BOOST ONLY for decorrelated pairs
 *     (highly-correlated pairs get factor=1.0, not penalized at v1; floor at
 *     0.95 future-proofs for if calibration says correlated pairs should be
 *     penalized too)
 *   - §D.1 (cc-inbox #883): idiosyncratic_threshold = 0.30 promoted to
 *     module_constant from v1
 *   - §D.2 (cc-inbox #883): both threshold comparisons use |corr| absolute
 *     value so anti-correlated pairs also flag as DRIFTING (anti-correlated
 *     to BTC = still tightly linked to BTC, just inversely → no idiosyncratic
 *     edge)
 *   - BTC reference: XBT/USD universal v1 (per-quote-currency BTC reference
 *     deferred to v2 if calibration shows it matters)
 *   - Self-reference handling (pair === btcReferenceSymbol): factor=1.0 +
 *     SELF_REFERENCE label flag (emit-with-flag, not skip-emit, per cc-inbox
 *     #883 B.6)
 *
 * No persistent state. Pure function over the OHLC cache; recomputed per
 * signal eval. BTC reference fetched at the emit hook from `ohlcCache.
 * getOHLCData('XBT/USD', 60)` per Langston cc-inbox #884 D.1 (cache read,
 * not network — microsecond latency; prefetch-into-MCE-state deferred as
 * v2 if profiling ever shows it matters, which it won't).
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { spearmanRankCorrelation } from '../../strategies/strategy-helpers.js';
import type { OHLCData } from '../../types/market-regime.types.js';
import type {
  FactorAlternate,
  RegimeDecision,
} from '../../services/factor-ablation-emitter.js';
// B79.0n.CONFIDENCE-CHAIN: per-class threading + reference-symbol-per-class
// resolution + compute_correlation_enabled flag handling.
import type { AssetClass } from '../../../shared/asset-classes.js';

/** Resolved config — supplied by MCE via `refreshPairCorrelationConfig()`. */
export interface PairCorrelationConfig {
  lookbackBars: number;
  /**
   * The reference symbol whose correlation is measured against the pair.
   * Per-class via B79.0n.CONFIDENCE-CHAIN — crypto_spot resolves to
   * `'XXBTZUSD'` (BTC); xstock_spot resolves to `'SPY/USD'` (S&P 500 INDEX_PROXY).
   * The field name retains `btc` for historical continuity but the semantic
   * is "broad-market reference symbol per asset class."
   */
  btcReferenceSymbol: string;
  factorMin: number;
  factorMax: number;
  sensitivity: number;
  minSamples: number;
  driftingThreshold: number;
  idiosyncraticThreshold: number;
  /**
   * B79.0n.CONFIDENCE-CHAIN — when false, `computePairCorrelation` short-
   * circuits to factor=1.0 + `computeDisabled: true` in the result. Used for
   * asset classes where the reference symbol's OHLC pipeline is not yet
   * calibrated for correlation (e.g., xstock_spot vs SPY pending follow-up).
   * Resolved from `module_constants.pair_correlation.<assetClass>.b68_3_compute_correlation_enabled`.
   */
  computeCorrelationEnabled: boolean;
  /**
   * B-XSTOCK-CORRELATION-COLLECT (row 105, Kyle KD-14): whether the factor is MULTIPLIED into confidence. Separate from
   * computing: xStock computes and records (`false`), crypto applies (`true`, the wildcard row). Resolved from
   * `module_constants.pair_correlation.<assetClass>.b68_3_apply_factor`; a missing key fails the per-class load.
   */
  applyFactor: boolean;
}

/**
 * B-XSTOCK-CORRELATION-COLLECT P-1: the two series the correlation is computed over, from the store that holds the
 * reference's class. Crypto: Kraken 60-minute bars, pair unchanged — byte-identical to the pre-batch call sites, and
 * already time-aligned because Kraken returns one continuous hourly series per pair (P-11, measured 12/12).
 * xStock: the xStock bar store at the PAIR series' own interval, and BOTH series reduced to the timestamps they share,
 * because xStock bars have gaps and this function pairs bars by POSITION (A-2: by position, 38 of 469 symbols lined
 * up in time; by timestamp, 465 of 472 had a full 30-bar window at 15 minutes).
 */
export interface CorrelationInputs {
  pair: OHLCData[];
  ref: OHLCData[] | null;
  intervalMinutes: number;
  alignedByTimestamp: boolean;
}

/** Where reference bars come from. Injected so the routing is testable without a database or a network. */
export interface CorrelationReferenceSources {
  crypto(symbol: string): Promise<OHLCData[]>;
  xstock(symbol: string, intervalMinutes: 15 | 60): Promise<OHLCData[]>;
}

const defaultReferenceSources: CorrelationReferenceSources = {
  async crypto(symbol) {
    const { ohlcCache } = await import('../../services/ohlc-cache.js');
    const raw = await ohlcCache.getOHLCData(symbol, 60);
    // The mapper the two call sites carried inline before this batch, moved here verbatim (byte-identical crypto).
    return (raw?.ohlc ?? []).map((c: any) => ({
      open: parseFloat(c.open || c[1]),
      high: parseFloat(c.high || c[2]),
      low: parseFloat(c.low || c[3]),
      close: parseFloat(c.close || c[4]),
      volume: parseFloat(c.volume || c[6] || 0),
      timestamp: c.timestamp || c[0] * 1000,
    })) as OHLCData[];
  },
  async xstock(symbol, intervalMinutes) {
    const { xstockOhlcCache } = await import('../../services/xstock-ohlc-cache.js');
    return (await xstockOhlcCache.getOHLCData(symbol, intervalMinutes)).bars;
  },
};

/** The bar interval of a series, in minutes, from the median spacing of its timestamps; null when it cannot be read. */
export function inferIntervalMinutes(bars: OHLCData[]): number | null {
  const ts = bars.map((b) => Number(b.timestamp)).filter((t) => Number.isFinite(t));
  if (ts.length < 2) return null;
  const gaps: number[] = [];
  for (let i = 1; i < ts.length; i++) if (ts[i] > ts[i - 1]) gaps.push(ts[i] - ts[i - 1]);
  if (gaps.length === 0) return null;
  gaps.sort((a, b) => a - b);
  return Math.round(gaps[Math.floor(gaps.length / 2)] / 60_000);
}

/** Both series reduced to the timestamps present in both, ascending. Bars without a finite timestamp are dropped. */
export function alignByTimestamp(pair: OHLCData[], ref: OHLCData[]): { pair: OHLCData[]; ref: OHLCData[] } {
  const refByTs = new Map<number, OHLCData>();
  for (const b of ref) { const t = Number(b.timestamp); if (Number.isFinite(t)) refByTs.set(t, b); }
  const out = { pair: [] as OHLCData[], ref: [] as OHLCData[] };
  const sorted = [...pair].filter((b) => Number.isFinite(Number(b.timestamp))).sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
  for (const b of sorted) {
    const r = refByTs.get(Number(b.timestamp));
    if (r) { out.pair.push(b); out.ref.push(r); }
  }
  return out;
}

/**
 * P-1: the one function every call site uses (signal orchestrator, crypto VTS runner, xStock VTS eval cycle), so the
 * three cannot drift. Returns `{ skip }` when an xStock pair series has no readable 15- or 60-minute interval.
 */
export async function resolveCorrelationInputs(
  assetClass: AssetClass,
  pairOhlc: OHLCData[],
  config: PairCorrelationConfig,
  sources: CorrelationReferenceSources = defaultReferenceSources,
): Promise<CorrelationInputs | { skip: string }> {
  if (assetClass === 'xstock_spot') {
    const interval = inferIntervalMinutes(pairOhlc);
    if (interval !== 15 && interval !== 60) return { skip: `xStock pair series interval ${interval ?? 'unreadable'} is not 15 or 60 minutes` };
    const refBars = await sources.xstock(config.btcReferenceSymbol, interval);
    const aligned = alignByTimestamp(pairOhlc, refBars);
    return {
      pair: aligned.pair,
      ref: aligned.ref.length >= config.minSamples ? aligned.ref : null,
      intervalMinutes: interval,
      alignedByTimestamp: true,
    };
  }
  const refBars = await sources.crypto(config.btcReferenceSymbol);
  return {
    pair: pairOhlc,
    ref: refBars.length >= config.minSamples ? refBars : null,
    intervalMinutes: 60,
    alignedByTimestamp: false,
  };
}

/** Computation result — score + factor + diagnostic flags. */
export interface PairCorrelationResult {
  /** Spearman rank correlation, signed [-1, +1]. NaN-safe → 0. */
  correlationToBtc: number;
  /** 1 - |correlationToBtc|, ∈ [0, 1]. High = idiosyncratic, low = drifting. */
  decorrelationScore: number;
  /** Confidence factor: clamp(min, max, 1.0 + decorrelationScore × sensitivity). */
  factor: number;
  /** True when sample count is insufficient (factor=1.0, no modulation). */
  coldStart: boolean;
  /** Number of return-pairs actually used for the correlation. */
  sampleCount: number;
  /** True when BTC OHLC was missing or too short — segments cohort. */
  btcReferenceAvailable: boolean;
  /** True when the evaluated pair IS the BTC reference (degenerate case). */
  isBtcSelfReference: boolean;
  /** Informational label from |correlationToBtc| vs configured thresholds. */
  label: 'IDIOSYNCRATIC' | 'DRIFTING' | 'NEUTRAL' | 'SELF_REFERENCE' | 'COMPUTE_DISABLED';
  /**
   * B79.0n.CONFIDENCE-CHAIN — true when `config.computeCorrelationEnabled` was
   * false and the function short-circuited to factor=1.0. Used for asset
   * classes where the reference-symbol correlation pipeline is not yet
   * calibrated (e.g., xstock_spot vs SPY pending follow-up batch).
   */
  computeDisabled: boolean;
}

/**
 * Pure function: compute pair correlation to BTC, the decorrelation score, the
 * confidence factor, and diagnostic flags. No state, no I/O. Caller fetches
 * BTC OHLC and passes in.
 */
export function computePairCorrelation(
  pairSymbol: string,
  pairOhlc: OHLCData[],
  btcOhlc: OHLCData[] | null,
  config: PairCorrelationConfig,
  assetClass: AssetClass,
): PairCorrelationResult {
  // B79.0n.CONFIDENCE-CHAIN per-class compute-disabled short-circuit. Used
  // for asset classes where the reference-symbol correlation pipeline is not
  // yet calibrated (e.g., xstock_spot vs SPY pending follow-up batch). Emits
  // with the disabled flag for downstream filterability.
  if (!config.computeCorrelationEnabled) {
    return {
      correlationToBtc: 0,
      decorrelationScore: 0,
      factor: 1.0,
      coldStart: false,
      sampleCount: 0,
      btcReferenceAvailable: false,
      isBtcSelfReference: false,
      label: 'COMPUTE_DISABLED',
      computeDisabled: true,
    };
  }

  // §A.1.2: self-reference guard — pair IS the BTC reference symbol. Trading
  // BTC vs itself is degenerate; emit row with explicit flag (per cc-inbox
  // #883 B.6 — emit-with-flag, not skip-emit, keeps ablation dataset clean).
  if (pairSymbol === config.btcReferenceSymbol) {
    return {
      correlationToBtc: 0,
      decorrelationScore: 0,
      factor: 1.0,
      coldStart: false,
      sampleCount: 0,
      btcReferenceAvailable: true,
      isBtcSelfReference: true,
      label: 'SELF_REFERENCE',
      computeDisabled: false,
    };
  }
  // Suppress unused-var warning — assetClass is part of the type contract
  // for downstream metadata stamping in buildB68_3Alternate, even though the
  // pure-function math is class-invariant (F-1 per scope §8).
  void assetClass;

  // §A.1.1: cold-start when either pair OR BTC OHLC is short. Both must have
  // ≥ N bars. BTC missing entirely (cache cold-start) is also cold-start.
  const btcAvailable = !!btcOhlc && btcOhlc.length >= config.minSamples;
  if (!pairOhlc || pairOhlc.length < config.minSamples || !btcAvailable) {
    return {
      correlationToBtc: 0,
      decorrelationScore: 0,
      factor: 1.0,
      coldStart: true,
      sampleCount: 0,
      btcReferenceAvailable: btcAvailable,
      isBtcSelfReference: false,
      label: 'NEUTRAL',
      computeDisabled: false,
    };
  }

  // Slice both series to lookback. Compute returns: (close[i] - close[i-1]) /
  // close[i-1] for i in 1..N. Returns array length = N - 1.
  const pairSlice = pairOhlc.slice(-config.lookbackBars);
  const btcSlice = btcOhlc!.slice(-config.lookbackBars);

  // Use the smaller of the two slice lengths — handles edge case where BTC
  // and pair slices differ by one bar due to slightly different cache state.
  const N = Math.min(pairSlice.length, btcSlice.length);
  const pairReturns: number[] = [];
  const btcReturns: number[] = [];
  for (let i = 1; i < N; i++) {
    const pairPrev = pairSlice[i - 1].close;
    const btcPrev = btcSlice[i - 1].close;
    // B-XSTOCK-CORRELATION-COLLECT: the CURRENT closes must be finite too. `prev > 0` already drops a NaN previous
    // close (`NaN > 0` is false) but a NaN current close produced a NaN return, which hung spearmanRankCorrelation
    // (fixed there as well). A dropped return lowers sample_count below 29 — the visible signature Langston named.
    if (pairPrev > 0 && btcPrev > 0 && Number.isFinite(pairSlice[i].close) && Number.isFinite(btcSlice[i].close)) {
      pairReturns.push((pairSlice[i].close - pairPrev) / pairPrev);
      btcReturns.push((btcSlice[i].close - btcPrev) / btcPrev);
    }
  }

  // Spearman correlation — reused from defensive-hedge.ts code path. Returns
  // 0 if series is too short or has zero variance.
  let correlationToBtc = 0;
  if (pairReturns.length >= 2 && pairReturns.length === btcReturns.length) {
    const corr = spearmanRankCorrelation(pairReturns, btcReturns);
    if (Number.isFinite(corr)) {
      correlationToBtc = corr;
    }
  }

  // §A.1.3: decorrelation = 1 - |correlation|. Both +1 and -1 correlation
  // produce decorrelation = 0 (pair tightly linked to BTC, just signs differ).
  const decorrelationScore = 1 - Math.abs(correlationToBtc);

  // §A.2: factor = clamp(min, max, 1.0 + decorr × sensitivity). With seed
  // sensitivity 0.05 and decorr ∈ [0, 1], raw range is [1.00, 1.05] (boost
  // only). Floor at 0.95 future-proofs for if v2 widens to penalty.
  const raw = 1.0 + decorrelationScore * config.sensitivity;
  const factor = Math.max(config.factorMin, Math.min(config.factorMax, raw));

  // §D.2: both threshold comparisons use |corr|. Anti-correlated pairs (corr
  // very negative) are also "drifting with BTC" (just inversely).
  const absCorr = Math.abs(correlationToBtc);
  let label: PairCorrelationResult['label'] = 'NEUTRAL';
  if (absCorr <= config.idiosyncraticThreshold) label = 'IDIOSYNCRATIC';
  else if (absCorr >= config.driftingThreshold) label = 'DRIFTING';

  return {
    correlationToBtc,
    decorrelationScore,
    factor,
    coldStart: false,
    sampleCount: pairReturns.length,
    btcReferenceAvailable: true,
    isBtcSelfReference: false,
    label,
    computeDisabled: false,
  };
}

/**
 * Build the B68.3 ablation alternate row.
 *
 * Counterfactual: divide-out the pair_correlation factor to recover what
 * confidence would have been without B68.3. Same divide-out approximation
 * as B67.4 / B68.4 / B68.2 — known limitation at clamp boundaries (Langston
 * OBS-2 from cc-inbox #879).
 */
export function buildB68_3Alternate(
  realConfidence: number,
  realRegimeLabel: string,
  result: PairCorrelationResult,
  config: PairCorrelationConfig,
  assetClass: AssetClass,
  // B-XSTOCK-CORRELATION-COLLECT P-4: REQUIRED, so every caller states whether the factor entered the real confidence.
  opts: { applied: boolean; intervalMinutes: number; alignedByTimestamp: boolean },
): FactorAlternate {
  // Applied (crypto): the factor is IN the real confidence, so the counterfactual divides it out — unchanged.
  // Record-only (xStock): the factor never entered the real confidence, so the counterfactual IS the real confidence;
  // dividing it out would manufacture a shift of real·(1 − 1/factor) that never happened (Langston's binding
  // condition, Step 2). The would-be applied value lives in metadata.confidence_with_factor only.
  const confidenceWithoutFactor = !opts.applied
    ? realConfidence
    : result.factor > 0 ? realConfidence / result.factor : realConfidence;
  const confidenceWithFactor = opts.applied ? realConfidence : realConfidence * result.factor;

  const alternate: RegimeDecision = {
    regimeLabel: realRegimeLabel,
    confidence: confidenceWithoutFactor,
    admissionPossible: true,
    metadata: {
      correlation_to_btc: result.correlationToBtc,
      decorrelation_score: result.decorrelationScore,
      pair_correlation_factor: result.factor,
      confidence_with_factor: confidenceWithFactor,
      confidence_without_factor: confidenceWithoutFactor,
      lookback_bars: config.lookbackBars,
      sample_count: result.sampleCount,
      cold_start: result.coldStart,
      btc_reference_available: result.btcReferenceAvailable,
      is_btc_self_reference: result.isBtcSelfReference,
      label: result.label,
      // B79.0n.CONFIDENCE-CHAIN: stamp asset class + reference symbol used +
      // compute-disabled flag for dashboard / replay filterability.
      asset_class: assetClass,
      reference_symbol: config.btcReferenceSymbol,
      compute_disabled: result.computeDisabled,
      // B-XSTOCK-CORRELATION-COLLECT: `factor_applied=false` marks a record-only row — every applied-factor reader filters
      // `alternate_decision->'metadata'->>'factor_applied' IS DISTINCT FROM 'false'` (pre-batch rows lack the key and
      // are all applied). `factorState` below stays 'alternate_disabled' for every row; it has no code reader and
      // `factor_applied` is the discriminator.
      factor_applied: opts.applied,
      interval_minutes: opts.intervalMinutes,
      aligned_by_timestamp: opts.alignedByTimestamp,
    },
  };

  return {
    factorName: 'b68_3_pair_correlation',
    factorState: 'alternate_disabled',
    alternateDecision: alternate,
  };
}

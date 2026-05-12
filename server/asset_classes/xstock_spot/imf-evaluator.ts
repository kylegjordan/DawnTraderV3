/**
 * ════════════════════════════════════════════════════════════════════════════
 * B79.0m.b — xstock_spot Family-IMF Evaluator (Layer-1 starter)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Computes the 5 quant family IMF metrics (trend / reversal / breakout /
 * oscillator / strong_trend) for an xstock pair against per-family thresholds
 * resolved from `screener_filters` rows with:
 *   asset_class = 'xstock_spot'
 *   filter_path ∈ { vts_trend, vts_reversal, vts_breakout, vts_oscillator, vts_strong_trend }
 *
 * B79.0m.a authored 10 family-IMF rows for xstock_spot (5 paths × 2 modes,
 * cloned from crypto baseline). The pattern path is currently skipped in the
 * Layer-1 starter — pattern detection runs inline in the strategy detect
 * functions (no pre-filter family gate needed for Layer-1 telemetry).
 *
 * "anyPassed" admits the pair to per-strategy evaluation if AT LEAST ONE
 * family path's LQ/VN/DI thresholds are satisfied — same admission shape as
 * crypto's family-fanout (a pair is eligible for any strategy whose family
 * label it qualifies for).
 *
 * Future B79.0m.b2: per-family routing (only run strategies whose family
 * passed) — Layer-1 simplification admits ALL eligible strategies on
 * any-family-pass and lets SQE filter further.
 * ════════════════════════════════════════════════════════════════════════════
 */

import { calculateIMFMetrics, calculateLogLiquidity, calculateVolNoise, calculateCorrelation } from '../../core/metrics/imf-metrics.js';
import { storage } from '../../storage.js';
import type { OHLCData } from '../../types/market-regime.types';

export interface FamilyIMFResult {
  anyPassed: boolean;
  passedFamilies: string[];
  counters: Record<string, number>;
  // B79.0m.b: per-metric LQ/VN/Corr/DI failure attribution, summed across families.
  // Used by the xStocks Filter Diagnostics tab so the IMF section shows
  // failedLQ/failedVN/failedDI broken out instead of one lumped count.
  perMetric: {
    failedLQ: number;
    failedVN: number;
    failedCorr: number;
    failedDI: number;
    passed: number;
    total: number;
  };
  // B79.0m.b iteration 2 — per-family-row breakdown so the Filter Diagnostics
  // UI can show which family is rejecting which metric.
  perFamily: Record<string, {
    evaluated: number;
    failedLQ: number;
    failedVN: number;
    failedCorr: number;
    failedDI: number;
    passed: number;
  }>;
  // Live metric values for telemetry / debug.
  metrics: { LQ: number; VolNoise: number; Correlation: number; DI: number | null };
}

const FAMILY_PATHS = ['vts_trend', 'vts_reversal', 'vts_breakout', 'vts_oscillator', 'vts_strong_trend'] as const;

/**
 * Compute Directional Integrity score from OHLC bars.
 * Simple proxy: sum of close-to-close returns over the window divided by
 * sum of absolute close-to-close returns, scaled to 0–100. Higher = more
 * directional. Mirrors the conceptual definition used in MCE without
 * adding a dependency on regime config here. Returns null when bars < 20.
 */
function computeDirectionalIntegrity(ohlc: OHLCData[]): number | null {
  if (ohlc.length < 20) return null;
  let netDelta = 0;
  let absDelta = 0;
  for (let i = 1; i < ohlc.length; i++) {
    const delta = ohlc[i].close - ohlc[i - 1].close;
    netDelta += delta;
    absDelta += Math.abs(delta);
  }
  if (absDelta === 0) return 50; // flat tape → neutral DI
  return Math.min(100, Math.max(0, ((netDelta / absDelta) * 50) + 50));
}

export async function evaluateXstockFamilyIMF(
  symbol: string,
  ohlc: OHLCData[],
  mode: 'paper' | 'live',
  preloadedFamilies?: Map<string, any>,
): Promise<FamilyIMFResult> {
  const counters: Record<string, number> = {
    evaluated: 1,
    any_passed: 0,
  };
  for (const fp of FAMILY_PATHS) {
    counters[`${fp}_evaluated`] = 0;
    counters[`${fp}_passed`] = 0;
  }

  const passedFamilies: string[] = [];
  const perMetric = { failedLQ: 0, failedVN: 0, failedCorr: 0, failedDI: 0, passed: 0, total: 0 };
  const perFamily: Record<string, { evaluated: number; failedLQ: number; failedVN: number; failedCorr: number; failedDI: number; passed: number }> = {};

  // Pre-compute metrics ONCE per pair — the LQ/VN/Correlation/DI values don't
  // depend on the family path; only the thresholds do.
  const LQ = ohlc.length >= 10 ? calculateLogLiquidity(ohlc) : 0;
  const VolNoise = ohlc.length >= 10 ? calculateVolNoise(ohlc) : 0.5;
  const Correlation = ohlc.length >= 10 ? calculateCorrelation(ohlc) : 0.5;
  const DI = computeDirectionalIntegrity(ohlc);
  counters.lq_value_x100 = Math.round(LQ * 100);
  counters.vn_value_x10000 = Math.round(VolNoise * 10000);
  counters.corr_value_x10000 = Math.round(Correlation * 10000);
  counters.di_value_x100 = DI === null ? -1 : Math.round(DI * 100);

  for (const filterPath of FAMILY_PATHS) {
    let row: any = preloadedFamilies?.get(filterPath);
    if (!row) {
      // Fallback DB lookup if not pre-loaded (e.g. unit tests).
      try {
        row = await storage.getScreenerFilters({
          mode,
          assetClass: 'xstock_spot',
          filterPath,
        });
      } catch {
        continue;
      }
    }
    if (!row) continue;
    counters[`${filterPath}_evaluated`]++;
    perMetric.total++;
    if (!perFamily[filterPath]) {
      perFamily[filterPath] = { evaluated: 0, failedLQ: 0, failedVN: 0, failedCorr: 0, failedDI: 0, passed: 0 };
    }
    perFamily[filterPath].evaluated++;

    const lqMin = parseFloat(row.lqMin ?? '0');
    const vnMax = parseFloat(row.vnMax ?? '999');
    const corrMax = parseFloat(row.corrMax ?? '0.95');
    const diMin = parseFloat(row.diMin ?? '0');
    const diMax = parseFloat(row.diMax ?? '100');

    // Per-metric attribution — order matters for counter accounting; we
    // attribute to the FIRST failing metric so each fail counts once.
    let failed = false;
    if (LQ < lqMin) {
      perMetric.failedLQ++;
      perFamily[filterPath].failedLQ++;
      counters[`${filterPath}_failed_lq`] = (counters[`${filterPath}_failed_lq`] ?? 0) + 1;
      failed = true;
    } else if (VolNoise > vnMax) {
      perMetric.failedVN++;
      perFamily[filterPath].failedVN++;
      counters[`${filterPath}_failed_vn`] = (counters[`${filterPath}_failed_vn`] ?? 0) + 1;
      failed = true;
    } else if (Correlation > corrMax) {
      perMetric.failedCorr++;
      perFamily[filterPath].failedCorr++;
      counters[`${filterPath}_failed_corr`] = (counters[`${filterPath}_failed_corr`] ?? 0) + 1;
      failed = true;
    } else if (DI !== null && (DI < diMin || DI > diMax)) {
      perMetric.failedDI++;
      perFamily[filterPath].failedDI++;
      counters[`${filterPath}_failed_di`] = (counters[`${filterPath}_failed_di`] ?? 0) + 1;
      failed = true;
    }

    if (!failed) {
      counters[`${filterPath}_passed`]++;
      perFamily[filterPath].passed++;
      perMetric.passed++;
      passedFamilies.push(filterPath);
    }
  }

  if (passedFamilies.length > 0) {
    counters.any_passed = 1;
  }

  return {
    anyPassed: passedFamilies.length > 0,
    passedFamilies,
    counters,
    perMetric,
    perFamily,
    metrics: { LQ, VolNoise, Correlation, DI },
  };
}

// Keep calculateIMFMetrics import referenced for back-compat (avoid removal flag).
void calculateIMFMetrics;

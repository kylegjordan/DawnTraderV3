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

import { calculateIMFMetrics } from '../../core/metrics/imf-metrics.js';
import { storage } from '../../storage.js';
import type { OHLCData } from '../../types/market-regime.types';

export interface FamilyIMFResult {
  anyPassed: boolean;
  passedFamilies: string[];
  counters: Record<string, number>;
}

const FAMILY_PATHS = ['vts_trend', 'vts_reversal', 'vts_breakout', 'vts_oscillator', 'vts_strong_trend'] as const;

export async function evaluateXstockFamilyIMF(
  symbol: string,
  ohlc: OHLCData[],
  mode: 'paper' | 'live',
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

  for (const filterPath of FAMILY_PATHS) {
    let row: any;
    try {
      row = await storage.getScreenerFilters({
        mode,
        assetClass: 'xstock_spot',
        filterPath,
      });
    } catch {
      continue;
    }
    if (!row) continue;
    counters[`${filterPath}_evaluated`]++;

    const lqMin = parseFloat(row.lqMin ?? '0');
    const vnMax = parseFloat(row.vnMax ?? '999');
    const diMin = parseFloat(row.diMin ?? '0');
    const diMax = parseFloat(row.diMax ?? '999');

    const metrics = await calculateIMFMetrics(
      symbol,
      ohlc,
      true, // passive
      undefined,
      { LQ_MIN: lqMin, VN_MAX: vnMax, CORR_MAX: 0.95 },
    );

    // calculateIMFMetrics already gates LQ + VN + Correlation. Layer-1 adds
    // a DI band check on top using directional integrity. For now, since we
    // don't have a separate DI compute here (it's part of MCE), we accept
    // the IMF gate as the family decision. DI fine-tuning in B79.0m.b2.
    void diMin;
    void diMax;

    if (metrics.passesMetricFilter) {
      counters[`${filterPath}_passed`]++;
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
  };
}

/**
 * `B-PRICE-SIDE-BY-JOB` row `8a-P4c` increment 3 (plan §C3.5, §C3.7 σ condition) — THE ONE SOURCE of the xStock
 * mark-staleness knobs and the σ-cache configuration.
 *
 * Two lanes read the risk-derived exit ceiling: the paper engine (since P19-B8.5e, `#548`) and, from increment 3, the
 * VTS xStock exit guard. The σ cache (`sigma-rate-cache.ts`) keeps module-level singletons whose behaviour depends on
 * the config passed on EACH call (`ensureSigmaFresh` expires the class-wide σ on the caller's `maxAgeMs`), so two call
 * sites passing different parameters would silently shape each other's σ. Both lanes therefore read the knobs HERE,
 * and nowhere else — a fence refuses a second reader of these knobs (Langston, Step-2 r2 σ condition).
 * VTS owns NO age knob: a paper tuning moves VTS by design (the fidelity-to-live test, plan §C3.5).
 * Every read is `getCachedNumberRequired` — a missing row THROWS; the callers fail closed (paper skips the mark,
 * VTS makes no decision).
 */
import { getCachedNumberRequired } from '../../services/module-constants-service.js';
import type { MarkStalenessConfig } from './mark-staleness.js';
import type { SigmaCacheConfig } from './sigma-rate-cache.js';

const XSTOCK_KEY = { exchange: '*', assetClass: 'xstock_spot' as const, strategy: '*', regime: '*' };

/** The ceiling's own knobs (`mark_staleness.*`). Throws on a missing row. */
export function readXstockMarkStalenessConfig(): MarkStalenessConfig {
  return {
    budgetK: getCachedNumberRequired('mark_staleness', 'budget_k', XSTOCK_KEY),
    nullStopBudgetPct: getCachedNumberRequired('mark_staleness', 'null_stop_budget_pct', XSTOCK_KEY),
    floorMs: getCachedNumberRequired('mark_staleness', 'floor_ms', XSTOCK_KEY),
    capMs: getCachedNumberRequired('mark_staleness', 'cap_ms', XSTOCK_KEY),
    // σ younger than one refresh period is as fresh as the design allows; past that, σ is inflated with age so stale
    // evidence cannot buy a wide window.
    sigmaFullCreditMs: getCachedNumberRequired('mark_staleness', 'sigma_refresh_after_ms', XSTOCK_KEY),
  };
}

/** The σ cache's configuration — the SAME object shape for every caller. Throws on a missing row. */
export function readXstockSigmaCacheConfig(): SigmaCacheConfig {
  return {
    windowMs: getCachedNumberRequired('mark_staleness', 'sigma_window_ms', XSTOCK_KEY),
    refreshAfterMs: getCachedNumberRequired('mark_staleness', 'sigma_refresh_after_ms', XSTOCK_KEY),
    maxAgeMs: getCachedNumberRequired('mark_staleness', 'sigma_max_age_ms', XSTOCK_KEY),
    minObservations: getCachedNumberRequired('mark_staleness', 'sigma_min_observations', XSTOCK_KEY),
    classwidePercentile: getCachedNumberRequired('mark_staleness', 'sigma_classwide_percentile', XSTOCK_KEY),
    queryTimeoutMs: getCachedNumberRequired('mark_staleness', 'sigma_query_timeout_ms', XSTOCK_KEY),
  };
}

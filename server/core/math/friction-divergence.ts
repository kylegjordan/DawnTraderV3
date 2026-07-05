// P19-B8.2 (§A / OBJ-3) — the friction-divergence estimator. PURE MODULE:
// no I/O, no DB, no clocks — every input is passed in; the callers own data
// acquisition (cost metrics from the same reads the maker/taker decision uses)
// and knob resolution (module_constants `friction_divergence`).
//
// PURPOSE: the auto re-anchor trigger (Kyle decision #1) fires on measured
// EXECUTION-QUALITY divergence between the paper balance and the live Kraken
// balance — not on a balance multiple. The instrument is the square-root
// market-impact law (field research P19_B8_BALANCE_POLICY_FIELD_RESEARCH.md):
//
//   estCostBps(Q) = spread_half_bps + k * sigma_bps * sqrt(Q / L)
//
// UNITS (scope §B-4 reconciliation — stated so the Phase-25 calibrator is never
// guessing): spread_half_bps and sigma_bps are in BASIS POINTS; Q and L are in
// the SAME quote-notional currency (USD) so Q/L is dimensionless; k is a
// DIMENSIONLESS coefficient — the product k*sigma_bps*sqrt(Q/L) therefore
// resolves to bps and adds cleanly to spread_half_bps.
//
// DIVERGENCE: cost of THIS open's real paper-sized order minus the cost of the
// risk-EQUIVALENT live-sized order (same risk%, only the balance differs — so
// the delta isolates the balance-driven Q difference). Plus the discrete leg:
// pool candidates sizeable at one balance but blocked by min-notional at the
// other (counted by the caller, compared against its own knob).
//
// The seeded knob values are CONSERVATIVE PLACEHOLDERS pending Phase-25
// calibration (§9.2 — deliberately tight so the first live trigger is reviewed
// early rather than discovered late).

export interface CostInputs {
  /** Half the quoted spread, in bps. */
  spreadHalfBps: number;
  /** Volatility estimate, in bps (same horizon the slippage-fee-model uses). */
  sigmaBps: number;
  /** Dimensionless sqrt-impact coefficient (knob `impact_k`). */
  k: number;
  /** Order quote-notional, USD. */
  orderNotionalUsd: number;
  /** Liquidity proxy, USD (per class: crypto ADV w/ top-of-book floor; xStock qd-probe depth w/ ADV). */
  liquidityNotionalUsd: number;
}

export interface DivergenceInputs {
  /** THIS open's real paper order notional (per-open) or the session median (daily aggregate). */
  paperOrderNotionalUsd: number;
  /** The risk-equivalent order notional at the LIVE balance (same risk%). */
  liveOrderNotionalUsd: number;
  spreadHalfBps: number;
  sigmaBps: number;
  k: number;
  liquidityNotionalUsd: number;
}

export interface DivergenceResult {
  paperCostBps: number;
  liveCostBps: number;
  /** paperCostBps - liveCostBps. Positive = paper trades cost more than live would. */
  divergenceBps: number;
}

export interface TriggerInputs {
  divergenceBps: number;
  /** Count of pool candidates min-notional-blocked at one balance but not the other. */
  minNotionalDelta: number;
  /** Knob: max tolerated |divergence| in bps. */
  maxDivergenceBps: number;
  /** Knob: max tolerated min-notional-blocked delta count. */
  minNotionalDeltaMax: number;
  /** ms since the last anchor event (any reason); Infinity if none. */
  msSinceLastAnchor: number;
  /** Knob: cooldown — no auto re-anchor inside this window. */
  minReanchorIntervalMs: number;
}

export interface TriggerResult {
  triggered: boolean;
  /** Why it (would have) fired; null when neither bound is crossed. */
  breach: 'divergence_bps' | 'min_notional_delta' | 'both' | null;
  /** True when a breach exists but the cooldown suppressed the trigger. */
  suppressedByCooldown: boolean;
}

function assertFinite(name: string, v: number): void {
  if (!Number.isFinite(v)) throw new Error(`[friction-divergence] ${name} must be finite, got ${v}`);
}

/** estCostBps(Q) = spread_half_bps + k * sigma_bps * sqrt(Q/L). Throws on invalid inputs. */
export function estimateCostBps(inputs: CostInputs): number {
  const { spreadHalfBps, sigmaBps, k, orderNotionalUsd, liquidityNotionalUsd } = inputs;
  assertFinite('spreadHalfBps', spreadHalfBps);
  assertFinite('sigmaBps', sigmaBps);
  assertFinite('k', k);
  assertFinite('orderNotionalUsd', orderNotionalUsd);
  assertFinite('liquidityNotionalUsd', liquidityNotionalUsd);
  if (orderNotionalUsd < 0) throw new Error(`[friction-divergence] orderNotionalUsd must be >= 0, got ${orderNotionalUsd}`);
  if (liquidityNotionalUsd <= 0) throw new Error(`[friction-divergence] liquidityNotionalUsd must be > 0, got ${liquidityNotionalUsd}`);
  if (spreadHalfBps < 0 || sigmaBps < 0 || k < 0) {
    throw new Error('[friction-divergence] spreadHalfBps/sigmaBps/k must be >= 0');
  }
  return spreadHalfBps + k * sigmaBps * Math.sqrt(orderNotionalUsd / liquidityNotionalUsd);
}

/** Paper-vs-live cost delta on identical market inputs — only Q differs. */
export function computeDivergence(inputs: DivergenceInputs): DivergenceResult {
  const shared = {
    spreadHalfBps: inputs.spreadHalfBps,
    sigmaBps: inputs.sigmaBps,
    k: inputs.k,
    liquidityNotionalUsd: inputs.liquidityNotionalUsd,
  };
  const paperCostBps = estimateCostBps({ ...shared, orderNotionalUsd: inputs.paperOrderNotionalUsd });
  const liveCostBps = estimateCostBps({ ...shared, orderNotionalUsd: inputs.liveOrderNotionalUsd });
  return { paperCostBps, liveCostBps, divergenceBps: paperCostBps - liveCostBps };
}

/**
 * The trigger decision. Keys on ORDER-SIZE divergence (both sides evaluated by
 * the caller from the same anchor-eval read — never on intraday live-balance
 * fill jitter) and applies the cooldown (Langston Step-1 hysteresis condition).
 */
export function evaluateReanchorTrigger(inputs: TriggerInputs): TriggerResult {
  assertFinite('divergenceBps', inputs.divergenceBps);
  assertFinite('maxDivergenceBps', inputs.maxDivergenceBps);
  if (!Number.isFinite(inputs.minNotionalDelta) || inputs.minNotionalDelta < 0) {
    throw new Error(`[friction-divergence] minNotionalDelta must be a finite count >= 0`);
  }

  const divergenceBreach = Math.abs(inputs.divergenceBps) > inputs.maxDivergenceBps;
  const notionalBreach = inputs.minNotionalDelta > inputs.minNotionalDeltaMax;
  const breach: TriggerResult['breach'] =
    divergenceBreach && notionalBreach ? 'both'
    : divergenceBreach ? 'divergence_bps'
    : notionalBreach ? 'min_notional_delta'
    : null;

  if (!breach) return { triggered: false, breach: null, suppressedByCooldown: false };

  const inCooldown = inputs.msSinceLastAnchor < inputs.minReanchorIntervalMs;
  return { triggered: !inCooldown, breach, suppressedByCooldown: inCooldown };
}

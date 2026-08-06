/**
 * P19-B8.5 — THE EXPLORATION LANE (paper-only, additive).
 *
 * 3-way consensus (CC-A + CC-B + Langston, 2026-07-15) + Kyle GO (budget 25-30/day):
 * the organic netEV>0 SQE admission stays BYTE-IDENTICAL (a genuine organic admit
 * remains a visible, meaningful event; the live-equivalent path stays pristine).
 * This lane runs ALONGSIDE it, in paper mode only, admitting a bounded daily budget
 * of the best-available signals whose ONLY SQE failure is the NetEV gate — because
 * the fee wall (verified genuine: ~1.6% maker / ~1.95% taker rawEV bar) admits ~zero
 * organically, and the entire purpose of the paper window is LEARNING DATA (machinery
 * proof, per-strategy outcomes, and above all the maker FILL-RATE measurement that
 * replaces the pFill=0.50 pessimism and reopens the organic gate).
 *
 * LIVE-SCOPING IS STRUCTURAL (Langston condition-2): this module is ONLY invoked
 * from the orchestrator's SQE-failure branch under `this.mode === 'paper'`. The live
 * path contains no call site and never reads these knobs. netEV>0 stays hardcoded
 * structural for live.
 *
 * COHORT HYGIENE (Langston condition-1 / the 4-field stamp): every lane admit is
 * stamped admission_basis='exploration' + netEvAtAdmit + floorInEffect +
 * policyVersion — KEEP-AS-DATA (the #405 paper_sim pattern) so Phase-25 weights or
 * excludes the cohort, and the anneal's non-stationarity is reconstructable per row.
 *
 * DETERMINISTIC ANNEAL (Langston condition-3): the effective floor tightens toward
 * zero as CLOSED exploration trades accrue — a rule in code, stateless, computed
 * from the DB count at read time: floor_eff = min(0, base + step_pct·⌊closed/step_trades⌋).
 *
 * FAIL-CLOSED: missing/unparseable knobs = lane DISABLED (never a silent default-open).
 * The `enabled` knob is the lane KILL-SWITCH (per class).
 */

import { db } from '../../db.js';
import { sql } from 'drizzle-orm';
import { getCachedConstant } from '../module-constants-service.js';

export interface ExplorationAdmitDecision {
  admit: boolean;
  /** Why not / why yes — always populated, always loggable. */
  reason: string;
  /** The effective (annealed) floor as a FRACTION of entry price (≤ 0). */
  floorInEffect: number | null;
  policyVersion: number | null;
  /** Today's consumed budget at decision time (diagnostic). */
  usedToday: number | null;
}

const KEY = (assetClass: string) => ({ exchange: '*', assetClass, strategy: '*', regime: '*' });

/** 60s TTL caches for the two DB counts (budget + anneal) — the lane is consulted on
 *  every NetEV-only SQE failure (~hundreds/day); the counts move slowly. */
const countCache = new Map<string, { value: number; at: number }>();
const COUNT_TTL_MS = 60_000;

async function cachedCount(key: string, query: () => Promise<number>): Promise<number> {
  const hit = countCache.get(key);
  if (hit && Date.now() - hit.at < COUNT_TTL_MS) return hit.value;
  const value = await query();
  countCache.set(key, { value, at: Date.now() });
  return value;
}

/**
 * Exploration admits today (UTC) for a class — the CONSERVATION count
 * (Langston Step-4 ①): promotion DELETES the rtb row, so counting rtb alone
 * leaks the cap by exactly the trades that actually open. Three terms cover the
 * lifecycle: still-resident rtb rows (queued today) + OPEN positions (stamped,
 * opened today) + CLOSED trades (stamped, opened today).
 *
 * THE TRUE PROPERTY (Langston re-derivation, on the record — §13 accepted
 * residual): the count is CONSERVATIVE ON DURABLE OPENED TRADES — the open +
 * closed terms are monotonic within a UTC day, so once opened-today alone
 * reaches the budget the lane stops for the day. An admit that EXPIRES
 * un-promoted (or whose open fails post-promotion) evaporates from all terms
 * and FREES its slot same-day — a small, bounded, LOOSE-direction transient
 * equal to the admits concurrently pending in rtb at cap-crossing (self-
 * limiting, a handful on a 25-30 budget), and arguably desirable: an
 * evaporated admit produced no learning data. The only tight-direction case
 * is the momentary rtb/position overlap inside one promotion.
 */
async function usedBudgetToday(assetClass: string): Promise<number> {
  return cachedCount(`budget:${assetClass}`, async () => {
    const r = await db.execute(sql`
      SELECT
        (SELECT count(*)::int FROM rtb_signals
          WHERE metadata->>'admissionBasis' = 'exploration'
            AND (metadata->>'assetClass' = ${assetClass} OR asset_class = ${assetClass})
            AND queued_at >= date_trunc('day', now()))
      + (SELECT count(*)::int FROM active_open_positions
          WHERE metadata->>'admissionBasis' = 'exploration'
            AND asset_class = ${assetClass}
            AND opened_at >= date_trunc('day', now()))
      + (SELECT count(*)::int FROM closed_trades
          WHERE metadata->>'admissionBasis' = 'exploration'
            AND asset_class = ${assetClass}
            AND opened_at >= date_trunc('day', now())) AS n`);
    return Number((r as any).rows?.[0]?.n ?? 0);
  });
}

/** INFORMATIVE closed exploration trades for a class — the anneal driver.
 *
 *  P19-B8.5 (Langston-approved 2026-07-15, the two-denominator split): never_filled
 *  rows are EXCLUDED here and ONLY here. The anneal's justification is "the subsidy
 *  expires as EDGE-evidence accumulates" — a maker admit that expired unfilled carries
 *  zero information about the trade's outcome, so it must not tighten the floor. The
 *  same event stays fully VISIBLE to the pFill measurement (filled/attempts), which
 *  reads the B7.2c pending-outcome records through a separate path — a never-filled
 *  attempt is precisely what pFill exists to count. Two denominators, two queries; no
 *  shared flag to misapply. With the step keyed to informative closes the anneal
 *  calendar becomes an OUTPUT of measured fill reality, not a date target.
 *
 *  A4 (2026-07-27, CC-C): closed_trades holds an AT-OPEN row (closed_at NULL) for every
 *  position, so the anneal MUST also filter `closed_at IS NOT NULL` — otherwise still-open
 *  and orphaned exploration rows count as if they carried an outcome, over-tightening the
 *  floor prematurely (measured: crypto 191 counted vs 187 truly-closed; the 4 extras were
 *  the 3 known orphans MET/ETH/AVAX + 1 legitimately-open ONDO). */
async function closedExplorationCount(assetClass: string): Promise<number> {
  // B-TRADE-TIER-REGISTER (#599): closed_trades rows now ARCHIVE out of hot at the
  // 365d window. The anneal is a MONOTONE RATCHET by construction, so archived
  // ranges' exploration closes live on in a persisted per-class tally the sweep
  // writes at archive time (same predicate as the live query). BOTH terms are read
  // INSIDE this cachedCount closure — read outside it, a stale live count still
  // containing just-archived rows plus the fresh tally would DOUBLE-COUNT, and
  // this counter only ratchets, so the error would tighten the floor (Langston
  // Step-2 accept, condition 1). A MISSING tally key is a FAULT (seeded-0 by the
  // batch migration; absence routed through the lane's fail-closed branch via
  // throw) — never a silent ?? 0 (condition 2, the #546 absent-as-valid guard).
  return cachedCount(`anneal:${assetClass}`, async () => {
    const r = await db.execute(sql`
      SELECT count(*)::int AS n FROM closed_trades
      WHERE metadata->>'admissionBasis' = 'exploration'
        AND asset_class = ${assetClass}
        AND closed_at IS NOT NULL
        AND close_reason IS DISTINCT FROM 'never_filled'`);
    const live = Number((r as any).rows?.[0]?.n ?? 0);
    const t = await db.execute(sql`
      SELECT value FROM module_constants
      WHERE module_name = 'exploration_lane'
        AND constant_name = ${'closed_count_archived.' + assetClass}`);
    const tRow = (t as any).rows?.[0];
    if (tRow === undefined) {
      // Fault, not zero: the seed migration guarantees the key exists per class.
      throw new Error(`exploration_lane.closed_count_archived.${assetClass} missing — seed migration absent (fail-closed; never coerce to 0)`);
    }
    const archived = Number(tRow.value);
    if (!Number.isFinite(archived)) {
      throw new Error(`exploration_lane.closed_count_archived.${assetClass} non-numeric: ${String(tRow.value)}`);
    }
    return live + archived;
  });
}

/** TEST SEAM: clear the count caches (unit tests drive fresh counts). */
export function _clearExplorationCaches(): void { countCache.clear(); }

/**
 * The lane decision. Pure knob-and-count logic; the CALLER (orchestrator, paper-only
 * branch) has already established: SQE failed, and the ONLY failure is the NetEV gate.
 */
export async function checkExplorationAdmit(input: {
  assetClass: string;
  /** The best-of-both chosenNetEv the SQE gated (price-unit dollars). */
  chosenNetEv: number;
  entryPrice: number;
}): Promise<ExplorationAdmitDecision> {
  const key = KEY(input.assetClass);
  const enabled = getCachedConstant<boolean>('exploration_lane', 'enabled', key);
  if (enabled !== true) {
    return { admit: false, reason: 'lane_disabled_or_unseeded (fail-closed)', floorInEffect: null, policyVersion: null, usedToday: null };
  }
  const budget = getCachedConstant<number>('exploration_lane', 'daily_budget', key);
  const baseFloor = getCachedConstant<number>('exploration_lane', 'base_floor_pct', key);
  const stepTrades = getCachedConstant<number>('exploration_lane', 'anneal_step_trades', key);
  const stepPct = getCachedConstant<number>('exploration_lane', 'anneal_step_pct', key);
  const policyVersion = getCachedConstant<number>('exploration_lane', 'policy_version', key);
  if (![budget, baseFloor, stepTrades, stepPct, policyVersion].every((v) => typeof v === 'number' && Number.isFinite(v))) {
    return { admit: false, reason: 'lane_knobs_incomplete (fail-closed)', floorInEffect: null, policyVersion: null, usedToday: null };
  }
  if (!(input.entryPrice > 0)) {
    return { admit: false, reason: `invalid entryPrice ${input.entryPrice}`, floorInEffect: null, policyVersion: policyVersion!, usedToday: null };
  }

  // Deterministic anneal: floor tightens toward 0 as closed exploration trades accrue.
  const closed = await closedExplorationCount(input.assetClass);
  const floorEff = Math.min(0, (baseFloor as number) + (stepPct as number) * Math.floor(closed / Math.max(1, stepTrades as number)));

  const netEvPct = input.chosenNetEv / input.entryPrice;
  if (netEvPct <= floorEff) {
    return { admit: false, reason: `below exploration floor (${(netEvPct * 100).toFixed(3)}% <= ${(floorEff * 100).toFixed(3)}%)`, floorInEffect: floorEff, policyVersion: policyVersion!, usedToday: null };
  }

  const used = await usedBudgetToday(input.assetClass);
  if (used >= (budget as number)) {
    return { admit: false, reason: `daily budget exhausted (${used}/${budget})`, floorInEffect: floorEff, policyVersion: policyVersion!, usedToday: used };
  }

  // Bust the budget cache on admit so back-to-back cycles see the consumption promptly.
  countCache.delete(`budget:${input.assetClass}`);
  return {
    admit: true,
    reason: `exploration admit (${(netEvPct * 100).toFixed(3)}% > floor ${(floorEff * 100).toFixed(3)}%, budget ${used + 1}/${budget})`,
    floorInEffect: floorEff,
    policyVersion: policyVersion!,
    usedToday: used + 1,
  };
}

/** Is the SQE failure set EXACTLY the NetEV gate (the lane's only override target)? */
export function isNetEvOnlyFailure(failures: string[]): boolean {
  return failures.length === 1 && failures[0].startsWith('NetEV ');
}

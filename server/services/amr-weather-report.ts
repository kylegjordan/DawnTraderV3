/**
 * ══════════════════════════════════════════════════════════════════════════════
 * B-5 AMR (Obj-3/3a/4/7) — per-class weather-report aggregator
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * THE Adaptive Market Response sensory organ: one report per asset class per
 * MCE cycle, classifying trading weather as CALM / CHOPPY / STORMY /
 * FAVORABLE / IDLE plus a continuous score.
 *
 * THE M2 SCORE CONTRACT (Langston-ratified, SysManual AMR section):
 *   continuousScore ∈ [0,1], MONOTONE — higher = more favorable, consistent
 *   across classes. 0 = max-hostile (SURVIVAL-grade), 0.5 = neutral
 *   (CALM-grade), 1 = max-favorable. The classification IS the bucketed
 *   score (DB-tunable bucket edges) — hard rules act as CAPS ON THE SCORE,
 *   never as side-channel overrides, so the brain seam stays one number +
 *   one mapping. A future learned brain replaces computeContinuousScore()
 *   internals; consumers never change.
 *
 * INPUT DOCTRINE:
 *   - Per-class everything; crypto and xstock never share a tracker (B-4.7).
 *   - IDLE (Obj-3a): voteStatus IDLE_OR_WARMING or the xstock weekend window
 *     → classification IDLE, no posture decision, trackers re-seed silently
 *     on resume (no transition event; flip counters never span an idle gap).
 *   - Null-tolerance: every input may be null-with-reason; absent inputs are
 *     EXCLUDED from the weighted score (weights renormalize) and surfaced in
 *     staleness[] — never silently defaulted.
 *   - R2 (quarantine asymmetry): a quarantined input (out-of-bounds, Obj-15b)
 *     caps the score at 0.5 — degraded awareness may tighten or hold, never
 *     loosen. No FAVORABLE (hence no AGGRESSIVE) with quarantined inputs.
 *   - B5 post-IDLE first read: reseedMode = min(firstReadMode, NORMAL) — a
 *     legitimate tighten applies immediately; no first-read AGGRESSIVE on
 *     thin post-idle buffers.
 *   - A8a: dwell/relax counters tick in DISTINCT-OBSERVATION EPOCHS (cycles
 *     where the class produced live inputs), never wall-clock poll counts.
 *   - A8b: relax is a one-rung ladder (SURVIVAL→DEFENSIVE→NORMAL→AGGRESSIVE)
 *     after relax_confirm_epochs; tighten is immediate and unlimited.
 *
 * FLAG (Obj-4, A5): amr_runtime.mode per class — disabled = NO compute
 * (stamps null, zero overhead); shadow = compute + ledger + stamp, apply
 * nothing; active = compute + apply. Input-HEALTH alerts fire in shadow AND
 * active (R1); posture-transition warnings are active-only (M4).
 *
 * All thresholds/weights DB-governed (amr_weather_rules, §11) — provenance
 * in migration 2026-06-11c-b5-amr-body.sql.
 */

import { getMarketIndicators } from './market-indicators.js';
import { getCachedNumberRequired, getCachedConstant } from './module-constants-service.js';
import { getLatestMacroSnapshot, getLatestMacroBaseline } from './external-macro-feed.js';
import { getLatestEquitySnapshot } from './amr-equity-feed.js';
import { isXstockMarketOpenUTC } from '../asset_classes/xstock_spot/market-hours.js';
import {
  resolveStrategyModeFromWeather,
  getModeOverlayForClass,
  type StrategyMode,
  type AmrWeatherClassification,
} from '../core/governance/strategy-modes.js';
import { evaluateInputHealth, type InputHealthReading } from './amr-input-health.js';
import type { AssetClass } from '../../shared/asset-classes.js';

/** Bumped whenever the inputs shape changes (Langston M1 — the Phase-25
 *  study partitions mixed-shape ledger history on this). */
export const AMR_INPUTS_SCHEMA_VERSION = 1;

export type AmrFlagState = 'disabled' | 'shadow' | 'active';

export interface AmrWeatherInputs {
  regime: string | null;
  votePct: number | null;
  voteStatus: 'LIVE' | 'IDLE_OR_WARMING';
  frictionScore: number | null;
  frictionReason: string | null;
  frictionSampleSize: number;
  dbsScore: number | null;
  dbsIsStale: boolean;
  flipsInWindow: number | null;
  epochsObserved: number;
  evGapRatio: number | null;
  evGapN: number;
  macroMaxAbsZ: number | null;
  macroDetail: Record<string, number | null> | null;
}

export interface AmrWeatherReport {
  assetClass: AssetClass;
  cycleTs: number;
  classification: AmrWeatherClassification;
  /** M2 contract — null only when IDLE. */
  continuousScore: number | null;
  /** Direction-C socket: per-class volatility context (v1 carries DBS-derived
   *  proxy only; the vol-Z percentile lands with the Phase-19 vol work). */
  volatilityState: { proxy: 'dbs_abs'; value: number | null };
  inputs: AmrWeatherInputs;
  health: InputHealthReading[];
  triggers: string[];
  staleness: string[];
  inputsSchemaVersion: number;
  flagState: AmrFlagState;
  /** Mode the resolver produced this cycle (dwell/ladder applied); null = IDLE hold. */
  resolvedMode: StrategyMode | null;
}

// ─── Per-class tracker state ─────────────────────────────────────────────────
interface ClassTrackers {
  lastRegime: string | null;
  regimeSinceEpoch: number;
  flipEpochs: number[];          // epoch indices where the vote flipped
  epochCount: number;            // distinct-observation epochs since (re)seed
  wasIdle: boolean;
  currentMode: StrategyMode | null;
  modeSinceEpoch: number;
  relaxCandidateEpochs: number;  // consecutive epochs supporting a relax
  evGap: Array<{ predicted: number; realized: number }>;
  lastReport: AmrWeatherReport | null;
}

const trackers = new Map<AssetClass, ClassTrackers>();
const AMR_CLASSES: AssetClass[] = ['crypto_spot', 'xstock_spot'];

function trackerFor(assetClass: AssetClass): ClassTrackers {
  let t = trackers.get(assetClass);
  if (!t) {
    t = {
      lastRegime: null, regimeSinceEpoch: 0, flipEpochs: [], epochCount: 0,
      wasIdle: true, currentMode: null, modeSinceEpoch: 0,
      relaxCandidateEpochs: 0, evGap: [], lastReport: null,
    };
    trackers.set(assetClass, t);
  }
  return t;
}

function ruleKey(assetClass: AssetClass) {
  return { exchange: '*', assetClass, strategy: '*', regime: '*' };
}

function rule(assetClass: AssetClass, name: string): number {
  return getCachedNumberRequired('amr_weather_rules', name, ruleKey(assetClass));
}

export function getAmrFlagState(assetClass: AssetClass): AmrFlagState {
  const v = getCachedConstant<string>('amr_runtime', 'mode', ruleKey(assetClass));
  if (v !== 'disabled' && v !== 'shadow' && v !== 'active') {
    throw new Error(`[B-5][amr] amr_runtime.mode for '${assetClass}' is '${v}' — must be disabled|shadow|active (migration seeds 'disabled'; no fallback by design).`);
  }
  return v;
}

/**
 * EV-gap feed (close-hook input, F6). Called from the VTS close path with
 * persisted===true results only; per-class rolling window, source-filtered
 * by the caller (vts now; paper joins in Phase 19 as a SEPARATE operator
 * decision — scope B2).
 */
export function feedEvGapObservation(assetClass: AssetClass, predictedNetEv: number, realizedNetPnl: number): void {
  if (!Number.isFinite(predictedNetEv) || !Number.isFinite(realizedNetPnl)) return;
  const t = trackerFor(assetClass);
  t.evGap.push({ predicted: predictedNetEv, realized: realizedNetPnl });
  const maxN = rule(assetClass, 'ev_gap_window_n');
  while (t.evGap.length > maxN) t.evGap.shift();
}

/** Rolling realized-vs-predicted shortfall RATIO (1.0 = predicted edge fully
 *  eaten). null below the per-class minimum window. */
function computeEvGapRatio(assetClass: AssetClass, t: ClassTrackers): { ratio: number | null; n: number } {
  const minN = rule(assetClass, 'ev_gap_window_n');
  if (t.evGap.length < minN) return { ratio: null, n: t.evGap.length };
  let sumPredicted = 0;
  let sumRealized = 0;
  for (const o of t.evGap) { sumPredicted += o.predicted; sumRealized += o.realized; }
  if (sumPredicted <= 0) return { ratio: null, n: t.evGap.length };
  return { ratio: (sumPredicted - sumRealized) / sumPredicted, n: t.evGap.length };
}

function clamp01(x: number): number { return Math.max(0, Math.min(1, x)); }

/** Macro favorability input per class — RAW z-scores (never modifier output). */
function readMacro(assetClass: AssetClass): { maxAbsZ: number | null; detail: Record<string, number | null> | null; stale: string | null } {
  if (assetClass === 'crypto_spot') {
    const snap = getLatestMacroSnapshot();
    const base = getLatestMacroBaseline();
    if (snap.ageSeconds === Infinity) return { maxAbsZ: null, detail: null, stale: 'macro_feed_no_data' };
    const zs: Record<string, number | null> = {
      btcDominanceZ: (typeof snap.btcDominance === 'number' && base.btcDominanceSampleCount >= 30 && base.btcDominanceStdDev > 0)
        ? (snap.btcDominance - base.btcDominanceMean) / base.btcDominanceStdDev : null,
      fundingZ: (typeof snap.fundingRate === 'number' && base.fundingSampleCount >= 30 && base.fundingStdDev > 0)
        ? (snap.fundingRate - base.fundingMean) / base.fundingStdDev : null,
      mcapMomentumZ: (typeof snap.mcapMomentum === 'number' && base.mcapMomentumSampleCount >= 30 && base.mcapMomentumStdDev > 0)
        ? (snap.mcapMomentum - base.mcapMomentumMean) / base.mcapMomentumStdDev : null,
    };
    const present = Object.values(zs).filter((z): z is number => z !== null).map(Math.abs);
    return present.length === 0
      ? { maxAbsZ: null, detail: zs, stale: 'macro_baselines_warming' }
      : { maxAbsZ: Math.max(...present), detail: zs, stale: null };
  }
  const eq = getLatestEquitySnapshot();
  if (eq.ageSeconds === Infinity) return { maxAbsZ: null, detail: null, stale: 'equity_feed_no_data' };
  const zs: Record<string, number | null> = { vixZ: eq.vixZ, dxyZ: eq.dxyZ };
  const present = Object.values(zs).filter((z): z is number => z !== null).map(Math.abs);
  return present.length === 0
    ? { maxAbsZ: null, detail: zs, stale: 'equity_baselines_warming' }
    : { maxAbsZ: Math.max(...present), detail: zs, stale: null };
}

/**
 * THE score function (M2). Weighted favorability over present inputs, weights
 * renormalized over what is actually present; hard rules apply as CAPS so the
 * classification stays a pure bucketing of this one number.
 */
function computeContinuousScore(
  assetClass: AssetClass,
  inputs: AmrWeatherInputs,
  anyQuarantined: boolean,
  triggers: string[],
): number {
  const choppyF = rule(assetClass, 'friction_score_choppy');
  const stormyF = rule(assetClass, 'friction_score_stormy');
  const choppyD = rule(assetClass, 'dbs_abs_choppy');
  const stormyD = rule(assetClass, 'dbs_abs_stormy');
  const stormyFlips = rule(assetClass, 'regime_flips_stormy');
  const choppyEv = rule(assetClass, 'ev_gap_choppy_ratio');
  const stormyEv = rule(assetClass, 'ev_gap_stormy_ratio');

  const parts: Array<{ w: number; fav: number; name: string; hostile: boolean }> = [];

  if (inputs.frictionScore !== null) {
    const f = inputs.frictionScore;
    const fav = f >= stormyF ? 0 : f >= choppyF
      ? 0.5 * (1 - (f - choppyF) / (stormyF - choppyF))
      : 0.5 + 0.5 * (1 - f / choppyF);
    parts.push({ w: rule(assetClass, 'weight_friction'), fav: clamp01(fav), name: 'friction', hostile: f >= stormyF });
    if (f >= stormyF) triggers.push(`friction_stormy(${f}>=${stormyF})`);
    else if (f >= choppyF) triggers.push(`friction_choppy(${f}>=${choppyF})`);
  }
  if (inputs.dbsScore !== null && !inputs.dbsIsStale) {
    const a = Math.abs(inputs.dbsScore);
    const fav = a >= stormyD ? 0 : a >= choppyD
      ? 0.5 * (1 - (a - choppyD) / (stormyD - choppyD))
      : 0.5 + 0.5 * (1 - a / choppyD);
    parts.push({ w: rule(assetClass, 'weight_dbs'), fav: clamp01(fav), name: 'dbs', hostile: a >= stormyD });
    if (a >= stormyD) triggers.push(`dbs_stormy(|${inputs.dbsScore.toFixed(3)}|>=${stormyD})`);
    else if (a >= choppyD) triggers.push(`dbs_choppy(|${inputs.dbsScore.toFixed(3)}|>=${choppyD})`);
  }
  if (inputs.flipsInWindow !== null) {
    const fav = 1 - clamp01(inputs.flipsInWindow / stormyFlips);
    parts.push({ w: rule(assetClass, 'weight_flips'), fav, name: 'flips', hostile: inputs.flipsInWindow >= stormyFlips });
    if (inputs.flipsInWindow >= stormyFlips) triggers.push(`flips_stormy(${inputs.flipsInWindow}>=${stormyFlips})`);
  }
  if (inputs.evGapRatio !== null) {
    const g = inputs.evGapRatio;
    const fav = g >= stormyEv ? 0 : g >= choppyEv
      ? 0.5 * (1 - (g - choppyEv) / (stormyEv - choppyEv))
      : 0.5 + 0.5 * (1 - Math.max(0, g) / choppyEv);
    parts.push({ w: rule(assetClass, 'weight_evgap'), fav: clamp01(fav), name: 'ev_gap', hostile: g >= stormyEv });
    if (g >= stormyEv) triggers.push(`ev_gap_stormy(${g.toFixed(2)}>=${stormyEv})`);
  }
  if (inputs.macroMaxAbsZ !== null) {
    const fav = 1 - clamp01(inputs.macroMaxAbsZ / 3); // 3-sigma = fully hostile
    parts.push({ w: rule(assetClass, 'weight_macro'), fav, name: 'macro', hostile: false });
  }

  if (parts.length === 0) return 0.5; // nothing present → neutral (caps below still apply)

  const totalW = parts.reduce((a, p) => a + p.w, 0);
  let score = parts.reduce((a, p) => a + p.w * p.fav, 0) / totalW;

  // Hard rules as SCORE CAPS (M2 purity — classification stays score-bucketed):
  const stormyCap = rule(assetClass, 'score_stormy_max');
  for (const p of parts) {
    if (p.hostile) score = Math.min(score, stormyCap * 0.8); // any stormy-grade input forces the STORMY bucket
  }
  // INPUT-COMPLETENESS cap (B5 doctrine generalized — surfaced by the unit
  // suite): with absent inputs the weight renormalization concentrates on the
  // few present readings and can inflate a thin snapshot into FAVORABLE.
  // Thin awareness may tighten or hold, never loosen — FAVORABLE (hence
  // AGGRESSIVE) requires the FULL input set present. In practice this makes
  // FAVORABLE unreachable until the EV-gap window warms — by design:
  // AGGRESSIVE earns its way in through evidence (Langston B5).
  if (parts.length < 5) {
    score = Math.min(score, rule(assetClass, 'favorable_min_score') - 0.001);
    triggers.push(`favorable_blocked_missing_inputs(${parts.length}/5)`);
  }
  // R2: degraded awareness never loosens — quarantine caps at neutral.
  if (anyQuarantined) {
    score = Math.min(score, 0.5);
    triggers.push('quarantine_cap(R2)');
  }
  return clamp01(score);
}

function bucketScore(assetClass: AssetClass, score: number): Exclude<AmrWeatherClassification, 'IDLE'> {
  if (score < rule(assetClass, 'score_stormy_max')) return 'STORMY';
  if (score < rule(assetClass, 'score_choppy_max')) return 'CHOPPY';
  if (score >= rule(assetClass, 'favorable_min_score')) return 'FAVORABLE';
  return 'CALM';
}

const MODE_RANK: Record<StrategyMode, number> = { SURVIVAL: 0, DEFENSIVE: 1, NORMAL: 2, AGGRESSIVE: 3 };

/**
 * Dwell + asymmetric hysteresis + one-rung relax ladder (A8a/A8b) + the B5
 * post-IDLE reseed rule. Tighten applies immediately; relax requires
 * relax_confirm_epochs consecutive supporting epochs AND moves one rung.
 */
function applyModeDiscipline(assetClass: AssetClass, t: ClassTrackers, targetMode: StrategyMode, resumedFromIdle: boolean): StrategyMode {
  if (t.currentMode === null || resumedFromIdle) {
    // B5: min(firstRead, NORMAL) — thin post-idle buffers may tighten, never loosen.
    const seeded = MODE_RANK[targetMode] > MODE_RANK.NORMAL ? 'NORMAL' : targetMode;
    t.currentMode = seeded;
    t.modeSinceEpoch = t.epochCount;
    t.relaxCandidateEpochs = 0;
    return seeded;
  }
  const cur = t.currentMode;
  if (MODE_RANK[targetMode] < MODE_RANK[cur]) {
    // Tighten: immediate, multi-rung, never delayed.
    t.currentMode = targetMode;
    t.modeSinceEpoch = t.epochCount;
    t.relaxCandidateEpochs = 0;
    return targetMode;
  }
  if (MODE_RANK[targetMode] > MODE_RANK[cur]) {
    // Relax: dwell first, then one rung per confirmation window.
    const dwell = rule(assetClass, 'dwell_min_epochs');
    const confirm = rule(assetClass, 'relax_confirm_epochs');
    if (t.epochCount - t.modeSinceEpoch < dwell) {
      t.relaxCandidateEpochs = 0;
      return cur;
    }
    t.relaxCandidateEpochs++;
    if (t.relaxCandidateEpochs >= confirm) {
      const next = (Object.keys(MODE_RANK) as StrategyMode[]).find(m => MODE_RANK[m] === MODE_RANK[cur] + 1)!;
      t.currentMode = next;
      t.modeSinceEpoch = t.epochCount;
      t.relaxCandidateEpochs = 0;
      return next;
    }
    return cur;
  }
  t.relaxCandidateEpochs = 0;
  return cur;
}

/** One class, one cycle. */
function computeClassReport(assetClass: AssetClass, flagState: AmrFlagState, now: number): AmrWeatherReport {
  const t = trackerFor(assetClass);
  const staleness: string[] = [];
  const triggers: string[] = [];

  const mi = getMarketIndicators(assetClass);
  const voteStatus = mi.voteStatus;
  const marketClosed = assetClass === 'xstock_spot' && !isXstockMarketOpenUTC('SPY/USD', new Date(now));
  // B-5.1 (#224, Langston D3): friction is REQUIRED for a LIVE classification
  // — it is the primary hostile-condition detector, and classifying from the
  // remaining inputs during sentinel warm-up produced a thin-input CALM for
  // ~90s on every restart (ledger-evidenced 2026-06-11; under ACTIVE that was
  // a full-size posture window during genuinely hostile overnight conditions).
  // WARMING / NO_SOURCE → IDLE (no decision; same honesty as the vote-idle
  // branch). LOW_VOLUME_THIN stays LIVE: the market is open and measured —
  // a thin sample is a caution-grade absent-input, not a warm-up state.
  const frictionWarming = mi.globalFrictionScore === null
    && (mi.frictionReason ?? 'NO_SOURCE') !== 'LOW_VOLUME_THIN'
    && (mi.frictionReason ?? 'NO_SOURCE') !== 'MARKET_CLOSED';

  // ── IDLE (Obj-3a + B-5.1 friction warm-up) ─────────────────────────────────
  if (marketClosed || voteStatus === 'IDLE_OR_WARMING' || frictionWarming) {
    t.wasIdle = true;
    const report: AmrWeatherReport = {
      assetClass, cycleTs: now, classification: 'IDLE', continuousScore: null,
      volatilityState: { proxy: 'dbs_abs', value: null },
      inputs: {
        regime: null, votePct: null, voteStatus,
        frictionScore: null,
        frictionReason: marketClosed ? 'MARKET_CLOSED'
          : frictionWarming ? (mi.frictionReason ?? 'NO_SOURCE')
          : 'IDLE_OR_WARMING',
        frictionSampleSize: 0, dbsScore: null, dbsIsStale: false,
        flipsInWindow: null, epochsObserved: t.epochCount,
        evGapRatio: null, evGapN: t.evGap.length, macroMaxAbsZ: null, macroDetail: null,
      },
      health: [], triggers: [],
      staleness: [marketClosed ? 'market_closed'
        : voteStatus === 'IDLE_OR_WARMING' ? 'vote_idle_or_warming'
        : (mi.frictionReason === 'WARMING' ? 'friction_warming' : 'friction_no_source')],
      inputsSchemaVersion: AMR_INPUTS_SCHEMA_VERSION, flagState,
      resolvedMode: null, // no posture decision while IDLE; consumers hold
    };
    t.lastReport = report;
    return report;
  }

  // ── LIVE epoch ────────────────────────────────────────────────────────────
  const resumedFromIdle = t.wasIdle;
  if (resumedFromIdle) {
    // Silent re-seed: flip history never spans an idle gap (B-4.7 doctrine).
    t.flipEpochs = [];
    t.lastRegime = null;
    t.regimeSinceEpoch = t.epochCount;
    t.wasIdle = false;
  }
  t.epochCount++;

  // Flip tracker (distinct-observation epochs).
  const regime = mi.marketRegime as string;
  if (t.lastRegime !== null && regime !== t.lastRegime) {
    t.flipEpochs.push(t.epochCount);
  }
  if (t.lastRegime !== regime) t.regimeSinceEpoch = t.epochCount;
  t.lastRegime = regime;
  const flipWindow = rule(assetClass, 'flip_window_epochs');
  t.flipEpochs = t.flipEpochs.filter(e => t.epochCount - e < flipWindow);

  const evGap = computeEvGapRatio(assetClass, t);
  if (evGap.ratio === null) staleness.push(`ev_gap_warming(n=${evGap.n}/${rule(assetClass, 'ev_gap_window_n')})`);

  const macro = readMacro(assetClass);
  if (macro.stale) staleness.push(macro.stale);

  const frictionScore = mi.globalFrictionScore;

  const inputs: AmrWeatherInputs = {
    regime,
    votePct: mi.regimePercentage ?? null,
    voteStatus,
    frictionScore,
    frictionReason: frictionScore === null ? (mi.frictionReason ?? 'NO_SOURCE') : null,
    frictionSampleSize: mi.frictionSampleSize ?? 0,
    dbsScore: mi.globalDBS?.score ?? null,
    dbsIsStale: mi.globalDBSIsStale ?? false,
    flipsInWindow: t.flipEpochs.length,
    epochsObserved: t.epochCount,
    evGapRatio: evGap.ratio,
    evGapN: evGap.n,
    macroMaxAbsZ: macro.maxAbsZ,
    macroDetail: macro.detail,
  };
  if (frictionScore === null) staleness.push('friction_no_sample');
  if (inputs.dbsScore === null) staleness.push('dbs_no_snapshot');
  else if (inputs.dbsIsStale) staleness.push('dbs_stale_carry_forward');

  // Obj-15b: per-input health (absence/bounds/stuck/divergence) — quarantine
  // out-of-bounds readings BEFORE they reach the score (R2 handled below).
  const health = evaluateInputHealth(assetClass, inputs, t.epochCount);
  const anyQuarantined = health.some(h => h.quarantined);
  if (anyQuarantined) {
    // Quarantined readings are nulled-with-reason for scoring purposes.
    for (const h of health.filter(x => x.quarantined)) {
      if (h.input === 'friction') { inputs.frictionScore = null; inputs.frictionReason = 'out_of_bounds'; }
      if (h.input === 'dbs') inputs.dbsScore = null;
      if (h.input === 'macro') inputs.macroMaxAbsZ = null;
      if (h.input === 'vote') inputs.votePct = null;
      staleness.push(`${h.input}_quarantined`);
    }
  }

  const score = computeContinuousScore(assetClass, inputs, anyQuarantined, triggers);
  const classification = bucketScore(assetClass, score);
  const targetMode = resolveStrategyModeFromWeather(classification)!; // non-IDLE here
  const resolvedMode = applyModeDiscipline(assetClass, t, targetMode, resumedFromIdle);

  const report: AmrWeatherReport = {
    assetClass, cycleTs: now, classification, continuousScore: score,
    volatilityState: { proxy: 'dbs_abs', value: inputs.dbsScore !== null ? Math.abs(inputs.dbsScore) : null },
    inputs, health, triggers, staleness,
    inputsSchemaVersion: AMR_INPUTS_SCHEMA_VERSION, flagState, resolvedMode,
  };

  // Transition diagnostics (M4: warning-grade alerts are active-only; the
  // ledger + log carry shadow evidence).
  const prev = t.lastReport;
  if (prev && prev.classification !== 'IDLE' && prev.classification !== classification) {
    console.log(`[B-5][AMR][TRANSITION] ${assetClass}: ${prev.classification}→${classification} score=${score.toFixed(3)} mode=${resolvedMode} triggers=[${triggers.join(',')}] flag=${flagState}`);
    if (flagState === 'active' && (classification === 'STORMY' || resolvedMode === 'SURVIVAL')) {
      void import('./system-alerts.js').then(({ addAlert }) => addAlert({
        title: `AMR ${assetClass} → ${classification}`,
        body: `Weather turned ${classification} (score ${score.toFixed(3)}; triggers: ${triggers.join(', ') || 'none'}); mode ${resolvedMode}.`,
        severity: 'warning',
        dedupe_key: `amr_transition_${assetClass}_${classification}`,
        metadata: { assetClass, score, triggers, mode: resolvedMode },
      } as never)).catch(() => { /* alert plumbing must never break the cycle */ });
    }
  }

  t.lastReport = report;
  return report;
}

// ─── Ledger write (Obj-7) ────────────────────────────────────────────────────
async function writeLedgerRow(report: AmrWeatherReport, wouldBlocks: unknown[] | null): Promise<void> {
  try {
    const { db } = await import('../db.js');
    const { amrDecisionLedger } = await import('../../shared/schema.js');
    let wouldDials: unknown = null;
    if (report.resolvedMode) {
      try { wouldDials = getModeOverlayForClass(report.resolvedMode, report.assetClass); } catch { wouldDials = null; }
    }
    await db.insert(amrDecisionLedger).values({
      cycleTs: new Date(report.cycleTs),
      assetClass: report.assetClass,
      inputsSchemaVersion: report.inputsSchemaVersion,
      weather: {
        classification: report.classification,
        inputs: report.inputs,
        triggers: report.triggers,
        staleness: report.staleness,
        health: report.health,
        // #217 shadow evidence (latest selection since the prior cycle).
        rankingShadow: pendingRankingShadow.get(report.assetClass) ?? null,
      },
      continuousScore: report.continuousScore,
      resolvedMode: report.resolvedMode,
      wouldDials,
      wouldBlocks,
      flagState: report.flagState,
    });
  } catch (err) {
    console.warn(`[B-5][AMR][LEDGER] write failed (cycle continues): ${err instanceof Error ? err.message : err}`);
  }
}

/** B-5 Obj-10 (#217): latest CONTEXT_BONUS shadow stamp per class — rides
 *  the next ledger row's weather json (rank1Changed + ceiling-saturation-rate
 *  are the Phase-19/#221 decision numbers). */
const pendingRankingShadow = new Map<AssetClass, unknown>();
export function recordRankingShadow(assetClass: AssetClass, stamp: unknown): void {
  pendingRankingShadow.set(assetClass, stamp);
}

/** Gate dry-run results attach to the LATEST ledger row's would_blocks via a
 *  small in-memory relay the gates module drains (avoids a second write path). */
const pendingWouldBlocks = new Map<AssetClass, unknown[]>();
export function recordWouldBlock(assetClass: AssetClass, block: unknown): void {
  const arr = pendingWouldBlocks.get(assetClass) ?? [];
  arr.push(block);
  if (arr.length > 200) arr.shift(); // bound between cycles
  pendingWouldBlocks.set(assetClass, arr);
}
function drainWouldBlocks(assetClass: AssetClass): unknown[] | null {
  const arr = pendingWouldBlocks.get(assetClass);
  if (!arr || arr.length === 0) return null;
  pendingWouldBlocks.set(assetClass, []);
  return arr;
}

// ─── Ledger retention: in-service 90-day prune (small non-partitioned table;
// the B-NEW-47 partition sweep machinery does not apply) ─────────────────────
let lastPruneAt = 0;
function maybePruneLedger(now: number): void {
  if (now - lastPruneAt < 86_400_000) return;
  lastPruneAt = now;
  void (async () => {
    try {
      const { db } = await import('../db.js');
      const { sql } = await import('drizzle-orm');
      await db.execute(sql`DELETE FROM amr_decision_ledger WHERE cycle_ts < NOW() - INTERVAL '90 days'`);
      console.log('[B-5][AMR][LEDGER] 90-day retention prune ran');
    } catch (err) {
      console.warn(`[B-5][AMR][LEDGER] prune failed (retried tomorrow): ${err instanceof Error ? err.message : err}`);
    }
  })();
}

// ─── The cycle entrypoint (wired from the MCE cycle, chunk 5) ───────────────
let lastReports = new Map<AssetClass, AmrWeatherReport>();

export function runAmrWeatherCycle(now: number = Date.now()): Map<AssetClass, AmrWeatherReport> {
  const out = new Map<AssetClass, AmrWeatherReport>();
  for (const assetClass of AMR_CLASSES) {
    let flagState: AmrFlagState;
    try {
      flagState = getAmrFlagState(assetClass);
    } catch (err) {
      console.warn(`[B-5][AMR] flag read failed for ${assetClass}: ${err instanceof Error ? err.message : err}`);
      continue;
    }
    if (flagState === 'disabled') continue; // A5: no compute, zero overhead
    try {
      const report = computeClassReport(assetClass, flagState, now);
      out.set(assetClass, report);
      // Gate dry-run results accumulated since the previous cycle ride THIS
      // cycle's row (one-cycle attribution skew is acceptable and documented;
      // each block carries its own ts + gate + site tags).
      void writeLedgerRow(report, drainWouldBlocks(assetClass));
    } catch (err) {
      console.warn(`[B-5][AMR] cycle failed for ${assetClass} (other classes continue): ${err instanceof Error ? err.message : err}`);
    }
  }
  lastReports = out;
  maybePruneLedger(now);
  return out;
}

export function getAmrWeatherReport(assetClass: AssetClass): AmrWeatherReport | null {
  return lastReports.get(assetClass) ?? trackerFor(assetClass).lastReport;
}

export function getAllAmrWeatherReports(): Map<AssetClass, AmrWeatherReport> {
  return new Map(lastReports);
}

/**
 * Mode under the dwell/ladder discipline REGARDLESS of flag state — the
 * dry-run gates (shadow) read this so the would-blocks ledger reflects the
 * mode the AMR would be holding. Never used by enforce paths.
 */
export function getCurrentModeForClass(assetClass: AssetClass): StrategyMode | null {
  return trackerFor(assetClass).currentMode;
}

/**
 * Consumer-facing posture read (Obj-4): the class's current mode under the
 * dwell/ladder discipline. null when the flag is not `active` (consumers use
 * the legacy per-signal path — parity gate) or no live cycle has run yet.
 */
export function getActiveModeForClass(assetClass: AssetClass): StrategyMode | null {
  try {
    if (getAmrFlagState(assetClass) !== 'active') return null;
  } catch {
    return null;
  }
  return trackerFor(assetClass).currentMode;
}

/** Test-only reset. */
export function _resetAmrWeatherForTests(): void {
  if (!process.env.VITEST && process.env.NODE_ENV !== 'test') {
    throw new Error('[B-5] _resetAmrWeatherForTests is test-only');
  }
  trackers.clear();
  lastReports.clear();
  pendingWouldBlocks.clear();
}

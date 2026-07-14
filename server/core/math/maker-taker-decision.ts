/**
 * ══════════════════════════════════════════════════════════════════════════════
 * P19-B7.2 — Maker/Taker Entry Decision (pure math authority; SHARED active + VTS)
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The per-signal ENTRY execution decision: does this signal open as a TAKER
 * (cross the spread, pay the taker fee, near-certain immediate fill) or as a
 * MAKER (rest a passive limit, pay the lower maker fee + save the spread, but
 * risk non-fill and adverse selection)?
 *
 * This is the STRUCTURAL crypto opener. At the July-9 Kraken Tier-1 fee wall
 * (0.80% taker / 0.40% maker ≈ 1.8% round-trip taker friction) the honest EV
 * gate refuses most crypto on taker economics; the ~0.8% round-trip maker
 * advantage is what lets a taker-unprofitable / maker-profitable signal open.
 * (Active-Trading-Path-Audit H1: friction dominates; pWin already at the 0.60
 * ceiling; #233 input-threading gives no lift → maker execution is the opener.)
 *
 * DESIGN (field survey P19_B7_2_FIELD_SURVEY.md + 3-way consensus):
 *   - BEST-OF-BOTH backbone: compute taker-EV and maker-EV, take the better.
 *   - BOTH EVs run through the SAME net-expectancy KERNEL — the only difference
 *     is the friction term (maker saves the entry-leg fee diff + spread + entry
 *     slippage). This guarantees the maker/taker comparison and every downstream
 *     EV consumer speak the same pWin-weighted netEV units.
 *   - Conservatism lives in ONE place: a per-asset-class, signal-conditioned
 *     adverse-selection HAIRCUT on the maker side, with an explicit pFill so the
 *     NON-FILL branch is booked as an opportunity-cost LOSS (never EV=0 —
 *     Langston Step-2 item 1: a predictive signal fills its passive order
 *     preferentially when the market is about to run against it and MISSES the
 *     fills where its edge would have paid). START TIGHT (Kyle 2026-07-01):
 *     the haircut is a deliberately pessimistic uncalibrated guess until live
 *     passive-fill data exists (Phase-21), so maker only wins when its advantage
 *     robustly survives a worst-case adverse-selection estimate.
 *   - Urgency is ENDOGENOUS via the continuation-vs-reversal prior (the one
 *     signal that needs no calibration data — field survey addendum #1):
 *     continuation/momentum → bigger non-fill cost + a hard taker floor;
 *     reversal/mean-reversion → smaller non-fill cost (the resting bid fills on
 *     the dip the thesis wants; adverse selection is partly ALIGNED).
 *
 * This module is PURE: synchronous, no side effects, no logging, no I/O, no DB.
 * Config is resolved by the CALLER (per-class, DB-governed, fail-hard) and
 * injected — mirrors the net-expectancy kernel's caller-injection pattern so the
 * math stays pure and the same function serves the active pipeline AND VTS.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import {
  computeNetExpectancyKernel,
  type NetExpectancyKernelResult,
} from '../calculations/net-expectancy-kernel.js';
import { computeTotalRoundTripCost, type CostComponents } from './cost-model.js';
import type { StrategyFamily } from '../../config/canonical-regime-strategy-map.js';

export type EntryMode = 'taker' | 'maker';

/**
 * The pre-calibration urgency prior derived from the strategy family. Needs NO
 * data (field survey addendum #1, Cartea-Wang): as the alpha signal strengthens
 * the optimal execution shifts from posting (making) toward taking.
 *   - continuation: momentum/breakout/strong-trend — the edge is in a move
 *     already starting; a resting order is left behind → taker-leaning.
 *   - reversal: mean-reversion/range — you want to buy weakness; a resting bid
 *     fills on the dip the thesis wants → maker-leaning, adverse-sel aligned.
 *   - neutral: pattern/hybrid/unclassified — no strong prior either way.
 */
export type EntryUrgencyClass = 'continuation' | 'reversal' | 'neutral';

/**
 * Per-asset-class maker/taker haircut configuration. Every field is a fraction
 * of entry price (same units as the cost components). DB-governed
 * (module_constants), fail-hard, resolved by the caller. START TIGHT.
 */
export interface MakerTakerHaircutConfig {
  /** Static, conservative passive-fill probability (0..1). Non-fill is booked as
   *  an opportunity-cost loss weighted by (1 - pFill). Not learned — the paper
   *  maker-fill data is model-vs-model and data-fenced; real pFill = Phase-21. */
  makerFillProbability: number;
  /** Adverse-selection cost on FILL, base rate (fraction of entry). */
  adverseSelectionBase: number;
  /** Adverse-selection slope: A = base + slope * signalStrength (monotonic ↑ in
   *  strength — a stronger/more-informed signal adversely-selects its own fills
   *  harder). */
  adverseSelectionStrengthMult: number;
  /** Non-fill opportunity cost (missed edge), base rate (fraction of entry). */
  nonFillCostBase: number;
  /** Added to the non-fill cost for continuation signals (fast alpha decay → a
   *  non-fill misses the move). */
  nonFillContinuationPenalty: number;
  /** Subtracted from the non-fill cost for reversal signals (patient edge; a
   *  non-fill costs little). Clamped so C ≥ 0. */
  nonFillReversalDiscount: number;
  /** Hard guardrail floor (belt-and-suspenders, independent of the EV compare):
   *  a continuation signal with strength ≥ this threshold is FORCED to taker
   *  regardless of the maker-EV compare. Defends against a miscalibrated prior. */
  hardFloorContinuationStrength: number;
}

export interface MakerTakerDecisionInput {
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  /** Per-symbol TAKER cost components (fee = taker fee, + slippage + spread) —
   *  the SAME value [HF9]/[11.8B] use as the taker baseline. */
  costs: CostComponents;
  /** DB-resolved maker fee for the asset class (getFrictionForAssetClass). */
  feeRateMaker: number;
  /** DB-resolved TAKER fee for the asset class (getFrictionForAssetClass) — used ONLY
   *  to single-source the taker−maker fee DELTA below (Langston Step-4 Q1 rider), so the
   *  maker advantage never mixes a per-symbol taker fee (costs.fee) with a per-class maker
   *  fee across two resolvers. The taker LEG still uses costs.fee (per-symbol, matching
   *  [HF9]/[11.8B]); only the maker-vs-taker fee delta is single-sourced here. */
  feeRateTaker: number;
  // pWin inputs — passed straight through to the kernel (identical on both legs).
  DI?: number;
  sourcePool?: string;
  dbsScore?: number;
  minPWin?: number;
  maxPWin?: number;
  diPWinFactor?: number;
  /** Signal strength in [0,1] (finalScore/predictive confidence). Drives the
   *  adverse-selection slope + the hard floor. */
  signalStrength: number;
  /** Urgency prior from the strategy family. */
  urgencyClass: EntryUrgencyClass;
  /** Per-class haircut config (DB-governed, fail-hard, injected by the caller). */
  haircut: MakerTakerHaircutConfig;
}

export interface MakerTakerDecisionResult {
  chosenMode: EntryMode;
  /** The netEV that flows to every downstream consumer (the SINGLE-CONSISTENT
   *  NUMBER — OBJ-3). For taker it is the kernel taker netEV; for maker it is the
   *  haircut-adjusted, pFill-weighted maker netEV (NEVER the raw maker netEV). */
  chosenNetEV: number;
  takerNetEV: number;
  /** Maker netEV assuming a certain fill, BEFORE the adverse-selection/non-fill
   *  haircut. Diagnostic only — never gates or ranks. */
  makerNetEVRaw: number;
  /** The haircut-adjusted, pFill-weighted maker netEV that competes with taker. */
  makerNetEVAdjusted: number;
  makerEntryAdvantagePct: number;
  adverseSelectionPct: number;
  nonFillCostPct: number;
  hardFloorFired: boolean;
  /** The pFill ASSUMED at decision time (`haircut.makerFillProbability`, clamped) — the Phase-25
   *  pFill-calibration TARGET. Exposed (B-EVIDENCE-SINK 2026-07-14) so the sink captures the faithful
   *  decision-time value rather than re-resolving a possibly-recalibrated config later. */
  makerFillProbability: number;
  /** The clamped `signalStrength` that drove the adverse-selection slope — echoed for the sink. */
  signalStrength: number;
  taker: NetExpectancyKernelResult;
  maker: NetExpectancyKernelResult;
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/**
 * Map a strategy family to its entry-urgency prior. Pure, total, no data needed.
 */
export function entryUrgencyClassForFamily(
  family: StrategyFamily | undefined | null,
): EntryUrgencyClass {
  switch (family) {
    case 'trend':
    case 'breakout':
    case 'strong_trend':
      return 'continuation';
    case 'reversal':
    case 'oscillator':
      return 'reversal';
    // pattern, hybrid, undefined → no strong prior
    default:
      return 'neutral';
  }
}

/**
 * The best-of-both maker/taker entry decision. Pure; both EVs via the same
 * kernel; conservatism entirely in the injected per-class haircut.
 */
export function decideMakerTaker(
  input: MakerTakerDecisionInput,
): MakerTakerDecisionResult {
  const {
    entryPrice,
    stopPrice,
    targetPrice,
    costs,
    feeRateMaker,
    feeRateTaker,
    DI,
    sourcePool,
    dbsScore,
    minPWin,
    maxPWin,
    diPWinFactor,
    signalStrength,
    urgencyClass,
    haircut,
  } = input;

  const kernelCommon = {
    entryPrice,
    stopPrice,
    targetPrice,
    DI,
    sourcePool,
    dbsScore,
    minPWin,
    maxPWin,
    diPWinFactor,
  };

  // ── TAKER leg — identical to the [HF9]/[11.8B] taker baseline ──────────────
  const takerFrictionPct = computeTotalRoundTripCost(
    costs.fee,
    costs.slippage,
    costs.spread,
  );
  const taker = computeNetExpectancyKernel({
    ...kernelCommon,
    totalFriction: takerFrictionPct * entryPrice,
  });

  // ── MAKER leg — save the ENTRY leg's fee diff + spread + entry slippage ────
  // Round-trip cost = 2·fee + 2·slip + spread (spread applied once, at entry).
  // A maker ENTRY pays the maker fee instead of the taker fee, rests passively
  // (≈0 entry slippage), and does not cross the spread. Conservatively we treat
  // the spread as SAVED (not earned as a credit) — START TIGHT. The exit leg is
  // identical to taker and cancels in the comparison.
  // Fee delta is SINGLE-SOURCED (both from getFrictionForAssetClass — Langston Step-4
  // Q1 rider): never `costs.fee − feeRateMaker`, which would subtract a per-class maker
  // fee from a per-symbol taker fee across two resolvers. spread + entry slippage are the
  // per-symbol microstructure the maker saves.
  const makerEntryAdvantagePct =
    (feeRateTaker - feeRateMaker) + costs.spread + costs.slippage;
  const makerFrictionPct = takerFrictionPct - makerEntryAdvantagePct;
  const maker = computeNetExpectancyKernel({
    ...kernelCommon,
    totalFriction: makerFrictionPct * entryPrice,
  });

  // ── The conservatism knob: signal-conditioned haircut + explicit pFill ─────
  const strength = clamp01(signalStrength);
  const adverseSelectionPct =
    haircut.adverseSelectionBase + haircut.adverseSelectionStrengthMult * strength;
  let nonFillCostPct = haircut.nonFillCostBase;
  if (urgencyClass === 'continuation') {
    nonFillCostPct += haircut.nonFillContinuationPenalty;
  } else if (urgencyClass === 'reversal') {
    nonFillCostPct = Math.max(0, nonFillCostPct - haircut.nonFillReversalDiscount);
  }

  const pFill = clamp01(haircut.makerFillProbability);
  const adverseSelectionPerUnit = adverseSelectionPct * entryPrice;
  const nonFillCostPerUnit = nonFillCostPct * entryPrice;

  // E[maker] = P(fill)·(netEV_onFill − adverseSelection) − P(no-fill)·nonFillCost
  // The non-fill branch is an opportunity-cost LOSS, never zero (Langston item 1).
  const makerNetEVOnFill = maker.netEV - adverseSelectionPerUnit;
  const makerNetEVAdjusted =
    pFill * makerNetEVOnFill - (1 - pFill) * nonFillCostPerUnit;

  // ── Hard guardrail floor: strong continuation → force taker ────────────────
  const hardFloorFired =
    urgencyClass === 'continuation' &&
    strength >= haircut.hardFloorContinuationStrength;

  let chosenMode: EntryMode;
  if (hardFloorFired) {
    chosenMode = 'taker';
  } else {
    chosenMode = makerNetEVAdjusted > taker.netEV ? 'maker' : 'taker';
  }
  const chosenNetEV = chosenMode === 'maker' ? makerNetEVAdjusted : taker.netEV;

  return {
    chosenMode,
    chosenNetEV,
    takerNetEV: taker.netEV,
    makerNetEVRaw: maker.netEV,
    makerNetEVAdjusted,
    makerEntryAdvantagePct,
    adverseSelectionPct,
    nonFillCostPct,
    makerFillProbability: pFill,   // B-EVIDENCE-SINK: the applied pFill (faithful decision-time snapshot)
    signalStrength: strength,      // B-EVIDENCE-SINK: the clamped strength that set the haircut slope
    hardFloorFired,
    taker,
    maker,
  };
}

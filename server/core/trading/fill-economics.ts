/**
 * `B-ENTRY-GATE` (`#1224`) increment A, P4 — THE ECONOMIC TEST AT THE PRICE ACTUALLY PAID (Kyle KD-11, Reply A).
 *
 * One deciding number at the fill: net EV for the ARM THAT FILLS, at the PRICE IT PAYS, through the same kernel and the
 * same friction model the birth decision used (`decideMakerTaker`, `levelGeometry: 'mid'`, as every lane is today):
 *   - a TAKER at its walked average fill price → the kernel's taker leg at that price;
 *   - a MAKER at its limit → the kernel's maker leg at the limit, CONDITIONAL ON HAVING FILLED: the adverse-selection
 *     haircut applies, the fill-probability weight and the non-fill cost do not (the order is being placed to fill).
 * This replaces, at the fill, the gen-time sign check on the stored snapshot (scope §2, pre-audit P4). The snapshot keeps
 * its integrity refusal and its drift alarm; in LIVE its block also stays until Kyle's §6.2 (P4b).
 *
 * ⛔ A-12, WATCH-ONLY (Kyle's KD-11 decision is owed): the kernel defaults DI to 50 when it is absent
 * (`net-expectancy-kernel.ts:91`), which with today's settings puts pWin at the 0.60 CEILING. xStock carries no DI to the
 * queue BY DESIGN (`signal-orchestrator.ts:1017-1020`: "EV-inert (#377 H1) … unreconciled basis (#502) … fail-safe kernel
 * default until Phase-25"); ~4 % of crypto queue rows also carry none. Measured (Langston, 2026-11-05): the default is
 * fail-OPEN, not fail-safe — above every xStock DI observed in 114 days (max 45.68) and above ~89 % of crypto's. Reply A
 * says a missing win probability refuses with no default; so this leg is RECORDED here for BOTH classes — the defaulted
 * EV (which decides, exactly as every EV gate decides today), the EV on a real carried DI where one exists, and the EV at
 * the measured per-class base rate — and never refuses until Kyle decides.
 *
 * Pure: the caller resolves every setting (fail-hard) and passes it in.
 */
import {
  decideMakerTaker,
  type EntryUrgencyClass,
  type MakerTakerHaircutConfig,
} from '../math/maker-taker-decision.js';
import type { CostComponents } from '../math/cost-model.js';

export interface FillEconomicsInput {
  arm: 'taker' | 'maker';
  /** Taker: the walked average fill. Maker: its limit (the price it pays if it fills). */
  fillPrice: number;
  stopPrice: number;
  targetPrice: number;
  costs: CostComponents;
  feeRateMaker: number;
  feeRateTaker: number;
  /** The at-queue DI; undefined ⇒ the kernel defaults it (A-12). */
  DI: number | undefined;
  sourcePool: string | undefined;
  dbsScore: number | undefined;
  minPWin: number;
  maxPWin: number;
  diPWinFactor: number;
  signalStrength: number;
  urgencyClass: EntryUrgencyClass;
  haircut: MakerTakerHaircutConfig;
  /** `scoring_base.flat_pwin_base` for the class — the measured base rate, for the A-12 shadow only. */
  measuredBasePWin: number;
}

export interface FillEconomics {
  /** THE deciding number: net EV per unit for the arm that fills, at the price it pays. */
  netEvAtFill: number;
  pWin: number;
  /** True when the win probability came from the kernel's DI default (no DI, not the strong-trend DBS branch). */
  pWinDefaulted: boolean;
  /** A-12 shadow: the same EV with pWin set to the measured per-class base rate. Never decides. */
  netEvAtMeasuredBase: number;
  /**
   * A-12 shadow (Langston's third candidate): the EV on a REAL DI. At the fill the only DI in reach is the signal's
   * carried at-queue DI, so this is that EV when a DI was carried, and null when it was not (all xStock today: the birth
   * deliberately leaves xStock DI null, `signal-orchestrator.ts:1017-1020`, #377 H1 / #502). Null means "not resolvable
   * here", never "zero".
   */
  netEvAtRealDi: number | null;
  /** Reply A at the fill: net EV ≤ 0 refuses. */
  refuse: boolean;
  /** A-12 shadow: what the missing-win-probability leg WOULD refuse. Never decides in this batch. */
  missingPWinWouldRefuse: boolean;
}

export function computeFillEconomics(i: FillEconomicsInput): FillEconomics {
  for (const [k, v] of Object.entries({ fillPrice: i.fillPrice, stopPrice: i.stopPrice, targetPrice: i.targetPrice, measuredBasePWin: i.measuredBasePWin })) {
    if (!Number.isFinite(v)) throw new Error(`computeFillEconomics: ${k} must be finite, got ${String(v)}`);
  }
  const d = decideMakerTaker({
    entryPrice: i.fillPrice,
    entryPriceMaker: i.fillPrice,
    levelGeometry: 'mid',
    stopPrice: i.stopPrice,
    targetPrice: i.targetPrice,
    costs: i.costs,
    feeRateMaker: i.feeRateMaker,
    feeRateTaker: i.feeRateTaker,
    DI: i.DI,
    sourcePool: i.sourcePool,
    dbsScore: i.dbsScore,
    minPWin: i.minPWin,
    maxPWin: i.maxPWin,
    diPWinFactor: i.diPWinFactor,
    signalStrength: i.signalStrength,
    urgencyClass: i.urgencyClass,
    haircut: i.haircut,
  });
  const leg = i.arm === 'taker' ? d.taker : d.maker;
  // Maker, conditional on filling: the adverse-selection cost applies; pFill and the non-fill cost do not.
  const adverseSelection = i.arm === 'maker' ? d.adverseSelectionPct * i.fillPrice : 0;
  const netEvAtFill = leg.netEV - adverseSelection;
  const pWinDefaulted = i.DI === undefined && i.sourcePool !== 'quant-strong_trend';
  const p = i.measuredBasePWin;
  const netEvAtMeasuredBase = p * leg.distTarget - (1 - p) * leg.distStop - leg.totalCost - adverseSelection;
  return {
    netEvAtFill,
    pWin: leg.pWin,
    pWinDefaulted,
    netEvAtMeasuredBase,
    netEvAtRealDi: i.DI === undefined ? null : netEvAtFill,
    refuse: !(netEvAtFill > 0),
    missingPWinWouldRefuse: pWinDefaulted,
  };
}

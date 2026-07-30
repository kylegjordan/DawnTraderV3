/**
 * ══════════════════════════════════════════════════════════════════════════════
 * B-COST-MATH-CONSOLIDATION — THE SINGLE SOURCE OF TRADE P&L ARITHMETIC
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * PURE. No I/O, no DB, no clock, no shared state. Unit-testable in isolation.
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
 * This arithmetic previously lived at THREE hand-synchronised copies, each
 * documented in-code as a deliberate mirror of the others:
 *   1. active-execution-engine.ts  — engine close (stop/target/trailing/time)
 *   2. routes.ts                   — manual close (the operator "Close" button)
 *   3. routes.ts                   — open-positions live display (the Open tab)
 * The duplication was DELIBERATE SYNCHRONISATION, not accident: site 2 was
 * copied from site 1 one day later (`2807c2360`, 2025-12-12) specifically so the
 * two would agree. **That intent — "these must produce identical numbers" — is
 * still correct today. It is the IMPLEMENTATION that fails it, because copies
 * drift and demonstrably had.**
 *
 * ── THE PROVENANCE RESOLUTION (bridge/canonical §2, a FROZEN historical record)
 * The founding design document is INTERNALLY INCONSISTENT and cannot be
 * satisfied as written:
 *   F1  grossPnl = (actualExitPrice − actualEntryPrice) × quantity
 *   F2  totalCost has FOUR components, with slippage "added to entry price" and
 *       "subtracted from exit price" — i.e. slippage is INSIDE the actual prices
 *   F3  totalCost = entryFee + exitFee + entrySlippage + exitSlippage
 * F2 puts slippage inside the actual prices, F1 computes gross FROM those
 * prices, and F3 then subtracts slippage AGAIN. Derivation: with
 * actualEntry = E(1+s) and actualExit = X(1−s), F1's gross is
 * (X−E)q − (entrySlip$ + exitSlip$), so F3's net is
 * intendedGross − 2×slippage − fees. **Slippage twice.**
 *
 * Anyone implementing F1+F3 faithfully produces a double-count, notices the
 * numbers are wrong, and has to abandon one. The old code silently abandoned
 * F1 (computing gross against INTENDED prices), which made F3's slippage
 * deduction telescope out and yielded a CORRECT net — verified 293/293 live.
 * That resolution was locally rational and entirely undocumented.
 *
 * ⚠️ TWO self-consistent resolutions existed, and the design cannot arbitrate
 * between them — a self-contradictory document is not a tiebreaker. Kyle's
 * 2026-07-29 directive picked the one that keeps GROSS and COST *individually*
 * truthful, which is what this module implements. F1 corroborates that choice;
 * it does not authorise it.
 *
 * ⚠️ **F2's four-component COMPOSITION of totalCost is RETIRED — not merely its
 * old rates.** State it plainly, because the failure mode is concrete and has
 * already happened once: a reader opens F2, counts four components, and re-adds
 * slippage. That is the exact loop this module exists to close.
 *
 * ── THE SIGN CONVENTION, stated because NO INDUSTRY STANDARD EXISTS ──────────
 * Slippage is retained by callers as SIGNED execution-quality telemetry
 * (positive = cost) — REPORTED, NEVER DEDUCTED here. It is already inside the
 * actual fill prices; deducting it again is the double-count above.
 * Supporting practice: Harris *Trading and Exchanges* Ch.21 (explicit costs are
 * accounting entries, implicit costs are estimates against a benchmark and are
 * not bookable); Zipline `finance/slippage.py` (slippage baked into the fill
 * price, commissions modelled separately — never both); PRIIPs (2023) floored
 * transaction costs at zero after funds reported negative ones. Talos, Anboto
 * and retail-FX conventions mutually contradict, hence the explicit statement.
 *
 * ⚠️ DO NOT CONFUSE WITH `computeTotalRoundTripCost` (routes.ts): that is a
 * same-named but DIFFERENT QUANTITY — an EX-ANTE friction ESTIMATE feeding the
 * EV gate, which legitimately INCLUDES slippage because it answers "what will
 * this round trip cost me?", not "what did this trade cost?". Harris-consistent,
 * correct, and deliberately untouched. It is fenced by name in the tests.
 * ══════════════════════════════════════════════════════════════════════════════
 */

/** The four values every caller needs, plus the basis they were computed against. */
export interface RealizedPnl {
  /** (exit − entry) × qty, measured on ACTUAL fills. Fees NOT deducted. */
  grossPnl: number;
  /** EXPLICIT costs only (fees). Structurally cannot be negative. */
  totalCost: number;
  /** grossPnl − totalCost. */
  netPnl: number;
  /** netPnl as a % of capital ACTUALLY deployed. 0 when the basis is non-positive. */
  netPnlPercent: number;
  /** entry × qty — the denominator, surfaced so callers never re-derive it. */
  entryValue: number;
}

export interface RealizedPnlInput {
  /** The ACTUAL entry fill price (slippage already inside it). */
  actualEntryPrice: number;
  /** The ACTUAL exit fill price (slippage already inside it). */
  actualExitPrice: number;
  quantity: number;
  entryFee: number;
  exitFee: number;
}

/**
 * REALIZED P&L for a CLOSED trade. Used by the engine close path and the manual
 * close endpoint — the two paths MUST produce identical numbers for identical
 * economics, which is the whole point of a single implementation.
 */
export function computeRealizedPnl(input: RealizedPnlInput): RealizedPnl {
  const { actualEntryPrice, actualExitPrice, quantity, entryFee, exitFee } = input;

  const grossPnl = (actualExitPrice - actualEntryPrice) * quantity;
  // EXPLICIT costs only. The negative-"cost" artifact came from netting price
  // improvement into this line; it never belonged here.
  const totalCost = entryFee + exitFee;
  const netPnl = grossPnl - totalCost;
  // Denominator is the capital ACTUALLY deployed, consistent with the actual-fill
  // gross above. The `> 0` guard is preserved from all three original sites: a
  // zero/absent basis yields 0, never NaN or Infinity.
  const entryValue = actualEntryPrice * quantity;
  const netPnlPercent = entryValue > 0 ? (netPnl / entryValue) * 100 : 0;

  return { grossPnl, totalCost, netPnl, netPnlPercent, entryValue };
}

export interface OpenPnl extends RealizedPnl {
  /** grossPnl as a % of the entry basis — the Open tab shows this alongside net. */
  grossPnlPercent: number;
}

export interface OpenPnlInput {
  /** The ACTUAL entry fill price. */
  actualEntryPrice: number;
  /** The live mark. NOT a fill — nothing has been sold yet. */
  currentPrice: number;
  quantity: number;
  entryFee: number;
  /** MODELLED exit fee at the current price. An estimate, not an incurred cost. */
  estExitFee: number;
}

/**
 * UNREALIZED P&L for an OPEN position.
 *
 * ★ A SEPARATE ENTRY POINT ON PURPOSE. It is NOT the same quantity as
 * `computeRealizedPnl` — the exit leg is a MARK, not a fill, and the exit fee is
 * MODELLED rather than incurred. Forcing one signature over both would make the
 * caller's meaning depend on which arguments happened to be passed, and that
 * ambiguity is how the next drift starts. The arithmetic is shared; the SEMANTICS
 * are deliberately not.
 */
export function computeOpenPnl(input: OpenPnlInput): OpenPnl {
  const { actualEntryPrice, currentPrice, quantity, entryFee, estExitFee } = input;

  const base = computeRealizedPnl({
    actualEntryPrice,
    actualExitPrice: currentPrice,
    quantity,
    entryFee,
    exitFee: estExitFee,
  });

  const grossPnlPercent = base.entryValue > 0 ? (base.grossPnl / base.entryValue) * 100 : 0;

  return { ...base, grossPnlPercent };
}

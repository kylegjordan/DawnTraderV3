/**
 * P19-B7.2c — PURE pending-maker decision logic, shared by the paper monitor pre-pass
 * (`active-execution-engine._processPendingMaker`) and the VTS resolve pre-pass
 * (`vts-runner.resolveOpenVirtualTrades`) so the two paths CANNOT drift (R2 parity).
 *
 * Model (Kyle, LOCKED + SIMPLIFIED 2026-07-02):
 *  - FILL: honest side-aware trade-through of the REAL price — a resting BUY fills iff
 *    price ≤ limit; a resting SELL iff price ≥ limit. Never optimistic.
 *  - DROP: past the hard-drop deadline (`maker_max_pending_ms`) → dropped, period
 *    (no convert re-evaluation).
 *  - PRECEDENCE (R2): if a pending both trades through AND is past its deadline in the
 *    SAME tick, FILL WINS (it filled as maker before the deadline).
 *  - The tiered fill-quality knobs are INERT placeholders: a fill is ALWAYS at the
 *    limit exactly (no haircut applied) until Phase-25 calibrates on real fill data.
 */

export type PendingSide = 'buy' | 'sell';
export type PendingOutcome = 'fill' | 'drop' | 'rest';

/** Side-aware honest trade-through: did the real price trade through the resting limit? */
export function tradedThrough(side: PendingSide, currentPrice: number, limit: number): boolean {
  if (!Number.isFinite(currentPrice) || !Number.isFinite(limit)) return false;
  return side === 'buy' ? currentPrice <= limit : currentPrice >= limit;
}

/**
 * Marketable-at-placement: the market is ALREADY at/through the limit the moment the
 * maker order would be placed — a real post-only would REJECT. (Same comparator as the
 * fill; named separately because the CONSEQUENCE differs: at placement it routes to the
 * stored-taker check, at monitor time it is a fill.)
 */
export function isMarketableAtPlacement(side: PendingSide, currentPrice: number, limit: number): boolean {
  return tradedThrough(side, currentPrice, limit);
}

/**
 * One pending order, one tick → one outcome. FILL WINS over the deadline in the same
 * tick (R2). A null/unavailable price can never fill; it can still hard-drop.
 */
export function evaluatePendingMaker(args: {
  side: PendingSide;
  currentPrice: number | null;
  limit: number;
  nowMs: number;
  deadlineMs: number | null;
}): PendingOutcome {
  const { side, currentPrice, limit, nowMs, deadlineMs } = args;
  if (currentPrice != null && tradedThrough(side, currentPrice, limit)) return 'fill'; // FILL WINS (R2)
  if (deadlineMs != null && nowMs >= deadlineMs) return 'drop';
  return 'rest';
}

/**
 * The maker FILL price — ALWAYS the limit, exactly. The inert Phase-25 tier knobs
 * (`maker_late_fill_haircut_pct`, seeded 0) are deliberately NOT inputs here: the
 * OBJ-7 inert-tier test pins fill === limit so an accidental future wiring of the
 * placeholder knobs is caught at CI, not in production fill data (Langston Q4 guard).
 */
export function makerFillPrice(limit: number): number {
  return limit;
}

// ═════════════════════════════════════════════════════════════════════════════
// P19-B7.2d — PURE twin planning (the decision half of `vts-runner.maybeOpenTwin`).
// Extracted VERBATIM from the crypto lane's inline twin block (vts-runner
// :2099-2136 pre-B7.2d) so the twin-mode selection + skip decisions are shared
// by BOTH VTS lanes (crypto + xstock) and unit-testable on BOTH branches — the
// opens path AND the skip path (Langston Step-2 regression condition: a helper
// identical when it fires but divergent on the no-op decision is the exact
// regression the B79.0m.b lock existed to catch).
// ═════════════════════════════════════════════════════════════════════════════

export type TwinPlan =
  | { kind: 'skip'; reason: 'twin_disabled' | 'marketable_maker' | 'degenerate_fallback' }
  | {
      kind: 'open';
      twinMode: 'taker' | 'maker';
      /** Overlay to spread over the chosen leg's record to build the twin record. */
      overlay: {
        chosenEntryMode: 'taker' | 'maker';
        entryFeeRate: number;
        state: 'pending' | 'open';
        makerLimitPrice: number | undefined;
        makerDeadline: number | undefined;
      };
    };

/**
 * One chosen leg → one twin plan. Transcription of the inline block's semantics:
 *  - twin disabled (per-class `maker_taker.twin_enabled` knob) → skip.
 *  - chosen leg opened PENDING maker → the twin is the TAKER leg (opens filled now).
 *  - chosen leg opened taker BY DECISION → the twin is the MAKER leg (rests pending
 *    at the limit + deadline) — UNLESS that maker twin would be marketable at
 *    placement (no honest rest possible) → skip.
 *  - chosen leg was the marketable taker-FALLBACK (decision said maker, placement
 *    flipped it) → comparison degenerate → skip.
 */
export function planTwin(params: {
  twinEnabled: boolean;
  /** Whether the chosen leg opened as a resting pending maker. */
  pendingMaker: boolean;
  /** The DECISION's chosenMode (PRE-marketable-fallback). */
  decisionChosenMode: 'taker' | 'maker';
  /** The chosen leg's entry price — the maker twin's resting limit. */
  limitPrice: number;
  /** Market price at placement (marketable check). */
  currentMarketPrice: number;
  feeRateMaker: number;
  feeRateTaker: number;
  /** Per-class hard-drop budget (`maker_max_pending_ms`) as a LAZY provider —
   *  invoked ONLY in the maker-twin open branch, exactly where the inline block
   *  called the fail-hard resolver (behavior-identity: a missing knob throws at
   *  the same point it used to, not on every twin evaluation). */
  makerMaxPendingMs: () => number;
  nowMs: number;
}): TwinPlan {
  if (!params.twinEnabled) return { kind: 'skip', reason: 'twin_disabled' };
  const twinMode: 'taker' | 'maker' | null =
    params.pendingMaker ? 'taker'
    : (params.decisionChosenMode === 'taker' ? 'maker' : null); // null = marketable-fallback chosen leg → degenerate
  if (twinMode === 'maker' && isMarketableAtPlacement('buy', params.currentMarketPrice, params.limitPrice)) {
    return { kind: 'skip', reason: 'marketable_maker' };
  }
  if (twinMode == null) return { kind: 'skip', reason: 'degenerate_fallback' };
  return {
    kind: 'open',
    twinMode,
    overlay: {
      chosenEntryMode: twinMode,
      entryFeeRate: twinMode === 'maker' ? params.feeRateMaker : params.feeRateTaker,
      ...(twinMode === 'maker'
        ? { state: 'pending' as const, makerLimitPrice: params.limitPrice, makerDeadline: params.nowMs + params.makerMaxPendingMs() }
        : { state: 'open' as const, makerLimitPrice: undefined, makerDeadline: undefined }),
    },
  };
}

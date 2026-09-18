/**
 * ══════════════════════════════════════════════════════════════════════════════
 * P19-B4b.1 — OrderPlacer execution port: PAPER ADAPTER (depth-walked fill)
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `PaperOrderPlacer` is the paper-mode implementation of the `OrderPlacer` port
 * (see ./types.ts). It encapsulates ONLY the fill — now an HONEST depth-walk over
 * the real order book (P19-B4b.1, replacing the flat 0.05% slippage of B3a). The
 * VWAP from walking the book IS the fill price; fees stay per-class (B-4.5).
 * Everything else (position write, P/L, learning capture, exit archive) stays in
 * `ActiveExecutionEngine` as mode-generic bookkeeping that consumes the `FillResult`.
 *
 * FILL MODEL:
 *  - OPEN (buy): walk the ask side for `quantity`. The VWAP is the fill price; if
 *    the book is thinner than the order (book moved between gate and fill) → a
 *    `partial` (the engine sizes down to fillQty). No book → `rejected` (the 24/5
 *    depth gate upstream should have blocked it; defense-in-depth).
 *  - CLOSE (sell): walk the bid side, then ALWAYS full-fill (R2 — a market exit
 *    always gets out; never a phantom stuck position). Any remainder beyond the
 *    captured book is priced with the DB-resolved `beyondDepthPenaltyBps`
 *    (Langston Q-A — NOT a magic constant). Cold book → exit at requestedPrice
 *    worsened by the penalty, loudly.
 *
 * DETERMINISM (Langston C-Q5): the fill seam is RNG-free end-to-end — the depth
 * walk is pure (depth-walk.ts) and there is no Math.random / jitter anywhere here.
 * Same book + same order → same fill, so paper Net Expectancy stays analyzable.
 *
 * DECOUPLED: the per-class fee fn is injected; the book + penalty arrive on the
 * request (the engine fetched them via the depth-source after its gate), so this
 * module does not import the engine — keeping the live-swap seam clean.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import type {
  OrderPlacer,
  OpenOrderRequest,
  CloseOrderRequest,
  FillResult,
} from './types.js';
import type { AssetClass } from '../../../shared/asset-classes.js';
import { openFill, closeFillFull } from './depth-walk.js';

/**
 * Returns the per-class fee percentage (e.g. 0.26 for 0.26%) for a symbol.
 * P19-B6.5d (OBJ-4): an optional carried asset-class stamp is threaded so the fill fee
 * is priced by the order's actual class (collision-correct), not re-derived from the
 * symbol. The engine resolver falls back to symbol-resolution when the stamp is absent.
 */
export type FeePercentResolver = (symbol: string, assetClass?: AssetClass) => number;

export class PaperOrderPlacer implements OrderPlacer {
  /**
   * @param feePercentFor Per-asset-class fee resolver (B-4.5), e.g.
   *                      `(symbol) => this.feePercentFor(symbol)` from the engine.
   */
  constructor(private readonly feePercentFor: FeePercentResolver) {}

  /**
   * Paper open fill: depth-walk the ask side. Effective price = VWAP over filled
   * levels; fee on filled notional; slippage measured vs the intended (signal)
   * price over the filled qty. `partial` when the book can't fully fill.
   */
  async openOrder(req: OpenOrderRequest): Promise<FillResult> {
    const asks = req.bookAsks;
    if (!asks || asks.length === 0) {
      return { status: 'rejected', reason: 'no_ask_book_for_open', code: 'DEPTH_UNAVAILABLE' };
    }
    const walked = openFill(req.quantity, asks);
    if (walked.filledQty <= 0) {
      return { status: 'rejected', reason: 'ask_book_unfillable', code: 'DEPTH_UNFILLABLE' };
    }
    const fillPrice = walked.avgFillPrice;
    const fillQty = walked.filledQty;
    const notional = fillPrice * fillQty;
    const feeQuote = notional * (this.feePercentFor(req.symbol, req.assetClass) / 100); // P19-B6.5d (OBJ-4): use the carried stamp
    // Slippage vs intended price over the FILLED qty. Positive when the book ask is
    // worse (higher) than the signal price; negative if the book moved favorably.
    const slippageQuote = (fillPrice - req.intendedPrice) * fillQty;
    if (walked.exhausted) {
      return {
        status: 'partial',
        fillPrice,
        fillQty,
        requestedQty: req.quantity,
        feeQuote,
        slippageQuote,
        remainingQty: req.quantity - fillQty,
      };
    }
    return { status: 'filled', fillPrice, fillQty, feeQuote, slippageQuote };
  }

  /**
   * Paper close fill: depth-walk the bid side and full-fill (R2); a beyond-book remainder is priced
   * with the DB-resolved penalty.
   * ⛔ B-FEED-MISMATCH-FIX P1/P2 — A COLD BOOK NO LONGER BOOKS `requestedPrice`. `requestedPrice` is
   * whatever the caller had (a mark on the exit monitor, and until this batch an ENTRY price on a
   * no-price flatten), so the old arm booked a price nobody bid. Now:
   *   - cold + `coldBookReferencePrice` (a stopped-engine flatten ONLY) → that OBSERVED price worsened by
   *     the penalty — the engine stamps it `synthetic_reference` and keeps it out of learning capture;
   *   - cold otherwise → `rejected` (`cold_book`) ⇒ the C3 rule leaves the position OPEN and the next exit
   *     cycle retries (bounded by the engine's `cold_refusal_cap`);
   *   - config missing → `rejected` (`no_depth_config`), never a zero-slippage exit — ⚠️ THIS INCLUDES A FLATTEN: with
   *     `fill_depth_gate` unseeded even a flatten carrying a good reference is refused (latent — both classes are seeded).
   *     The engine alerts on a refused flatten's FIRST refusal (Step-4 BLOCKER-2), so it is loud, not silent.
   * Still side-effect-free: no await, no write, nothing mutated. The engine's divergence gate RELIES on
   * that to discard a computed fill (B-FEED-MISMATCH-FIX r5) — a LIVE placer is not, see SIM OrderPlacer.
   */
  async closeOrder(req: CloseOrderRequest): Promise<FillResult> {
    const bids = req.bookBids;
    const penaltyBps = req.beyondDepthPenaltyBps;
    let fillPrice: number;
    if (typeof penaltyBps !== 'number') {
      console.error(
        `[PaperOrderPlacer][CLOSE_NO_DEPTH_CONFIG] ${req.symbol} pos=${req.positionId} — fill_depth_gate config unavailable; close REJECTED, position stays open (seed fill_depth_gate)`,
      );
      return { status: 'rejected', reason: 'fill_depth_gate config unavailable', code: 'no_depth_config' };
    }
    if (bids && bids.length > 0) {
      fillPrice = closeFillFull(req.quantity, bids, penaltyBps).avgFillPrice;
    } else if (typeof req.coldBookReferencePrice === 'number' && req.coldBookReferencePrice > 0) {
      fillPrice = req.coldBookReferencePrice * (1 - penaltyBps / 10_000);
      console.warn(
        `[PaperOrderPlacer][CLOSE_COLD_BOOK_REFERENCE] ${req.symbol} pos=${req.positionId} — no live bids; flatten booked at observed reference ${req.coldBookReferencePrice}*(1-${penaltyBps}bps)`,
      );
    } else {
      console.warn(
        `[PaperOrderPlacer][CLOSE_COLD_BOOK] ${req.symbol} pos=${req.positionId} — no live bids and no observed reference; close REJECTED, position stays open`,
      );
      return { status: 'rejected', reason: 'no live bids and no observed reference', code: 'cold_book' };
    }
    const notional = fillPrice * req.quantity;
    const feeQuote = notional * (this.feePercentFor(req.symbol, req.assetClass) / 100); // P19-B6.5d (OBJ-4): use the carried stamp
    // Slippage vs requested price (positive when the fill is worse/lower for a sell).
    const slippageQuote = (req.requestedPrice - fillPrice) * req.quantity;
    return { status: 'filled', fillPrice, fillQty: req.quantity, feeQuote, slippageQuote };
  }
}

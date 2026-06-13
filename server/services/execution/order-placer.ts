/**
 * ══════════════════════════════════════════════════════════════════════════════
 * P19-B3a — OrderPlacer execution port: PAPER ADAPTER
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `PaperOrderPlacer` is the paper-mode implementation of the `OrderPlacer` port
 * (see ./types.ts). It encapsulates ONLY the fill — the slippage + fee math that
 * turns an intended price into an effective fill — and returns a `FillResult`.
 * Everything else (position write, P/L, learning capture, exit archive, trade-
 * record update) stays in `PaperExecutionEngine` as mode-generic bookkeeping that
 * consumes the result.
 *
 * BEHAVIOUR-IDENTICAL EXTRACTION: the math here is a verbatim relocation of the
 * inline fill math previously in `paper-execution-engine.ts`
 *   - open  (executeSimulatedTrade ~:2025-2030): worse-price-UP by slippage%, fee on filled notional
 *   - close (closePosition          ~:1140-1150): worse-price-DOWN by slippage%, fee on filled notional
 * No numbers change; only the location. Paper fills are synchronous, atomic, and
 * always-full → `PaperOrderPlacer` ALWAYS returns `status: 'filled'`. The
 * `partial`/`delayed`/`rejected` variants of `FillResult` exist for the future
 * `LiveOrderPlacer` (B7); paper never produces them.
 *
 * DECOUPLED BY CONSTRUCTION: slippage% and the per-asset-class fee function are
 * INJECTED (not imported from the engine), so this module does not depend on
 * `paper-execution-engine.ts` — keeping the live-swap seam clean.
 *
 * Refs: P19_B3_SCOPE.md §5, P19_B3_PRE_AUDIT.md §A2 + §A6 (Finding 4: seams private,
 * LOW blast radius).
 * ══════════════════════════════════════════════════════════════════════════════
 */

import type {
  OrderPlacer,
  OpenOrderRequest,
  CloseOrderRequest,
  FillResult,
} from './types.js';

/** Returns the per-class fee percentage (e.g. 0.26 for 0.26%) for a symbol. */
export type FeePercentResolver = (symbol: string) => number;

export class PaperOrderPlacer implements OrderPlacer {
  /**
   * @param slippagePercent  Per-unit slippage as a percent (e.g. 0.05 == 0.05%).
   *                         Matches `PaperExecutionEngine.SLIPPAGE_PERCENT`.
   * @param feePercentFor    Per-asset-class fee resolver (B-4.5), e.g.
   *                         `(symbol) => this.feePercentFor(symbol)` from the engine.
   */
  constructor(
    private readonly slippagePercent: number,
    private readonly feePercentFor: FeePercentResolver,
  ) {}

  /**
   * Paper open fill. Buy → effective price is the intended price made WORSE
   * (higher) by slippage%; fee is charged on the filled notional. Always `filled`.
   */
  async openOrder(req: OpenOrderRequest): Promise<FillResult> {
    const slippagePerUnit = req.intendedPrice * (this.slippagePercent / 100);
    const fillPrice = req.intendedPrice + slippagePerUnit; // worse (higher) for a buy
    const notional = fillPrice * req.quantity;
    const feeQuote = notional * (this.feePercentFor(req.symbol) / 100);
    const slippageQuote = slippagePerUnit * req.quantity;
    return {
      status: 'filled',
      fillPrice,
      fillQty: req.quantity,
      feeQuote,
      slippageQuote,
    };
  }

  /**
   * Paper close fill. Sell → effective price is the requested price made WORSE
   * (lower) by slippage%; fee is charged on the filled notional. Always `filled`.
   */
  async closeOrder(req: CloseOrderRequest): Promise<FillResult> {
    const slippagePerUnit = req.requestedPrice * (this.slippagePercent / 100);
    const fillPrice = req.requestedPrice - slippagePerUnit; // worse (lower) for a sell
    const notional = fillPrice * req.quantity;
    const feeQuote = notional * (this.feePercentFor(req.symbol) / 100);
    const slippageQuote = slippagePerUnit * req.quantity;
    return {
      status: 'filled',
      fillPrice,
      fillQty: req.quantity,
      feeQuote,
      slippageQuote,
    };
  }
}

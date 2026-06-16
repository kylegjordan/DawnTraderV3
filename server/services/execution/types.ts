/**
 * ══════════════════════════════════════════════════════════════════════════════
 * P19-B3a — OrderPlacer execution port: TYPE CONTRACT
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The single typed boundary every order — open and close — passes through.
 * Phase 19 (turn paper-active back on) reuses ONE engine for paper and live by
 * extension (P19-B2 Option A); this port is the live-swap seam: the ONLY thing
 * that differs paper↔live is HOW an order gets filled. Everything downstream
 * (position write, P/L, learning capture, exit archive, trade-record update)
 * is mode-generic engine bookkeeping that CONSUMES a `FillResult`.
 *
 * THIN PORT (Langston Step-2, locked): the port wraps ONLY the fill — paper does
 * the slippage+fee math and returns a synchronous atomic `filled`; live (B7) will
 * place a real Kraken order and return the venue's actual async/partial/rejectable
 * fill. The `FillResult` union below carries live's full reality FROM DAY ONE so
 * paper's fill-handling code is already written against the shape live returns —
 * no reshaping at the live cut-over.
 *
 * Lives in `server/services/execution/` so the future live adapter (B7) imports
 * THIS type module without importing the paper adapter (`order-placer.ts`).
 *
 * Refs: P19_B3_SCOPE.md §5 (A2), P19_B3_PRE_AUDIT.md §A2 + §A5 (C3 close-seam rule).
 * ══════════════════════════════════════════════════════════════════════════════
 */

import type { AssetClass } from '../../../shared/asset-classes.js';
import type { BookLevel } from './depth-walk.js';

/**
 * Trading mode. Matches `PaperExecutionEngine.mode` (`'live' | 'paper'`, declared
 * inline at paper-execution-engine.ts:120 — there is no canonical `shared/`
 * TradingMode export; it is redefined locally in several modules). Inlined here
 * to avoid coupling the port to a non-canonical location.
 */
export type ExecutionMode = 'paper' | 'live';

/**
 * The four fill outcomes a real venue can return. Paper today only ever produces
 * `filled` (synchronous, atomic, always-full — see PaperOrderPlacer). The other
 * three are written so live (B7) slots in without reshaping the consumer code.
 *
 * Monetary fields are in QUOTE currency (e.g. USD for BTC/USD). `fillPrice` is
 * the EFFECTIVE per-unit fill price AFTER slippage (i.e. what the position is
 * actually marked at); `slippageQuote`/`feeQuote` are the absolute quote-currency
 * costs already reflected, surfaced for P/L attribution.
 */
export type FillStatus = 'filled' | 'partial' | 'delayed' | 'rejected';

/** Order fully filled at `fillQty`. Paper's only outcome. */
export interface FilledResult {
  status: 'filled';
  /** Effective per-unit fill price after slippage (quote/base). */
  fillPrice: number;
  /** Base-asset quantity actually filled (== requested for `filled`). */
  fillQty: number;
  /** Absolute fee in quote currency. */
  feeQuote: number;
  /** Absolute slippage cost in quote currency already reflected in fillPrice. */
  slippageQuote: number;
}

/** Order partially filled — live reality (thin book). Paper never produces this. */
export interface PartialFillResult {
  status: 'partial';
  fillPrice: number;
  fillQty: number;
  requestedQty: number;
  feeQuote: number;
  slippageQuote: number;
  /** Base-asset quantity NOT filled (requestedQty - fillQty). */
  remainingQty: number;
}

/** Order accepted by the venue but not yet filled (async). Paper never produces this. */
export interface DelayedResult {
  status: 'delayed';
  /** Venue order id to poll for terminal fill. */
  orderRef: string;
  /** ISO timestamp the order was submitted. */
  submittedAt: string;
}

/** Order rejected by the venue (insufficient balance, bad price, halt, etc.). */
export interface RejectedResult {
  status: 'rejected';
  /** Human-readable rejection reason. */
  reason: string;
  /** Venue/error code when available. */
  code?: string;
}

/** Discriminated union over `status` — exhaustiveness-checked at the consumer. */
export type FillResult =
  | FilledResult
  | PartialFillResult
  | DelayedResult
  | RejectedResult;

/** Open-order request. Side is always `buy` today (long-only paper/live). */
export interface OpenOrderRequest {
  symbol: string;
  side: 'buy';
  /** Base-asset quantity to acquire. */
  quantity: number;
  /** Intended (pre-slippage) per-unit entry price the fill is computed from. */
  intendedPrice: number;
  mode: ExecutionMode;
  /** Resolved asset class (drives per-class fee tier); optional — adapter falls back. */
  assetClass?: AssetClass;
  /**
   * P19-B4b.1: ask-side book levels (best-first) for the depth-walked open fill.
   * The engine passes a snapshot AFTER its 24/5 depth-sufficiency gate has passed.
   * Absent/empty → the placer rejects (an open with no book is a bug; the gate
   * should have blocked it). May produce a `partial` if the book moved thinner
   * between gate and fill.
   */
  bookAsks?: BookLevel[];
}

/** Close-order request for an existing position. */
export interface CloseOrderRequest {
  symbol: string;
  side: 'sell';
  /** Base-asset quantity to close (full position today). */
  quantity: number;
  /** Requested (pre-slippage) per-unit exit price the fill is computed from. */
  requestedPrice: number;
  mode: ExecutionMode;
  /** Open-position id being closed — carried for venue mapping + idempotency. */
  positionId: string;
  /** Resolved asset class (drives per-class fee tier); optional — adapter falls back. */
  assetClass?: AssetClass;
  /**
   * P19-B4b.1: bid-side book levels (best-first) for the depth-walked close. The
   * close ALWAYS full-fills (R2 — a market exit always gets out); any remainder
   * beyond the captured book is priced with `beyondDepthPenaltyBps`. When absent
   * (cold book), the close fills at `requestedPrice` worsened by the penalty (if
   * available) + a LOUD log — never a phantom stuck position.
   */
  bookBids?: BookLevel[];
  /**
   * P19-B4b.1: DB-resolved per-class beyond-captured-depth close penalty (bps).
   * NOT a hardcoded constant (Langston Q-A condition). When absent (config missing
   * → fail-closed), the close exits at `requestedPrice` with a loud unavailable log.
   */
  beyondDepthPenaltyBps?: number;
}

/**
 * The order-placement boundary. ONE method per direction; each returns a
 * `FillResult`. Implementations: `PaperOrderPlacer` (B3a, this batch) and a
 * future `LiveOrderPlacer` (B7).
 *
 * ⚠️ CLOSE-SEAM STATE RULE (Langston Step-2 C3 — BINDING): a `closeOrder` that
 * returns a non-`filled` status (or throws, contained) MUST leave the position
 * OPEN with the close NOT recorded — it is retried on the next exit-monitor
 * cycle. A close must NEVER leave a position half-closed / in limbo (close
 * unrecorded but position mutated). The caller is responsible for honoring this:
 * it commits the close-write ONLY on `status === 'filled'`. (Paper always returns
 * `filled`, so this rule is dormant for paper and load-bearing for live.)
 */
export interface OrderPlacer {
  openOrder(req: OpenOrderRequest): Promise<FillResult>;
  closeOrder(req: CloseOrderRequest): Promise<FillResult>;
}

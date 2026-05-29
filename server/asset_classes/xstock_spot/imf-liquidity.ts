/**
 * ════════════════════════════════════════════════════════════════════════════
 * B.1.5 — xstock_spot Depth-Based Log-Liquidity (forked LQ)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * WHY THIS EXISTS (B.1.5 data-integrity gate):
 * Crypto's shared `calculateLogLiquidity` (`core/metrics/imf-metrics.ts:60`) =
 * `log10(avg per-bar USD volume) × 10`, which assumes a deep market where 24h
 * volume is a faithful liquidity proxy. For xStocks that assumption breaks: the
 * per-bar OHLC `volume` (and the ticker 24h `volume`) is the **underlying
 * equity's share volume**, not the tradeable token's. Multiplying by price
 * yields underlying turnover (billions), so the crypto LQ **saturates at ~100
 * for every xStock** → the `LQ ≥ lq_min` gate never rejects → liquidity gating
 * is effectively OFF for an illiquid asset class (the opposite of protective).
 * See `Scope Files/B_1_5_PRE_AUDIT.md` §2 Row-2 + §1 for the verified root cause.
 *
 * WHAT THIS COMPUTES:
 * A liquidity score derived from **live top-of-book order-book depth** — the
 * only trustworthy token-liquidity signal we receive (verified via the
 * `ws-equities` `book` channel = a real CLOB depth ladder; pre-audit §0/O0).
 * Uses **ASK-side** depth-USD (entry-side liquidity for this long-only spot
 * system: you BUY at the ask). 0-100 scale, log10-shaped for **parity with the
 * crypto LQ** so the SIM §8 mental model and threshold semantics carry over.
 *
 * Langston Step-2 Q1 (folded): PURE depth signal — do NOT blend spread.
 * Spread is gated independently via `max_bid_ask_spread`; mixing them conflates
 * two distinct decisions and makes threshold tuning ambiguous.
 *
 * ISOLATION (B.1.5 §3/§4): FORKED module under `xstock_spot/`. Crypto never
 * imports it; the shared `imf-metrics.ts` `calculateLogLiquidity` is left
 * byte-identical, so the crypto LQ path is provably unchanged.
 *
 * Scale reference (recalibrated thresholds land in `screener_filters`, Chunk G):
 *   askDepthUsd $10K  → LQ 40.0
 *   askDepthUsd $50K  → LQ 47.0
 *   askDepthUsd $100K → LQ 50.0
 *   askDepthUsd $500K → LQ 57.0
 *   askDepthUsd $1M   → LQ 60.0
 * ════════════════════════════════════════════════════════════════════════════
 */

/**
 * Depth-based Log-Liquidity for xstock_spot.
 *
 * @param askDepthUsd  Top-of-book ASK-side depth in USD (`ask × ask_qty`),
 *                     i.e. how much can be bought at the best offer right now.
 *                     Caller passes a sentinel <= 0 (or non-finite) when depth
 *                     is unavailable this cycle → returns 0 (treated as "no
 *                     liquidity evidence", which the LQ gate rejects).
 * @returns LQ in [0, 100], log10-shaped for parity with crypto LQ.
 */
export function calculateXstockDepthLQ(askDepthUsd: number): number {
  if (!Number.isFinite(askDepthUsd) || askDepthUsd <= 0) return 0;
  // Parity with crypto's shape: log10(USD + 1) × 10, clamped [0, 100].
  // NOTE: depth-USD is a *stock* (instantaneous top-of-book) not a *flow*
  // (24h volume), so the absolute scale differs from crypto — thresholds are
  // recalibrated per-class in `screener_filters` (B.1.5 Chunk G / R5). The
  // log10 SHAPE is what we preserve for cross-class semantic continuity.
  const rawLQ = Math.log10(askDepthUsd + 1) * 10;
  return Math.min(100, Math.max(0, rawLQ));
}

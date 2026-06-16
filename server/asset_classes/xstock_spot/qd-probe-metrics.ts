/**
 * ════════════════════════════════════════════════════════════════════════════
 * P19-B5c — Q-D (Quote-Depth) probe PURE metrics (#86)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Pure, side-effect-free functions for the continuous Q-D friction probe:
 *   - `floorToCadenceGrid` — D5: the probe-FIRE time floored to the cadence
 *     grid (the dedup bucket key). NOT a function of the snap's captured_at.
 *   - `computeQdMetrics` — derive the on-venue friction row from a raw snap.
 *
 * A1 degenerate-quote policy (Langston Step-1/2 ACK):
 *   - raw bid/ask/qty are stored by the caller regardless; THIS function only
 *     computes the DERIVED metrics + a `quote_quality` classification.
 *   - price metrics (mid/spread_abs/spread_bps) are computed ONLY when the
 *     quote is price-valid (bid>0 ∧ ask>0 ∧ ask≥bid ∧ mid>0); else NULL + a
 *     reason (`crossed` / `zero_bid` / `zero_ask` / `nonpositive_mid`). This
 *     mirrors the `depth-source.ts` fill-path price gate.
 *   - depth metrics are computed ONLY when depth-valid (bid_qty>0 ∧ ask_qty>0);
 *     a price-valid but zero/missing-size quote is tagged `zero_depth` (spread
 *     IS still computed — it's a real spread; only depth is absent). Mirrors the
 *     `depth-source.ts` requirement (bid_qty>0 ∧ ask_qty>0). This is the
 *     distinction friction-extraction needs: "thin-but-present" vs "zero-depth".
 *
 * No DB, no clock — the fire time is passed in so the bucket grid + staleness
 * are deterministic and unit-testable.
 * ════════════════════════════════════════════════════════════════════════════
 */

export type QdQuoteQuality =
  | 'ok'
  | 'crossed'          // ask < bid (both > 0) — inverted book
  | 'zero_bid'         // bid ≤ 0 / missing
  | 'zero_ask'         // ask ≤ 0 / missing
  | 'nonpositive_mid'  // defensive — (bid+ask)/2 ≤ 0
  | 'zero_depth'       // price-valid but bid_qty ≤ 0 or ask_qty ≤ 0 / missing
  | 'no_snap';         // no ticker_snap row at all (caller skips the write per D7)

/** The raw top-of-book read from `xstock_spot_ticker_snap` (numbers already parsed). */
export interface QdRawSnap {
  bid: number | null;
  ask: number | null;
  bidQty: number | null;
  askQty: number | null;
  /** epoch ms of the snap's `captured_at`; null if unknown. */
  capturedAtMs: number | null;
}

/** The derived friction metrics written to `xstock_qd_probe_history`. */
export interface QdMetrics {
  mid: number | null;
  spreadAbs: number | null;
  spreadBps: number | null;
  bidDepthNotional: number | null;
  askDepthNotional: number | null;
  snapAgeMs: number | null;
  stale: boolean;
  quoteQuality: QdQuoteQuality;
}

/**
 * D5: floor the probe-fire instant to the cadence grid (UTC). The result is the
 * `bucket_start` dedup key — a regular grid independent of when the snap was
 * captured, so a feed gap yields one honest (stale) row PER bucket, not one
 * collapsed row.
 */
export function floorToCadenceGrid(fireTimeMs: number, cadenceMinutes: number): Date {
  if (!Number.isFinite(cadenceMinutes) || cadenceMinutes <= 0) {
    throw new Error(`[qd-probe-metrics] invalid cadenceMinutes=${cadenceMinutes}`);
  }
  const gridMs = cadenceMinutes * 60_000;
  return new Date(Math.floor(fireTimeMs / gridMs) * gridMs);
}

const DEGENERATE_PRICE: Omit<QdMetrics, 'snapAgeMs' | 'stale' | 'quoteQuality'> = {
  mid: null,
  spreadAbs: null,
  spreadBps: null,
  bidDepthNotional: null,
  askDepthNotional: null,
};

/**
 * Derive the friction metrics + quote_quality classification from a raw snap.
 * Pure. `snap === null` → the `no_snap` sentinel (caller skips writing a row
 * per D7 and increments the skipped-symbol count).
 */
export function computeQdMetrics(
  snap: QdRawSnap | null,
  fireTimeMs: number,
  freshnessCeilingMs: number,
): QdMetrics {
  if (snap === null) {
    return { ...DEGENERATE_PRICE, snapAgeMs: null, stale: false, quoteQuality: 'no_snap' };
  }

  const { bid, ask, bidQty, askQty, capturedAtMs } = snap;
  const snapAgeMs = capturedAtMs !== null ? Math.max(0, fireTimeMs - capturedAtMs) : null;
  const stale = snapAgeMs !== null ? snapAgeMs > freshnessCeilingMs : false;

  // ── Price-validity gate (mirrors depth-source.ts: bid>0 ∧ ask>0) ──────────
  if (bid === null || !(bid > 0)) {
    return { ...DEGENERATE_PRICE, snapAgeMs, stale, quoteQuality: 'zero_bid' };
  }
  if (ask === null || !(ask > 0)) {
    return { ...DEGENERATE_PRICE, snapAgeMs, stale, quoteQuality: 'zero_ask' };
  }
  if (ask < bid) {
    return { ...DEGENERATE_PRICE, snapAgeMs, stale, quoteQuality: 'crossed' };
  }
  const mid = (bid + ask) / 2;
  if (!(mid > 0)) {
    return { ...DEGENERATE_PRICE, snapAgeMs, stale, quoteQuality: 'nonpositive_mid' };
  }

  const spreadAbs = ask - bid;
  const spreadBps = (spreadAbs / mid) * 10_000;

  // ── Depth-validity gate (mirrors depth-source.ts: bid_qty>0 ∧ ask_qty>0) ──
  const depthValid =
    bidQty !== null && askQty !== null && bidQty > 0 && askQty > 0;

  return {
    mid,
    spreadAbs,
    spreadBps,
    bidDepthNotional: depthValid ? bid * (bidQty as number) : null,
    askDepthNotional: depthValid ? ask * (askQty as number) : null,
    snapAgeMs,
    stale,
    // Price is valid here; only depth may be missing → 'zero_depth' (spread kept).
    quoteQuality: depthValid ? 'ok' : 'zero_depth',
  };
}

/**
 * B-ATR-BAD-PRINT (#1153) — THE one Average True Range for every trading decision.
 *
 * WHY THIS EXISTS. Six copies of a plain 14-bar true-range mean fed live decisions (the MCE value behind
 * every stop/target/reach check and `atr_at_open`, strategy-engine, strategy-helpers, and three DBS copies).
 * A single off-market print in one Kraken 60-minute candle carried the whole value: GBP/USD's 2026-09-23
 * 20:00Z bar printed a high of 1.70000 against ~1.324 and set a 5.42 % target on a currency; LIGHTER's
 * 2026-09-30 04:00Z bar printed a low of 0.110 against ~3.7 and set a 30 % target. Record and evidence:
 * `Claude Comms and Packages/Scope Files/B_ATR_BAD_PRINT_PRE_AUDIT.md`.
 *
 * THE ESTIMATOR (E3, "returned-wick clip"; chosen by a pre-registered test and ruled by Langston, §1d):
 *   1. take the last `period + 1` bars and their `period` true ranges;
 *   2. m = the MEDIAN of those true ranges;
 *   3. clip each bar's high to `max(open, close) + WICK_CLIP_MULTIPLE × m` and its low to
 *      `min(open, close) − WICK_CLIP_MULTIPLE × m` — the bar's own BODY ± 3 typical ranges;
 *   4. return the plain mean of the true ranges of the clipped bars.
 * An off-market print is a wick the price does not stay at, so it is clipped. A real move moves the CLOSE,
 * and the clip never touches a close or a previous close, so a genuine move — a sweep that holds, a gap,
 * several wide bars in a row — passes through unchanged. The judgement uses only the pair's OWN recent
 * bars, never a second venue (the binding plausibility rule, RUNNING_ISSUES ~:5770).
 * DELIBERATELY NOT DONE: it never reads a later bar (no look-ahead), and it does not dampen genuine
 * volatility. Measured: 128 ordinary paper opens changed by at most 1.34 %; GBP/USD's spike 13.36× → 1.15×.
 *
 * "NOT ENOUGH DATA" IS NaN HERE. Fewer than `period + 1` bars, or any non-finite input ⇒ NaN. Each caller
 * maps that to the invalid sentinel it already fails closed on (see `atrOrZero`), so no downstream
 * contract changes. NOT Wilder's smoothing — a plain mean, as every copy it replaces was.
 */

/** The clip, in multiples of the window's median true range. Provenance: the pre-registered test (§0 of
 *  the pre-audit); changing it requires re-running that test. */
export const WICK_CLIP_MULTIPLE = 3;

/** The minimal candle shape. Strings are accepted because `price_data` rows carry decimals as strings. */
export interface AtrBar {
  open: number | string;
  high: number | string;
  low: number | string;
  close: number | string;
}

interface NumBar { open: number; high: number; low: number; close: number; }

function toNum(b: AtrBar): NumBar {
  return { open: Number(b.open), high: Number(b.high), low: Number(b.low), close: Number(b.close) };
}

/** True range of `bar` given the previous close: max(H − L, |H − prevC|, |L − prevC|). */
export function trueRange(high: number, low: number, prevClose: number): number {
  return Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * The shared ATR (E3). Returns NaN when there are fewer than `period + 1` bars or any value in the window
 * is not finite.
 */
export function computeAtr(bars: readonly AtrBar[], period: number = 14): number {
  if (!Number.isInteger(period) || period < 1 || bars.length < period + 1) return NaN;
  const w = bars.slice(-(period + 1)).map(toNum);
  for (const b of w) {
    if (!Number.isFinite(b.open) || !Number.isFinite(b.high) || !Number.isFinite(b.low) || !Number.isFinite(b.close)) {
      return NaN;
    }
  }
  const raw: number[] = [];
  for (let i = 1; i < w.length; i++) raw.push(trueRange(w[i].high, w[i].low, w[i - 1].close));
  const m = median(raw);
  const span = WICK_CLIP_MULTIPLE * m;
  let sum = 0;
  for (let i = 1; i < w.length; i++) {
    const b = w[i];
    const top = Math.max(b.open, b.close);
    const bottom = Math.min(b.open, b.close);
    const high = Math.min(b.high, top + span);
    const low = Math.max(b.low, bottom - span);
    sum += trueRange(high, low, w[i - 1].close);
  }
  return sum / period;
}

/** For callers whose existing contract is "0 means no usable ATR": NaN (not enough data, bad input) ⇒ 0. */
export function atrOrZero(bars: readonly AtrBar[], period: number = 14): number {
  const a = computeAtr(bars, period);
  return Number.isFinite(a) && a > 0 ? a : 0;
}

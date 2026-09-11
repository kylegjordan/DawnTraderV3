/**
 * ═══════════════════════════════════════════════════════════════════════
 * B-OHLC-FRAME-GUARD (#1028) — the OHLC frame validator
 * ═══════════════════════════════════════════════════════════════════════
 *
 * WHAT IT ENFORCES — VALUE-LEVEL STORABILITY AND AGGREGATABILITY: every value in an admitted bar is one
 * its database column accepts (so no single VALUE makes PG reject the row and drop the 1,000-row chunk
 * it rides in) and one a reader can aggregate (no stored NaN — `max(1, NaN, 5)` is NaN). Before this,
 * one bad value either dropped the whole chunk or landed a NaN. Reference:
 * B_OHLC_FRAME_GUARD_PRE_AUDIT.md §2 (A1, A2, A16) and §P1.
 *
 * ⛔ WHAT IT DOES *NOT* ENFORCE — ROW ROUTING. `intervalBegin` only has to be a finite time (scope option
 * (c): no plausibility rule), and the four OHLC tables are RANGE-partitioned on it with NO DEFAULT
 * partition. A finite time outside every partition — a seconds-for-milliseconds unit change, say —
 * passes this validator, and PG still rejects the row ("no partition of relation … found for row") and
 * the writer drops its whole chunk. Measured at the sink 2026-09-11 (Langston, Step 4: a `1970-01-21`
 * bar into `crypto_spot_ohlc_1m`). Forward coverage is the partition creators' job and is monitored; a
 * malformed stamp landing outside the range entirely is covered by neither. Homed as `#1036`.
 *
 * ⛔ THE STRING PATH IS GATED ON THE *UNTRIMMED* STRING, AND THE REASON IS MEASURED, NOT ASSUMED
 * (Step-2 condition C1: the validator's acceptor must be the sink's acceptor). Probed on PG 17.6,
 * 2026-09-11, with `pg_input_is_valid` against `numeric(20,8)` and `numeric(28,8)`, cross-checked
 * by real casts, known-valid and known-invalid controls first —
 * `scripts/analysis/b_ohlc_frame_guard_sink_acceptor_probe.sql`:
 *   • `Number()` strips Unicode whitespace the database does NOT: `'12 '`, `'﻿12'` and
 *     `'　12'` all read as 12 in JS and are REJECTED by PG. A trim-then-check would admit
 *     them, store `String(original)`, and drop the chunk — this batch's own premise.
 *   • `0x10`, `0b101`, `0o17` (either case) are ACCEPTED by PG with the value JS reads, so they
 *     were never a chunk-drop hazard. They are rejected here anyway: a venue never sends them, and
 *     a plain-decimal acceptor is a subset of the sink's that a reader can check by eye.
 *   • Inside PLAIN_DECIMAL the only PG rejection probed is `numeric(x,8)` overflow after rounding
 *     (`999999999999.999999995`), and JS parses those to the bound itself, so step (4) rejects them.
 *
 * ⚠️ BYTE-IDENTITY HOLDS TO 8 DECIMAL PLACES ONLY. A valid value is kept as `String(original)`,
 * never `String(Number(v))`, but PG rounds anything finer than `numeric(x,8)` on the way in.
 *
 * Zero and negatives are ADMITTED. There is NO time-plausibility rule (scope option (c)).
 * An absent volume is defaulted to '0' by the producer BEFORE this runs (J6; the conflation is `#1033`).
 */

/** The closed set of reasons, shared by the skip log and the tests.
 *  `not_decimal` was added at Step 3: condition C1 introduced step (1b), and its failure needs a name.
 *  `not_number_or_string` means the field failed its TYPE GATE — for `symbol` that gate is "a string". */
export const OHLC_FRAME_REJECT_REASONS = [
  'absent',
  'not_number_or_string',
  'empty',
  'not_decimal',
  'not_finite',
  'out_of_range',
  'not_integer',
  'invalid_time',
] as const;
export type OhlcFrameRejectReason = (typeof OHLC_FRAME_REJECT_REASONS)[number];

/** The raw values as each producer sources them, AFTER its existing absence defaults. */
export interface OhlcFrameInput {
  symbol: unknown;
  intervalBegin: unknown;
  open: unknown;
  high: unknown;
  low: unknown;
  close: unknown;
  volume: unknown;
  vwap: unknown;
  trades: unknown;
}
export type OhlcFrameField = keyof OhlcFrameInput;

export interface ValidOhlcRow {
  symbol: string;
  intervalBegin: Date;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  vwap: string | null;
  tradeCount: number | null;
}

export type OhlcFrameVerdict =
  | { ok: true; row: ValidOhlcRow }
  | { ok: false; field: OhlcFrameField; reason: OhlcFrameRejectReason };

/** `numeric(20,8)` holds |v| < 10^12 (open/high/low/close/vwap); `numeric(28,8)` holds |v| < 10^20 (volume). */
export const PRICE_ABS_BOUND = 1e12;
export const VOLUME_ABS_BOUND = 1e20;
const INT4_MIN = -2_147_483_648;
const INT4_MAX = 2_147_483_647;

/** ASCII digits only (`\d` without the `u` flag), optional sign, optional exponent, NO whitespace. */
const PLAIN_DECIMAL = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

type Checked<T> = { ok: true; value: T } | { ok: false; reason: OhlcFrameRejectReason };

/** Steps (1)-(4) for one numeric field: type gate, decimal gate (strings), parse, finite, bound.
 *  `text` is what gets stored; `n` is what was bounded. */
function checkNumeric(v: unknown, bound: number | null): Checked<{ text: string; n: number }> {
  if (v === undefined || v === null) return { ok: false, reason: 'absent' };
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return { ok: false, reason: 'not_finite' };
    if (bound !== null && Math.abs(v) >= bound) return { ok: false, reason: 'out_of_range' };
    return { ok: true, value: { text: String(v), n: v } };
  }
  if (typeof v !== 'string') return { ok: false, reason: 'not_number_or_string' };
  if (v.trim() === '') return { ok: false, reason: 'empty' };
  if (!PLAIN_DECIMAL.test(v)) return { ok: false, reason: 'not_decimal' };
  const n = Number(v);
  if (!Number.isFinite(n)) return { ok: false, reason: 'not_finite' };
  if (bound !== null && Math.abs(n) >= bound) return { ok: false, reason: 'out_of_range' };
  return { ok: true, value: { text: v, n } };
}

/** Step (6): a number or non-empty string that parses to a finite time. */
function checkTime(v: unknown): Checked<Date> {
  if (v === undefined || v === null) return { ok: false, reason: 'absent' };
  if (typeof v !== 'number' && typeof v !== 'string') return { ok: false, reason: 'not_number_or_string' };
  if (typeof v === 'string' && v.trim() === '') return { ok: false, reason: 'empty' };
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? { ok: true, value: d } : { ok: false, reason: 'invalid_time' };
}

/** Pure and non-throwing. The first failing field, in the order below, is the one reported. */
export function validateOhlcFrame(input: OhlcFrameInput): OhlcFrameVerdict {
  // (0) symbol — absorbs the producers' old truthiness check, so a silent return becomes a counted skip.
  const sym = input.symbol;
  if (sym === undefined || sym === null) return { ok: false, field: 'symbol', reason: 'absent' };
  if (typeof sym !== 'string') return { ok: false, field: 'symbol', reason: 'not_number_or_string' };
  if (sym.length === 0) return { ok: false, field: 'symbol', reason: 'empty' };

  // (6) intervalBegin — checked second so that every rejected VALUE still has a bar identity.
  const t = checkTime(input.intervalBegin);
  if (!t.ok) return { ok: false, field: 'intervalBegin', reason: t.reason };

  const open = checkNumeric(input.open, PRICE_ABS_BOUND);
  if (!open.ok) return { ok: false, field: 'open', reason: open.reason };
  const high = checkNumeric(input.high, PRICE_ABS_BOUND);
  if (!high.ok) return { ok: false, field: 'high', reason: high.reason };
  const low = checkNumeric(input.low, PRICE_ABS_BOUND);
  if (!low.ok) return { ok: false, field: 'low', reason: low.reason };
  const close = checkNumeric(input.close, PRICE_ABS_BOUND);
  if (!close.ok) return { ok: false, field: 'close', reason: close.reason };

  const volume = checkNumeric(input.volume, VOLUME_ABS_BOUND);
  if (!volume.ok) return { ok: false, field: 'volume', reason: volume.reason };

  // vwap is nullable: absent maps to null, exactly as the producers map it today.
  let vwap: string | null = null;
  if (input.vwap !== undefined && input.vwap !== null) {
    const c = checkNumeric(input.vwap, PRICE_ABS_BOUND);
    if (!c.ok) return { ok: false, field: 'vwap', reason: c.reason };
    vwap = c.value.text;
  }

  // (5) trades — null passes; otherwise an integer inside int4.
  let tradeCount: number | null = null;
  if (input.trades !== undefined && input.trades !== null) {
    const c = checkNumeric(input.trades, null);
    if (!c.ok) return { ok: false, field: 'trades', reason: c.reason };
    if (!Number.isInteger(c.value.n)) return { ok: false, field: 'trades', reason: 'not_integer' };
    if (c.value.n < INT4_MIN || c.value.n > INT4_MAX) return { ok: false, field: 'trades', reason: 'out_of_range' };
    tradeCount = c.value.n;
  }

  return {
    ok: true,
    row: {
      symbol: sym,
      intervalBegin: t.value,
      open: open.value.text,
      high: high.value.text,
      low: low.value.text,
      close: close.value.text,
      volume: volume.value.text,
      vwap,
      tradeCount,
    },
  };
}

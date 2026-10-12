/**
 * `B-PRICE-STALENESS-BOUND` P4 — `B-PRICE-SIDE-BY-JOB` row 8g-bis, moved here by Langston's Step-2 ruling (2026-10-10).
 *
 * THE STORED-ROW TRIPWIRE, carried from `#951`'s retirement (`B_PRICE_AGE_TRUTH_COMPLETION_REPORT.md` §9b, Langston
 * 2026-09-11 20:33Z, condition 1). A standing invariant on WRITTEN `closed_trades` rows — a different object from 8g's
 * runtime gate, and the reason it reads the TABLE rather than hooking a write path: a proof by construction covers the
 * code path, not a row written by some other path. Any row whose exit was priced by the rate-limited re-serve
 * (`exit_price_producer = 'kraken_rest_rate_limited_reserve'`) fires when:
 *   (a) `exit_observed_at_ms` is null — the honest stamp did not reach the row;
 *   (b) the stamp is implausibly YOUNG at close (< `RESERVE_MIN_HONEST_AGE_MS`, including equal to the close instant or
 *       after it) — a re-stamp at close, the `#743` launder. Langston Step-4 gate 2, call 2: exact equality is the
 *       degenerate case; the youngest honest re-serve on record is 936 ms, so a 100 ms floor false-positives nothing
 *       that exists;
 *   (c) `exit_price_source` is anything other than `kraken_rest` (a NULL source included) — the literal was rewritten;
 *   (d) on an exit the engine DECIDED (any close reason outside `OPERATOR_CLOSE_REASONS`), the stamp is older at close
 *       than D6's exit window plus the measured booking latency (`closed_at − exit_observed_at_ms` >
 *       `CRYPTO_EXIT_PRICE_MAX_AGE_MS + RESERVE_CLOSE_LATENCY_ALLOWANCE_MS`) — an autonomous exit booked on a stale re-serve
 *       (Langston gate 2, condition 1; narrowed at Step 8, 2026-10-12). Age-at-close is an UPPER bound on decision-time
 *       age: it includes the evaluate-and-book latency, so the window carries an allowance. An OPERATOR close (flatten,
 *       reset, manual, stop reconcile, stranded clear) is deliberately ungated by 8g and records its age on the row, so
 *       (d) does not judge it — on the 8 reserve rows on record, 6 are `reset` at 1.9-4.0 s and the unnarrowed arm fired
 *       on 6 of 8 honest rows (Langston's Step-8 FINDING). The set is NAMED; an unknown reason is judged (fails toward firing).
 * ✅ The residual `B-PRICE-AGE-TRUTH` left unproven — that the honest stamp reaches `closed_trades` — is DISCHARGED
 * POSITIVELY (Langston, 2026-10-11; re-derived by him 2026-10-12): all 8 `kraken_rest_rate_limited_reserve` rows on
 * staging (`paper`, 2026-09-22 → 2026-10-06) carry a non-null stamp, source `kraken_rest`, and 936-4,553 ms of age. On the
 * narrowed arm (d) exactly ONE fires: the autonomous SUI close at 4,553 ms — a pre-8g exit decided on a stale re-serve, the
 * class 8g now prevents. (A 9th reserve-priced row, AMC/USD `xstock_rest_gate_reserve`, is another producer, outside.)
 * The run line prints how many reserve rows it CHECKED, so a zero is read against its population, never as a pass — and
 * it is checked only while the engine runs.
 */
import { CRYPTO_EXIT_PRICE_MAX_AGE_MS } from '../core/trading/exit-price-age.js';

export const RESERVE_PRODUCER = 'kraken_rest_rate_limited_reserve';
/** Below this age at close a re-served stamp is implausible — a re-stamp, not an observation. */
export const RESERVE_MIN_HONEST_AGE_MS = 100;
/** Measured booking latency on decided exits: across 215 paper crypto closes with a FRESH WebSocket price (`kraken_ws_book_mid`
 *  171, `kraken_ws_ticker_mid` 44; close reasons stop/target/trailing/max-holding), age at close was median ~0.2 s, p99
 *  0.93 s, max 1,263 ms (read 2026-10-12). 1,500 ms covers the observed maximum. */
export const RESERVE_CLOSE_LATENCY_ALLOWANCE_MS = 1500;
/** Close reasons an OPERATOR (or a reconciler acting for one) writes — 8g does not gate them, so arm (d) does not judge them. */
export const OPERATOR_CLOSE_REASONS: ReadonlySet<string> = new Set([
  'reset', 'hard_reset', 'manual', 'manual_stop', 'engine_stop_cleanup', 'stranded_clear', 'stranded_trades_cleared', 'guardrail', 'never_filled',
]);
/** At most this many alerts per run; the rest are counted on the run line (a systematic break mints one row per trade). */
export const RESERVE_TRIPWIRE_MAX_ALERTS_PER_RUN = 20;

export type ReserveRowViolation = 'null_stamp' | 'stamp_too_young' | 'wrong_source' | 'stale_at_close';

export interface ReserveRow {
  id: string;
  symbol: string;
  exit_observed_at_ms: number | string | null;
  closed_at: Date | string | null;
  exit_price_source: string | null;
  close_reason: string | null;
}

/** PURE. The violations one stored reserve row carries (empty = it honours the invariant), and its age at close. */
export function classifyReserveRow(r: ReserveRow): { violations: ReserveRowViolation[]; ageAtCloseMs: number | null } {
  const out: ReserveRowViolation[] = [];
  const stamp = r.exit_observed_at_ms === null ? null : Number(r.exit_observed_at_ms);
  const closeMs = r.closed_at === null ? NaN : new Date(r.closed_at).getTime();
  let ageAtCloseMs: number | null = null;
  if (stamp === null || !Number.isFinite(stamp)) out.push('null_stamp');
  else if (Number.isFinite(closeMs)) {
    ageAtCloseMs = closeMs - stamp;
    if (ageAtCloseMs < RESERVE_MIN_HONEST_AGE_MS) out.push('stamp_too_young');
    else if (ageAtCloseMs > CRYPTO_EXIT_PRICE_MAX_AGE_MS + RESERVE_CLOSE_LATENCY_ALLOWANCE_MS && !OPERATOR_CLOSE_REASONS.has(r.close_reason ?? '')) {
      out.push('stale_at_close');
    }
  }
  if (r.exit_price_source !== 'kraken_rest') out.push('wrong_source');
  return { violations: out, ageAtCloseMs };
}

export interface ReserveTripwireDeps {
  /** Reserve rows of this mode closed at or after `sinceMs`. */
  listReserveRows: (mode: string, sinceMs: number) => Promise<ReserveRow[]>;
  addAlert: (a: Record<string, unknown>) => Promise<unknown>;
}

export interface ReserveTripwireResult {
  checked: number;
  violating: Array<{ id: string; symbol: string; closeReason: string | null; violations: ReserveRowViolation[]; ageAtCloseMs: number | null }>;
  alerted: number;
  /** Violating rows NOT alerted this run because the per-run cap was reached. */
  overCap: number;
}

/** Run once: classify every reserve row closed since `sinceMs`; one alert per violating row (dedupe key per row). */
export async function runReserveRowTripwire(mode: string, sinceMs: number, deps: ReserveTripwireDeps): Promise<ReserveTripwireResult> {
  const rows = await deps.listReserveRows(mode, sinceMs);
  const violating: ReserveTripwireResult['violating'] = [];
  let alerted = 0;
  for (const r of rows) {
    const { violations, ageAtCloseMs } = classifyReserveRow(r);
    if (violations.length === 0) continue;
    violating.push({ id: r.id, symbol: r.symbol, closeReason: r.close_reason, violations, ageAtCloseMs });
    if (alerted >= RESERVE_TRIPWIRE_MAX_ALERTS_PER_RUN) continue;
    alerted++;
    await deps.addAlert({
      triggers_at: new Date(), category: 'breakage', severity: 'warning',
      title: `Closed trade ${r.symbol} (${r.close_reason ?? 'no close reason'}) was priced by a re-served quote that breaks the age invariant`,
      body: `A ${mode} closed trade (${r.id}, close_reason ${r.close_reason ?? 'null'}) exited on the rate-limited re-serve, and its stored row breaks the invariant: ${violations.join(', ')}${ageAtCloseMs !== null ? ` (stamp ${ageAtCloseMs} ms before close — an upper bound on its age at decision)` : ''}. The honest observation time must reach closed_trades unrefreshed, and a decided exit must close inside D6's ${CRYPTO_EXIT_PRICE_MAX_AGE_MS} ms window plus ${RESERVE_CLOSE_LATENCY_ALLOWANCE_MS} ms booking latency (B-PRICE-STALENESS-BOUND P4, row 8g-bis; #951 §9b).`,
      metadata: { tradeId: r.id, symbol: r.symbol, mode, closeReason: r.close_reason, violations, ageAtCloseMs, exitObservedAtMs: r.exit_observed_at_ms, closedAt: r.closed_at, exitPriceSource: r.exit_price_source },
      dedupe_key: `reserve-row-tripwire-${r.id}`,
    });
  }
  return { checked: rows.length, violating, alerted, overCap: violating.length - alerted };
}

/** The production query: the stored columns only. */
export async function listReserveRowsFromDb(mode: string, sinceMs: number): Promise<ReserveRow[]> {
  const { db } = await import('../db.js');
  const { sql } = await import('drizzle-orm');
  const res = await db.execute(sql`SELECT id, symbol, exit_observed_at_ms, closed_at, exit_price_source, close_reason
    FROM closed_trades
    WHERE mode = ${mode} AND exit_price_producer = ${RESERVE_PRODUCER}
      AND closed_at IS NOT NULL AND closed_at >= ${new Date(sinceMs).toISOString()}::timestamptz`);
  return ((res as unknown as { rows?: ReserveRow[] }).rows ?? []) as ReserveRow[];
}

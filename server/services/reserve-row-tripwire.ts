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
 *   (d) the stamp is older than D6's exit window at close (`closed_at − exit_observed_at_ms` >
 *       `CRYPTO_EXIT_PRICE_MAX_AGE_MS`) — an exit booked on a stale re-serve, on ANY path (Langston gate 2, condition 1).
 *       It is the only arm that reaches the operator closes 8g deliberately does not gate. ⚠️ Age-at-close is an UPPER
 *       BOUND on the age at decision time: it includes the evaluate-and-book latency.
 * ✅ The residual `B-PRICE-AGE-TRUTH` left unproven — that the honest stamp reaches `closed_trades` — is DISCHARGED
 * POSITIVELY (Langston, 2026-10-11): all 8 reserve-priced rows on staging (`paper`, 2026-09-22 → 2026-10-06) carry a
 * non-null stamp, source `kraken_rest`, and 936-4,553 ms of honest age. The invariant is still held.
 * The run line prints how many reserve rows it CHECKED, so a zero is read against its population, never as a pass — and
 * it is checked only while the engine runs.
 */
import { CRYPTO_EXIT_PRICE_MAX_AGE_MS } from '../core/trading/exit-price-age.js';

export const RESERVE_PRODUCER = 'kraken_rest_rate_limited_reserve';
/** Below this age at close a re-served stamp is implausible — a re-stamp, not an observation. */
export const RESERVE_MIN_HONEST_AGE_MS = 100;
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
    else if (ageAtCloseMs > CRYPTO_EXIT_PRICE_MAX_AGE_MS) out.push('stale_at_close');
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
      body: `A ${mode} closed trade (${r.id}, close_reason ${r.close_reason ?? 'null'}) exited on the rate-limited re-serve, and its stored row breaks the invariant: ${violations.join(', ')}${ageAtCloseMs !== null ? ` (stamp ${ageAtCloseMs} ms before close — an upper bound on its age at decision)` : ''}. The honest observation time must reach closed_trades unrefreshed and inside D6's ${CRYPTO_EXIT_PRICE_MAX_AGE_MS} ms exit window (B-PRICE-STALENESS-BOUND P4, row 8g-bis; #951 §9b).`,
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

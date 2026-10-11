/**
 * `B-PRICE-STALENESS-BOUND` P4 — `B-PRICE-SIDE-BY-JOB` row 8g-bis, moved here by Langston's Step-2 ruling (2026-10-10).
 *
 * THE STORED-ROW TRIPWIRE, carried from `#951`'s retirement (`B_PRICE_AGE_TRUTH_COMPLETION_REPORT.md` §9b, Langston
 * 2026-09-11 20:33Z, condition 1). A standing invariant on WRITTEN `closed_trades` rows — a different object from 8g's
 * runtime gate, and the reason it reads the TABLE rather than hooking a write path: a proof by construction covers the
 * code path, not a row written by some other path. Any row whose exit was priced by the rate-limited re-serve
 * (`exit_price_producer = 'kraken_rest_rate_limited_reserve'`) fires when:
 *   (a) `exit_observed_at_ms` is null — the honest stamp did not reach the row;
 *   (b) `exit_observed_at_ms` equals its close instant (to the millisecond) — a re-stamp at close, the `#743` launder;
 *   (c) `exit_price_source` is anything other than `kraken_rest` — the re-serve's source literal was rewritten.
 * ⚠️ It carries the residual `B-PRICE-AGE-TRUTH` left UNPROVEN: that the honest stamp ever reaches `closed_trades`. A
 * clean run over an EMPTY arm proves nothing — the run line prints how many reserve rows it checked, so a zero is read
 * against its population, never as a pass.
 */
export const RESERVE_PRODUCER = 'kraken_rest_rate_limited_reserve';

export type ReserveRowViolation = 'null_stamp' | 'stamp_equals_close' | 'wrong_source';

export interface ReserveRow {
  id: string;
  symbol: string;
  exit_observed_at_ms: number | string | null;
  closed_at: Date | string | null;
  exit_price_source: string | null;
}

/** PURE. The violations one stored reserve row carries (empty = it honours the invariant). */
export function classifyReserveRow(r: ReserveRow): ReserveRowViolation[] {
  const out: ReserveRowViolation[] = [];
  const stamp = r.exit_observed_at_ms === null ? null : Number(r.exit_observed_at_ms);
  if (stamp === null || !Number.isFinite(stamp)) out.push('null_stamp');
  else if (r.closed_at !== null) {
    const closeMs = new Date(r.closed_at).getTime();
    if (Number.isFinite(closeMs) && Math.floor(stamp) === Math.floor(closeMs)) out.push('stamp_equals_close');
  }
  if (r.exit_price_source !== 'kraken_rest') out.push('wrong_source');
  return out;
}

export interface ReserveTripwireDeps {
  /** Reserve rows of this mode closed at or after `sinceMs`. */
  listReserveRows: (mode: string, sinceMs: number) => Promise<ReserveRow[]>;
  addAlert: (a: Record<string, unknown>) => Promise<unknown>;
}

/** Run once: classify every reserve row closed since `sinceMs`; one alert per violating row (dedupe key per row). */
export async function runReserveRowTripwire(
  mode: string, sinceMs: number, deps: ReserveTripwireDeps,
): Promise<{ checked: number; violating: Array<{ id: string; symbol: string; violations: ReserveRowViolation[] }> }> {
  const rows = await deps.listReserveRows(mode, sinceMs);
  const violating: Array<{ id: string; symbol: string; violations: ReserveRowViolation[] }> = [];
  for (const r of rows) {
    const v = classifyReserveRow(r);
    if (v.length === 0) continue;
    violating.push({ id: r.id, symbol: r.symbol, violations: v });
    await deps.addAlert({
      triggers_at: new Date(), category: 'breakage', severity: 'warning',
      title: `Closed trade ${r.symbol} was priced by a re-served quote whose age did not survive to the record`,
      body: `A ${mode} closed trade (${r.id}) exited on the rate-limited re-serve, and its stored row breaks the invariant: ${v.join(', ')}. The honest observation time must reach closed_trades unrefreshed (B-PRICE-STALENESS-BOUND P4, row 8g-bis; #951 §9b).`,
      metadata: { tradeId: r.id, symbol: r.symbol, mode, violations: v, exitObservedAtMs: r.exit_observed_at_ms, closedAt: r.closed_at, exitPriceSource: r.exit_price_source },
      dedupe_key: `reserve-row-tripwire-${r.id}`,
    });
  }
  return { checked: rows.length, violating };
}

/** The production query: the stored columns only. */
export async function listReserveRowsFromDb(mode: string, sinceMs: number): Promise<ReserveRow[]> {
  const { db } = await import('../db.js');
  const { sql } = await import('drizzle-orm');
  const res = await db.execute(sql`SELECT id, symbol, exit_observed_at_ms, closed_at, exit_price_source
    FROM closed_trades
    WHERE mode = ${mode} AND exit_price_producer = ${RESERVE_PRODUCER}
      AND closed_at IS NOT NULL AND closed_at >= ${new Date(sinceMs).toISOString()}::timestamptz`);
  return ((res as unknown as { rows?: ReserveRow[] }).rows ?? []) as ReserveRow[];
}

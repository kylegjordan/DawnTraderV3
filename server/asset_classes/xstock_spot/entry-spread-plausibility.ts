/**
 * B-XSTOCK-BID-TRIGGER-RELAND increment A, P3 (objective 3, was row 41 / `#996`) — ENTRY PLAUSIBILITY FOR AN xSTOCK WE
 * DO NOT HOLD.
 *
 * WHY. The entry gate's book-state check reaches only `absent_bid` / `absent_ask` for a symbol with no comparator (the
 * comparator has ONE writer, the exit loop, keyed on held positions), so a collapsed-but-positive bid or a stub ask on an
 * unheld name passed. Seeding the comparator at entry was refused (a second writer to SIM S25).
 *
 * THE TEST. Refuse the entry when the CURRENT spread > max(kRel × YARDSTICK, floor_pct / 100) — the same threshold form as
 * the exit guard's one-side arms, from the same knobs. The YARDSTICK is the symbol's OWN normal spread: the median spread
 * of its last N REGULAR-SESSION two-sided snapshots (`is_extended_hours = false`), N = the guard's
 * `trailing_spread_window_snaps`.
 * ⛔⛔ ONE YARDSTICK, AND THE RETAINED RING IS NOT IT (Langston, Step 4 gate 2 BLOCKER-1). An earlier build preferred the
 *   exit guard's live retained ring. A ring holds whatever HOUR the symbol last held a plausible chain, so it is not
 *   hour-invariant: measured over all 95 durable rings, 86 were wider than the symbol's regular-session median and 32
 *   lifted the threshold above the 1% floor (worst 53.51%, KEYS/USD; PLTR's ring 784× its regular-session median). And
 *   the regular-session window was available for all 95, so the ring was never needed. The yardstick may never be
 *   LOOSER than the hour-invariant one; it is now the hour-invariant one alone.
 * ⛔⛔ HOUR-INVARIANT, NOT A TRAILING WINDOW (Langston gate 2 sent the trailing form back): a window taken AT ENTRY TIME
 *   holds only that hour's books, so its threshold moved with the clock — at 2026-10-08 02:00Z it admitted 419 of 467
 *   names at a median current spread of 2.93% because their own trailing median was 4.13%. A regular-session yardstick
 *   applies ONE standard at every hour (Kyle 2026-09-03). In regular hours nothing changes (468 of 468 pass both ways at
 *   10-08 15:00Z); off-hours it refuses wide books (330 of 467 at 02:00Z). With the floor at 1.0% the entry floor EQUALS
 *   the exit's ring-independent release ceiling, so entry and exit share one off-hours standard.
 * ⚠️ `is_extended_hours` is the FEED's flag (it flips at 13:45Z, 15 min after the open) and is NOT the engine's
 *   `getXstockSession()`; the two are never mixed in one comparison. The snapshot table is a HISTORY REFERENCE (a floor
 *   on what the decision path saw), never "the book the gate saw" — the current spread comes from the live tick.
 * ⛔ FAIL-OPEN ON ABSENCE (`#546`): fewer than N rows, or a failed read ⇒ PASS, labelled. That arm is near-empty in
 *   practice and is NOT a safety valve.
 */
import { db } from '../../db.js';
import { sql } from 'drizzle-orm';

export type EntryYardstick =
  | { median: number; basis: 'regular_session'; n: number }
  | { median: null; basis: 'under_window' | 'read_failed'; n: number | null; error?: string };

/** How far back the regular-session read may look: covers a weekend plus a US holiday. */
const LOOKBACK = '5 days';

export async function resolveEntryYardstick(symbol: string, windowSnaps: number): Promise<EntryYardstick> {
  try {
    const res = await db.execute<{ n: string; med: string | null }>(sql`
      SELECT count(*)::text AS n,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY spread)::text AS med
      FROM (
        SELECT (ask - bid) / ((ask + bid) / 2) AS spread
        FROM xstock_spot_ticker_snap
        WHERE symbol = ${symbol} AND is_extended_hours = false
          AND bid > 0 AND ask > 0 AND ask >= bid
          AND captured_at > NOW() - ${LOOKBACK}::interval
        ORDER BY captured_at DESC
        LIMIT ${windowSnaps}
      ) s
    `);
    const rows = (res as any).rows ?? (res as unknown as any[]);
    const r = Array.isArray(rows) ? rows[0] : undefined;
    const n = r ? parseInt(r.n, 10) : 0;
    const med = r && r.med !== null ? parseFloat(r.med) : NaN;
    if (!(n >= windowSnaps) || !(med >= 0)) return { median: null, basis: 'under_window', n };
    return { median: med, basis: 'regular_session', n };
  } catch (err) {
    return { median: null, basis: 'read_failed', n: null, error: err instanceof Error ? err.message : String(err) };
  }
}

/** PURE. The same threshold form as the exit guard's one-side arms: max(kRel × yardstick, floorPct / 100). */
export function judgeEntrySpread(spreadNow: number, yardstick: number, kRel: number, floorPct: number): { refuse: boolean; threshold: number } {
  const threshold = Math.max(kRel * yardstick, floorPct / 100);
  return { refuse: spreadNow > threshold, threshold };
}

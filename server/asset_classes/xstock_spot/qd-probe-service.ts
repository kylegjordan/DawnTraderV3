/**
 * ════════════════════════════════════════════════════════════════════════════
 * P19-B5c — Q-D (Quote-Depth) probe SERVICE (#86)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * The always-on probe body: once per cadence fire, record a compact DERIVED
 * on-venue friction row per active xStock symbol (bid/ask spread + top-of-book
 * depth + freshness) into `xstock_qd_probe_history`, read from the internal
 * `xstock_spot_ticker_snap` archive. CAPTURE-ONLY — nothing consumes the table
 * yet (friction-extraction → B81/Phase-25).
 *
 * Design (Langston Step-1/2 ACK):
 *   - D6: iterate `XSTOCK_SPOT_SYMBOLS` (the live active set — same accessor the
 *     scanner uses), NOT a hard-coded list.
 *   - D5: `bucket_start` = the FIRE time floored to the cadence grid (dedup key);
 *     `captured_at` is the real snap timestamp. UNIQUE(symbol,bucket_start) +
 *     ON CONFLICT DO NOTHING → idempotent + one honest (stale) row per bucket
 *     during a feed gap.
 *   - D7: a symbol with NO snap is SKIPPED (no row) and COUNTED; a stale-but-
 *     present snap IS written with stale=true. The fire-evidence meta carries
 *     {market_open, universe_size, rows_written, symbols_skipped_no_snap,
 *     symbols_stale} so a weekend is distinguishable from a probe breakage.
 *     NOTE (Langston Step-4): a weekend does NOT zero rows_written — Friday's
 *     last snaps persist in the table (30d retention), so they're returned and
 *     written with stale=true → rows_written ≈ universe_size, symbols_stale ≈
 *     universe_size, market_open=false. The genuine rows_written=0 cases are a
 *     dup-fire (all dedup-skipped) or all-no-snap (empty table). Downstream MUST
 *     NOT treat rows_written>0 as a health signal.
 *   - DB-governed (no hardcoded fallbacks): cadence + freshness from
 *     module_constants (fail-loud if unseeded).
 * ════════════════════════════════════════════════════════════════════════════
 */

import { db } from '../../db.js';
import { sql } from 'drizzle-orm';
import { XSTOCK_SPOT_SYMBOLS } from '../../../shared/asset-classes.js';
import { xstockQdProbeHistory, type InsertXstockQdProbeHistory } from '../../../shared/schema.js';
import { isXstockMarketOpenUTC } from './market-hours.js';
import { computeQdMetrics, floorToCadenceGrid, type QdRawSnap } from './qd-probe-metrics.js';

export interface QdProbeConfig {
  cadenceMinutes: number;
  freshnessCeilingMs: number;
}

export interface QdProbeFireSummary {
  bucketStart: Date;
  marketOpen: boolean;
  universeSize: number;
  rowsWritten: number;
  symbolsSkippedNoSnap: number;
  symbolsStale: number;
}

/** Cadence must divide 60 so the cron grid + bucket grid stay regular. */
export const VALID_CADENCE_MINUTES: ReadonlySet<number> = new Set([1, 2, 3, 4, 5, 6, 10, 12, 15, 20, 30]);

/**
 * Resolve probe runtime config from module_constants (module_name='qd_probe',
 * asset_class='xstock_spot'). Fail-loud if a required key is missing/invalid
 * (Kyle: DB-governed settings never silently default).
 */
export async function loadQdProbeConfig(): Promise<QdProbeConfig> {
  const res = await db.execute<{ constant_name: string; value: unknown }>(sql`
    SELECT constant_name, value FROM module_constants
     WHERE module_name = 'qd_probe' AND asset_class = 'xstock_spot'
  `);
  const rows = (res as any).rows ?? (res as unknown as Array<{ constant_name: string; value: unknown }>);
  const map = new Map<string, unknown>();
  for (const r of rows) map.set(r.constant_name, r.value);

  function reqNum(key: string): number {
    const v = map.get(key);
    const n = typeof v === 'number' ? v : Number(v);
    if (!Number.isFinite(n) || n <= 0) {
      throw new Error(`[qd-probe] missing or invalid module_constants qd_probe.${key} (got ${JSON.stringify(v)})`);
    }
    return n;
  }

  const cadenceMinutes = reqNum('cadence_minutes');
  if (!VALID_CADENCE_MINUTES.has(cadenceMinutes)) {
    throw new Error(
      `[qd-probe] cadence_minutes=${cadenceMinutes} must divide 60 (one of ${[...VALID_CADENCE_MINUTES].join(', ')})`,
    );
  }
  return { cadenceMinutes, freshnessCeilingMs: reqNum('freshness_ceiling_ms') };
}

/** drizzle numeric columns take string on insert; null stays null. */
function num2str(x: number | null): string | null {
  return x === null ? null : String(x);
}

// extends Record<string, unknown> to satisfy db.execute<T>'s row constraint
// (named interfaces lack the implicit index signature inline literals get).
interface SnapRow extends Record<string, unknown> {
  symbol: string;
  bid: string | null;
  ask: string | null;
  bid_qty: string | null;
  ask_qty: string | null;
  captured_at: string | Date | null;
}

/**
 * Run a single probe fire for the given fire time + config. Pure-ish: reads the
 * snap archive + writes the history table, returns the fire summary for the
 * fire-evidence row. Fail-soft is the caller's job (the cron wraps in try/catch
 * + always writes fire-evidence); this throws only on a hard DB failure.
 */
export async function runQdProbeOnce(fireTime: Date, config: QdProbeConfig): Promise<QdProbeFireSummary> {
  const fireMs = fireTime.getTime();
  const bucketStart = floorToCadenceGrid(fireMs, config.cadenceMinutes);
  const symbols = Array.from(XSTOCK_SPOT_SYMBOLS);
  const universeSet = new Set(symbols);
  const representative = symbols[0] ?? 'AAPL/USD';
  const marketOpen = isXstockMarketOpenUTC(representative, fireTime);

  // Latest snap per symbol in ONE index-served query (DISTINCT ON over the
  // xStock-only ticker table; filtered to the active universe in JS).
  const snapRes = await db.execute<SnapRow>(sql`
    SELECT DISTINCT ON (symbol)
           symbol,
           bid::text     AS bid,
           ask::text     AS ask,
           bid_qty::text AS bid_qty,
           ask_qty::text AS ask_qty,
           captured_at
      FROM xstock_spot_ticker_snap
     ORDER BY symbol, captured_at DESC
  `);
  const snapRows = (snapRes as any).rows ?? (snapRes as unknown as SnapRow[]);

  const snapBySymbol = new Map<string, QdRawSnap>();
  for (const r of snapRows as SnapRow[]) {
    if (!universeSet.has(r.symbol)) continue; // only the active universe
    snapBySymbol.set(r.symbol, {
      bid: r.bid !== null ? parseFloat(r.bid) : null,
      ask: r.ask !== null ? parseFloat(r.ask) : null,
      bidQty: r.bid_qty !== null ? parseFloat(r.bid_qty) : null,
      askQty: r.ask_qty !== null ? parseFloat(r.ask_qty) : null,
      capturedAtMs: r.captured_at !== null ? new Date(r.captured_at).getTime() : null,
    });
  }

  const toInsert: InsertXstockQdProbeHistory[] = [];
  let symbolsSkippedNoSnap = 0;
  let symbolsStale = 0;

  for (const symbol of symbols) {
    const snap = snapBySymbol.get(symbol) ?? null;
    if (snap === null) {
      symbolsSkippedNoSnap++; // D7: skip-no-row on no-snap (counted, not written)
      continue;
    }
    const m = computeQdMetrics(snap, fireMs, config.freshnessCeilingMs);
    if (m.stale) symbolsStale++;
    toInsert.push({
      symbol,
      assetClass: 'xstock_spot',
      bucketStart,
      capturedAt: snap.capturedAtMs !== null ? new Date(snap.capturedAtMs) : null,
      bid: num2str(snap.bid),
      ask: num2str(snap.ask),
      bidQty: num2str(snap.bidQty),
      askQty: num2str(snap.askQty),
      mid: num2str(m.mid),
      spreadAbs: num2str(m.spreadAbs),
      spreadBps: num2str(m.spreadBps),
      bidDepthNotional: num2str(m.bidDepthNotional),
      askDepthNotional: num2str(m.askDepthNotional),
      snapAgeMs: m.snapAgeMs,
      stale: m.stale,
      quoteQuality: m.quoteQuality,
    });
  }

  let rowsWritten = 0;
  if (toInsert.length > 0) {
    // ON CONFLICT (symbol, bucket_start) DO NOTHING — idempotent within a bucket.
    // .returning() yields only the rows actually inserted (conflicts excluded).
    const inserted = await db
      .insert(xstockQdProbeHistory)
      .values(toInsert)
      .onConflictDoNothing()
      .returning({ id: xstockQdProbeHistory.id });
    rowsWritten = Array.isArray(inserted) ? inserted.length : 0;
  }

  return {
    bucketStart,
    marketOpen,
    universeSize: symbols.length,
    rowsWritten,
    symbolsSkippedNoSnap,
    symbolsStale,
  };
}

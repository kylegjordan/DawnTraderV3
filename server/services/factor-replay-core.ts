/**
 * ══════════════════════════════════════════════════════════════════════════════
 * B-NEW-33 — Factor replay core (shared logic for nightly cron + one-shot CLI)
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Pulled out of `server/scripts/replay-ablation.ts` so that BOTH the nightly
 * cron (`npm run b67:replay-ablation`) and the one-shot calibration backtest
 * (`npm run b-new-33:factor-backtest`) share the same VTS-trade-lookup logic.
 *
 * Two structural improvements over the previous monolithic cron (per Langston
 * approval 2026-05-15):
 *
 *   1. **Dual canonical source** — primary: `vts_open_trades WHERE closed=true`
 *      for trades opened ≥ 2026-05-11 (B79.0g-tx soft-delete date). Fallback:
 *      JSONL files (`logs/virtual_trades/YYYY-MM-DD.json`) indexed by close-date
 *      filename, for trades opened < 2026-05-11. JSONL is read using the same
 *      `(symbol|strategy)` index pattern as the legacy cron. The dual source
 *      is the structural answer to the cron's matched=0 stall: post-B79.0g-tx
 *      the JSONL coverage went incomplete (trades filed under CLOSE-DATE not
 *      OPEN-DATE) and `vts_open_trades.closed=true` became canonical, but the
 *      old cron only consulted JSONL.
 *
 *   2. **Unmatched rows are MARKED** as `unreplayable_real_rejected` (with
 *      diagnostics in notes) instead of left pending. The cron previously left
 *      unmatched rows pending forever, so each night re-fetched the same 5000
 *      unreplayable rows and never made progress on the matchable ones beneath
 *      that ceiling.
 *
 * Public exports:
 *   - `buildVtsTradeIndex(daysBack)` — JSONL index loader (unchanged from cron)
 *   - `findVtsTradeByNaturalKey(...)` — closest-by-time match within ±tolerance,
 *     extracted with the tiebreak preserved (closest entryTime wins).
 *   - `loadClosedVtsTradesFromDb(since)` — NEW: load closed trades from
 *     `vts_open_trades` for trades opened ≥ `since`. Returns an index in the
 *     same shape as `buildVtsTradeIndex` for ergonomic dual-source lookup.
 *   - `findMatchingTrade(dbIndex, jsonlIndex, symbol, strategy, evaluatedAtMs)`
 *     — checks DB first (faster, canonical), JSONL fallback if no DB hit.
 *   - `classifyTradeOutcome(pnl)` — re-export of the existing classifier.
 *   - `computeReplayOutcomeFromTrade(trade, vtsTradeId)` — extracted from the
 *     cron's update loop, produces the `replayOutcome` JSON payload.
 *
 * The cron and CLI both use these helpers. No duplicated state, no risk of
 * drift between the two paths.
 *
 * Reference: B67.0.1 natural-key cc-inbox #864 + B-NEW-33 design ask 2026-05-15.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { db } from '../db.js';
import { sql } from 'drizzle-orm';
import { VTS_OPEN_TRADES_EXCLUDE_SHADOW } from './vts-trade-persistence.js';

// VTS JSONL log directory — same constant pattern as vts-service.ts:153.
// Files are date-partitioned: YYYY-MM-DD.json containing a JSON ARRAY.
// **Important (B-NEW-33 discovery 2026-05-15):** closed trades are filed
// under the date the trade CLOSED, not opened. So a trade opened May 12 and
// closed May 14 lives in `2026-05-14.json`, not `2026-05-12.json`. The index
// loader walks all files in the lookback window and indexes by `entryTime`
// so the close-date-filename detail doesn't matter for matching.
const VTS_LOGS_DIR = path.join(process.cwd(), 'logs', 'virtual_trades');

/**
 * B79.0g-tx soft-delete cutoff — trades opened on or after this date are
 * canonical-sourced from `vts_open_trades WHERE closed=true`. Trades before
 * this date are only available in JSONL.
 */
export const VTS_OPEN_TRADES_CANONICAL_CUTOFF = new Date('2026-05-11T00:00:00.000Z');

export type VtsTradeIndexEntry = {
  entryTime: number; // ms epoch
  trade: any;        // legacy JSONL trade record shape OR vts_open_trades-derived record
  source: 'db' | 'jsonl';
};

export type VtsTradeIndex = Map<string, VtsTradeIndexEntry[]>;

/**
 * Build an index of closed VTS trades from JSONL files (`logs/virtual_trades/
 * YYYY-MM-DD.json`). Used as the FALLBACK source for trades opened before
 * the B79.0g-tx canonical-cutoff date.
 *
 * Keyed by `${symbol}|${strategy}` → sorted-by-entryTime list of entries.
 * `daysBack` is from today; default 14 matches the cron's existing window.
 */
export async function buildVtsTradeIndex(
  daysBack: number = 14,
): Promise<VtsTradeIndex> {
  const index: VtsTradeIndex = new Map();
  try {
    const files = await fs.readdir(VTS_LOGS_DIR);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysBack);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    for (const filename of files) {
      if (!filename.endsWith('.json')) continue;
      if (filename.endsWith('.bak') || filename.includes('.bak.')) continue;
      const datePart = filename.replace('.json', '');
      if (datePart < cutoffStr) continue;

      try {
        const fullPath = path.join(VTS_LOGS_DIR, filename);
        const raw = await fs.readFile(fullPath, 'utf-8');
        const trades = JSON.parse(raw) as any[];
        for (const trade of trades) {
          if (trade?.status !== 'closed') continue;
          const symbol: string | undefined = trade?.signal?.symbol ?? trade?.symbol;
          const strategy: string | undefined = trade?.strategy ?? trade?.signal?.strategy;
          const entryTime: number | undefined = trade?.entryTime ?? trade?.signal?.createdAt;
          if (!symbol || !strategy || !entryTime) continue;
          const key = `${symbol}|${strategy}`;
          const list = index.get(key) ?? [];
          list.push({ entryTime, trade, source: 'jsonl' });
          index.set(key, list);
        }
      } catch (err) {
        console.warn(
          `[factor-replay-core] Failed to parse ${filename}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
    // Sort each bucket so closest-by-time scans are stable.
    for (const list of index.values()) {
      list.sort((a, b) => a.entryTime - b.entryTime);
    }
  } catch (err) {
    console.warn(
      '[factor-replay-core] VTS JSONL logs directory unreadable:',
      err instanceof Error ? err.message : err,
    );
  }
  return index;
}

/**
 * Load closed VTS trades from `vts_open_trades WHERE closed=true` for trades
 * opened ≥ `since`. Returns the same shape as `buildVtsTradeIndex` so callers
 * can reuse the lookup logic.
 *
 * Per B-NEW-33 coverage check (2026-05-15): post-B79.0g-tx (2026-05-11) this
 * is the canonical source. Pre-cutoff trades were hard-deleted from this
 * table and exist ONLY in JSONL.
 *
 * The "trade shape" stored in the index uses fields that match what
 * `computeReplayOutcomeFromTrade` reads — see that function for the contract.
 * Net P&L: stored on `vts_open_trades.context` jsonb if available; otherwise
 * derived as 0 (will mark `breakeven`).
 */
export async function loadClosedVtsTradesFromDb(
  since: Date = VTS_OPEN_TRADES_CANONICAL_CUTOFF,
): Promise<VtsTradeIndex> {
  const index: VtsTradeIndex = new Map();
  // Raw SQL — `vts_open_trades` is created via migration not Drizzle schema
  // (B79.0g-tx). Mirror the access pattern in vts-trade-persistence.ts.
  const sinceIso = since.toISOString();
  // reorg-B4: EXCLUDE shadow rows. Shadow trades persist into this shared table
  // (context.shadow=true) and close=true after shadowClose; without this filter the
  // factor-replay + ablation learning population would silently absorb the full
  // RTB-pool shadow set (a different population) — the OBJ-3b contamination this
  // filter prevents. See VTS_OPEN_TRADES_EXCLUDE_SHADOW (Langston Step-4 finding).
  const result: any = await db.execute(sql`
    SELECT id, symbol, strategy, regime, pool, asset_class,
           opened_at, closed_at, context
    FROM vts_open_trades
    WHERE closed = true
      AND opened_at >= ${sinceIso}::timestamptz
      AND ${VTS_OPEN_TRADES_EXCLUDE_SHADOW}
  `);
  const rows: any[] = (result as any).rows ?? result;

  for (const row of rows) {
    const ctx = (row.context as any) ?? {};
    const openedAtMs = new Date(row.opened_at).getTime();
    const closedAtMs = row.closed_at ? new Date(row.closed_at).getTime() : null;
    const trade = {
      id: row.id,
      status: 'closed',
      strategy: row.strategy,
      regime: row.regime,
      pool: row.pool,
      assetClass: row.asset_class,
      signal: { symbol: row.symbol, strategy: row.strategy },
      entryTime: openedAtMs,
      exitTime: closedAtMs,
      // The vts_open_trades row may not carry net P&L on its context jsonb if
      // the close-cascade wrote it elsewhere. Look in common context keys.
      netProfit: ctx.netProfit ?? ctx.net_profit ?? ctx.netPnl ?? null,
      exitReason: ctx.exitReason ?? ctx.exit_reason ?? 'unknown',
      tradeMode: ctx.tradeMode ?? null,
      ladderRungsHit: ctx.ladderRungsHit ?? 0,
      phase: ctx.phase ?? null,
      phaseAgeSeconds: ctx.phaseAgeSeconds ?? null,
      regimeConfidenceModulated: ctx.regimeConfidenceModulated ?? null,
      macroModifierValue: ctx.macroModifierValue ?? null,
    };
    const key = `${row.symbol}|${row.strategy}`;
    const list = index.get(key) ?? [];
    list.push({ entryTime: openedAtMs, trade, source: 'db' });
    index.set(key, list);
  }
  for (const list of index.values()) {
    list.sort((a, b) => a.entryTime - b.entryTime);
  }
  return index;
}

/**
 * Find the best closed-trade match for an ablation row, prioritizing the DB
 * (canonical, post-B79.0g-tx) over JSONL (legacy, pre-cutoff). Returns the
 * matched entry or null.
 *
 * **Tiebreak rule (Langston condition 4, 2026-05-15):** if multiple trades on
 * the same `(symbol, strategy)` opened within tolerance, pick the one with
 * `entryTime` CLOSEST to `evaluatedAtMs`. This reduces miss-tag risk for
 * high-frequency symbols where two distinct signals could land in the same
 * 10-min window.
 */
export function findMatchingTrade(
  dbIndex: VtsTradeIndex,
  jsonlIndex: VtsTradeIndex,
  symbol: string,
  strategy: string | null,
  evaluatedAtMs: number,
  toleranceMs: number = 5 * 60 * 1000, // ±5min per Langston Q5
): VtsTradeIndexEntry | null {
  if (!strategy) return null;
  const key = `${symbol}|${strategy}`;

  // Primary: DB index
  const dbHit = pickClosest(dbIndex.get(key), evaluatedAtMs, toleranceMs);
  if (dbHit) return dbHit;

  // Fallback: JSONL index
  const jsonlHit = pickClosest(jsonlIndex.get(key), evaluatedAtMs, toleranceMs);
  return jsonlHit;
}

function pickClosest(
  list: VtsTradeIndexEntry[] | undefined,
  targetMs: number,
  toleranceMs: number,
): VtsTradeIndexEntry | null {
  if (!list || list.length === 0) return null;
  let best: VtsTradeIndexEntry | null = null;
  let bestDelta = Infinity;
  for (const entry of list) {
    const delta = Math.abs(entry.entryTime - targetMs);
    if (delta <= toleranceMs && delta < bestDelta) {
      best = entry;
      bestDelta = delta;
    }
  }
  return best;
}

/**
 * Outcome classification — VirtualTrade.netProfit is a FRACTION (0.005 = 0.5%
 * return), NOT dollars. Threshold ≥0.5% wins / ≤-0.5% losses / else breakeven.
 * Preserved from the cron's existing implementation (B67.4 calibration window
 * verification, 2026-05-01).
 */
export function classifyTradeOutcome(
  pnl: number,
): 'admitted_won' | 'admitted_lost' | 'admitted_breakeven' {
  if (pnl >= 0.005) return 'admitted_won';
  if (pnl <= -0.005) return 'admitted_lost';
  return 'admitted_breakeven';
}

/**
 * Build the `replayOutcome` JSON payload for a successfully-matched trade.
 * Extracted from the cron's UPDATE loop so the CLI tool produces the same
 * row shape.
 */
export function computeReplayOutcomeFromTrade(
  trade: any,
  vtsTradeId: string | null,
  source: 'db' | 'jsonl',
): Record<string, any> {
  const netPnl = Number(trade.netProfit ?? 0);
  const outcome = classifyTradeOutcome(netPnl);
  const exitReason = trade.exitReason ?? trade.resultType ?? 'unknown';
  return {
    outcome,
    pnl_usd: netPnl,
    exit_reason: exitReason,
    vts_trade_id: vtsTradeId,
    vts_jsonl_trade_id: trade?.id ?? null,
    vts_jsonl_signal_id: trade?.signal?.id ?? null,
    trade_mode: trade.tradeMode ?? null,
    ladder_rungs_hit: trade.ladderRungsHit ?? 0,
    regime_at_entry: trade.regime ?? null,
    strategy_at_entry: trade.strategy ?? null,
    phase_at_entry: trade.phase ?? null,
    phase_age_seconds_at_entry: trade.phaseAgeSeconds ?? null,
    regime_confidence_modulated_at_entry: trade.regimeConfidenceModulated ?? null,
    macro_modifier_at_entry: trade.macroModifierValue ?? null,
    notes: 'pre_b67_5_both_admit',
    source, // diagnostic: which source produced this match
  };
}

/**
 * Build the `replayOutcome` JSON payload for an UNMATCHED ablation row.
 * Marking these as `unreplayable_real_rejected` lets subsequent cron passes
 * skip them — the structural fix for the cron's pending-row pileup.
 *
 * `diagnostics` carries closest-near-miss info for ops visibility (e.g. the
 * trade existed for that symbol+strategy on a neighboring day, or no trade
 * for that (symbol, strategy) tuple at all).
 */
export function buildUnmatchedReplayOutcome(
  diagnostics: { reason: string; sourcesTried: Array<'db' | 'jsonl'>; nearMissMs?: number },
): Record<string, any> {
  return {
    outcome: 'unreplayable_real_rejected',
    notes: diagnostics.reason,
    sources_tried: diagnostics.sourcesTried,
    near_miss_ms: diagnostics.nearMissMs ?? null,
    marked_unreplayable_at: new Date().toISOString(),
  };
}

/**
 * Diagnostic helper — for an unmatched row, find the closest entry in either
 * index (regardless of tolerance) so we can record the near-miss delta. Used
 * for the `near_miss_ms` field in `buildUnmatchedReplayOutcome`.
 *
 * Returns null if no entries exist for this (symbol, strategy) at all in
 * either index — that means the signal was likely rejected pre-trade-open.
 */
export function findNearestForDiagnostic(
  dbIndex: VtsTradeIndex,
  jsonlIndex: VtsTradeIndex,
  symbol: string,
  strategy: string | null,
  evaluatedAtMs: number,
): { delta: number; source: 'db' | 'jsonl' } | null {
  if (!strategy) return null;
  const key = `${symbol}|${strategy}`;
  let best: { delta: number; source: 'db' | 'jsonl' } | null = null;
  for (const [source, idx] of [['db', dbIndex] as const, ['jsonl', jsonlIndex] as const]) {
    const list = idx.get(key);
    if (!list) continue;
    for (const entry of list) {
      const delta = Math.abs(entry.entryTime - evaluatedAtMs);
      if (!best || delta < best.delta) best = { delta, source };
    }
  }
  return best;
}

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * B73 — Exit-Strategy Ablation: Replay Orchestrator + DB Persistence
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Async fire-and-forget service. On every closed trade:
 *   1. Fetch 1-min OHLC bars for the trade's window
 *   2. Run all 12 variant evaluators
 *   3. Bulk-insert 12 rows into exit_strategy_alternates
 *
 * Errors are logged and swallowed — never block the trade-close path.
 *
 * Per BATCH_73_SCOPE.md + BATCH_73_PRE_AUDIT.md.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';
import { ohlcCache } from './ohlc-cache';

// B79.0m.b2 (2026-05-11): xstock B73 replay error counter. Async fire-and-
// forget means errors otherwise vanish silently. This counter increments on
// any exception in the xstock_spot_ohlc_1m fetch path so a partition mishap
// or schema drift is observable in PM2 logs. OBSERVATIONAL ONLY (no auto-
// disable). Surface in completion report.
let _b73XstockReplayErrors = 0;
export function getB73XstockReplayErrorCount(): number { return _b73XstockReplayErrors; }
import { getModuleConstants } from './module-constants-service';
import {
  replayAllVariants,
  type ReplayConfig,
  type ReplayInputs,
  type VirtualExit,
} from './exit-strategy-replay';
import type { OHLCData } from '../types/market-regime.types';
// BATCH_82 (2026-05-14): AssetClass enum for non-nullable ReplayContext.assetClass.
// Pre-B82 was `assetClass?: string` with `?? 'crypto_spot'` silent fallbacks at
// the SQL INSERT (:264) and OHLC fetch (:294) — same anti-pattern as the 5 prior
// crypto-first incidents. Structural fix per Langston B82 design review concur.
import type { AssetClass } from '../../shared/asset-classes.js';

export interface ReplayContext {
  tradeId: string;
  tradeSource: 'paper' | 'vts';
  symbol: string;
  // BATCH_82 (2026-05-14): non-nullable, typed AssetClass — REQUIRED.
  // Pre-B82 was `assetClass?: string` with `?? 'crypto_spot'` fallbacks at the
  // SQL INSERT (:264) and OHLC fetch (:294). Both fallbacks dropped — caller
  // MUST resolve and pass. The sole caller (vts-service.ts:967) already
  // threads `tradeData.assetClass` per B79.0m.b2 — no caller change required.
  // Compile fails if any new caller forgets. Per Langston B82 design review
  // concur 2026-05-14 + CLAUDE.md §11 (no silent fallbacks).
  assetClass: AssetClass;
  side: 'BUY' | 'SELL';
  entryPrice: number;
  entryTime: number;       // epoch ms
  exitTime: number;        // epoch ms
  target: number;
  originalStopPrice: number | null;
  atr: number;
  volatility: number;
  regime: string;
  strategy: string;
  baselinePnlPct: number;
  // B73.1 (2026-04-30): realized exit values from the actual closed trade.
  // Variant A is no longer simulated — it copies these directly so the
  // baseline anchor IS live truth. Non-firing variants on TIMEOUT also
  // inherit these instead of a synthetic last-bar mid. Per Langston cc-inbox
  // #864 Q2(b)+(c).
  actualExitPrice: number;
  actualExitTime: number;
  actualExitReason: 'TP_target_hit' | 'SL_hit' | 'BE_stop' | 'TRAIL_hit' | 'TIMEOUT';
}

let cachedConfig: ReplayConfig | null = null;
let cachedConfigAt = 0;
const CONFIG_TTL_MS = 60_000;

async function loadReplayConfig(): Promise<ReplayConfig | null> {
  const now = Date.now();
  if (cachedConfig && (now - cachedConfigAt) < CONFIG_TTL_MS) return cachedConfig;
  try {
    const rows = await getModuleConstants('exit_strategy_replay', {
      exchange: '*', assetClass: '*', strategy: '*', regime: '*',
    });
    const enabled = rows.b73_replay_enabled === true || rows.b73_replay_enabled === 'true';
    if (!enabled) return null;
    const required: Array<keyof ReplayConfig | 'b73_max_hold_ms'> = [];
    const cfg: ReplayConfig = {
      baselineBeTriggerR:        toNum(rows.b73_baseline_be_trigger_r),
      baselineTrailDistanceAtr:  toNum(rows.b73_baseline_trail_distance_atr),
      variantBBeAtrPad:          toNum(rows.b73_variant_b_be_atr_pad),
      variantCBeTriggerR:        toNum(rows.b73_variant_c_be_trigger_r),
      variantHTrailDistanceAtr:  toNum(rows.b73_variant_h_trail_distance_atr),
      variantITrailDistanceAtr:  toNum(rows.b73_variant_i_trail_distance_atr),
      variantEVolP75Threshold:   toNum(rows.b73_variant_e_vol_p75_threshold),
      maxHoldMs:                 toNum(rows.b73_max_hold_ms),
    };
    cachedConfig = cfg;
    cachedConfigAt = now;
    return cfg;
  } catch (err) {
    console.warn('[B73][exit-replay] config load failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

function toNum(v: any): number {
  return typeof v === 'number' ? v : Number(v);
}

/**
 * B73.2 (2026-04-30, Langston cc-inbox #866): Fetch 1-min OHLC bars covering
 *   [entryTime - ATR_LOOKBACK_MIN, entryTime + maxHoldMs]
 *
 * Two B73.2 changes from prior B73.1 fetch:
 *
 * 1. Window extended to ENTRY + maxHoldMs (7d) regardless of actualExit.
 *    Previously capped at exitTime + 1h, which prevented Variant F (no_BE_stop)
 *    and K (no_BE_no_trail) from seeing whether the original target would
 *    eventually have hit after the live BE_stop closed the trade. Per Langston
 *    Q1 cc-inbox #866: this is what makes the headline question
 *    "does live BE-stop convert TPs to break-evens" answerable at all.
 *
 * 2. Pre-entry bars fetched alongside replay bars, used to compute bar-derived
 *    ATR. Prefix runs from entryTime - 14min to entryTime; replay window from
 *    entryTime to windowEnd. Caller separates the two slices.
 *
 * Pagination is enabled with maxCandlesTotal sized for 7d × 1440min = 10080
 * candles. Most trades won't actually need the full window; pagination short-
 * circuits when Kraken returns < 720 candles in a batch (no more data).
 */
const ATR_LOOKBACK_MIN = 14;

async function fetchOhlcForReplay(
  symbol: string,
  entryTime: number,
  exitTime: number,
  maxHoldMs: number,
  bufferMs: number, // retained for back-compat, unused (window now always extends to entryTime + maxHoldMs)
  assetClass: AssetClass, // BATCH_82 (2026-05-14): REQUIRED, no default. Caller resolves from ReplayContext.assetClass.
): Promise<OHLCData[]> {
  void exitTime; void bufferMs; // explicit no-op; window is entry-anchored now
  const windowEnd = entryTime + maxHoldMs;
  const sinceSeconds = Math.floor(entryTime / 1000) - ATR_LOOKBACK_MIN * 60 - 60;

  // B79.0m.b2: xstock_spot uses the partitioned passive-archive table
  // (xstock_spot_ohlc_1m, populated by B74 archiver from wss://ws-equities.
  // kraken.com). Pre-audit EXPLAIN ANALYZE 2026-05-11 verified per-trade
  // query at 1.035ms with full index coverage across all 13 partitions.
  if (assetClass === 'xstock_spot') {
    try {
      const sinceTs = new Date(sinceSeconds * 1000);
      const endTs = new Date(windowEnd);
      const result: any = await db.execute(sql`
        SELECT interval_begin, open, high, low, close, volume
          FROM xstock_spot_ohlc_1m
         WHERE symbol = ${symbol}
           AND interval_begin >= ${sinceTs}
           AND interval_begin <= ${endTs}
         ORDER BY interval_begin ASC
      `);
      const rows: any[] = (result as any).rows ?? result;
      if (!Array.isArray(rows)) return [];
      return rows.map((r: any) => ({
        timestamp: new Date(r.interval_begin).getTime(),
        open: parseFloat(r.open),
        high: parseFloat(r.high),
        low: parseFloat(r.low),
        close: parseFloat(r.close),
        volume: parseFloat(r.volume),
      } as OHLCData));
    } catch (err) {
      _b73XstockReplayErrors++;
      console.warn(`[B73-REPLAY][XSTOCK] err=${err instanceof Error ? err.message : err} symbol=${symbol} tradeWindow=[${sinceSeconds}..${Math.floor(windowEnd / 1000)}] errCount=${_b73XstockReplayErrors}`);
      return [];
    }
  }

  // crypto_spot (default) — existing Kraken REST path via ohlcCache.
  const result = await ohlcCache.getOHLCData(symbol, 1, sinceSeconds, {
    paginationEnabled: true,
    maxBatches: 14,
    maxCandlesTotal: 10_080,
    endTimestamp: Math.floor(windowEnd / 1000),
  });
  if (!result?.ohlc) return [];
  return result.ohlc
    .map((c: any) => ({
      timestamp: c.time * 1000,
      open: parseFloat(c.open),
      high: parseFloat(c.high),
      low: parseFloat(c.low),
      close: parseFloat(c.close),
      volume: parseFloat(c.volume),
    }))
    .filter(b => b.timestamp >= entryTime - ATR_LOOKBACK_MIN * 60_000 && b.timestamp <= windowEnd);
}

/**
 * B73.2: Compute bar-derived ATR from the 14 1-min bars BEFORE entry. This
 * gives a stable per-trade ATR that's consistent with the data resolution the
 * variant replay actually walks. Per Langston cc-inbox #866 Q1: the live ATR
 * (from atrAtOpen) is computed on a different timeframe and produces trigger
 * thresholds 1-2 orders of magnitude above what 1-min bar highs can show —
 * causing every variant trigger check to fail. Using bar-derived ATR makes
 * trigger thresholds firearble at bar resolution → variants actually
 * differentiate. Trade-off: replay ATR ≠ live ATR; the framework answers
 * "what would variant X have done if its THRESHOLDS scaled to bar visibility"
 * not "what would variant X have done in the LIVE world." Acceptable for
 * variant-comparability per cc-inbox #866.
 */
function computeBarDerivedAtr(preEntryBars: OHLCData[]): number {
  if (preEntryBars.length < 2) return 0;
  // True Range over the bars: max(high-low, |high-prevClose|, |low-prevClose|)
  let trSum = 0;
  let trCount = 0;
  for (let i = 1; i < preEntryBars.length; i++) {
    const cur = preEntryBars[i];
    const prev = preEntryBars[i - 1];
    const tr = Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prev.close),
      Math.abs(cur.low - prev.close),
    );
    trSum += tr;
    trCount++;
  }
  return trCount > 0 ? trSum / trCount : 0;
}

/**
 * Persist 12 variant exits to exit_strategy_alternates.
 * Uses ON CONFLICT DO NOTHING so re-replay (e.g., bug fix) doesn't duplicate.
 */
async function persistExits(
  ctx: ReplayContext,
  exits: VirtualExit[],
): Promise<void> {
  // Build a multi-row INSERT
  const rows = exits.map(e => ({
    trade_id: ctx.tradeId,
    trade_source: ctx.tradeSource,
    variant_id: e.variantId,
    variant_name: e.variantName,
    virtual_exit_price: e.exitPrice,
    virtual_exit_reason: e.exitReason,
    virtual_exit_time: e.exitTime ? new Date(e.exitTime) : null,
    virtual_pnl_pct: e.pnlPct,
    virtual_duration_min: e.durationMin,
    baseline_pnl_pct: ctx.baselinePnlPct,
    regime: ctx.regime,
    strategy: ctx.strategy,
    metadata: e.metadata,
  }));

  // Drizzle-style raw SQL — keep it simple given limited ORM mapping for the new table
  for (const r of rows) {
    await db.execute(sql`
      INSERT INTO exit_strategy_alternates
        (trade_id, trade_source, variant_id, variant_name,
         virtual_exit_price, virtual_exit_reason, virtual_exit_time,
         virtual_pnl_pct, virtual_duration_min, baseline_pnl_pct,
         regime, strategy, metadata,
         exchange, asset_class)
      VALUES
        (${r.trade_id}, ${r.trade_source}, ${r.variant_id}, ${r.variant_name},
         ${r.virtual_exit_price}, ${r.virtual_exit_reason}, ${r.virtual_exit_time},
         ${r.virtual_pnl_pct}, ${r.virtual_duration_min}, ${r.baseline_pnl_pct},
         ${r.regime}, ${r.strategy}, ${JSON.stringify(r.metadata)}::jsonb,
         'kraken', ${ctx.assetClass})
      ON CONFLICT (trade_id, variant_id) DO NOTHING
    `);
  }
}

/**
 * Public entrypoint. Fire-and-forget — caller should NOT await this.
 * Logs errors via [B73][exit-replay] tag.
 */
export async function replayAndPersist(ctx: ReplayContext): Promise<void> {
  if (ctx.originalStopPrice == null) {
    console.log(`[B73][exit-replay] skip ${ctx.symbol} ${ctx.tradeId}: no originalStopPrice`);
    return;
  }
  const config = await loadReplayConfig();
  if (!config) {
    return; // disabled or config load failed
  }
  if (!ctx.atr || ctx.atr <= 0) {
    console.log(`[B73][exit-replay] skip ${ctx.symbol} ${ctx.tradeId}: no ATR`);
    return;
  }

  const allBars = await fetchOhlcForReplay(
    ctx.symbol,
    ctx.entryTime,
    ctx.exitTime,
    config.maxHoldMs,
    3_600_000, // back-compat; ignored — window is entry-anchored now
    ctx.assetClass, // BATCH_82 (2026-05-14): `??` fallback dropped — assetClass is non-nullable on ReplayContext
  );
  if (allBars.length === 0) {
    console.warn(`[B73][exit-replay] no OHLC bars for ${ctx.symbol} ${ctx.tradeId}`);
    return;
  }

  // B73.2 (2026-04-30, Langston cc-inbox #866): split pre-entry slice for
  // bar-derived ATR vs replay slice for variant simulation.
  const preEntryBars = allBars.filter(b => b.timestamp < ctx.entryTime);
  const replayBars = allBars.filter(b => b.timestamp >= ctx.entryTime);
  const atrBarDerived = computeBarDerivedAtr(preEntryBars);

  const inputs: ReplayInputs = {
    side: ctx.side,
    entryPrice: ctx.entryPrice,
    entryTime: ctx.entryTime,
    target: ctx.target,
    originalStopPrice: ctx.originalStopPrice,
    // B73.2 (2026-04-30): variant trigger thresholds use bar-derived ATR for
    // internal comparability. Live `atr` (from atrAtOpen) is preserved in
    // metadata for validation. Per Langston cc-inbox #866 Q1.
    atr: atrBarDerived > 0 ? atrBarDerived : ctx.atr,
    volatility: ctx.volatility,
    ohlcBars: replayBars,
    config,
    actualExitPrice: ctx.actualExitPrice,
    actualExitTime: ctx.actualExitTime,
    actualExitReason: ctx.actualExitReason,
    actualPnlPct: ctx.baselinePnlPct,
    // B73.2: ATR validation metadata — both values logged on every variant row
    // so post-hoc analysis can quantify the live↔bar ATR divergence.
    atrLive: ctx.atr,
    atrBarDerived,
  };

  const exits = replayAllVariants(inputs);

  try {
    await persistExits(ctx, exits);
    const winners = exits
      .filter(e => e.exitReason === 'TP_target_hit')
      .map(e => e.variantId);
    console.log(
      `[B73][exit-replay] ${ctx.symbol} ${ctx.tradeId} regime=${ctx.regime} ` +
      `bars=${ohlcBars.length} TP_variants=[${winners.join(',')}]`,
    );
  } catch (err) {
    console.error(
      `[B73][exit-replay] persist failed for ${ctx.symbol} ${ctx.tradeId}:`,
      err instanceof Error ? err.message : err,
    );
  }
}

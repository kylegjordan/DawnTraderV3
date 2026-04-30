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
import { getModuleConstants } from './module-constants-service';
import {
  replayAllVariants,
  type ReplayConfig,
  type ReplayInputs,
  type VirtualExit,
} from './exit-strategy-replay';
import type { OHLCData } from '../types/market-regime.types';

export interface ReplayContext {
  tradeId: string;
  tradeSource: 'paper' | 'vts';
  symbol: string;
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
 * Fetch 1-min OHLC bars covering the trade window:
 *   [entryTime, min(exitTime + buffer, entryTime + maxHoldMs)]
 *
 * Per Langston cc-inbox #861 Q6: window must extend to maxHoldMs to capture
 * variants that would have held longer than the actual exit.
 */
async function fetchOhlcForReplay(
  symbol: string,
  entryTime: number,
  exitTime: number,
  maxHoldMs: number,
  bufferMs: number,
): Promise<OHLCData[]> {
  const windowEnd = Math.min(exitTime + bufferMs, entryTime + maxHoldMs);
  const sinceSeconds = Math.floor(entryTime / 1000) - 60; // 1 candle of leeway
  // ohlc-cache exposes getOHLCData; passing `since` bypasses cache and fetches
  // historical 1-min candles directly. Returns up to 720 candles (12h) per call.
  // For windows > 12h, multi-call pagination would be needed; v1 caps at 720
  // bars (~12h) per fetch and times out variants past that with TIMEOUT.
  const result = await ohlcCache.getOHLCData(symbol, 1, sinceSeconds);
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
    .filter(b => b.timestamp >= entryTime && b.timestamp <= windowEnd);
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
         regime, strategy, metadata)
      VALUES
        (${r.trade_id}, ${r.trade_source}, ${r.variant_id}, ${r.variant_name},
         ${r.virtual_exit_price}, ${r.virtual_exit_reason}, ${r.virtual_exit_time},
         ${r.virtual_pnl_pct}, ${r.virtual_duration_min}, ${r.baseline_pnl_pct},
         ${r.regime}, ${r.strategy}, ${JSON.stringify(r.metadata)}::jsonb)
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

  const ohlcBars = await fetchOhlcForReplay(
    ctx.symbol,
    ctx.entryTime,
    ctx.exitTime,
    config.maxHoldMs,
    3_600_000, // 1h buffer post-actual-exit
  );
  if (ohlcBars.length === 0) {
    console.warn(`[B73][exit-replay] no OHLC bars for ${ctx.symbol} ${ctx.tradeId}`);
    return;
  }

  const inputs: ReplayInputs = {
    side: ctx.side,
    entryPrice: ctx.entryPrice,
    entryTime: ctx.entryTime,
    target: ctx.target,
    originalStopPrice: ctx.originalStopPrice,
    atr: ctx.atr,
    volatility: ctx.volatility,
    ohlcBars,
    config,
    // B73.1 (2026-04-30): realized exit pass-through for Variant A truth +
    // TIMEOUT inheritance per Langston cc-inbox #864 Q2(b)+(c).
    actualExitPrice: ctx.actualExitPrice,
    actualExitTime: ctx.actualExitTime,
    actualExitReason: ctx.actualExitReason,
    actualPnlPct: ctx.baselinePnlPct,
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

/**
 * reorg-B4 (2026-06-25) — the shadow-pairing SELECTION-QUALITY sink writer.
 *
 * This module is the ONLY writer for `rtb_shadow_pairings`. It writes the
 * decision-time pairing row at shadow OPEN and the realized outcome at shadow
 * CLOSE. It is part of the by-construction isolation that makes the shadow
 * telemetry layer safe:
 *
 *   ★ ISOLATION INVARIANT (Langston Step-2): nothing here ever touches a
 *     learning sink. No `outcomeFeedbackStore.updateEma`, no
 *     `telemetry.recordPairTelemetry`, no `updateRollingAverages`, no
 *     exit-decision archive, no `paper_sim_trades`. It writes ONE table —
 *     `rtb_shadow_pairings` — which NO learning consumer (ranker /
 *     outcomeFeedbackStore / telemetry-aggregator / ML / expectancy /
 *     win-rate / regime stats) ever reads. It is a pure B5/B6 analysis sink.
 *
 * Style note: uses `db.execute(sql`...`)` to match the sibling
 * `vts-trade-persistence.ts` writer (same module family, same conventions).
 */

import { db } from '../db.js';
import { sql } from 'drizzle-orm';

/**
 * Decision-time pairing row, snapshotted AT the promotion decision (the
 * ranking inputs) — written once at shadow open. Outcome columns stay NULL
 * until `updateShadowPairingOutcome` fills them at shadow close.
 */
export interface ShadowPairingOpenRow {
  id: string;            // == the openShadowTrades Map key (shadow trade id)
  cycleKey: string;      // composite: mode|assetClass|tsMs|seq
  mode: string;          // 'paper' | 'live'
  assetClass: string;
  regime?: string | null;
  promotionRank?: number | null; // 0-based ordinal in the finalScore-sorted pool
  promoted?: boolean;            // true = ranker-selected this cycle (rank < openSlots)
  promotedTradeId?: string | null;
  signalId?: string | null;
  symbol: string;
  strategy: string;
  entryPrice?: number | null;
  stopPrice?: number | null;
  targetPrice?: number | null;
  finalScore?: number | null;
  hybridScore?: number | null;
  confidence?: number | null;
  regimeWeight?: number | null;
  decayPenalty?: number | null;
  rankingScore?: number | null;
  sourcePool?: string | null;
  diAtQueue?: number | null;
  dbsScoreAtQueue?: number | null;
  sqeVerdict?: string | null;
  sqeRejectReason?: string | null;
}

/** Realized outcome, written once at shadow close. */
export interface ShadowPairingCloseOutcome {
  grossPnl: number;
  netPnl: number;
  rMultiple?: number | null;
  closeReason: string;   // stop_hit | target_hit | shadow_max_hold | ...
  exitPrice: number;
  holdingMs: number;
}

/**
 * INSERT the decision-time pairing row. Idempotent via ON CONFLICT (id) DO
 * NOTHING — a re-open of the same shadow id is a no-op. Throws on DB failure;
 * the caller (registerOpenShadowTrade) treats a failed insert as a fatal
 * shadow-open error and does NOT add the trade to the in-memory Map (no
 * orphan / no untracked durable row).
 */
export async function insertShadowPairing(row: ShadowPairingOpenRow): Promise<void> {
  await db.execute(sql`
    INSERT INTO rtb_shadow_pairings (
      id, cycle_key, mode, asset_class, regime, promotion_rank, promoted,
      promoted_trade_id, signal_id, symbol, strategy, entry_price, stop_price,
      target_price, final_score, hybrid_score, confidence, regime_weight,
      decay_penalty, ranking_score, source_pool, di_at_queue, dbs_score_at_queue,
      sqe_verdict, sqe_reject_reason, closed, opened_at, created_at
    ) VALUES (
      ${row.id}, ${row.cycleKey}, ${row.mode}, ${row.assetClass},
      ${row.regime ?? null}, ${row.promotionRank ?? null}, ${row.promoted ?? false},
      ${row.promotedTradeId ?? null}, ${row.signalId ?? null}, ${row.symbol},
      ${row.strategy}, ${row.entryPrice ?? null}, ${row.stopPrice ?? null},
      ${row.targetPrice ?? null}, ${row.finalScore ?? null}, ${row.hybridScore ?? null},
      ${row.confidence ?? null}, ${row.regimeWeight ?? null}, ${row.decayPenalty ?? null},
      ${row.rankingScore ?? null}, ${row.sourcePool ?? null}, ${row.diAtQueue ?? null},
      ${row.dbsScoreAtQueue ?? null}, ${row.sqeVerdict ?? null}, ${row.sqeRejectReason ?? null},
      false, NOW(), NOW()
    )
    ON CONFLICT (id) DO NOTHING
  `);
}

/**
 * UPDATE the pairing row with the realized shadow outcome at close. Idempotent
 * via `WHERE closed = false`: a retry after a partial-failure matches zero rows
 * and returns cleanly (the row was already finalized).
 */
export async function updateShadowPairingOutcome(
  id: string,
  outcome: ShadowPairingCloseOutcome,
): Promise<void> {
  await db.execute(sql`
    UPDATE rtb_shadow_pairings
       SET gross_pnl     = ${outcome.grossPnl},
           net_pnl       = ${outcome.netPnl},
           r_multiple    = ${outcome.rMultiple ?? null},
           close_reason  = ${outcome.closeReason},
           exit_price    = ${outcome.exitPrice},
           holding_ms    = ${outcome.holdingMs},
           closed        = true,
           closed_at     = NOW()
     WHERE id = ${id}
       AND closed = false
  `);
}

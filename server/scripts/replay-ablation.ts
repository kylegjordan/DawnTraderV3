/**
 * B67.0 — Replay Ablation Nightly Job
 *
 * Runs nightly. For every regime_factor_alternates row whose corresponding
 * trade has closed, computes the counterfactual outcome implied by the
 * alternate decision and persists it. Also enforces retention policy.
 *
 * ── Architectural design ───────────────────────────────────────────────────
 *
 * With B67's "confidence-modifying factor" architecture, the only way an
 * alternate decision can produce a different outcome is by changing
 * `admissionPossible`. Confidence-VALUE deltas alone (e.g., real conf=0.8 vs
 * alt conf=0.7) without an admit/reject flip produce no outcome delta — same
 * trade, same fill, same exit, same P&L.
 *
 *   Real ADMIT, Alt ADMIT     → outcome unchanged; copy real outcome.
 *   Real ADMIT, Alt REJECT    → counterfactual = no trade ($0 net P&L);
 *                                pnlDeltaUsd = -realPnl.
 *   Real REJECT, Alt ADMIT    → cannot replay (no actual trade exists);
 *                                marked `unreplayable_real_rejected`. These
 *                                rows are valuable for factor analysis but
 *                                require a forward-simulation harness, not a
 *                                replay. Phase 19 may add forward-sim.
 *   Real REJECT, Alt REJECT   → outcome unchanged ($0 either way).
 *
 * Once B67.5 wires regime confidence into Kelly sizing (Consumer #2), a
 * confidence-VALUE delta WILL produce a position-size delta which scales the
 * actual P&L. The replay then needs:
 *   counterfactual_pnl = real_pnl × (alt_kelly_multiplier / real_kelly_multiplier)
 * That logic ships with B67.5; until then, confidence-only deltas are
 * outcome-equal.
 *
 * ── B67.0 scope (this file) ────────────────────────────────────────────────
 *
 * B67.0 ships the framework BEFORE any factor producer exists. With zero
 * factors deployed, the emitter writes zero rows, and this job finds zero
 * pending rows. Its function at B67.0 time is purely structural:
 *
 *   1. Cron + invocation chain are exercised nightly
 *   2. Retention sweep runs (no-op on empty table)
 *   3. Failure modes (DB down, etc.) surface in logs immediately
 *
 * The actual outcome-classification logic is in place for when factor
 * producers (B67.1+) ship. At that point, the source-specific outcome
 * lookups are populated:
 *
 *   - Active-signal path: join via signal_id → trades / paper_sim_trades on
 *     the trade record's signal_id field. Wires in when active paper trading
 *     produces ablation rows.
 *
 *   - VTS path: VTS trade outcomes live in `logs/virtual_trades/` JSONL
 *     files, not in a relational table. The replay job needs a JSONL reader
 *     for this path. Logic deferred to a B67.1+ task; placeholder logs the
 *     row count and skips outcome computation.
 *
 * Schedule: nightly cron at 04:00 UTC. Wired into PM2 via package.json
 * script `npm run b67:replay-ablation` (cron entry added at deploy time).
 *
 * Reference: BATCH_67_SCOPE.md §4.5 + BATCH_67_PRE_AUDIT.md §6.4
 */

import 'dotenv/config';
import { db } from '../db.js';
import { regimeFactorAlternates } from '../../shared/schema.js';
import { eq, and, isNull, lt, sql, count } from 'drizzle-orm';
import { getConstant } from '../services/module-constants-service.js';

interface ReplayStats {
  pendingActiveSignalRows: number;
  pendingVtsTradeRows: number;
  rowsReplayed: number;
  rowsRetentionDeleted: number;
  errors: number;
}

/**
 * Run a single replay pass. Idempotent: only processes rows where
 * `replay_completed_at IS NULL`.
 */
export async function runReplayAblation(): Promise<ReplayStats> {
  console.log('[B67.0][replay-ablation] Starting replay pass');

  const stats: ReplayStats = {
    pendingActiveSignalRows: 0,
    pendingVtsTradeRows: 0,
    rowsReplayed: 0,
    rowsRetentionDeleted: 0,
    errors: 0,
  };

  try {
    // ── Step 1: count pending rows by source_type ──
    const pendingCounts = await db
      .select({
        sourceType: regimeFactorAlternates.sourceType,
        cnt: count(),
      })
      .from(regimeFactorAlternates)
      .where(isNull(regimeFactorAlternates.replayCompletedAt))
      .groupBy(regimeFactorAlternates.sourceType);

    for (const row of pendingCounts) {
      if (row.sourceType === 'active_signal') {
        stats.pendingActiveSignalRows = Number(row.cnt);
      } else if (row.sourceType === 'vts_trade') {
        stats.pendingVtsTradeRows = Number(row.cnt);
      }
    }

    console.log(
      `[B67.0][replay-ablation] Pending rows: active_signal=${stats.pendingActiveSignalRows} vts_trade=${stats.pendingVtsTradeRows}`,
    );

    // ── Step 2: replay active-signal rows ──
    // Implementation lands when B67.5 produces the first active-signal
    // ablation rows (active paper trading + factor producers both required).
    // Until then, this is a no-op count check.
    if (stats.pendingActiveSignalRows > 0) {
      console.warn(
        `[B67.0][replay-ablation] ${stats.pendingActiveSignalRows} active_signal rows pending replay; ` +
          `outcome-lookup logic ships with B67.5+. Rows remain pending until that batch.`,
      );
    }

    // ── Step 3: replay VTS-trade rows ──
    // Implementation lands when a JSONL reader for `logs/virtual_trades/` is
    // wired in. Deferred to B67.1+ when first factor producer needs it.
    if (stats.pendingVtsTradeRows > 0) {
      console.warn(
        `[B67.0][replay-ablation] ${stats.pendingVtsTradeRows} vts_trade rows pending replay; ` +
          `JSONL outcome reader ships with first B67.1+ factor producer that needs it.`,
      );
    }

    // ── Step 4: enforce retention policy ──
    const retentionDays =
      (await getConstant<number>('ablation_framework', 'b67_0_alternates_retention_days', {})) ?? 90;
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    const deleteResult = await db
      .delete(regimeFactorAlternates)
      .where(lt(regimeFactorAlternates.evaluatedAt, cutoff))
      .returning({ id: regimeFactorAlternates.id });
    stats.rowsRetentionDeleted = deleteResult.length;

    if (stats.rowsRetentionDeleted > 0) {
      console.log(
        `[B67.0][replay-ablation] Retention sweep deleted ${stats.rowsRetentionDeleted} rows older than ${retentionDays}d`,
      );
    }
  } catch (err) {
    stats.errors++;
    console.error('[B67.0][replay-ablation] Error:', err instanceof Error ? err.message : err);
  }

  console.log(
    `[B67.0][replay-ablation] Done. pending_active=${stats.pendingActiveSignalRows} pending_vts=${stats.pendingVtsTradeRows} replayed=${stats.rowsReplayed} retention_deleted=${stats.rowsRetentionDeleted} errors=${stats.errors}`,
  );

  return stats;
}

/**
 * Outcome classification helper used by future B67.1+ replay implementations.
 * Threshold of $0.50 for "breakeven" matches the existing B65.4.1 break-even-
 * stop semantics (small protective exit ≈ 0).
 *
 * Exported for downstream factor producers that wire in their own outcome
 * computation while keeping classification consistent across the framework.
 */
export function classifyTradeOutcome(
  pnlUsd: number,
): 'admitted_won' | 'admitted_lost' | 'admitted_breakeven' {
  if (pnlUsd >= 0.5) return 'admitted_won';
  if (pnlUsd <= -0.5) return 'admitted_lost';
  return 'admitted_breakeven';
}

/**
 * Discrete outcome buckets the replay records when fully wired. Exported so
 * downstream factor implementations stay aligned on the taxonomy.
 */
export type AblationOutcome =
  | 'admitted_won'
  | 'admitted_lost'
  | 'admitted_breakeven'
  | 'rejected'
  | 'rejected_no_trade'
  | 'unreplayable_real_rejected';

// CLI entry — invoked by `npm run b67:replay-ablation`.
const isMain = import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`;
if (isMain) {
  runReplayAblation()
    .then((stats) => {
      console.log('[B67.0][replay-ablation] Stats:', stats);
      process.exit(stats.errors > 0 ? 1 : 0);
    })
    .catch((err) => {
      console.error('[B67.0][replay-ablation] Fatal error:', err);
      process.exit(1);
    });
}

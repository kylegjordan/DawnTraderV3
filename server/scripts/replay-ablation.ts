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
 *   - Active-signal path: join via signal_id → trades / closed_trades on
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
import { eq, and, isNull, lt, sql, count, gte } from 'drizzle-orm';
import { getConstant } from '../services/module-constants-service.js';

// B-XSTOCK-CORRELATION-COLLECT (2026-11-05): the module-level legacy `buildVtsTradeIndex` + `findVtsTradeByNaturalKey`
// (B67.0.1) were removed — unused since B-NEW-33 moved matching to services/factor-replay-core.ts (the block below
// imports that module's builder, which shadowed this one). Archived in DELETED_COMPONENTS_LOG.md.

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
    // Implementation: query `closed_trades` for closed trades, join by
    // signalId. Currently active trading is OFF (closed_trades has 0 rows
    // total) so this loop runs but processes nothing. When active trading
    // turns back on this path becomes hot. The lookup logic is implemented
    // here for forward-compat — the logic itself doesn't care whether the
    // table is empty.
    if (stats.pendingActiveSignalRows > 0) {
      try {
        const { closedTradesTable } = await import('../../shared/schema.js');
        const pendingActiveRows = await db
          .select()
          .from(regimeFactorAlternates)
          .where(
            and(
              eq(regimeFactorAlternates.sourceType, 'active_signal'),
              isNull(regimeFactorAlternates.replayCompletedAt),
            ),
          )
          .limit(5000); // bounded per pass

        for (const row of pendingActiveRows) {
          if (row.signalId === null) continue;
          // Join: closed_trades doesn't store signalId today (no
          // explicit FK). Until that wire-in lands the active-path replay
          // is structurally limited. Marker outcome is set so future runs
          // skip these rows; the row stays for forward-replay analysis.
          await db
            .update(regimeFactorAlternates)
            .set({
              replayOutcome: {
                outcome: 'unreplayable_active_no_signal_id_join',
                notes: 'closed_trades does not currently store signalId; awaiting schema link in a future commit',
              } as any,
              replayCompletedAt: new Date(),
            })
            .where(eq(regimeFactorAlternates.id, row.id));
          stats.rowsReplayed++;
        }
      } catch (err) {
        console.error('[B67.0][replay-ablation] Active-path replay error:', err instanceof Error ? err.message : err);
        stats.errors++;
      }
    }

    // ── Step 3: replay VTS-trade rows ──
    // B-NEW-33 (2026-05-15) refactor: uses `factor-replay-core.ts` for the
    // matching logic (shared with the one-shot CLI `b-new-33:factor-backtest`).
    // Dual canonical source: `vts_open_trades WHERE closed=true` (post-
    // B79.0g-tx canonical) PRIMARY, JSONL files FALLBACK for pre-cutoff
    // trades. Unmatched rows are MARKED `unreplayable_real_rejected` so
    // subsequent runs skip them (the structural fix for the pre-B-NEW-33
    // pending-row pileup that produced matched=0/5000 nightly).
    if (stats.pendingVtsTradeRows > 0) {
      try {
        const { loadClosedVtsTradesFromDb, findMatchingTrade, findNearestForDiagnostic, computeReplayOutcomeFromTrade, buildUnmatchedReplayOutcome } = await import('../services/factor-replay-core.js');
        const { buildVtsTradeIndex } = await import('../services/factor-replay-core.js');

        const dbIndex = await loadClosedVtsTradesFromDb();
        const dbCount = Array.from(dbIndex.values()).reduce((s, l) => s + l.length, 0);
        const jsonlIndex = await buildVtsTradeIndex(14);
        const jsonlCount = Array.from(jsonlIndex.values()).reduce((s, l) => s + l.length, 0);
        console.log(
          `[B67.0][replay-ablation] Indexes loaded: db=${dbCount} jsonl=${jsonlCount} (post-B-NEW-33 dual-source)`,
        );

        // Load pending VTS rows. Cron stays bounded at 5000 per pass to keep
        // run-time predictable on the nightly schedule; the CLI tool handles
        // the unbounded drain on demand.
        const pendingVtsRows = await db
          .select()
          .from(regimeFactorAlternates)
          .where(
            and(
              eq(regimeFactorAlternates.sourceType, 'vts_trade'),
              isNull(regimeFactorAlternates.replayCompletedAt),
            ),
          )
          .limit(5000);

        let matched = 0;
        let unmatched = 0;
        for (const row of pendingVtsRows) {
          const evaluatedAtMs = row.evaluatedAt instanceof Date
            ? row.evaluatedAt.getTime()
            : Number(row.evaluatedAt);
          const entry = findMatchingTrade(
            dbIndex,
            jsonlIndex,
            row.assetClass,
            row.pairSymbol,
            row.strategy,
            evaluatedAtMs,
          );
          if (!entry) {
            // No match in either source. Mark as unreplayable so we don't
            // re-fetch this row on tomorrow's run. Old behavior left the row
            // pending forever and the pipeline got stuck on stale rows.
            const nearest = findNearestForDiagnostic(
              dbIndex,
              jsonlIndex,
              row.assetClass,
              row.pairSymbol,
              row.strategy,
              evaluatedAtMs,
            );
            const outcome = buildUnmatchedReplayOutcome({
              reason: nearest
                ? `no trade within ±5min; nearest in ${nearest.source} was ${nearest.delta}ms away`
                : 'no closed trade for (symbol, strategy) — likely rejected pre-trade-open',
              sourcesTried: ['db', 'jsonl'],
              nearMissMs: nearest?.delta,
            });
            await db
              .update(regimeFactorAlternates)
              .set({ replayOutcome: outcome as any, replayCompletedAt: new Date() })
              .where(eq(regimeFactorAlternates.id, row.id));
            unmatched++;
            stats.rowsReplayed++;
            continue;
          }

          // Matched. Build the replay-outcome payload via shared core.
          const outcome = computeReplayOutcomeFromTrade(entry.trade, row.vtsTradeId, entry.source);
          await db
            .update(regimeFactorAlternates)
            .set({ replayOutcome: outcome as any, replayCompletedAt: new Date() })
            .where(eq(regimeFactorAlternates.id, row.id));
          matched++;
          stats.rowsReplayed++;
        }
        console.log(
          `[B67.0][replay-ablation] VTS replay: matched=${matched} unmatched=${unmatched} (unmatched are marked unreplayable_real_rejected; cron will skip on subsequent runs)`,
        );
      } catch (err) {
        console.error('[B67.0][replay-ablation] VTS replay error:', err instanceof Error ? err.message : err);
        stats.errors++;
      }
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
  pnl: number,
): 'admitted_won' | 'admitted_lost' | 'admitted_breakeven' {
  // 2026-05-01 (B67.4 calibration window verification): VirtualTrade.netProfit
  // is stored as a FRACTION (0.005 = 0.5% return), NOT dollars. Pre-fix the
  // threshold was `>= 0.5` (interpreted as $0.50) which never fired — every
  // trade landed in `admitted_breakeven`, collapsing tertile-WR analysis to
  // 0% across the board. Fix: 0.5% return is the meaningful-win threshold,
  // matching the gross/net log lines in vts-service.ts:335 which print
  // `(netProfit * 100).toFixed(3)%`.
  if (pnl >= 0.005) return 'admitted_won';
  if (pnl <= -0.005) return 'admitted_lost';
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

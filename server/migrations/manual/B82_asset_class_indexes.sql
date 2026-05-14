-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ BATCH_82 — Asset-class composite indexes on ablation/calibration tables  ║
-- ║ Date: 2026-05-14                                                          ║
-- ║ Author: Claude Code                                                       ║
-- ║ Workflow step: §3.b (DB index migration)                                  ║
-- ║                                                                           ║
-- ║ FORWARD DDL — apply manually via psql; CANNOT run inside transaction.    ║
-- ║ Pre-audit B82 §3 confirmed neither table is partitioned, so straight     ║
-- ║ CREATE INDEX CONCURRENTLY works (no per-partition coordination needed).  ║
-- ║                                                                           ║
-- ║ Idempotent: IF NOT EXISTS guards. Safe to re-run.                         ║
-- ║                                                                           ║
-- ║ Rollback: server/migrations/manual/B82_asset_class_indexes_rollback.sql  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── Index 1: exit_strategy_alternates ─────────────────────────────────────
-- Supports queries that filter by asset_class + filter/sort by created_at.
-- Used by:
--   - exit-strategy-ablation-aggregator.ts:88,100,117 (3 sub-queries in
--     computeExitStrategyAblation) — drives /api/xstocks/exit-strategy-ablation
--     + /api/analytics/exit-strategy-ablation endpoints.
-- Pre-B82 EXPLAIN showed 32s scan time with post-bitmap-scan Filter on
-- asset_class. Post-B82 EXPLAIN must show Index Cond on (asset_class, created_at).
-- See pre-audit §6.4 for verification query.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_exit_strategy_alternates_asset_created
ON public.exit_strategy_alternates (asset_class, created_at DESC);

-- ── Index 2: regime_factor_alternates (partial — replay-completed only) ───
-- Supports queries that filter by asset_class + filter by replay_completed_at
-- IS NOT NULL + filter/sort by evaluated_at.
-- Used by:
--   - drift-dashboard-aggregator.ts:501,1053 — drives /api/xstocks/factor-
--     calibration + /api/analytics/factor-calibration endpoints. Both queries
--     include `AND replay_completed_at IS NOT NULL` in the WHERE clause, so
--     the partial-index predicate matches.
-- Partial index reduces index size + improves performance — the table has
-- many pending (replay_completed_at IS NULL) rows that are not relevant to
-- the calibration computation.
-- See pre-audit §6.4b for verification query (partial-predicate validation).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_regime_factor_alternates_asset_evaluated
ON public.regime_factor_alternates (asset_class, evaluated_at DESC)
WHERE replay_completed_at IS NOT NULL;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ BATCH_82 ROLLBACK — Drop asset-class composite indexes                   ║
-- ║ Date: 2026-05-14                                                          ║
-- ║                                                                           ║
-- ║ Idempotent: IF EXISTS guards. Safe to re-run.                             ║
-- ║ Zero data impact (indexes are derived data). Reverts to pre-B82 query    ║
-- ║ plans (slow xstock paths). Use only if writer-side fix needs reversion   ║
-- ║ for unforeseen reasons; the indexes themselves are additive and harmless.║
-- ╚══════════════════════════════════════════════════════════════════════════╝

DROP INDEX CONCURRENTLY IF EXISTS public.idx_exit_strategy_alternates_asset_created;

DROP INDEX CONCURRENTLY IF EXISTS public.idx_regime_factor_alternates_asset_evaluated;

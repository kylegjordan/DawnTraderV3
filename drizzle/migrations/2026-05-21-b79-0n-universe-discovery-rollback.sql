-- =====================================================================
-- B79.0n.UNIVERSE-DISCOVERY — rollback for 2026-05-21-b79-0n-universe-discovery.sql
-- =====================================================================
--
-- Drops the three tables introduced by the universe-discovery migration.
-- Safe to re-run: uses IF EXISTS.
--
-- WARNING: this drops the dynamic universe AND the override curation
-- AND the discovery audit history. After rollback the application reverts
-- to consuming the hardcoded XSTOCK_SPOT_REGISTRY Map literal in
-- shared/asset-classes.ts — but that requires the application code to
-- also be reverted. Use only as part of a coordinated rollback of the
-- universe-discovery code changes (commit 6050165cf or earlier).
-- =====================================================================

BEGIN;

DROP TABLE IF EXISTS discovery_runs;
DROP TABLE IF EXISTS xstock_spot_universe_overrides;
DROP TABLE IF EXISTS xstock_spot_universe;

DELETE FROM _migrations WHERE filename = '2026-05-21-b79-0n-universe-discovery.sql';

COMMIT;

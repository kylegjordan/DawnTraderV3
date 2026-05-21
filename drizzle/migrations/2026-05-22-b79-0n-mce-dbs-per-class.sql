-- =====================================================================
-- B79.0n.MCE — dbs_calculation per-asset-class seed migration
-- =====================================================================
-- Sub-batch 4 of 18 in the B79.0n umbrella arc.
--
-- Purpose: replace the single wildcard (*,*,*,*) module_constants row for
-- dbs_calculation.min_sample_count with explicit per-asset-class rows
-- (crypto_spot + xstock_spot), then retire the wildcard. After B79.0n.MCE
-- removes the silent crypto-default footgun, both directional-bias-store
-- instances (crypto + xstock, per B-PHASE-A2 2026-05-17) resolve their own
-- explicit per-class row instead of both silently falling through to the
-- shared wildcard via the resolver's most-specific-wins hierarchy.
--
-- Behaviour delta: ZERO at runtime — the xstock_spot row is a byte-for-byte
-- placeholder-clone of the crypto value (20). Phase 19 active-trade
-- calibration replaces the xstock value with a measured one. This migration
-- changes the resolution PATH (explicit per-class), not the resolved VALUE.
--
-- Scope discipline (Langston Step 2 C1): this migration touches ONLY
-- dbs_calculation.min_sample_count. B-PHASE-A2's xstock-only
-- dbs_calculation.sector_coverage_floor row is NOT touched — every WHERE
-- clause below filters on constant_name = 'min_sample_count' exactly.
--
-- Source wildcard row carries exchange = '*' (verified B79.0n.MCE pre-audit
-- §2); the SELECT preserves that exchange value into both new class-scoped
-- rows, so there is no exchange-axis ambiguity.
--
-- Idempotent: ON CONFLICT DO NOTHING on the inserts; EXISTS-gated DELETE.
-- Re-running after a successful pass is a no-op. Atomic — single transaction.
--
-- Rollback: see 2026-05-22-b79-0n-mce-dbs-per-class-rollback.sql companion.
-- =====================================================================

BEGIN;

-- Step 1: add the crypto_spot row, cloning the wildcard value byte-for-byte.
-- Crypto behaviour is preserved exactly — the resolver previously fell
-- through to the wildcard for assetClass='crypto_spot'; it now lands on this
-- explicit row holding the identical value.
INSERT INTO module_constants
  (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by)
SELECT module_name, exchange, 'crypto_spot' AS asset_class, strategy, regime, constant_name, value, 'b79-0n-mce'
FROM module_constants
WHERE module_name = 'dbs_calculation'
  AND asset_class = '*'
  AND constant_name = 'min_sample_count'
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- Step 2: add the xstock_spot row — placeholder-clone of the crypto value.
-- Phase 19 active-trade calibration replaces this with a measured value.
INSERT INTO module_constants
  (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by)
SELECT module_name, exchange, 'xstock_spot' AS asset_class, strategy, regime, constant_name, value, 'b79-0n-mce'
FROM module_constants
WHERE module_name = 'dbs_calculation'
  AND asset_class = '*'
  AND constant_name = 'min_sample_count'
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- Step 3: retire the wildcard row — but ONLY after both class-scoped rows
-- are confirmed present. The EXISTS guards eliminate any orphan window where
-- the wildcard is gone but a class-scoped replacement is missing (which would
-- make getCachedNumberRequired throw on that class's first cycle).
DELETE FROM module_constants w
WHERE w.module_name = 'dbs_calculation'
  AND w.asset_class = '*'
  AND w.constant_name = 'min_sample_count'
  AND EXISTS (
    SELECT 1 FROM module_constants r
    WHERE r.module_name = w.module_name
      AND r.asset_class = 'crypto_spot'
      AND r.constant_name = w.constant_name
      AND r.exchange = w.exchange
      AND r.strategy = w.strategy
      AND r.regime = w.regime
  )
  AND EXISTS (
    SELECT 1 FROM module_constants r
    WHERE r.module_name = w.module_name
      AND r.asset_class = 'xstock_spot'
      AND r.constant_name = w.constant_name
      AND r.exchange = w.exchange
      AND r.strategy = w.strategy
      AND r.regime = w.regime
  );

COMMIT;

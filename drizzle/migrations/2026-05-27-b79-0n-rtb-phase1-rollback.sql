-- ════════════════════════════════════════════════════════════════════════════
-- B79.0n.RTB Phase 1 ROLLBACK — undo asset_class column + cadence seed
-- ════════════════════════════════════════════════════════════════════════════
--
-- Reverse of 2026-05-27-b79-0n-rtb-phase1.sql. Applied only if Phase 1
-- needs to be unwound (typically because a downstream issue surfaces during
-- post-deploy verification before Phase 2 backfill kicks off).
--
-- IMPORTANT: this rollback MUST run BEFORE PM2 restart that activates the
-- Chunk E dual-write code, otherwise the dual-write writes will fail (no
-- column to write to). If Phase 2 backfill already wrote rows, those rows
-- become permanently unrecoverable IF the column is dropped — Phase 2
-- backfill should be considered a one-way commit.

BEGIN;

-- ────────────────────────────────────────────────────────────────────────
-- §1. Drop the 4 module_constants seed rows
-- ────────────────────────────────────────────────────────────────────────

DELETE FROM module_constants
WHERE module_name = 'rtb_config'
  AND constant_name = 'refresh_interval_ms'
  AND asset_class IN ('crypto_spot', 'crypto_perp', 'xstock_spot', 'xstock_perp')
  AND updated_by = 'B79.0n.RTB';

-- ────────────────────────────────────────────────────────────────────────
-- §2. Drop the asset_class column
-- ────────────────────────────────────────────────────────────────────────
--
-- WARNING: this is destructive of any backfill data. Only run if you are
-- certain Phase 2 backfill has NOT yet committed values that need preserved.

ALTER TABLE rtb_signals
  DROP COLUMN IF EXISTS asset_class;

-- ────────────────────────────────────────────────────────────────────────
-- §3. Verify clean reversal
-- ────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  col_exists BOOLEAN;
  seed_count INTEGER;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rtb_signals' AND column_name = 'asset_class'
  ) INTO col_exists;

  SELECT COUNT(*) INTO seed_count
  FROM module_constants
  WHERE module_name = 'rtb_config'
    AND constant_name = 'refresh_interval_ms';

  IF col_exists THEN
    RAISE EXCEPTION 'B79.0n.RTB Phase 1 ROLLBACK FAILED: asset_class column still exists';
  END IF;

  IF seed_count != 0 THEN
    RAISE EXCEPTION 'B79.0n.RTB Phase 1 ROLLBACK FAILED: % residual refresh_interval_ms rows remain (expected 0)', seed_count;
  END IF;

  RAISE NOTICE 'B79.0n.RTB Phase 1 ROLLBACK OK: asset_class column dropped, 0 residual cadence rows';
END $$;

COMMIT;

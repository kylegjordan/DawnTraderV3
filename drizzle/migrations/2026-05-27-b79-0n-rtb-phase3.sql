-- ════════════════════════════════════════════════════════════════════════════
-- B79.0n.RTB Phase 3 — CHECK constraint + index
-- ════════════════════════════════════════════════════════════════════════════
--
-- Per scope v2.2 OBJ-1 Phase 3:
--   - ADD CHECK constraint enforcing asset_class IS NOT NULL (post-backfill
--     enforcement; SET NOT NULL column constraint is Phase 4 contingent on
--     §6.4 zero-null gate per Langston C-4)
--   - CREATE INDEX (mode, asset_class, status) for per-class queue reads
--
-- PRECONDITION: Phase 2 backfill script (b79-0n-rtb-backfill-asset-class.ts)
-- MUST have completed before this migration runs. Verification block at the
-- top fails-loud if any nulls remain.
--
-- Idempotent: ADD CONSTRAINT IF NOT EXISTS (via DO block check) + CREATE
-- INDEX IF NOT EXISTS. Safe to re-run.
--
-- Rollback: see companion 2026-05-27-b79-0n-rtb-phase3-rollback.sql

BEGIN;

-- ────────────────────────────────────────────────────────────────────────
-- §1. Precondition verification: zero nulls before CHECK constraint applies
-- ────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  null_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO null_count
  FROM rtb_signals
  WHERE asset_class IS NULL;

  IF null_count > 0 THEN
    RAISE EXCEPTION 'B79.0n.RTB Phase 3 PRECONDITION FAILED: % rows still have asset_class IS NULL. Run Phase 2 backfill (npm run b79-0n-rtb-backfill) before applying Phase 3.', null_count;
  END IF;

  RAISE NOTICE 'B79.0n.RTB Phase 3 precondition OK: 0 null rows in rtb_signals.asset_class';
END $$;

-- ────────────────────────────────────────────────────────────────────────
-- §2. CHECK constraint: enforce NOT NULL via CHECK (Phase 4 column-level
--      SET NOT NULL is contingent in-batch per §6.4)
-- ────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'rtb_signals'
      AND constraint_name = 'rtb_signals_asset_class_not_null_chk'
  ) THEN
    ALTER TABLE rtb_signals
      ADD CONSTRAINT rtb_signals_asset_class_not_null_chk
      CHECK (asset_class IS NOT NULL);
    RAISE NOTICE 'B79.0n.RTB Phase 3: CHECK constraint rtb_signals_asset_class_not_null_chk created';
  ELSE
    RAISE NOTICE 'B79.0n.RTB Phase 3: CHECK constraint already exists, skipping';
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────────
-- §3. Index: (mode, asset_class, status) for hot per-class queue reads
-- ────────────────────────────────────────────────────────────────────────
--
-- Covers the dominant read pattern: storage.getRtbSignals({ mode,
-- assetClass, status }) called from the per-class queue accessors in
-- ready_to_buy_service.ts (Chunk F). Also covers existing (mode, status)
-- reads since asset_class is in the middle of the composite key.

CREATE INDEX IF NOT EXISTS rtb_signals_mode_asset_class_status_idx
  ON rtb_signals (mode, asset_class, status);

COMMIT;

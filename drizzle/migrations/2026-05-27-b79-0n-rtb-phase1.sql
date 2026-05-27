-- ════════════════════════════════════════════════════════════════════════════
-- B79.0n.RTB Phase 1 — asset_class column ADD + refresh cadence seed
-- ════════════════════════════════════════════════════════════════════════════
--
-- Per scope v2.2 (commit 239723058) OBJ-1 Phase 1 + Langston Step 2 ACK
-- (commit 97572094e):
--   - ADD COLUMN asset_class VARCHAR (NULLABLE in Phase 1 per Langston C-3 +
--     C-4; Phase 4 SET NOT NULL is contingent on §6.4 48h zero-null gate)
--   - Seed 4 module_constants rows for rtb_config.refresh_interval_ms
--     (uniform 30000ms across all 4 active classes per Kyle directive
--     2026-05-27 + scope §3.1 lock). C-10 mitigation: HARD-FAIL boot in
--     server/index.ts requires these 4 rows to exist pre-PM2-restart.
--
-- This migration applies BEFORE the PM2 restart that activates dual-write
-- code (Chunk E updates storage.insertRtbSignal). Phase 2 backfill script
-- (`scripts/b79-0n-rtb-backfill-asset-class.ts`) runs IMMEDIATELY post-
-- Phase-1-deploy to bound the null-window to in-flight rows only.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + INSERT ON CONFLICT DO NOTHING.
-- Safe to re-run; safe to roll back via companion file.
--
-- Rollback: see companion 2026-05-27-b79-0n-rtb-phase1-rollback.sql

BEGIN;

-- ────────────────────────────────────────────────────────────────────────
-- §1. Schema: ADD COLUMN asset_class (nullable, no default, no CHECK)
-- ────────────────────────────────────────────────────────────────────────
--
-- VARCHAR(32) holds the AssetClass enum values from
-- `shared/asset-classes.ts` (crypto_spot, crypto_perp, xstock_spot,
-- xstock_perp + 4 reserved-future). NOT NULL is deferred to Phase 4
-- (contingent on §6.4 48h gate per Langston C-4).

ALTER TABLE rtb_signals
  ADD COLUMN IF NOT EXISTS asset_class VARCHAR(32) NULL;

COMMENT ON COLUMN rtb_signals.asset_class IS
  'B79.0n.RTB Phase 1 2026-05-27: per-class queue partitioning key. NULL allowed only during Phase 1+2 backfill window. Post-Phase-3 CHECK constraint + Phase 4 (contingent) SET NOT NULL.';

-- ────────────────────────────────────────────────────────────────────────
-- §2. Module-constants: seed 4 refresh_interval_ms rows (C-10 mitigation)
-- ────────────────────────────────────────────────────────────────────────
--
-- Per Kyle directive 2026-05-27 + scope §3.1 lock: all 4 active classes
-- use uniform 30000ms (matches current crypto behavior). Per-class
-- plumbing exists so Phase E xstock calibration evidence can change
-- the xstock value via DB-only update later. Per-class isolation comes
-- from Option A nested buckets (Chunk H), not from per-class cadence.
--
-- Module name = 'rtb_config' (matches existing rtb_config.tcl_warmup_-
-- threshold_signals namespace at ready_to_buy_service.ts:149).

INSERT INTO module_constants
  (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by)
VALUES
  ('rtb_config', '*', 'crypto_spot',  '*', '*', 'refresh_interval_ms', '30000'::jsonb, 'B79.0n.RTB'),
  ('rtb_config', '*', 'crypto_perp',  '*', '*', 'refresh_interval_ms', '30000'::jsonb, 'B79.0n.RTB'),
  ('rtb_config', '*', 'xstock_spot',  '*', '*', 'refresh_interval_ms', '30000'::jsonb, 'B79.0n.RTB'),
  ('rtb_config', '*', 'xstock_perp',  '*', '*', 'refresh_interval_ms', '30000'::jsonb, 'B79.0n.RTB')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name)
DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────
-- §3. Verification: confirm 4 rows landed (HARD-FAIL trigger if not)
-- ────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  row_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO row_count
  FROM module_constants
  WHERE module_name = 'rtb_config'
    AND constant_name = 'refresh_interval_ms'
    AND asset_class IN ('crypto_spot', 'crypto_perp', 'xstock_spot', 'xstock_perp');

  IF row_count != 4 THEN
    RAISE EXCEPTION 'B79.0n.RTB Phase 1 verification FAILED: expected 4 rtb_config.refresh_interval_ms rows for 4 active classes, found %', row_count;
  END IF;

  RAISE NOTICE 'B79.0n.RTB Phase 1 verification OK: 4 refresh_interval_ms rows landed (crypto_spot, crypto_perp, xstock_spot, xstock_perp = 30000ms each)';
END $$;

COMMIT;

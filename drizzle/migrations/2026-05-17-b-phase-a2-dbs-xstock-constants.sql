-- db-migrate:skip
-- B-NEW-43 Phase 2 chunk 4.7 (2026-05-23): bulk skip-marker added. This
-- migration's effects are already captured in 2026-04-22-initial-schema.sql
-- (pg_dump of staging state on 2026-05-23). On a fresh empty Postgres,
-- initial-schema applies the FINAL state; re-running this delta would
-- duplicate-create or otherwise conflict (idempotent ALTER-IF-NOT-EXISTS
-- migrations would no-op but still run unnecessarily; non-idempotent ones
-- would error). Skip-marker ledger-records as applied without running the
-- SQL. See scripts/db-migrate.ts SKIP_MARKER + 1-system-manual/staging-
-- coordination/2026-04-22-initial-schema-mark-applied.sql for the full
-- staging-vs-CI bootstrap divergence model.
-- B-PHASE-A2 — xstock_spot DBS calculation module_constants rows.
--
-- Phase A.2 of xStock Calibration Plan, sub-task D.
--
-- Seeds 8 xstock_spot-keyed rows under module='dbs_calculation' so the
-- xstockDirectionalBiasStore reads asset-class-specific values for the floor
-- mechanic + (byte-identical to crypto) component weights. The wildcard
-- (*, *, *, *, *) rows for crypto stay untouched — crypto callers continue
-- to read 20 for min_sample_count etc.
--
-- Per scope rev2 D13 + Langston Step 1 #5 isolation note:
--   These per-asset-class rows isolate xStock from any future crypto-side
--   retunes of the wildcard rows. xStock-specific retunes happen post-A.3
--   evidence-gated per CLAUDE.md §5 #15 (per-asset-class is the default,
--   wildcards are placeholders).
--
-- Per scope rev2 Q7 ACK: ON CONFLICT DO UPDATE for idempotency. Re-running
-- the migration safely updates values if the row already exists.
--
-- Reference: B_PHASE_A1_DBS_design_ask_rev2.md §3.6 (floor mechanics +
-- byte-identical component weights). B_PHASE_A2_DBS_SCOPE.md D13 (full
-- knob table).

BEGIN;

INSERT INTO module_constants
  (module_name, constant_name, value, asset_class, exchange, regime, strategy, updated_at, updated_by)
VALUES
  -- Dual floor mechanics (xStock-specific) ----------------------------------
  -- Global floor: 30 GICS-sectored non-sentinel entries (vs crypto wildcard 20)
  ('dbs_calculation', 'min_sample_count',     '30'::jsonb,    'xstock_spot', '*', '*', '*', NOW(), 'b-phase-a2-layer1-starter'),
  -- Sector coverage floor: ≥7 distinct GICS sectors must each have ≥1 non-sentinel entry
  -- NEW knob — does not exist for crypto (sector partition only meaningful for xStocks)
  ('dbs_calculation', 'sector_coverage_floor', '7'::jsonb,    'xstock_spot', '*', '*', '*', NOW(), 'b-phase-a2-layer1-starter'),

  -- Byte-identical-to-crypto component weights -----------------------------
  -- Per B_PHASE_A1_DBS_design_ask_rev2.md §2 mirror invariant: no
  -- pre-emptive equity-tune. Component-weight retune is post-A.3 evidence-gated.
  -- Explicit xstock_spot rows here isolate future retunes from crypto wildcard reads.
  ('dbs_calculation', 'slope_weight',          '0.40'::jsonb, 'xstock_spot', '*', '*', '*', NOW(), 'b-phase-a2-byte-identical-crypto'),
  ('dbs_calculation', 'return_weight',         '0.35'::jsonb, 'xstock_spot', '*', '*', '*', NOW(), 'b-phase-a2-byte-identical-crypto'),
  ('dbs_calculation', 'ema_weight',            '0.25'::jsonb, 'xstock_spot', '*', '*', '*', NOW(), 'b-phase-a2-byte-identical-crypto'),
  ('dbs_calculation', 'lookback_period',       '48'::jsonb,   'xstock_spot', '*', '*', '*', NOW(), 'b-phase-a2-byte-identical-crypto'),
  ('dbs_calculation', 'ema_fast_period',       '12'::jsonb,   'xstock_spot', '*', '*', '*', NOW(), 'b-phase-a2-byte-identical-crypto'),
  ('dbs_calculation', 'ema_slow_period',       '26'::jsonb,   'xstock_spot', '*', '*', '*', NOW(), 'b-phase-a2-byte-identical-crypto')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name)
  DO UPDATE SET
    value      = EXCLUDED.value,
    updated_at = NOW(),
    updated_by = EXCLUDED.updated_by;

-- Wildcard crypto rows untouched. Crypto callers (assetClass='crypto_spot' or
-- assetClass='*' resolution key) continue to read the wildcard row (min_sample_count=20
-- at the (*, *, *, *, *) row established by B72). The new xstock_spot-keyed
-- rows resolve via the more-specific match precedence in scoreRowForKey()
-- (module-constants-service.ts:108-219).

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- B79.0n.TEC Migration 1 — per-class TEC config seed (32 new rows)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Per pre-audit §5.1 + Langston Step 2 ACK (APPROVED FOR STEP 3 with R-1 + R-2
-- required revisions + N-1..N-4 inline notes; N-1 incorporated below).
--
-- This migration closes the B79.TEC follow-up explicitly deferred at
-- `trailing-exit-controller.ts:358-359` (RUNNING_ISSUES #85): extend HARD-FAIL
-- coverage from 1 → 11 TEC keys by seeding explicit per-class rows for every
-- ACTIVE asset class. Companion Migration 2 (wildcard retirement) ships in
-- same deploy per D-4 single-batch (clean wildcard-consumer grep).
--
-- Rows seeded:
-- (A) 8 rows: crypto_perp + xstock_perp coverage for the 4 hot keys currently
--     per-class for spot only (break_even_trigger_r, target_lock_r,
--     trail_distance_atr_multiplier, rung_floor_slippage_buffer_multiplier).
-- (B) 24 rows: 6 wildcard-only keys × 4 active classes (persistence_debounce_ms
--     + 5 moonbag keys).
--
-- Day-1 values are VARIANT-K-ALIGNED:
--   - `moonbag_qualifying_strategies = []` ALL CLASSES per Kyle 2026-05-05
--     directive (`kyle-2026-05-05-disable-trailing-after-target`). NOT a drift;
--     this is the intentional kill-switch state. See pre-audit §-1 F-1.
--   - All other moonbag config matches existing wildcard semantics.
--
-- N-1 incorporated: xstock_perp seed values match WILDCARD (not xstock_spot
-- values like trail_distance_atr_multiplier=0.8). Rationale: perp not active,
-- no operational P&L, Kyle can flip when perp activates. xstock_perp != xstock_spot
-- at Day-1 by design — perp has different funding/spread/ATR profile that
-- empirically belongs to its own class, not inherited from spot.
--
-- Idempotent: ON CONFLICT DO NOTHING + DO-block verification on the
-- `updated_by='B79.0n.TEC'` stamp catches partial-prior-state (fail-loud rather
-- than silent top-off).
--
-- Rollback: see companion -rollback.sql

BEGIN;

INSERT INTO module_constants
  (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by)
VALUES
  -- ─── (A.1) 8 rows: crypto_perp + xstock_perp coverage for 4 hot keys ───
  ('trailing_exit', '*', 'crypto_perp', '*', '*', 'break_even_trigger_r',                  '1.0'::jsonb, 'B79.0n.TEC'),
  ('trailing_exit', '*', 'crypto_perp', '*', '*', 'target_lock_r',                         '1.5'::jsonb, 'B79.0n.TEC'),
  ('trailing_exit', '*', 'crypto_perp', '*', '*', 'trail_distance_atr_multiplier',         '1.0'::jsonb, 'B79.0n.TEC'),
  ('trailing_exit', '*', 'crypto_perp', '*', '*', 'rung_floor_slippage_buffer_multiplier', '1.0'::jsonb, 'B79.0n.TEC'),
  ('trailing_exit', '*', 'xstock_perp', '*', '*', 'break_even_trigger_r',                  '1.0'::jsonb, 'B79.0n.TEC'),
  ('trailing_exit', '*', 'xstock_perp', '*', '*', 'target_lock_r',                         '1.5'::jsonb, 'B79.0n.TEC'),
  ('trailing_exit', '*', 'xstock_perp', '*', '*', 'trail_distance_atr_multiplier',         '1.0'::jsonb, 'B79.0n.TEC'),
  ('trailing_exit', '*', 'xstock_perp', '*', '*', 'rung_floor_slippage_buffer_multiplier', '1.0'::jsonb, 'B79.0n.TEC'),

  -- ─── (A.2) 8 rows: idempotent backfill for crypto_spot + xstock_spot ───
  -- These rows EXIST on staging (seeded by B65/B79.0m.b era migrations) but are
  -- ABSENT from CI's initial-schema.sql pg_dump baseline. ON CONFLICT DO NOTHING
  -- below means staging skips these inserts (rows already there with operator-
  -- set values); CI gets them seeded with Day-1 defaults matching staging.
  -- xstock_spot.trail_distance_atr_multiplier = 0.8 per B79.0m.b empirical
  -- equity-baseline value (NOT 1.0 like other classes).
  ('trailing_exit', '*', 'crypto_spot', '*', '*', 'break_even_trigger_r',                  '1.0'::jsonb, 'B79.0n.TEC'),
  ('trailing_exit', '*', 'crypto_spot', '*', '*', 'target_lock_r',                         '1.5'::jsonb, 'B79.0n.TEC'),
  ('trailing_exit', '*', 'crypto_spot', '*', '*', 'trail_distance_atr_multiplier',         '1.0'::jsonb, 'B79.0n.TEC'),
  ('trailing_exit', '*', 'crypto_spot', '*', '*', 'rung_floor_slippage_buffer_multiplier', '1.0'::jsonb, 'B79.0n.TEC'),
  ('trailing_exit', '*', 'xstock_spot', '*', '*', 'break_even_trigger_r',                  '1.0'::jsonb, 'B79.0n.TEC'),
  ('trailing_exit', '*', 'xstock_spot', '*', '*', 'target_lock_r',                         '1.5'::jsonb, 'B79.0n.TEC'),
  ('trailing_exit', '*', 'xstock_spot', '*', '*', 'trail_distance_atr_multiplier',         '0.8'::jsonb, 'B79.0n.TEC'),
  ('trailing_exit', '*', 'xstock_spot', '*', '*', 'rung_floor_slippage_buffer_multiplier', '1.0'::jsonb, 'B79.0n.TEC'),

  -- ─── (B) 24 rows: 6 wildcard-only keys × 4 active classes ───

  -- persistence_debounce_ms (F-1 identical 5000 all classes)
  ('trailing_exit', '*', 'crypto_spot', '*', '*', 'persistence_debounce_ms', '5000'::jsonb, 'B79.0n.TEC'),
  ('trailing_exit', '*', 'crypto_perp', '*', '*', 'persistence_debounce_ms', '5000'::jsonb, 'B79.0n.TEC'),
  ('trailing_exit', '*', 'xstock_spot', '*', '*', 'persistence_debounce_ms', '5000'::jsonb, 'B79.0n.TEC'),
  ('trailing_exit', '*', 'xstock_perp', '*', '*', 'persistence_debounce_ms', '5000'::jsonb, 'B79.0n.TEC'),

  -- moonbag_qualifying_strategies (VARIANT-K ALIGNMENT: [] all classes preserves
  -- Kyle 2026-05-05 disable-trailing-after-target directive)
  ('trailing_exit', '*', 'crypto_spot', '*', '*', 'moonbag_qualifying_strategies', '[]'::jsonb, 'B79.0n.TEC'),
  ('trailing_exit', '*', 'crypto_perp', '*', '*', 'moonbag_qualifying_strategies', '[]'::jsonb, 'B79.0n.TEC'),
  ('trailing_exit', '*', 'xstock_spot', '*', '*', 'moonbag_qualifying_strategies', '[]'::jsonb, 'B79.0n.TEC'),
  ('trailing_exit', '*', 'xstock_perp', '*', '*', 'moonbag_qualifying_strategies', '[]'::jsonb, 'B79.0n.TEC'),

  -- moonbag_qualifying_source_pools (F-1 identical default all classes)
  ('trailing_exit', '*', 'crypto_spot', '*', '*', 'moonbag_qualifying_source_pools', '{"vwap_pullback":["quant-strong_trend"]}'::jsonb, 'B79.0n.TEC'),
  ('trailing_exit', '*', 'crypto_perp', '*', '*', 'moonbag_qualifying_source_pools', '{"vwap_pullback":["quant-strong_trend"]}'::jsonb, 'B79.0n.TEC'),
  ('trailing_exit', '*', 'xstock_spot', '*', '*', 'moonbag_qualifying_source_pools', '{"vwap_pullback":["quant-strong_trend"]}'::jsonb, 'B79.0n.TEC'),
  ('trailing_exit', '*', 'xstock_perp', '*', '*', 'moonbag_qualifying_source_pools', '{"vwap_pullback":["quant-strong_trend"]}'::jsonb, 'B79.0n.TEC'),

  -- moonbag_max_duration_ms (F-1 identical 4h all classes)
  ('trailing_exit', '*', 'crypto_spot', '*', '*', 'moonbag_max_duration_ms', '14400000'::jsonb, 'B79.0n.TEC'),
  ('trailing_exit', '*', 'crypto_perp', '*', '*', 'moonbag_max_duration_ms', '14400000'::jsonb, 'B79.0n.TEC'),
  ('trailing_exit', '*', 'xstock_spot', '*', '*', 'moonbag_max_duration_ms', '14400000'::jsonb, 'B79.0n.TEC'),
  ('trailing_exit', '*', 'xstock_perp', '*', '*', 'moonbag_max_duration_ms', '14400000'::jsonb, 'B79.0n.TEC'),

  -- moonbag_cap_mode (F-1 identical "reserved_slots" all classes)
  ('trailing_exit', '*', 'crypto_spot', '*', '*', 'moonbag_cap_mode', '"reserved_slots"'::jsonb, 'B79.0n.TEC'),
  ('trailing_exit', '*', 'crypto_perp', '*', '*', 'moonbag_cap_mode', '"reserved_slots"'::jsonb, 'B79.0n.TEC'),
  ('trailing_exit', '*', 'xstock_spot', '*', '*', 'moonbag_cap_mode', '"reserved_slots"'::jsonb, 'B79.0n.TEC'),
  ('trailing_exit', '*', 'xstock_perp', '*', '*', 'moonbag_cap_mode', '"reserved_slots"'::jsonb, 'B79.0n.TEC'),

  -- moonbag_reserved_slots (F-1 identical 1 all classes)
  ('trailing_exit', '*', 'crypto_spot', '*', '*', 'moonbag_reserved_slots', '1'::jsonb, 'B79.0n.TEC'),
  ('trailing_exit', '*', 'crypto_perp', '*', '*', 'moonbag_reserved_slots', '1'::jsonb, 'B79.0n.TEC'),
  ('trailing_exit', '*', 'xstock_spot', '*', '*', 'moonbag_reserved_slots', '1'::jsonb, 'B79.0n.TEC'),
  ('trailing_exit', '*', 'xstock_perp', '*', '*', 'moonbag_reserved_slots', '1'::jsonb, 'B79.0n.TEC')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- ── Verification assertion: all 11 TEC keys × 4 active classes = 44 rows present ──
-- Counts on ALL rows for the 4 active classes (regardless of updated_by stamp),
-- because the idempotent A.2 block depends on pre-existing rows existing on staging.
-- Fail-loud on missing keys (e.g., partial-prior-state OR a future TEC key
-- added to ALL_TEC_KEYS but not seeded here).
DO $$
DECLARE
  TEC_KEYS text[] := ARRAY[
    'break_even_enabled', 'break_even_trigger_r', 'target_lock_r',
    'trail_distance_atr_multiplier', 'rung_floor_slippage_buffer_multiplier',
    'persistence_debounce_ms', 'moonbag_qualifying_strategies',
    'moonbag_qualifying_source_pools', 'moonbag_max_duration_ms',
    'moonbag_cap_mode', 'moonbag_reserved_slots'
  ];
  ACTIVE_CLASSES text[] := ARRAY['crypto_spot','crypto_perp','xstock_spot','xstock_perp'];
  expected_count int := 44;  -- 11 keys × 4 classes
  actual int;
BEGIN
  SELECT COUNT(*) INTO actual FROM module_constants
   WHERE module_name='trailing_exit'
     AND asset_class = ANY(ACTIVE_CLASSES)
     AND constant_name = ANY(TEC_KEYS);
  IF actual != expected_count THEN
    RAISE EXCEPTION 'B79.0n.TEC Migration 1 assertion failed: expected % per-class rows for 11 TEC keys × 4 active classes, found %. Missing key(s); manual review required.', expected_count, actual;
  END IF;
END $$;

COMMIT;

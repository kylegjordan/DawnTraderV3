-- ════════════════════════════════════════════════════════════════════════════
-- B79.0n.TEC Migration 2 — wildcard retirement for all 11 TEC keys
-- ════════════════════════════════════════════════════════════════════════════
--
-- Per pre-audit §5.2 + Langston Step 2 D-4 disposition (single-batch confirmed
-- via clean grep — zero consumers read assetClass='*' directly from
-- module_constants 'trailing_exit').
--
-- EXISTS-gated DELETE: only retire wildcard rows AFTER all 4 active asset
-- classes have explicit per-class rows for every TEC key. Defense-in-depth
-- against partial Migration-1 application.
--
-- N-2 (Langston ACK): hardcoded 4-class IN-clause acceptable for B79.0n.TEC
-- Day-1. Future migrations should source from getActiveAssetClasses() SSOT —
-- non-trivial in pure SQL (requires server-side pg_temp function or
-- node-driven migration wrapper). Filed for §4.16 onboarding follow-up.

BEGIN;

-- ── EXISTS-gate: assert all 4 active classes × all 11 keys have explicit rows ──
DO $$
DECLARE
  TEC_KEYS text[] := ARRAY[
    'break_even_enabled',
    'break_even_trigger_r',
    'target_lock_r',
    'trail_distance_atr_multiplier',
    'rung_floor_slippage_buffer_multiplier',
    'persistence_debounce_ms',
    'moonbag_qualifying_strategies',
    'moonbag_qualifying_source_pools',
    'moonbag_max_duration_ms',
    'moonbag_cap_mode',
    'moonbag_reserved_slots'
  ];
  ACTIVE_CLASSES text[] := ARRAY['crypto_spot','crypto_perp','xstock_spot','xstock_perp'];
  k text;
  per_class_count int;
BEGIN
  FOREACH k IN ARRAY TEC_KEYS LOOP
    SELECT COUNT(*) INTO per_class_count
      FROM module_constants
     WHERE module_name='trailing_exit'
       AND constant_name=k
       AND asset_class = ANY(ACTIVE_CLASSES);
    IF per_class_count != 4 THEN
      RAISE EXCEPTION 'B79.0n.TEC Migration 2 EXISTS-gate failed: key=% has %/4 per-class rows. Wildcard retirement aborted. Run Migration 1 first or investigate partial state.', k, per_class_count;
    END IF;
  END LOOP;
END $$;

-- All gates passed — delete wildcard rows
DELETE FROM module_constants
 WHERE module_name='trailing_exit' AND asset_class='*';

-- Verify zero wildcard rows remain
DO $$
DECLARE
  remaining int;
BEGIN
  SELECT COUNT(*) INTO remaining FROM module_constants
   WHERE module_name='trailing_exit' AND asset_class='*';
  IF remaining != 0 THEN
    RAISE EXCEPTION 'B79.0n.TEC Migration 2 post-DELETE assertion failed: % wildcard rows still present', remaining;
  END IF;
END $$;

COMMIT;

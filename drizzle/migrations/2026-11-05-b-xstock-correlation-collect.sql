-- B-XSTOCK-CORRELATION-COLLECT (row 105, roadmap 25-9, Kyle KD-14) — record xStock pair correlation, never apply it.
-- Scope:     Claude Comms and Packages/Scope Files/B_XSTOCK_CORRELATION_COLLECT_SCOPE.md (r3, Langston PROCEED)
-- Pre-audit: Claude Comms and Packages/Scope Files/B_XSTOCK_CORRELATION_COLLECT_PRE_AUDIT.md (P-2, Langston PROCEED)
--
-- (1) NEW per-class key `b68_3_apply_factor` (pair_correlation): whether the factor is MULTIPLIED into confidence.
--     '*' (the wildcard row crypto resolves to) = true — crypto behaviour unchanged. 'xstock_spot' = false — record only.
--     The loader (market-context-engine.ts refreshPairCorrelationConfig) REQUIRES the key and throws without it; no
--     default in code. dt-deploy runs db:migrate BETWEEN build and pm2 restart, so the rows exist before the reader.
-- (2) xStock `b68_3_compute_correlation_enabled` false -> true. Safe only together with (1): computing without the
--     apply flag would multiply the factor into xStock confidence on the active path.
-- Measured on staging 2026-11-05 ~08:50Z before writing this: two compute rows ('*' true, 'xstock_spot' false,
-- updated_by b79.0n.confidence-chain-seed_xstock_off_v1); no b68_3_apply_factor rows.

BEGIN;

INSERT INTO module_constants
  (module_name, constant_name, value, asset_class, exchange, regime, strategy, updated_at, updated_by)
VALUES
  ('pair_correlation', 'b68_3_apply_factor', 'true'::jsonb,  '*',           '*', '*', '*', NOW(), 'b-xstock-correlation-collect'),
  ('pair_correlation', 'b68_3_apply_factor', 'false'::jsonb, 'xstock_spot', '*', '*', '*', NOW(), 'b-xstock-correlation-collect')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

UPDATE module_constants
   SET value = 'true'::jsonb, updated_at = NOW(), updated_by = 'b-xstock-correlation-collect'
 WHERE module_name = 'pair_correlation' AND constant_name = 'b68_3_compute_correlation_enabled'
   AND asset_class = 'xstock_spot' AND exchange = '*' AND strategy = '*' AND regime = '*';

DO $$
DECLARE n_apply integer; n_compute integer; xs_apply jsonb;
BEGIN
  SELECT count(*) INTO n_apply FROM module_constants
   WHERE module_name = 'pair_correlation' AND constant_name = 'b68_3_apply_factor';
  SELECT value INTO xs_apply FROM module_constants
   WHERE module_name = 'pair_correlation' AND constant_name = 'b68_3_apply_factor' AND asset_class = 'xstock_spot';
  SELECT count(*) INTO n_compute FROM module_constants
   WHERE module_name = 'pair_correlation' AND constant_name = 'b68_3_compute_correlation_enabled'
     AND asset_class = 'xstock_spot' AND value = 'true'::jsonb;
  IF n_apply <> 2 OR xs_apply IS DISTINCT FROM 'false'::jsonb OR n_compute <> 1 THEN
    RAISE EXCEPTION 'B-XSTOCK-CORRELATION-COLLECT seed incomplete: apply rows %, xStock apply %, xStock compute-on rows %', n_apply, xs_apply, n_compute;
  END IF;
END $$;

COMMIT;

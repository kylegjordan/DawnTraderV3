-- B-ENTRY-GATE (#1224) increment A — the entry window settings (scope OBJ-1/OBJ-1b; pre-audit P1/P1b).
-- Scope:     Claude Comms and Packages/Scope Files/B_ENTRY_GATE_SCOPE.md (r4, Langston PROCEED)
-- Pre-audit: Claude Comms and Packages/Scope Files/B_ENTRY_GATE_PRE_AUDIT.md (r5)
--
-- Kyle KD-10 (2026-11-04): the window applies to the WORSE side only, at 25 % of the planned entry-to-stop distance,
-- plus a cheaper-side floor of about 0.40 of the planned risk, WATCH-ONLY. Per class, one rule for both (scope OBJ-1).
-- Read by server/services/active-execution-engine.ts at the taker fill through getCachedNumberRequired, which throws
-- when a row is absent: no fallback in code. dt-deploy runs db:migrate between build and pm2 restart, so these rows
-- exist before the code that reads them. Module entry_gate is warmed at startup (b72-warmup PREFETCH_MODULES).

BEGIN;

INSERT INTO module_constants
  (module_name, constant_name, value, asset_class, exchange, regime, strategy, updated_at, updated_by)
VALUES
  ('entry_gate', 'entry_window_worse_side_frac',  '0.25'::jsonb, 'crypto_spot', '*', '*', '*', NOW(), 'b-entry-gate'),
  ('entry_gate', 'entry_window_worse_side_frac',  '0.25'::jsonb, 'xstock_spot', '*', '*', '*', NOW(), 'b-entry-gate'),
  ('entry_gate', 'entry_cheaper_side_floor_frac', '0.40'::jsonb, 'crypto_spot', '*', '*', '*', NOW(), 'b-entry-gate'),
  ('entry_gate', 'entry_cheaper_side_floor_frac', '0.40'::jsonb, 'xstock_spot', '*', '*', '*', NOW(), 'b-entry-gate')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM module_constants WHERE updated_by = 'b-entry-gate';
  IF n <> 4 THEN
    RAISE EXCEPTION 'B-ENTRY-GATE seed incomplete: expected 4 rows, found %', n;
  END IF;
END $$;

COMMIT;

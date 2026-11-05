-- B-ENTRY-GATE (#1224) increment B, P7 — the priced pass and the promotion price-age gate (scope OBJ-7; pre-audit P7, r12 Q-4, r13).
-- Scope:     Claude Comms and Packages/Scope Files/B_ENTRY_GATE_SCOPE.md (r4, Langston PROCEED)
-- Pre-audit: Claude Comms and Packages/Scope Files/B_ENTRY_GATE_PRE_AUDIT.md (r13)
--
-- Two columns on rtb_signals, written ONLY by the refresh (never by the queue upsert, so a re-issue keeps the priced history):
--   last_priced_at               the last refresh pass that had an admissible live ask for the row (the exit's own contract);
--   consecutive_unpriced_passes  passes since then with no admissible ask (0 after a priced pass).
-- One setting, read at promotion through getCachedConstant: entry_gate.promotion_price_max_age_ms, per class.
--   crypto_spot = 300000 ms, from the refresh cadence: one macro cycle is 120 s (rtb-refresh-service.ts MACRO_CYCLE_INTERVAL),
--   so a plan priced on its last pass is at most ~120 s old; 300 s allows one missed pass plus scheduling skew.
--   xstock_spot = NO ROW: the gate is OFF for xStock and says so, until one week of its own last_priced_at record seeds it
--   against a named prediction written before the week (r12 Q-4; KD-34 — a technical call settled with Langston).

BEGIN;

ALTER TABLE rtb_signals ADD COLUMN IF NOT EXISTS last_priced_at timestamptz;
ALTER TABLE rtb_signals ADD COLUMN IF NOT EXISTS consecutive_unpriced_passes integer NOT NULL DEFAULT 0;

INSERT INTO module_constants
  (module_name, constant_name, value, asset_class, exchange, regime, strategy, updated_at, updated_by)
VALUES
  ('entry_gate', 'promotion_price_max_age_ms', '300000'::jsonb, 'crypto_spot', '*', '*', '*', NOW(), 'b-entry-gate-inc-b')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM module_constants WHERE updated_by = 'b-entry-gate-inc-b';
  IF n <> 1 THEN
    RAISE EXCEPTION 'B-ENTRY-GATE inc B seed incomplete: expected 1 row, found %', n;
  END IF;
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_name = 'rtb_signals' AND column_name IN ('last_priced_at', 'consecutive_unpriced_passes');
  IF n <> 2 THEN
    RAISE EXCEPTION 'B-ENTRY-GATE inc B columns incomplete: expected 2, found %', n;
  END IF;
END $$;

COMMIT;

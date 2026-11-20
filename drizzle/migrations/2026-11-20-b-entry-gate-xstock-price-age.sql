-- B-ENTRY-GATE (#1224) — seed the xStock promotion price-age gate (P7 week read; Langston second pass + ruling (a), 2026-11-20).
-- Week read:  Claude Comms and Packages/Langston Design Asks/B_ENTRY_GATE_P7_XSTOCK_WEEK_READ.md (committed 9a3b34192)
-- Prediction: Claude Comms and Packages/Langston Design Asks/B_ENTRY_GATE_P7_XSTOCK_PREDICTION.md (registered before the week)
-- Inc-B seed: 2026-11-05-b-entry-gate-inc-b.sql, which deliberately left xstock_spot with NO ROW (gate OFF) until this read.
--
-- WHAT IT DOES: entry_gate.promotion_price_max_age_ms = 300000 ms for xstock_spot, the same value crypto_spot carries.
--   From this row on, an xStock RTB row is promoted only if a refresh pass priced it within the last 5 minutes.
--   OVERNIGHT AND THIN xSTOCK ROWS STOP PROMOTING UNLESS PRICED WITHIN 5 MINUTES. A stale row is NOT deleted:
--   it stays queued (UNPRICED) and promotes on the next pass that prices it (ready_to_buy_service promotion gate).
-- WHY THIS VALUE (week read, Langston ruling (a)): item 1 (the class-level night share, corrected to 4262/10880 = 39.17%,
--   inside the <=40% prediction) holds; the true-session share is 16949/16953 = 99.98%.
-- WHAT THE READ DID NOT ESTABLISH, stated so this row is not read as fully evidenced:
--   items 2-4 were UNSCORED (underpowered — too few passes per named symbol to score), so the cost to the thin names is
--   UNKNOWN; FE (7/13) and A (8/13) lean AGAINST the per-symbol premise. That premise is carried on #1224 with a count
--   criterion: re-read the named symbols' overnight shares once each has >= 20 overnight passes. Not a new plan row.
-- ROLLBACK: 2026-11-20-b-entry-gate-xstock-price-age-rollback.sql (by hand) returns xStock to NO ROW = gate OFF, logged once.

BEGIN;

INSERT INTO module_constants
  (module_name, constant_name, value, asset_class, exchange, regime, strategy, updated_at, updated_by)
VALUES
  ('entry_gate', 'promotion_price_max_age_ms', '300000'::jsonb, 'xstock_spot', '*', '*', '*', NOW(), 'b-entry-gate-p7-xstock-seed')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM module_constants
   WHERE module_name = 'entry_gate' AND constant_name = 'promotion_price_max_age_ms'
     AND asset_class = 'xstock_spot' AND exchange = '*' AND strategy = '*' AND regime = '*'
     AND value = '300000'::jsonb;
  IF n <> 1 THEN
    RAISE EXCEPTION 'B-ENTRY-GATE xStock price-age seed: expected 1 row at 300000, found %', n;
  END IF;
END $$;

COMMIT;

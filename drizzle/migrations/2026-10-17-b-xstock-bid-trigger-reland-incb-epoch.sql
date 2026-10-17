-- B-XSTOCK-BID-TRIGGER-RELAND increment B (row 2, objectives 5 + 8) — the PAPER xSTOCK learning population changes meaning.
-- Record: Claude Comms and Packages/Scope Files/B_XSTOCK_BID_TRIGGER_RELAND_INCB_PRE_AUDIT.md (P6, r2).
--
-- WHAT CHANGES, PER SOURCE:
--   paper_sim / xstock_spot — the stop/target TRIGGER moves from the mark to the judged BID while the book-state guard and
--                             `spread_blown` are both on; resting fills refuse a side that cannot show our size; a crossed
--                             book refuses entry. Stops fire earlier and targets later on the bid ⇒ a new composition.  ⇒ +1
--   vts / xstock_spot       — NOT moved. The VTS trigger was already the bid; only refusals were added (a refused entry or
--                             rest fill books nothing), so no booked VTS price changes meaning.
--   live / *, crypto rows   — not moved.
-- ⛔ THE OBJECTIVE-6 BOUNDARY (spread_blown ON, deployed 2026-10-16T15:10:55Z) IS NOT MACHINE-VISIBLE AND THIS DOES NOT MAKE
--   IT SO. No epoch moved at that deploy, so rows between it and this one carry the SAME epoch as rows before it. The one
--   machine consumer (the outcome-feedback Welford stream, `outcome-feedback-store.ts`) resets on THIS bump, discarding
--   that blended interval; the legacy EMA carries across epochs regardless (documented limitation). Any study must split
--   at the deploy TIME, recorded in ADJUSTMENT_FRAMEWORK's epoch register — the register records it, the stamp does not.
-- Every other epoch row is asserted unchanged against its own pre-image. `updated_at` IS set on the moved row.
--
-- ONE TRANSACTION. A post-condition failure rolls it all back, fails db:migrate, and stops dt-deploy before restart.
-- ⛔ ROLLBACK: run 2026-10-17-b-xstock-bid-trigger-reland-incb-epoch-rollback.sql BY HAND before deploying a pre-B sha.

BEGIN;

DROP TABLE IF EXISTS _incb_epoch_before;
CREATE TEMP TABLE _incb_epoch_before ON COMMIT DROP AS
SELECT asset_class, constant_name, (value)::text::numeric AS v
FROM module_constants
WHERE module_name = 'calibration_epoch' AND exchange = '*' AND strategy = '*' AND regime = '*';

UPDATE module_constants
SET value = to_jsonb((value)::text::numeric + 1), updated_by = 'b-xstock-bid-trigger-reland-incb', updated_at = now()
WHERE module_name = 'calibration_epoch' AND exchange = '*' AND strategy = '*' AND regime = '*'
  AND asset_class = 'xstock_spot' AND constant_name = 'paper_sim';

DO $$
DECLARE
  n int;
  bad int;
BEGIN
  SELECT count(*) INTO n FROM _incb_epoch_before WHERE asset_class = 'xstock_spot' AND constant_name = 'paper_sim';
  IF n <> 1 THEN
    RAISE EXCEPTION '[row 2 inc B epoch] expected exactly the calibration_epoch/xstock_spot paper_sim row, found %', n;
  END IF;
  SELECT count(*) INTO bad
  FROM _incb_epoch_before b
  JOIN module_constants m
    ON m.module_name = 'calibration_epoch' AND m.exchange = '*' AND m.strategy = '*' AND m.regime = '*'
   AND m.asset_class = b.asset_class AND m.constant_name = b.constant_name
  WHERE (m.value)::text::numeric IS DISTINCT FROM
        b.v + CASE WHEN b.asset_class = 'xstock_spot' AND b.constant_name = 'paper_sim' THEN 1 ELSE 0 END;
  IF bad <> 0 THEN
    RAISE EXCEPTION '[row 2 inc B epoch] % epoch row(s) moved wrongly — only xstock_spot paper_sim may move, by exactly +1', bad;
  END IF;
END $$;

COMMIT;

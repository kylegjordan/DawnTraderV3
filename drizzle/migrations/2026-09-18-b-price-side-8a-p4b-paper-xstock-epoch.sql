-- B-PRICE-SIDE-BY-JOB row 8a-P4b (PHASE_19_PLAN 3n.q2, the xStock half, paper piece) — the PAPER xSTOCK learning
-- AND VTS xSTOCK learning populations change meaning.
-- Audit + plan: Claude Comms and Packages/Scope Files/B_PRICE_SIDE_BY_JOB_8A_P4B_AUDIT_AND_PLAN.md (J4 / P7).
--
-- WHAT CHANGES, PER SOURCE:
--   paper_sim / xstock_spot — stops and targets are DECIDED on the guard-validated BID (was the mark), a resting target
--                             sale fills only when the BID reaches it, and a resting entry only when the ASK does. Both
--                             prices (earlier stops, later targets) and composition (the marginal resting fills disappear)
--                             change. Pre- and post-change outcomes must not blend.                            ⇒ +1
--   vts / xstock_spot       — J5 (Langston BLOCKER-J5): the xStock discontinuity sentinel is now keyed lane|symbol, so
--                             the VTS lane's post-gap deferral is no longer consumed by paper's calls where both held a
--                             symbol. Its xStock stop/target timing changes at those events: a composition change. ⇒ +1
--                             (8a-P4c bumps it again when the VTS xStock trigger moves to the bid.)
--   live / *                — inert until Phase 21. Not moved.
--   crypto rows             — untouched (8a-P3 moved them on 2026-09-15).
-- Every other epoch row is asserted unchanged against its own pre-image — a DELTA, because absolute values differ between
-- staging and a fresh CI database. The paper_sim/xstock_spot row must already exist (it is asserted, never created: its
-- absence would mean the class has been reading the wildcard, and that is a different fact to be decided, not papered).
--
-- ONE TRANSACTION. A post-condition failure rolls it all back, fails db:migrate, and stops dt-deploy before restart.
-- ⛔ ROLLBACK: run 2026-09-18-b-price-side-8a-p4b-paper-xstock-epoch-rollback.sql BY HAND before deploying a pre-batch sha.

BEGIN;

DROP TABLE IF EXISTS _p4b_epoch_before;
CREATE TEMP TABLE _p4b_epoch_before ON COMMIT DROP AS
SELECT asset_class, constant_name, (value)::text::numeric AS v
FROM module_constants
WHERE module_name = 'calibration_epoch' AND exchange = '*' AND strategy = '*' AND regime = '*';

UPDATE module_constants
SET value = to_jsonb((value)::text::numeric + 1), updated_by = 'b-price-side-8a-p4b'
WHERE module_name = 'calibration_epoch' AND exchange = '*' AND strategy = '*' AND regime = '*'
  AND asset_class = 'xstock_spot' AND constant_name IN ('paper_sim', 'vts');

DO $$
DECLARE
  n int;
  bad int;
BEGIN
  SELECT count(*) INTO n FROM _p4b_epoch_before WHERE asset_class = 'xstock_spot' AND constant_name IN ('paper_sim', 'vts');
  IF n <> 2 THEN
    RAISE EXCEPTION '[8a-P4b epoch] expected exactly the calibration_epoch/xstock_spot paper_sim AND vts rows, found %', n;
  END IF;

  -- xstock_spot paper_sim and vts moved by exactly +1; every OTHER row did not move.
  SELECT count(*) INTO bad
  FROM _p4b_epoch_before b
  JOIN module_constants m
    ON m.module_name = 'calibration_epoch' AND m.exchange = '*' AND m.strategy = '*' AND m.regime = '*'
   AND m.asset_class = b.asset_class AND m.constant_name = b.constant_name
  WHERE (m.value)::text::numeric IS DISTINCT FROM
        b.v + CASE WHEN b.asset_class = 'xstock_spot' AND b.constant_name IN ('paper_sim', 'vts') THEN 1 ELSE 0 END;
  IF bad <> 0 THEN
    RAISE EXCEPTION '[8a-P4b epoch] % epoch row(s) moved wrongly — only xstock_spot paper_sim/vts may move, by exactly +1', bad;
  END IF;
END $$;

COMMIT;

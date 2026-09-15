-- B-PRICE-SIDE-BY-JOB row 8a-P3 (PHASE_19_PLAN 3n.q, crypto half) — the CRYPTO learning populations change meaning.
-- Audit + plan: Claude Comms and Packages/Scope Files/B_PRICE_SIDE_BY_JOB_8A_P3_SCOPE_AUDIT_AND_PLAN.md (P6).
--
-- WHAT CHANGES, PER SOURCE:
--   vts / crypto_spot       — resting entries fill on the ASK, stops/targets are DECIDED on the BID, exits are BOOKED at
--                             the bid. Prices and composition both change.        ⇒ +1
--   paper_sim / crypto_spot — no paper PRICE changes (a maker entry still books at its limit, a resting target sale still
--                             closes at its limit), but the SELECTION does, and asymmetrically: a resting buy now needs the
--                             ask (≥ mid) and a resting sell the bid (≤ mid), so exactly the marginal fills disappear. The
--                             paper learning stream is epoch-scoped per class (active-execution-engine.ts, the
--                             `getCalibrationEpoch(_learnSource, _assetClass)` read), and a composition change in its
--                             inputs is a re-basing event: pre- and post-change outcomes must not blend.   ⇒ +1
--                             (Langston Step-4 condition 5.) The row does not exist yet: it is created at paper_sim/* + 1.
--   live / *                — inert until Phase 21. Not moved.
--   xStock rows             — untouched (xStock is 8a-P4).
-- Every other epoch row is asserted unchanged against its own pre-image — a DELTA, because absolute values differ between
-- staging and a fresh CI database. calibration_epoch/crypto_spot/vts is seeded by 2026-06-12a-b5-evgap-units-epoch.sql.
--
-- ONE TRANSACTION. A post-condition failure rolls it all back, fails db:migrate, and stops dt-deploy before restart.
-- ⛔ ROLLBACK: run 2026-09-15-b-price-side-8a-p3-vts-crypto-epoch-rollback.sql BY HAND before deploying a pre-batch sha.

BEGIN;

DROP TABLE IF EXISTS _p3_epoch_before;
CREATE TEMP TABLE _p3_epoch_before ON COMMIT DROP AS
SELECT asset_class, constant_name, (value)::text::numeric AS v
FROM module_constants
WHERE module_name = 'calibration_epoch' AND exchange = '*' AND strategy = '*' AND regime = '*';

UPDATE module_constants
SET value = to_jsonb((value)::text::numeric + 1), updated_by = 'b-price-side-8a-p3'
WHERE module_name = 'calibration_epoch' AND exchange = '*' AND strategy = '*' AND regime = '*'
  AND asset_class = 'crypto_spot' AND constant_name IN ('vts', 'paper_sim');

-- paper_sim/crypto_spot does not exist before the first run: create it one past the wildcard. Runs AFTER the UPDATE, so a
-- row created here is never bumped twice.
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by)
SELECT 'calibration_epoch', '*', 'crypto_spot', '*', '*', 'paper_sim', to_jsonb((mc.value)::text::numeric + 1), 'b-price-side-8a-p3'
FROM module_constants mc
WHERE mc.module_name = 'calibration_epoch' AND mc.exchange = '*' AND mc.asset_class = '*'
  AND mc.strategy = '*' AND mc.regime = '*' AND mc.constant_name = 'paper_sim'
  AND NOT EXISTS (SELECT 1 FROM _p3_epoch_before b WHERE b.asset_class = 'crypto_spot' AND b.constant_name = 'paper_sim')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

DO $$
DECLARE
  n int;
  bad int;
  pre_paper numeric;
  post_paper numeric;
BEGIN
  SELECT count(*) INTO n FROM _p3_epoch_before WHERE asset_class = 'crypto_spot' AND constant_name = 'vts';
  IF n <> 1 THEN
    RAISE EXCEPTION '[8a-P3 epoch] expected exactly one calibration_epoch/crypto_spot/vts row, found %', n;
  END IF;

  -- vts/crypto_spot moved by exactly +1; every OTHER pre-existing row except paper_sim/crypto_spot did not move.
  SELECT count(*) INTO bad
  FROM _p3_epoch_before b
  JOIN module_constants m
    ON m.module_name = 'calibration_epoch' AND m.exchange = '*' AND m.strategy = '*' AND m.regime = '*'
   AND m.asset_class = b.asset_class AND m.constant_name = b.constant_name
  WHERE NOT (b.asset_class = 'crypto_spot' AND b.constant_name = 'paper_sim')
    AND (m.value)::text::numeric IS DISTINCT FROM
        b.v + CASE WHEN b.asset_class = 'crypto_spot' AND b.constant_name = 'vts' THEN 1 ELSE 0 END;
  IF bad <> 0 THEN
    RAISE EXCEPTION '[8a-P3 epoch] % epoch row(s) moved wrongly — only crypto vts/paper_sim may move, by exactly +1', bad;
  END IF;

  -- paper_sim/crypto_spot = (its own pre-image, or the paper_sim wildcard it resolved to) + 1.
  SELECT COALESCE(
           (SELECT v FROM _p3_epoch_before WHERE asset_class = 'crypto_spot' AND constant_name = 'paper_sim'),
           (SELECT v FROM _p3_epoch_before WHERE asset_class = '*' AND constant_name = 'paper_sim'))
    INTO pre_paper;
  SELECT (value)::text::numeric INTO post_paper FROM module_constants
   WHERE module_name = 'calibration_epoch' AND exchange = '*' AND strategy = '*' AND regime = '*'
     AND asset_class = 'crypto_spot' AND constant_name = 'paper_sim';
  IF pre_paper IS NULL OR post_paper IS DISTINCT FROM pre_paper + 1 THEN
    RAISE EXCEPTION '[8a-P3 epoch] paper_sim/crypto_spot is %, expected % + 1', post_paper, pre_paper;
  END IF;
END $$;

COMMIT;

-- B-PRICE-SIDE-BY-JOB row 8c (switch-on) — the crypto level-build knobs, module_constants `level_basis` (crypto_spot).
--
-- Langston's ruling on the 8c audit-and-plan §5 (2026-11-06, Discord 1568288118241624175): the 60 s age ceiling STANDS
-- for an operative level, resolved through the DB and FAILING HARD on an empty read; the code literals
-- LEVEL_BASIS_OBSERVATION_MAX_AGE_MS / _MAX_SPREAD_FRACTION are deleted in the same change. Read by
-- server/core/trading/level-build-config.ts, prefetched and asserted at boot (b72-warmup.ts).
--
--   level_build_max_age_ms          = 60000   the ruling (f = 0.182 at the median crypto stop; the p10-stop tail is the
--                                             stated cost, stratified at Step 7 by stop distance)
--   level_build_max_spread_fraction = 0.50    unchanged plausibility bound; a wide REAL spread is priced on sided levels
--                                             (RR floor + EV gate), not refused here
--   level_build_drift_ref_60s       = 0.00429 his bid-drift leg: p90 0.3727 % one-minute bid drift (crypto_spot_ticker_snap,
--                                             52,863 symbol-minutes / 406 symbols) scaled to 60 s; the reference for the
--                                             stamped f = (drift / stop distance) * sqrt(age / 60 s)

BEGIN;

INSERT INTO module_constants
  (module_name, constant_name, value, asset_class, exchange, regime, strategy, updated_at, updated_by)
VALUES
  ('level_basis', 'level_build_max_age_ms',          '60000'::jsonb,   'crypto_spot', '*', '*', '*', NOW(), 'b-price-side-8c'),
  ('level_basis', 'level_build_max_spread_fraction', '0.50'::jsonb,    'crypto_spot', '*', '*', '*', NOW(), 'b-price-side-8c'),
  ('level_basis', 'level_build_drift_ref_60s',       '0.00429'::jsonb, 'crypto_spot', '*', '*', '*', NOW(), 'b-price-side-8c')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- Exactly these three rows, with these values (an ON CONFLICT DO NOTHING over a pre-existing different value must fail).
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM module_constants
   WHERE module_name = 'level_basis' AND asset_class = 'crypto_spot' AND exchange = '*' AND strategy = '*' AND regime = '*'
     AND ((constant_name = 'level_build_max_age_ms'          AND value = '60000'::jsonb)
       OR (constant_name = 'level_build_max_spread_fraction' AND value = '0.50'::jsonb)
       OR (constant_name = 'level_build_drift_ref_60s'       AND value = '0.00429'::jsonb));
  IF n <> 3 THEN
    RAISE EXCEPTION '8c level-build seed: expected exactly 3 level_basis/crypto_spot rows at the seeded values, found %', n;
  END IF;
END $$;

COMMIT;

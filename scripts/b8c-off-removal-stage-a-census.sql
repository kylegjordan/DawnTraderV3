-- Governed staging prerequisite. The deployer reads this under its deploy lock.
-- PENDING_ON also requires the live Phase A identity proof before any reset.
WITH crypto AS (
  SELECT count(*) AS total,
    count(*) FILTER (
      WHERE exchange = '*' AND strategy = '*' AND regime = '*'
        AND (constant_name, value) IN (
          ('level_build_max_age_ms', '60000'::jsonb),
          ('level_build_max_spread_fraction', '0.50'::jsonb),
          ('level_build_drift_ref_60s', '0.00429'::jsonb)
        )
    ) AS retained,
    count(*) FILTER (
      WHERE exchange = '*' AND strategy = '*' AND regime = '*'
        AND constant_name = concat_ws('_', 'crypto', 'birth', 'sided', 'enabled')
        AND value = '1'::jsonb
    ) AS switch_on
  FROM module_constants
  WHERE module_name = 'level_basis' AND asset_class = 'crypto_spot'
), ledger AS (
  SELECT count(*) AS entries FROM _migrations WHERE name = '2026-11-25-b-price-side-8c-off-removal.sql'
)
SELECT CASE
  WHEN entries = 0 AND total = 4 AND retained = 3 AND switch_on = 1 THEN 'PENDING_ON'
  WHEN entries = 1 AND total = 3 AND retained = 3 THEN 'APPLIED'
  ELSE 'REFUSE'
END AS gate
FROM crypto CROSS JOIN ledger;

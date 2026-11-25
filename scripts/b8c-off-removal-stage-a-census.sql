-- Read-only. Run with dt-sql after the committed live Phase A identity verifier.
-- Only one row with gate=PASS admits live Phase B. Save the full four-row census separately.
SELECT CASE WHEN count(*) = 4 AND count(*) FILTER (
    WHERE exchange = '*' AND strategy = '*' AND regime = '*'
      AND (constant_name, value) IN (
        ('level_build_max_age_ms', '60000'::jsonb),
        ('level_build_max_spread_fraction', '0.50'::jsonb),
        ('level_build_drift_ref_60s', '0.00429'::jsonb),
        (concat_ws('_', 'crypto', 'birth', 'sided', 'enabled'), '1'::jsonb)
      )
  ) = 4 THEN 'PASS' ELSE 'REFUSE' END AS gate,
  count(*) AS crypto_rows
FROM module_constants
WHERE module_name = 'level_basis' AND asset_class = 'crypto_spot';

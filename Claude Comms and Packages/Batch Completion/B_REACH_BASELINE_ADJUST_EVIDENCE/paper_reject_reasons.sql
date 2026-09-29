SET default_transaction_read_only = on;
SET statement_timeout = '600s';
SELECT strategy::text, asset_class::text, reject_stage, coalesce(gate_decision->>'gate','?') AS gate, left(coalesce(gate_decision->>'reason', '?'),60) AS reason, count(*)
FROM signal_eval_archive
WHERE captured_at >= timestamptz '2026-09-20 21:19:40+00' AND mode::text <> 'vts'
  AND (strategy::text, asset_class::text) IN (('vwap_bounce','crypto_spot'),('vwap_pullback','crypto_spot'),('vwap_pullback','xstock_spot'))
GROUP BY 1,2,3,4,5 ORDER BY 1,2,6 DESC LIMIT 30;

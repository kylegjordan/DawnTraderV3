-- B-PRICE-AGE-TRUTH (#951) — TERMINAL READ: the criterion carried by gate alert 0db25f1d-3da5-46e2-9303-09290eb447b5.
-- Run at the pre-deploy sha IMMEDIATELY BEFORE B-PRICE-SIDE-BY-JOB OBJ-7 deploys (pre-audit A-9.9, read-then-deploy).
-- The population, the two producer literals and the three PASS predicates are copied from the gate body, not retyped.
--
-- POPULATION (pre-registered, do not widen): closed_trades WHERE closed_at IS NOT NULL AND closed_at >= 2026-08-31T11:30:47Z.
-- TRAP: exit_observed_at_ms is a COLUMN of closed_trades, not a metadata key (a metadata-key read is 100% null).
-- TRAP: never LIKE 'kraken_rest%': the producers share a prefix. ENUMERATE.
-- RULE: zero reserve rows = EXTEND, not pass and not fail.
-- STOPPING RULE (binds at this read): if the touched arm is STILL empty, that is THE RESULT. Convert the progress report,
-- recording either a re-scope onto an exercised path or the assertion's retirement. Do not extend again.

-- 1. POSITIVE CONTROL AND CENSUS: every producer in the population, and how many rows carry an observation time.
--    An empty touched arm below is only evidence if this census shows the instrument sees the population.
SELECT coalesce(exit_price_producer, '(null)') AS exit_price_producer,
       count(*) AS n,
       count(exit_observed_at_ms) AS with_observed_at
  FROM closed_trades
 WHERE closed_at IS NOT NULL
   AND closed_at >= timestamptz '2026-08-31 11:30:47+00'
 GROUP BY 1
 ORDER BY n DESC;

-- 2. THE TOUCHED ARM, ROW BY ROW, with each PASS predicate evaluated.
SELECT id,
       symbol,
       closed_at,
       exit_price_producer,
       exit_price_source,
       exit_observed_at_ms,
       (exit_observed_at_ms IS NOT NULL) AS pass1_non_null,
       CASE WHEN exit_price_producer = 'kraken_rest_rate_limited_reserve'
            THEN (extract(epoch FROM closed_at) * 1000 - exit_observed_at_ms) >= 1000 END AS pass2_older_by_1s,
       CASE WHEN exit_price_producer = 'kraken_rest_rate_limited_reserve'
            THEN exit_price_source = 'kraken_rest' END AS pass3_source_unchanged
  FROM closed_trades
 WHERE closed_at IS NOT NULL
   AND closed_at >= timestamptz '2026-08-31 11:30:47+00'
   AND exit_price_producer IN ('kraken_rest_poller','kraken_rest_rate_limited_reserve')
 ORDER BY closed_at;

-- 3. THE VERDICT COUNTS.
SELECT count(*) AS population,
       count(*) FILTER (WHERE exit_price_producer IN ('kraken_rest_poller','kraken_rest_rate_limited_reserve')) AS touched_arm,
       count(*) FILTER (WHERE exit_price_producer = 'kraken_rest_rate_limited_reserve') AS reserve_rows,
       count(*) FILTER (WHERE exit_price_producer IN ('kraken_rest_poller','kraken_rest_rate_limited_reserve')
                          AND exit_observed_at_ms IS NULL) AS fail1_null_observed_at,
       count(*) FILTER (WHERE exit_price_producer = 'kraken_rest_rate_limited_reserve'
                          AND (extract(epoch FROM closed_at) * 1000 - exit_observed_at_ms) < 1000) AS not_pass2_under_1s_old,
       count(*) FILTER (WHERE exit_price_producer = 'kraken_rest_rate_limited_reserve'
                          AND exit_price_source IS DISTINCT FROM 'kraken_rest') AS fail3_source_changed
  FROM closed_trades
 WHERE closed_at IS NOT NULL
   AND closed_at >= timestamptz '2026-08-31 11:30:47+00';

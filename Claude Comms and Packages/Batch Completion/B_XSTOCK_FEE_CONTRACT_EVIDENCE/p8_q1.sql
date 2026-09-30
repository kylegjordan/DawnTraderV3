-- P8 read (B-XSTOCK-FEE-CONTRACT #1010) — population, per segment. READ-ONLY.
SET default_transaction_read_only = on;
SET statement_timeout = '600s';
\pset pager off

\echo === (0) instant of this read ===
SELECT now() AS read_at;

\echo === (1) POPULATION: switch_on_shadow_evidence, proof_type=maker_taker, asset_class=xstock_spot, captured_at >= deploy, per segment x part x mode ===
WITH seg(s, a, b) AS (VALUES
  ('S0', timestamptz '2026-09-11 20:09:47+00', timestamptz '2026-09-14 08:34:00+00'),
  ('S1', timestamptz '2026-09-14 08:34:00+00', timestamptz '2026-09-15 11:59:00+00'),
  ('S2', timestamptz '2026-09-15 11:59:00+00', timestamptz '2026-09-19 00:02:00+00'),
  ('S3', timestamptz '2026-09-19 00:02:00+00', timestamptz '2026-09-20 21:19:40+00'),
  ('S4', timestamptz '2026-09-20 21:19:40+00', timestamptz '2026-09-22 14:38:00+00'),
  ('S5', timestamptz '2026-09-22 14:38:00+00', timestamptz '2099-01-01 00:00:00+00')),
alias(symbol) AS (VALUES ('A/USD'),('ADI/USD'),('CAT/USD'),('CVX/USD'),('DASH/USD'),('EDU/USD'),('ES/USD'),('IR/USD'),('MET/USD'),
  ('OPEN/USD'),('PEP/USD'),('STRK/USD'),('STX/USD'),('SUI/USD'),('T/USD'),('WELL/USD'),('WEN/USD')),
ev AS (
  SELECT e.*, s.s AS seg, CASE WHEN al.symbol IS NULL THEN 'verdict' ELSE 'alias17' END AS part
  FROM switch_on_shadow_evidence e
  JOIN seg s ON e.captured_at >= s.a AND e.captured_at < s.b
  LEFT JOIN alias al ON al.symbol = e.symbol
  WHERE e.proof_type = 'maker_taker' AND e.asset_class = 'xstock_spot'
    AND e.captured_at >= timestamptz '2026-09-11 20:09:47+00')
SELECT seg, part, mode,
       count(*) AS n,
       count(*) FILTER (WHERE chosen_entry_mode = 'maker') AS maker,
       count(*) FILTER (WHERE chosen_entry_mode = 'taker') AS taker,
       count(*) FILTER (WHERE chosen_entry_mode IS NULL OR chosen_entry_mode NOT IN ('maker','taker')) AS other_or_null,
       round(100.0 * count(*) FILTER (WHERE chosen_entry_mode = 'maker') / NULLIF(count(*),0), 2) AS maker_pct,
       count(*) FILTER (WHERE hard_floor_fired) AS hard_floor_true,
       count(*) FILTER (WHERE hard_floor_fired IS NULL) AS hard_floor_null,
       min(captured_at) AS first_row, max(captured_at) AS last_row
FROM ev GROUP BY ROLLUP (seg, part, mode) ORDER BY seg NULLS LAST, part NULLS LAST, mode NULLS LAST;

\echo === (1b) CONTROL: the same population filter across the whole table by asset_class (instrument can see rows) ===
SELECT asset_class, count(*) AS n_post_deploy_maker_taker_rows
FROM switch_on_shadow_evidence
WHERE proof_type = 'maker_taker' AND captured_at >= timestamptz '2026-09-11 20:09:47+00'
GROUP BY 1 ORDER BY 1;

\echo === (1c) CONTROL: reproduce the frozen deploy-note (1)/(1c) p0 rows [f8870022f 2026-09-04T19:27:07Z, 2026-09-11T20:01:34Z) ===
WITH alias(symbol) AS (VALUES ('A/USD'),('ADI/USD'),('CAT/USD'),('CVX/USD'),('DASH/USD'),('EDU/USD'),('ES/USD'),('IR/USD'),('MET/USD'),
  ('OPEN/USD'),('PEP/USD'),('STRK/USD'),('STX/USD'),('SUI/USD'),('T/USD'),('WELL/USD'),('WEN/USD'))
SELECT CASE WHEN al.symbol IS NULL THEN 'verdict' ELSE 'alias17' END AS part, count(*) AS n,
       count(*) FILTER (WHERE e.chosen_entry_mode='maker') AS maker,
       round(100.0*count(*) FILTER (WHERE e.chosen_entry_mode='maker')/NULLIF(count(*),0),1) AS maker_pct
FROM switch_on_shadow_evidence e LEFT JOIN alias al ON al.symbol = e.symbol
WHERE e.proof_type='maker_taker' AND e.asset_class='xstock_spot'
  AND e.captured_at >= timestamptz '2026-09-04 19:27:07+00' AND e.captured_at < timestamptz '2026-09-11 20:01:34+00'
GROUP BY ROLLUP (1) ORDER BY 1 NULLS LAST;

\echo === (1d) the gap rows between the frozen baseline run (20:01:34Z) and the deploy restart (20:09:47Z) ===
SELECT count(*) AS n, count(*) FILTER (WHERE chosen_entry_mode='maker') AS maker, min(captured_at), max(captured_at)
FROM switch_on_shadow_evidence
WHERE proof_type='maker_taker' AND asset_class='xstock_spot'
  AND captured_at >= timestamptz '2026-09-11 20:01:34+00' AND captured_at < timestamptz '2026-09-11 20:09:47+00';

\echo === (5) VOID watch: xStock maker_taker module_constants rows, fee_model xStock rows ===
SELECT module_name, asset_class, strategy, regime, constant_name, value, updated_by, updated_at
FROM module_constants
WHERE (module_name = 'maker_taker' AND asset_class = 'xstock_spot')
   OR (module_name = 'fee_model' AND asset_class IN ('xstock_spot','crypto_spot'))
   OR (module_name = 'scoring_base' AND constant_name = 'flat_pwin_base')
ORDER BY module_name, asset_class, constant_name;
SELECT count(*) AS xstock_maker_taker_rows, max(updated_at) AS last_write,
       count(*) FILTER (WHERE updated_at >= timestamptz '2026-09-11 20:09:47+00') AS written_in_window
FROM module_constants WHERE module_name = 'maker_taker' AND asset_class = 'xstock_spot';

\echo === (5b) haircut AS APPLIED on post-deploy xStock evidence rows, per segment (a VOID cross-check independent of updated_at) ===
WITH seg(s, a, b) AS (VALUES
  ('S0', timestamptz '2026-09-11 20:09:47+00', timestamptz '2026-09-14 08:34:00+00'),
  ('S1', timestamptz '2026-09-14 08:34:00+00', timestamptz '2026-09-15 11:59:00+00'),
  ('S2', timestamptz '2026-09-15 11:59:00+00', timestamptz '2026-09-19 00:02:00+00'),
  ('S3', timestamptz '2026-09-19 00:02:00+00', timestamptz '2026-09-20 21:19:40+00'),
  ('S4', timestamptz '2026-09-20 21:19:40+00', timestamptz '2026-09-22 14:38:00+00'),
  ('S5', timestamptz '2026-09-22 14:38:00+00', timestamptz '2099-01-01 00:00:00+00'))
SELECT s.s AS seg, e.maker_fill_probability, e.signal_strength, count(*) AS n,
       min(e.adverse_selection_pct) AS min_A, max(e.adverse_selection_pct) AS max_A,
       min(e.non_fill_cost_pct) AS min_C, max(e.non_fill_cost_pct) AS max_C
FROM switch_on_shadow_evidence e JOIN seg s ON e.captured_at >= s.a AND e.captured_at < s.b
WHERE e.proof_type='maker_taker' AND e.asset_class='xstock_spot' AND e.captured_at >= timestamptz '2026-09-11 20:09:47+00'
GROUP BY 1,2,3 ORDER BY 1,2,3;

-- B-XSTOCK-FEE-CONTRACT (#1010) — the Step-6 DEPLOY NOTE baselines, frozen at the deploy instant.
-- Pre-audit r7, P8: p₀ and Arm B are published with their n BEFORE any post-deploy row is read.
--
-- HOW TO RUN (staging, as deploy, env sourced), IMMEDIATELY before `dt-deploy`:
--   psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
--        -v deploy_at='<UTC timestamp of this run>' -v obj7_at='<B-PRICE-SIDE-BY-JOB OBJ-7 deploy timestamp>' \
--        -f scripts/analysis/b_xstock_fee_contract_deploy_baselines.sql
-- Paste the whole output into the deploy note and commit it before the deploy.
-- If OBJ-7 has not deployed, pass obj7_at = deploy_at (the "post-OBJ-7" rows are then empty, and that is stated, not hidden).
--
-- Sources, read at the ref:
--   switch_on_shadow_evidence — the maker/taker decision sink (proof_type 'maker_taker').
--   signal_eval_archive — the EV-gate rows: gate 'net_ev_floor', written at eval-cycle.ts:874 (reject) and :1107 (admit),
--     and at vts-runner.ts:5201; paper admits have reject_stage 'admitted'.
--   module_constants — fee_model, calibration_epoch, and maker_taker (P8's VOID watch).

\set f8870022f_at '2026-09-04T19:27:07Z'

\echo === (1) P8 p0: xStock maker share among maker_taker decisions since f8870022f, up to the deploy instant ===
SELECT count(*) AS n,
       count(*) FILTER (WHERE chosen_entry_mode = 'maker') AS maker,
       round(100.0 * count(*) FILTER (WHERE chosen_entry_mode = 'maker') / NULLIF(count(*), 0), 1) AS maker_pct,
       count(*) FILTER (WHERE chosen_entry_mode IS NULL) AS null_mode,
       min(captured_at) AS first_row, max(captured_at) AS last_row
FROM switch_on_shadow_evidence
WHERE proof_type = 'maker_taker' AND asset_class = 'xstock_spot'
  AND captured_at >= :'f8870022f_at'::timestamptz AND captured_at < :'deploy_at'::timestamptz;

\echo === (1b) the same p0, split at the OBJ-7 deploy (a shift here means OBJ-7 moved the baseline) ===
SELECT CASE WHEN captured_at < :'obj7_at'::timestamptz THEN 'before OBJ-7' ELSE 'after OBJ-7' END AS side,
       count(*) AS n,
       count(*) FILTER (WHERE chosen_entry_mode = 'maker') AS maker,
       round(100.0 * count(*) FILTER (WHERE chosen_entry_mode = 'maker') / NULLIF(count(*), 0), 1) AS maker_pct
FROM switch_on_shadow_evidence
WHERE proof_type = 'maker_taker' AND asset_class = 'xstock_spot'
  AND captured_at >= :'f8870022f_at'::timestamptz AND captured_at < :'deploy_at'::timestamptz
GROUP BY 1 ORDER BY 1 DESC;

\echo === (2) Arm B trading days: the 5 most recent complete UTC days before the deploy day with xStock EV-gate rows ===
CREATE TEMP TABLE _bxfc_armb_days AS
SELECT date_trunc('day', captured_at) AS d
FROM signal_eval_archive
WHERE asset_class = 'xstock_spot' AND gate_decision->>'gate' = 'net_ev_floor'
  AND captured_at >= :'deploy_at'::timestamptz - interval '14 days'
  AND captured_at < date_trunc('day', :'deploy_at'::timestamptz)
GROUP BY 1 ORDER BY 1 DESC LIMIT 5;
SELECT d::date AS trading_day FROM _bxfc_armb_days ORDER BY d;
-- The archive is partitioned by day. Joining on date_trunc(captured_at) defeats partition pruning and trips the server's
-- statement timeout (measured on the first trial run), so the window bounds are fixed as literals first.
SELECT min(d) AS armb_from, max(d) + interval '1 day' AS armb_to FROM _bxfc_armb_days \gset

\echo === (3) Arm B1, VTS: xStock EV-gate admission RATE per trading day, and pooled ===
SELECT date_trunc('day', a.captured_at)::date AS day,
       count(*) FILTER (WHERE a.reject_stage = 'admitted') AS admitted,
       count(*) AS at_gate,
       round(100.0 * count(*) FILTER (WHERE a.reject_stage = 'admitted') / NULLIF(count(*), 0), 3) AS admit_pct
FROM signal_eval_archive a
WHERE a.captured_at >= :'armb_from'::timestamptz AND a.captured_at < :'armb_to'::timestamptz
  AND a.asset_class = 'xstock_spot' AND a.mode = 'vts' AND a.gate_decision->>'gate' = 'net_ev_floor'
  AND date_trunc('day', a.captured_at) IN (SELECT d FROM _bxfc_armb_days)
GROUP BY ROLLUP (1) ORDER BY 1 NULLS LAST;

\echo === (4) Arm B2, paper mode: xStock admitted COUNT per trading day (a volume; no paper denominator exists in this archive) ===
SELECT date_trunc('day', a.captured_at)::date AS day,
       count(*) FILTER (WHERE a.reject_stage = 'admitted') AS paper_admitted,
       count(*) FILTER (WHERE a.reject_stage <> 'admitted') AS paper_non_admitted_rows
FROM signal_eval_archive a
WHERE a.captured_at >= :'armb_from'::timestamptz AND a.captured_at < :'armb_to'::timestamptz
  AND a.asset_class = 'xstock_spot' AND a.mode = 'paper_sim'
  AND date_trunc('day', a.captured_at) IN (SELECT d FROM _bxfc_armb_days)
GROUP BY ROLLUP (1) ORDER BY 1 NULLS LAST;
\echo (a trading day missing from (4) had zero xStock paper rows; (2) lists all five days)

\echo === (5) state at the deploy instant: xStock fee rows, xStock epochs, and the last maker_taker write (P8 VOID watch) ===
SELECT module_name, asset_class, constant_name, value, updated_by, updated_at
FROM module_constants
WHERE (module_name = 'fee_model' AND asset_class IN ('crypto_spot', 'xstock_spot') AND constant_name IN ('spot_taker_fee', 'spot_maker_fee'))
   OR (module_name = 'calibration_epoch' AND asset_class IN ('*', 'xstock_spot'))
ORDER BY module_name, asset_class, constant_name;
SELECT count(*) AS xstock_maker_taker_rows, max(updated_at) AS last_write
FROM module_constants WHERE module_name = 'maker_taker' AND asset_class = 'xstock_spot';

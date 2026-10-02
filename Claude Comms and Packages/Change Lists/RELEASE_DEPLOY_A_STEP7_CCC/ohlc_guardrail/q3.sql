set statement_timeout='120s';
\echo === POST-DEPLOY window captured_at in [2026-10-02T20:38:00Z, 20:48:00Z), interval_begin >= 2026-10-01 (pruning)
select 'crypto_spot_ohlc_1m' tbl, count(*) n, count(arrived_at) n_arrived, round(100.0*count(arrived_at)/nullif(count(*),0),2) pct,
       min(arrived_at) min_arr, max(arrived_at) max_arr, min(interval_begin) min_ib, max(interval_begin) max_ib,
       count(*) filter (where arrived_at < '2026-10-02 20:37:49+00') arr_before_proc_start
  from crypto_spot_ohlc_1m where captured_at >= '2026-10-02 20:38:00+00' and captured_at < '2026-10-02 20:48:00+00' and interval_begin >= '2026-10-01';
select 'xstock_spot_ohlc_1m' tbl, count(*) n, count(arrived_at) n_arrived, round(100.0*count(arrived_at)/nullif(count(*),0),2) pct,
       min(arrived_at) min_arr, max(arrived_at) max_arr, min(interval_begin) min_ib, max(interval_begin) max_ib,
       count(*) filter (where arrived_at < '2026-10-02 20:37:49+00') arr_before_proc_start
  from xstock_spot_ohlc_1m where captured_at >= '2026-10-02 20:38:00+00' and captured_at < '2026-10-02 20:48:00+00' and interval_begin >= '2026-10-01';
\echo === reach check: post-window rows with interval_begin BEFORE 2026-10-01 (outside the pruned range), spot only, narrow captured_at window
select 'crypto_spot_old_ib' tbl, count(*) n, count(arrived_at) n_arrived from crypto_spot_ohlc_1m
 where captured_at >= '2026-10-02 20:38:00+00' and captured_at < '2026-10-02 20:48:00+00' and interval_begin >= '2026-09-20' and interval_begin < '2026-10-01';

set statement_timeout='120s';
\echo === POST-DEPLOY: captured_at >= 2026-10-02T20:38:00Z (interval_begin >= 2026-09-25 for partition pruning)
select 'crypto_spot_ohlc_1m' tbl, count(*) n, count(arrived_at) n_arrived, round(100.0*count(arrived_at)/nullif(count(*),0),2) pct,
       min(arrived_at) min_arr, max(arrived_at) max_arr, min(captured_at) min_cap, max(captured_at) max_cap, min(interval_begin) min_ib, max(interval_begin) max_ib,
       count(*) filter (where arrived_at < '2026-10-02 20:37:49+00') arr_before_proc_start
  from crypto_spot_ohlc_1m where captured_at >= '2026-10-02 20:38:00+00' and interval_begin >= '2026-09-25'
union all
select 'xstock_spot_ohlc_1m', count(*), count(arrived_at), round(100.0*count(arrived_at)/nullif(count(*),0),2),
       min(arrived_at), max(arrived_at), min(captured_at), max(captured_at), min(interval_begin), max(interval_begin),
       count(*) filter (where arrived_at < '2026-10-02 20:37:49+00')
  from xstock_spot_ohlc_1m where captured_at >= '2026-10-02 20:38:00+00' and interval_begin >= '2026-09-25'
union all
select 'crypto_perp_ohlc_1m', count(*), count(arrived_at), round(100.0*count(arrived_at)/nullif(count(*),0),2),
       min(arrived_at), max(arrived_at), min(captured_at), max(captured_at), min(interval_begin), max(interval_begin),
       count(*) filter (where arrived_at < '2026-10-02 20:37:49+00')
  from crypto_perp_ohlc_1m where captured_at >= '2026-10-02 20:38:00+00' and interval_begin >= '2026-09-25'
union all
select 'xstock_perp_ohlc_1m', count(*), count(arrived_at), round(100.0*count(arrived_at)/nullif(count(*),0),2),
       min(arrived_at), max(arrived_at), min(captured_at), max(captured_at), min(interval_begin), max(interval_begin),
       count(*) filter (where arrived_at < '2026-10-02 20:37:49+00')
  from xstock_perp_ohlc_1m where captured_at >= '2026-10-02 20:38:00+00' and interval_begin >= '2026-09-25';
\echo === NEGATIVE CONTROL: captured_at in [20:20, 20:37:49) - written by the OLD process, expect arrived_at NULL
select 'crypto_spot_ohlc_1m' tbl, count(*) n, count(arrived_at) n_arrived from crypto_spot_ohlc_1m
 where captured_at >= '2026-10-02 20:20:00+00' and captured_at < '2026-10-02 20:37:49+00' and interval_begin >= '2026-09-25'
union all
select 'xstock_spot_ohlc_1m', count(*), count(arrived_at) from xstock_spot_ohlc_1m
 where captured_at >= '2026-10-02 20:20:00+00' and captured_at < '2026-10-02 20:37:49+00' and interval_begin >= '2026-09-25';
\echo === arrived_at - captured_at lag, crypto_spot post-deploy (seconds)
select percentile_disc(array[0,0.5,0.95,1]) within group (order by extract(epoch from arrived_at-captured_at)) lag_s
 from crypto_spot_ohlc_1m where captured_at >= '2026-10-02 20:38:00+00' and interval_begin >= '2026-09-25';
select now() as db_now;

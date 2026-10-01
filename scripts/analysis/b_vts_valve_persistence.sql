-- B-VTS-NO-DECISION-VALVE Step 2, A1 (Langston's persistence condition): for each Class B forced exit (exit price = entry
-- price) since the epoch-6 boundary, the gap to the next two-sided frame in the class's own capture table.
-- Run: psql "$DATABASE_URL" -q -X -f scripts/analysis/b_vts_valve_persistence.sql   (read 2026-10-01 ~21:10Z)
set statement_timeout = '300s';
\echo xstock shadow class B: gap close -> next two-sided xstock_spot frame
with b as (
  select id, symbol, closed_at from rtb_shadow_pairings
   where closed and closed_at >= '2026-09-15T11:59:22Z' and asset_class='xstock_spot'
     and close_reason='shadow_max_hold' and exit_price = entry_price
), g as (
  select b.id, b.symbol, b.closed_at,
    (select min(s.captured_at) from xstock_spot_ticker_snap s
      where s.symbol=b.symbol and s.captured_at > b.closed_at and s.captured_at < b.closed_at + interval '4 days'
        and s.bid > 0 and s.ask > 0) nxt
  from b)
select count(*) n, count(nxt) found,
  percentile_cont(array[0,0.1,0.5,0.9,1]) within group (order by extract(epoch from nxt-closed_at)/3600.0) hrs,
  sum(case when extract(epoch from nxt-closed_at) < 60 then 1 else 0 end) under_1min
from g;
\echo xstock shadow class B: close hour-of-week (UTC dow, hour)
select extract(dow from closed_at)::int dow, extract(hour from closed_at)::int hr, count(*)
 from rtb_shadow_pairings where closed and closed_at >= '2026-09-15T11:59:22Z' and asset_class='xstock_spot'
  and close_reason='shadow_max_hold' and exit_price = entry_price group by 1,2 order by 3 desc limit 8;
\echo crypto shadow class B (timeout at entry): gap -> next two-sided crypto_spot frame
with b as (
  select id, symbol, closed_at from rtb_shadow_pairings
   where closed and closed_at >= '2026-09-15T11:59:22Z' and asset_class='crypto_spot'
     and close_reason='timeout' and exit_price = entry_price
), g as (
  select b.id, b.symbol, b.closed_at,
    (select min(s.captured_at) from crypto_spot_ticker_snap s
      where s.symbol=b.symbol and s.captured_at > b.closed_at and s.captured_at < b.closed_at + interval '4 days'
        and s.bid > 0 and s.ask > 0) nxt
  from b)
select symbol, closed_at, round(extract(epoch from nxt-closed_at)::numeric,1) gap_s from g order by closed_at;

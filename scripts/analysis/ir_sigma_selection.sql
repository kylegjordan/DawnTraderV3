-- The cadence story is REFUTED (obs floor is met by 95.6% RTH / 62.7% off-hours). Testing the
-- alternative: D is SELECTED on staleness, and staleness in the preceding window is the same
-- condition that starves the sigma estimate. If so, obs collapses on the refused set specifically
-- — a selection effect, not a session effect.
set statement_timeout = 600000;
with att as (
  select v.id, v.symbol, v.inserted_at, (v.inserted_at at time zone 'America/New_York') as ny
    from vts_open_trades v
   where v.asset_class = 'xstock_spot'
     and v.inserted_at >= timestamptz '2026-08-20 00:00+00'
     and v.inserted_at <  timestamptz '2026-09-03 00:00+00'
     and v.entry_price is not null and v.entry_price > 0
), o as (
  select * from att
   where not (extract(dow from ny) = 6
              or (extract(dow from ny) = 0 and ny::time <  time '20:00')
              or (extract(dow from ny) = 5 and ny::time >= time '20:00'))
), a as (
  select o.id, o.symbol, o.inserted_at,
         extract(epoch from (o.inserted_at -
           (select max(t.captured_at) from xstock_spot_ticker_snap t
             where t.symbol = o.symbol and t.captured_at <= o.inserted_at))) * 1000 as age_ms,
         (select count(*) from xstock_spot_ticker_snap t
           where t.symbol = o.symbol
             and t.captured_at >  o.inserted_at - interval '30 minutes'
             and t.captured_at <= o.inserted_at
             and t.last > 0) as obs
    from o
)
select case when age_ms > 15000 then 'REFUSED (age > 15s)' else 'admitted by the clock' end as bucket,
       count(*) as attempts,
       count(*) filter (where obs >= 200) as meets_min_obs,
       round(100.0 * count(*) filter (where obs >= 200) / count(*), 1) as pct_own_sigma_eligible,
       min(obs) as obs_min,
       round(percentile_cont(0.50) within group (order by obs)::numeric) as obs_p50,
       max(obs) as obs_max
  from a group by 1 order by 1;

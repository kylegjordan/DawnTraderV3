-- WHY arm (c) tripped: sigma_min_observations = 200 over a 30-MINUTE window. At the regular-hours
-- ~4 s cadence a 30-min window holds ~450 ticks; off-hours cadence is 13-20 s, so the SAME window
-- holds ~90-140. The observation floor may therefore be structurally unreachable off-hours,
-- which is exactly when the budget would be used. This DIAGNOSES the registered result; it does
-- not change it.
set statement_timeout = 600000;
with att as (
  select v.id, v.symbol, v.inserted_at,
         (v.inserted_at at time zone 'America/New_York') as ny
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
), s as (
  select o.id,
         case when o.ny::time >= time '09:30' and o.ny::time < time '16:00' then 'rth'
              else 'off_hours' end as session,
         (select count(*) from xstock_spot_ticker_snap t
           where t.symbol = o.symbol
             and t.captured_at >  o.inserted_at - interval '30 minutes'
             and t.captured_at <= o.inserted_at
             and t.last > 0) as obs
    from o
)
select session,
       count(*) as attempts,
       count(*) filter (where obs >= 200) as meets_min_obs,
       round(100.0 * count(*) filter (where obs >= 200) / count(*), 1) as pct_own_sigma_eligible,
       min(obs) as obs_min,
       round(percentile_cont(0.50) within group (order by obs)::numeric) as obs_p50,
       max(obs) as obs_max
  from s group by session order by session;

-- Langston's ask: read the RIOT fill-block against the cohort numbers, before 09-07.
-- THE CASE: alert 1d1573c7, RIOT/USD refused at 55,473 ms, attempt instant 2026-09-02 20:18:23Z
-- (16:18 ET, after-hours). If the cohort was LIVE while RIOT alone was stale, that is the
-- discriminator's intended case working on a real refusal — evidence for #526's design.
-- OBJECT: distinct symbols with a tick in each of the minutes around the attempt.
-- POPULATION: the 479 tracked symbols. DENOMINATOR stated per row.
set statement_timeout = 300000;
with probe as (select timestamptz '2026-09-02 20:18:23Z' as t),
     mins as (
  select generate_series(date_trunc('minute', p.t) - interval '4 minutes',
                         date_trunc('minute', p.t) + interval '1 minute',
                         interval '1 minute') as m
    from probe p
)
select to_char(mins.m, 'HH24:MI') as minute_utc,
       (select count(distinct t.symbol) from xstock_spot_ticker_snap t
         where t.captured_at >= mins.m and t.captured_at < mins.m + interval '1 minute')
         as live_symbols,
       (select count(*) from xstock_spot_ticker_snap t
         where t.symbol = 'RIOT/USD'
           and t.captured_at >= mins.m and t.captured_at < mins.m + interval '1 minute')
         as riot_ticks
  from mins order by 1;

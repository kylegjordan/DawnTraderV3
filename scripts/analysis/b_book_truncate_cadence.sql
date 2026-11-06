-- #507 item 5 (Langston's test): per-symbol sample cadence vs the 60 s requirement, on 2026-11-05 (a full post-recovery day).
-- cover60 = share of the day's time within 60 s of a sample = sum(min(gap,120 s)) / span. Both legs (independent instants) ~ cover60^2.
with pop as (select distinct symbol from closed_trades where closed_at is not null and asset_class='crypto_spot' and closed_at >= '2026-09-29' and close_reason not in ('never_filled','reset')),
s as (select t.symbol, t.captured_at, lead(t.captured_at) over (partition by t.symbol order by t.captured_at) nx
      from crypto_spot_ticker_snap t join pop using (symbol) where t.captured_at >= '2026-11-05' and t.captured_at < '2026-11-06'),
g as (select symbol, extract(epoch from nx-captured_at) gap from s where nx is not null),
per as (select symbol, count(*)+1 n, percentile_cont(0.5) within group (order by gap) p50, percentile_cont(0.9) within group (order by gap) p90,
        sum(least(gap,120))/nullif(sum(gap),0) cover60 from g group by symbol)
select 'POP', (select count(*) from pop), 'SAMPLED', count(*), 'median_p50_s', round(percentile_cont(0.5) within group (order by p50)::numeric,1),
  'median_p90_s', round(percentile_cont(0.5) within group (order by p90)::numeric,1),
  'median_cover60', round(percentile_cont(0.5) within group (order by cover60)::numeric,3),
  'p10_cover60', round(percentile_cont(0.1) within group (order by cover60)::numeric,3),
  'mean_both_legs', round(avg(cover60*cover60)::numeric,3),
  'symbols_cover60_lt_0.8', sum((cover60<0.8)::int) from per;

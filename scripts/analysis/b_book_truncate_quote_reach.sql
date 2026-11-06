-- B-BOOK-TRUNCATE-HOTFIX (#507) / #741 — the quote instrument's reach, for the amended (quote-based) gate (CC-C, 2026-11-06).
-- KD-34 condition 2, with Langston's three follow-up conditions: both reach measures side by side, the share BY WEEK, and the SYMBOLS that go unassessable.
--
-- Two measures, not one, and they are different questions:
--   nearest_s  = distance from the fill instant to the NEAREST crypto_spot_ticker_snap sample of that symbol, either side (CC-C's first figure)
--   bracket_s  = length of the gap between the last sample BEFORE and the first sample AFTER the fill instant (Langston's figure) — the
--                time the book went unobserved around the fill; always >= nearest_s, and heavy-tailed
-- Both NULL when no sample lies within +-60 min. "within 60 s" uses nearest_s.
-- Population: crypto closes, exit on or after 2026-10-01 (the hot ticker table's reach), never_filled and reset excluded.
--
-- Run: psql "$DATABASE_URL" -A -F'|' -f scripts/analysis/b_book_truncate_quote_reach.sql

with t as (
  select id, symbol, closed_at,
         coalesce(to_timestamp(entry_observed_at_ms/1000.0), opened_at) et,
         coalesce(to_timestamp(exit_observed_at_ms/1000.0), closed_at)  xt
  from closed_trades
  where closed_at is not null and asset_class = 'crypto_spot' and close_reason not in ('never_filled', 'reset')
    and coalesce(to_timestamp(exit_observed_at_ms/1000.0), closed_at) >= '2026-10-01'),
g as (
  select t.*,
    (select max(s.captured_at) from crypto_spot_ticker_snap s where s.symbol = t.symbol and s.captured_at <= t.xt and s.captured_at >= t.xt - interval '60 min') x_before,
    (select min(s.captured_at) from crypto_spot_ticker_snap s where s.symbol = t.symbol and s.captured_at >  t.xt and s.captured_at <= t.xt + interval '60 min') x_after,
    (select max(s.captured_at) from crypto_spot_ticker_snap s where s.symbol = t.symbol and s.captured_at <= t.et and s.captured_at >= t.et - interval '60 min') e_before,
    (select min(s.captured_at) from crypto_spot_ticker_snap s where s.symbol = t.symbol and s.captured_at >  t.et and s.captured_at <= t.et + interval '60 min') e_after
  from t),
m as (
  select g.*,
    least(extract(epoch from (xt - x_before)), extract(epoch from (x_after - xt))) x_nearest,
    extract(epoch from (x_after - x_before)) x_bracket,
    least(extract(epoch from (et - e_before)), extract(epoch from (e_after - et))) e_nearest,
    extract(epoch from (e_after - e_before)) e_bracket
  from g),
r as (
  select m.*, (coalesce(x_nearest, 1e9) <= 60 and coalesce(e_nearest, 1e9) <= 60) reach60 from m)
-- 1. both measures, overall
select 'OVERALL' k, count(*)::text n,
  'exit nearest p50/p90 ' || round(percentile_cont(0.5) within group (order by x_nearest)::numeric, 1) || '/' || round(percentile_cont(0.9) within group (order by x_nearest)::numeric, 1)
  || ' | exit bracket p50/p90 ' || round(percentile_cont(0.5) within group (order by x_bracket)::numeric, 1) || '/' || round(percentile_cont(0.9) within group (order by x_bracket)::numeric, 1)
  || ' | entry nearest p50/p90 ' || round(percentile_cont(0.5) within group (order by e_nearest)::numeric, 1) || '/' || round(percentile_cont(0.9) within group (order by e_nearest)::numeric, 1)
  || ' | entry bracket p50/p90 ' || round(percentile_cont(0.5) within group (order by e_bracket)::numeric, 1) || '/' || round(percentile_cont(0.9) within group (order by e_bracket)::numeric, 1)
  || ' | no sample within 60 min: exit ' || count(*) filter (where x_nearest is null) || ', entry ' || count(*) filter (where e_nearest is null)
  || ' | both legs within 60 s: ' || count(*) filter (where reach60) detail
from r
union all
-- 2. by week (ISO week of the exit), so a falling reach is visible rather than averaged away
select 'WEEK ' || to_char(date_trunc('week', xt), 'YYYY-MM-DD'), count(*)::text,
  'reach60 ' || count(*) filter (where reach60) || ' of ' || count(*) || ' (' || round(100.0 * count(*) filter (where reach60) / count(*), 0) || '%)'
from r group by date_trunc('week', xt)
union all
-- 3. by symbol, the names that fall outside reach
select 'SYMBOL ' || symbol, count(*)::text,
  'reach60 ' || count(*) filter (where reach60) || ' of ' || count(*)
from r group by symbol having count(*) filter (where not reach60) > 0
order by 1;

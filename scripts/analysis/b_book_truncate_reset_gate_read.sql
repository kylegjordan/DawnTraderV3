-- B-BOOK-TRUNCATE-HOTFIX (#507) / #741 — the reset gate read, re-runnable (CC-C, 2026-11-05, KD-43 audit).
--
-- THE GATE, as pre-registered (SCRATCH_CHECKLIST_2026-07-27_Kyle-CCC.md, "THE RESET GATE, WITH A NUMBER";
-- GOVERNANCE_EXCEPTIONS row for B-BOOK-TRUNCATE-HOTFIX): provenance stamp on 100% of closes in the window ·
-- >= 50 ASSESSABLE closes across >= 5 consecutive days · ZERO contaminated among them, on BOTH legs.
--
-- THE DETECTOR (the checklist's F1+F2, both legs, venue OHLC, the forgery-safe superset window):
--   exit leg contaminated  := exit_price  > max(high) of kraken crypto_spot_ohlc_1m bars within +-10 min of the exit time
--   entry leg contaminated := entry_price < min(low)  of the same bars within +-10 min of the entry time
--   assessable             := bars exist in BOTH windows (no bar = no trade = unassessable, a THIRD state, never clean)
--   entry/exit time        := entry_observed_at_ms / exit_observed_at_ms when stamped, else opened_at / closed_at
-- Population: crypto_spot closes with closed_at >= :since, excluding never_filled (no fill) and reset (closed by the
-- paper reset, not by an exit). Every trade here is a long (side = buy).
--
-- Run on staging:  psql "$DATABASE_URL" -v since=2026-09-29 -f scripts/analysis/b_book_truncate_reset_gate_read.sql

with t as (
  select id, symbol, close_reason, entry_price::numeric ep, exit_price::numeric xp,
         exit_price_source, entry_price_source,
         coalesce(to_timestamp(entry_observed_at_ms/1000.0), opened_at) et,
         coalesce(to_timestamp(exit_observed_at_ms/1000.0), closed_at)  xt, closed_at
  from closed_trades
  where closed_at is not null and asset_class = 'crypto_spot'
    and closed_at >= :'since'::timestamptz
    and close_reason not in ('never_filled', 'reset')),
e as (
  select t.*,
    (select max(high) from crypto_spot_ohlc_1m o where o.symbol = t.symbol and o.exchange = 'kraken'
       and o.interval_begin between t.xt - interval '10 min' and t.xt + interval '10 min') xhi,
    (select min(low)  from crypto_spot_ohlc_1m o where o.symbol = t.symbol and o.exchange = 'kraken'
       and o.interval_begin between t.et - interval '10 min' and t.et + interval '10 min') elo
  from t),
g as (
  -- Three states per leg, never two (Langston, KD-34 condition 1, 2026-11-06): a leg with no bar is UNASSESSED, not clean.
  -- The old coalesce(x, false) scored a missing bar as a clean leg; a flag is now only ever counted on an assessed leg.
  select *, (xhi is not null and elo is not null) assessable,
         (xhi is not null) exit_assessed, (elo is not null) entry_assessed,
         (xhi is not null and xp > xhi) exit_bad, (elo is not null and ep < elo) entry_bad from e)
-- 1. the totals
select 'TOTAL' as k, count(*) n, count(*) filter (where assessable) assessable,
       -- per-leg reach, so a single-leg question (e.g. a target_hit exit) is not hidden by the both-legs rule
       -- (exit_assessed / entry_assessed are printed on the TOTAL row's detail column)
       count(*) filter (where exit_bad) exit_contaminated, count(*) filter (where entry_bad) entry_contaminated,
       count(*) filter (where exit_price_source is null or entry_price_source is null) missing_stamp,
       'exit_assessed=' || count(*) filter (where exit_assessed) || ' entry_assessed=' || count(*) filter (where entry_assessed) as detail
from g
union all
-- 2. per day (the consecutive-days leg)
select to_char(closed_at, 'YYYY-MM-DD'), count(*), count(*) filter (where assessable),
       count(*) filter (where exit_bad), count(*) filter (where entry_bad),
       count(*) filter (where exit_price_source is null or entry_price_source is null), null
from g group by 1
union all
-- 3. every flagged row, named
select 'FLAG', 1, 1, exit_bad::int, entry_bad::int, 0,
       id || ' ' || symbol || ' ' || close_reason || ' entry ' || ep || ' vs low ' || coalesce(elo::text, '-') ||
       ' exit ' || xp || ' vs high ' || coalesce(xhi::text, '-')
from g where exit_bad or entry_bad
order by 1;

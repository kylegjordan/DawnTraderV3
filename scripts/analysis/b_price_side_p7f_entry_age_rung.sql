-- B-PRICE-SIDE-BY-JOB r5 — P-7f (decision D6): "the 15 s entry limit is checked against the 14.3 s re-serve rung
-- with one query". Run against staging with: psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f <this file>
--
-- WHAT D6 ASSUMED: `active_fill_max_age_ms` (15,000) sits just above the re-serve sawtooth's densest rung (14.3 s,
-- measured on the live-pricing adapter's rate-limited re-serve, #951), so once a re-serve keeps its original age that
-- rung would show up in entry fill-age.
--
-- WHAT THE CODE SAYS BEFORE ANY QUERY (read at the ref, 2026-09-11):
--   * the 15 s gate is xStock-only (asset_classes/xstock_spot/active-dispatch.ts): NOW() - MAX(captured_at) on the
--     xstock_spot_ticker_snap archive table. It never reads an adapter quote, so a re-serve cannot reach it.
--   * crypto entries gate freshness on the BOOK's age (fill_depth_gate.warmth_max_age_ms, 5,000 ms), not on the
--     adapter quote's age.
--
-- Q1 below asks whether a re-serve has ever been the ENTRY price of a closed trade. Q2 is its positive control: the
-- same column CAN hold an adapter REST producer. Q3 is the instrument that looks like an entry age and is NOT one.
\pset footer off

-- Q1 + Q2: entry producers across the provenance era (the columns were created 2026-08-26).
select asset_class, coalesce(entry_price_producer, '(null)') as entry_producer, count(*) as n
  from closed_trades
 where opened_at >= timestamptz '2026-08-26 00:00+00'
   and closed_at is not null
 group by asset_class, entry_price_producer
 order by asset_class, n desc;

-- Q3: opened_at - entry_observed_at_ms. ⛔ NOT an entry fill-age: opened_at precedes the entry price read (a maker
-- order rests before it fills), so most values are negative. Kept to show why it was discarded.
select asset_class,
       count(*) filter (where entry_observed_at_ms is not null)                                   as stamped,
       count(*) filter (where extract(epoch from opened_at) * 1000 - entry_observed_at_ms < 0)    as negative,
       round(min(extract(epoch from opened_at) * 1000 - entry_observed_at_ms)::numeric, 0)        as min_ms,
       round(percentile_cont(0.5) within group
             (order by extract(epoch from opened_at) * 1000 - entry_observed_at_ms)::numeric, 0)  as p50_ms
  from closed_trades
 where opened_at >= timestamptz '2026-08-31 11:30:47+00'   -- the #951 deploy
   and closed_at is not null
   and entry_observed_at_ms is not null
 group by asset_class;

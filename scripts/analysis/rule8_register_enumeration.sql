-- ADJUSTMENT_FRAMEWORK calibration-epoch rule 8 — the register enumeration, re-runnable (CC-C, 2026-11-06).
-- The 2026-09-30 enumeration (B_PRICE_SIDE_BY_JOB_8A_P3_PROGRESS_REPORT.md §9.7) was built by hand; this is the same
-- method as a query, run for the remaining stretch up to B-VTS-NO-DECISION-VALVE's deploy, after which a refused
-- max-hold books NO price (`time_stop_unpriced`) and the register closes to new Class A/B members.
--
-- Population: exit_decision_archive, mode = 'vts', exit_reason = 'time_stop', crypto (trade_id NOT LIKE 'vts_xstock_spot_%'),
--             captured_at in [:start, :end), one row per trade_id.
-- Discriminator (rule 8), against the nearest crypto_spot_ticker_snap frame for the symbol within 60 s:
--   exit = entry                                   => MEMBER, Class B (no live mark, booked at entry)
--   exit = bid and exit <> mid and exit <> last    => NON-MEMBER (the bid alone)
--   exit = mid or exit = last, and exit <> bid     => MEMBER, Class A (booked at the mark while the bid was refused)
--   a frame, none of the above                     => UNDETERMINED (not the bid alone)
--   no frame within 60 s                           => UNDETERMINED (direction vs the nearest frame's bid at any distance, else UNKNOWN)
--
-- Run: psql "$DATABASE_URL" -A -F'|' -v start=2026-09-30T00:00:00Z -v end=2026-10-06T15:45:04Z -f scripts/analysis/rule8_register_enumeration.sql

with t as (
  select distinct on (trade_id) trade_id, symbol, captured_at, entry_price::numeric ep, exit_price::numeric xp
  from exit_decision_archive
  where mode = 'vts' and exit_reason = 'time_stop' and trade_id not like 'vts_xstock_spot_%'
    and captured_at >= :'start'::timestamptz and captured_at < :'end'::timestamptz
  order by trade_id, captured_at),
f as (
  select t.*,
    (select row(s.bid, s.ask, s.last, extract(epoch from (s.captured_at - t.captured_at)))::text
       from crypto_spot_ticker_snap s
      where s.symbol = t.symbol and s.captured_at between t.captured_at - interval '60 s' and t.captured_at + interval '60 s'
      order by abs(extract(epoch from (s.captured_at - t.captured_at))) limit 1) near60,
    (select s.bid from crypto_spot_ticker_snap s
      where s.symbol = t.symbol and s.captured_at between t.captured_at - interval '2 hours' and t.captured_at + interval '2 hours'
      order by abs(extract(epoch from (s.captured_at - t.captured_at))) limit 1) anybid
  from t),
p as (
  select f.*,
    split_part(trim(both '()' from near60), ',', 1)::numeric bid,
    split_part(trim(both '()' from near60), ',', 2)::numeric ask,
    nullif(split_part(trim(both '()' from near60), ',', 3), '')::numeric lst,
    split_part(trim(both '()' from near60), ',', 4)::numeric dt
  from f),
c as (
  select p.*,
    case
      when xp = ep then 'MEMBER-B'
      when near60 is null then 'UNDETERMINED'
      when xp = bid and xp <> (bid + ask) / 2 and (lst is null or xp <> lst) then 'NON-MEMBER'
      when xp <> bid and (xp = (bid + ask) / 2 or xp = lst) then 'MEMBER-A'
      else 'UNDETERMINED'
    end bucket,
    case when near60 is null then 'no frame within 60 s' else 'frame ' || round(dt, 1) || ' s' end why,
    case
      when coalesce(bid, anybid) is null then 'UNKNOWN'
      when xp > coalesce(bid, anybid) then 'OVERSTATED vs bid ' || coalesce(bid, anybid)
      when xp < coalesce(bid, anybid) then 'UNDERSTATED vs bid ' || coalesce(bid, anybid)
      else 'AT the bid'
    end direction
  from p)
select to_char(captured_at, 'MM-DD HH24:MI:SS.MS') closed, symbol, bucket, why, direction, trade_id from c
union all
select 'TOTAL', count(*)::text, 'B ' || count(*) filter (where bucket = 'MEMBER-B') || ' / A ' || count(*) filter (where bucket = 'MEMBER-A')
       || ' / non ' || count(*) filter (where bucket = 'NON-MEMBER') || ' / undetermined ' || count(*) filter (where bucket = 'UNDETERMINED'),
       '', '', '' from c
order by 1;

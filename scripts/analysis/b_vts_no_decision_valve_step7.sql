-- B-VTS-NO-DECISION-VALVE (row 4, `3n.q3`) — the Step-7 reads (a)-(f), re-runnable (CC-C, 2026-11-05).
-- Pre-registered in `Claude Comms and Packages/Scope Files/B_VTS_NO_DECISION_VALVE_PRE_AUDIT.md` ("Verification (Step 7)").
-- Deploy line: release deploy B, 3576d39810fa7428501b68ce341ee46533c24935, live 2026-10-06T15:45:04Z.
-- The first xStock weekend shut window after it (Fri 20:00 ET -> Sun 20:00 ET, EDT) is [2026-10-10 00:00Z, 2026-10-12 00:00Z).
-- ⚠️ 2026-10-10 is a SATURDAY. (Getting this wrong by one day reads the Sunday-evening reopen burst as "inside the window".)
-- Not covered here: (d)'s JSON-file leg (logs/virtual_trades/*.json, read with a script) and (e) (the [8a-P3][VTS_TOUCH] log line).
--
-- Run on staging:  psql "$DATABASE_URL" -A -F'|' -f scripts/analysis/b_vts_no_decision_valve_step7.sql

\echo (a)+(b)+(d) shadow closes since the deploy, by class / reason / booking arm; shadow_max_hold must be absent, arm never NULL, unpriced rows NULL
select asset_class, close_reason, coalesce(exit_booking_arm, '<NULL>') arm, count(*) n,
       count(*) filter (where net_pnl is null) null_pnl, count(*) filter (where exit_price is null) null_px
from rtb_shadow_pairings
where closed and closed_at >= '2026-10-06T15:45:04Z'
group by 1, 2, 3 order by 1, 4 desc;

\echo (a)+(d) real-lane time-stop archive rows since the deploy: no plain time_stop may carry a clamp_* arm; unpriced rows NULL
select asset_class, exit_reason, coalesce(state_snapshot->>'exitBookingArm', '<none>') arm, count(*) n,
       count(*) filter (where exit_price is null) null_px, count(*) filter (where pnl_pct is null) null_pnl
from exit_decision_archive
where captured_at >= '2026-10-06T15:45:04Z' and source = 'vts-runner' and exit_reason like 'time_stop%'
group by 1, 2, 3 order by 1, 2, 4 desc;

\echo (c) xStock shadow closes INSIDE the first shut window (expected 0), and the same window one week earlier as the control
select 'after deploy 10-10..10-12' w, count(*) from rtb_shadow_pairings
 where closed and asset_class = 'xstock_spot' and closed_at >= '2026-10-10T00:00Z' and closed_at < '2026-10-12T00:00Z'
union all
select 'control 10-03..10-05', count(*) from rtb_shadow_pairings
 where closed and asset_class = 'xstock_spot' and closed_at >= '2026-10-03T00:00Z' and closed_at < '2026-10-05T00:00Z';

\echo (f) the reopen set — open at the window start, 48 h cap inside the window — and how it closed
with s as (
  select * from rtb_shadow_pairings
  where asset_class = 'xstock_spot' and opened_at < '2026-10-10T00:00Z'
    and opened_at + interval '48 hours' >= '2026-10-10T00:00Z' and opened_at + interval '48 hours' < '2026-10-12T00:00Z'
    and (not closed or closed_at >= '2026-10-10T00:00Z'))
select close_reason, coalesce(exit_booking_arm, '<NULL>') arm, count(*), min(closed_at), max(closed_at)
from s group by 1, 2 order by 3 desc;

\echo (f) the same definition on five weekends — the band (100-115) was set from the first two only
with w(ws) as (values ('2026-09-19T00:00Z'::timestamptz), ('2026-09-26T00:00Z'), ('2026-10-03T00:00Z'), ('2026-10-10T00:00Z'), ('2026-10-17T00:00Z'))
select w.ws::date as saturday,
  (select count(*) from rtb_shadow_pairings s
    where s.asset_class = 'xstock_spot' and s.opened_at < w.ws
      and s.opened_at + interval '48 hours' >= w.ws and s.opened_at + interval '48 hours' < w.ws + interval '2 days'
      and (not s.closed or s.closed_at >= w.ws)) as capped_in_window
from w order by 1;

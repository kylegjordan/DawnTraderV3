-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- COHORT COMPOSITION — OUTPUT B, BRACKETED. Folds Langston's biases (2) and (3), 2026-09-03.
--
-- `cohort_composition.sql` output B reported min 3 / p05 5 / p50 6 and I called it "optimistic".
-- ⛔ THAT SIGN CLAIM IS WITHDRAWN: there are THREE biases and they do not point the same way.
--
--  (1) UPWARD — mine, confirmed. `S` conditions on having signalled, which conditions on having
--      had data. Against a sector- or liquidity-keyed peer set, B overstates peer liveness.
--  (2) DOWNWARD — and it was in the SQL, not the framing. `peer_live` left-joined over EVERY
--      overnight minute, but the trigger only ever runs at a minute where a DISPATCH occurred,
--      and those are exactly the minutes when the tape is alive. The reported figure is
--      P(k live in S | ANY overnight minute); the OPERATIONAL quantity is
--      P(k live in S | A DISPATCH OCCURRED THIS MINUTE), almost certainly larger.
--  (3) UPWARD — unnamed by me. `count(op.symbol)` counted THE SUBJECT SYMBOL, which is in `S`
--      and live by construction at any minute it dispatches. **So "p50 6" was at most 5 PEERS**,
--      and at |S| = 9 that is not a rounding detail.
--
-- ⇒ (1) and (2) oppose, neither was measured, so **the sign of the original figure is UNKNOWN.**
--   This file measures (2) and (3) directly — one predicate each — so the true number is
--   BRACKETED rather than argued about.
--
-- OBJECT: for each (overnight minute, subject symbol) at which that subject dispatched, the
--   number of OTHER symbols in `S` live in that same minute. **Self excluded, by name.**
-- POPULATION: overnight minutes 2026-08-27 to 2026-09-02 inclusive inside the 24/5 window in
--   which at least one xStock dispatch occurred. DENOMINATOR: |S|, reported.
--
-- ⚠️ ON LANGSTON'S POINT (4), THE SOURCE-WORDING QUESTION — RESOLVED AT THE REF, NOT ASSERTED.
--   `S` is drawn from `vts_open_trades`. `eval-cycle.ts:1179` `registerOpenVtsTrade` sits
--   UNCONDITIONALLY, with no branch, immediately above `:1185 dispatchXstockActiveSignal`, and
--   `dispatchXstockActiveSignal` has exactly ONE non-test caller — that line. ⇒ every dispatch
--   has a VTS row and every VTS row is followed by a dispatch call, so `S` is COMPLETE for
--   dispatch attempts and "produced an overnight dispatch attempt" is the correct wording.
--   **What a VTS row does NOT establish is that the attempt passed the gates ABOVE the freshness
--   check** — that is the separate denominator limit already carried in the estimand.
--
-- ⛔ THE SAMPLE-MINIMUM LIMIT CARRIES OVER UNREPAIRED: seven consecutive ORDINARY sessions, no
--   holiday, no half-day, no venue incident. Every minimum here is a sample minimum.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
set statement_timeout = 600000;

with bounds as (
  select timestamptz '2026-08-27 00:00+00' as t0, timestamptz '2026-09-03 00:00+00' as t1
),
is_overnight_open as (
  -- reusable predicate: inside the 24/5 window AND in the 20:00–04:00 ET overnight band
  select 1
),
pairs as (
  select symbol, date_trunc('minute', captured_at) as m
    from xstock_spot_ticker_snap, bounds
   where captured_at >= bounds.t0 and captured_at < bounds.t1
   group by 1, 2
),
overnight_pairs as (
  select p.symbol, p.m
    from pairs p, lateral (select (p.m at time zone 'America/New_York') as ny) x
   where not (extract(dow from x.ny) = 6
              or (extract(dow from x.ny) = 0 and x.ny::time <  time '20:00')
              or (extract(dow from x.ny) = 5 and x.ny::time >= time '20:00'))
     and not (x.ny::time >= time '04:00' and x.ny::time < time '20:00')
),
-- every overnight DISPATCH, with its symbol and its minute
dispatches as (
  select v.symbol, date_trunc('minute', v.inserted_at) as m
    from vts_open_trades v, bounds
   where v.asset_class = 'xstock_spot'
     and v.inserted_at >= bounds.t0 and v.inserted_at < bounds.t1
     and not ((v.inserted_at at time zone 'America/New_York')::time >= time '04:00'
              and (v.inserted_at at time zone 'America/New_York')::time < time '20:00')
),
sig_symbols as (select distinct symbol from dispatches),
-- (2) conditioned on a DISPATCH MINUTE · (3) SELF EXCLUDED by name
-- ⚠️ EXECUTION SHAPE CHANGED, QUANTITY IDENTICAL: the per-event correlated subquery approached the
--    statement timeout. Pre-aggregate the live-in-S count ONCE per minute, then join and subtract
--    the subject if the subject itself was live that minute. ⛔ The subtraction is CONDITIONAL and
--    must stay so: a symbol can dispatch in a minute WITHOUT having ticked in it — that is the
--    whole staleness case — so an unconditional "minus one" would understate peers exactly on the
--    events the trigger fires for.
s_live_per_min as (
  select op.m, count(*) as live_in_s
    from overnight_pairs op
   where op.symbol in (select symbol from sig_symbols)
   group by op.m
),
peers as (
  select d.symbol as subject, d.m,
         coalesce(l.live_in_s, 0)
           - (case when exists (select 1 from overnight_pairs op
                                 where op.m = d.m and op.symbol = d.symbol)
                   then 1 else 0 end) as live_peers
    from dispatches d
    left join s_live_per_min l on l.m = d.m
)
select 'with self, dispatch minutes' as variant,
       count(*) as events,
       min(live_peers + self_live) as v_min,
       round(percentile_cont(0.50) within group (order by live_peers + self_live)::numeric) as v_p50,
       max(live_peers + self_live) as v_max
  from (select p.*, (case when exists (select 1 from overnight_pairs op
                                        where op.m = p.m and op.symbol = p.subject) then 1 else 0 end) as self_live
          from peers p) z
union all
select 'without self, dispatch minutes', count(*), min(live_peers),
       round(percentile_cont(0.50) within group (order by live_peers)::numeric), max(live_peers)
  from peers
order by 1;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- COHORT COMPOSITION — the design input that decides `#526`'s thin-cohort branch TRIGGER.
--
-- CC-B's framing, and it is why this is load-bearing rather than interesting: the branch is
-- going in regardless, so this does not decide WHETHER. It decides the TRIGGER.
--   · If the overnight live set is COMPOSITION-STABLE and covers the names that actually signal
--     overnight ⇒ a COUNT threshold is sufficient.
--   · If liveness is CONCENTRATED in the same names ⇒ the trigger must test the PEER SET of the
--     symbol under evaluation rather than the aggregate — a materially different piece of code.
--
-- ⛔ THE LIMIT THAT CARRIES OVER FROM `cohort_liveness.sql` AND IS NOT REPAIRED HERE: this is
--    seven consecutive ORDINARY sessions. No US market holiday, no half-day, no venue incident.
--    Every minimum below is a SAMPLE minimum, never a population floor. **"A state seven ordinary
--    sessions could not have shown me" — never "a state that did not occur".**
--
-- OUTPUT A — CONCENTRATION. OBJECT: per symbol, the share of OVERNIGHT minutes in which that
--   symbol has at least one tick. POPULATION: the 479 tracked symbols × the overnight minutes of
--   2026-08-27 to 2026-09-02 inclusive inside the 24/5 window. **This is the discriminator:
--   concentrated liveness ⇒ a few symbols near 100% and a long tail near 0%; spread liveness ⇒
--   most symbols clustered near the aggregate share.**
--
-- OUTPUT B — COVERAGE, and it is the one that decides the trigger. OBJECT: at each overnight
--   minute, the number of live symbols DRAWN FROM `S` — the set of symbols that actually produced
--   an overnight dispatch attempt in the window. POPULATION: those overnight minutes; DENOMINATOR
--   `|S|`, reported. ⭐ **A cohort of 366 unrelated books is not 366 comparators. Restricting to
--   the names that actually signal overnight is the closest available proxy for a peer set, since
--   no sector or liquidity grouping exists to key on — stated as a proxy, not as a peer set.**
-- ═══════════════════════════════════════════════════════════════════════════════════════════
set statement_timeout = 600000;

with bounds as (
  select timestamptz '2026-08-27 00:00+00' as t0, timestamptz '2026-09-03 00:00+00' as t1
),
-- distinct (symbol, minute) FIRST, then everything else counts over it (the cheap shape)
pairs as (
  select symbol, date_trunc('minute', captured_at) as m
    from xstock_spot_ticker_snap, bounds
   where captured_at >= bounds.t0 and captured_at < bounds.t1
   group by 1, 2
),
tagged as (
  select p.*, (p.m at time zone 'America/New_York') as ny from pairs p
),
overnight_pairs as (
  select symbol, m from tagged
   where not (extract(dow from ny) = 6
              or (extract(dow from ny) = 0 and ny::time <  time '20:00')
              or (extract(dow from ny) = 5 and ny::time >= time '20:00'))
     and not (ny::time >= time '04:00' and ny::time < time '20:00')   -- overnight = 20:00–04:00 ET
),
overnight_minutes as (select distinct m from overnight_pairs),
n_min as (select count(*)::numeric as n from overnight_minutes),
universe as (
  select count(distinct symbol)::numeric as n_tracked
    from xstock_spot_ticker_snap, bounds
   where captured_at >= bounds.t0 and captured_at < bounds.t1
),
-- ── OUTPUT A: per-symbol share of overnight minutes live ──────────────────────────────────────
per_symbol as (
  select symbol, count(*)::numeric as live_minutes from overnight_pairs group by 1
),
shares as (
  select ps.symbol, ps.live_minutes / n_min.n as share from per_symbol ps cross join n_min
),
-- ── S = symbols that ACTUALLY produced an overnight dispatch attempt ──────────────────────────
sig_symbols as (
  select distinct v.symbol
    from vts_open_trades v, bounds
   where v.asset_class = 'xstock_spot'
     and v.inserted_at >= bounds.t0 and v.inserted_at < bounds.t1
     and not ((v.inserted_at at time zone 'America/New_York')::time >= time '04:00'
              and (v.inserted_at at time zone 'America/New_York')::time < time '20:00')
),
-- ── OUTPUT B: live symbols drawn from S, per overnight minute ─────────────────────────────────
peer_live as (
  select om.m, count(op.symbol) as live_in_s
    from overnight_minutes om
    left join overnight_pairs op
      on op.m = om.m and op.symbol in (select symbol from sig_symbols)
   group by om.m
)
select 'A concentration' as output,
       'symbols live in >=90% / 50-90% / 10-50% / <10% of overnight minutes' as detail,
       (select count(*) from shares where share >= 0.90)::text as a,
       (select count(*) from shares where share >= 0.50 and share < 0.90)::text as b,
       (select count(*) from shares where share >= 0.10 and share < 0.50)::text as c,
       (select count(*) from shares where share <  0.10)::text as d,
       (select round(n_tracked) from universe)::text as denom
union all
select 'A share percentiles',
       'p10 / p50 / p90 of the per-symbol overnight live share',
       (select round(percentile_cont(0.10) within group (order by share)::numeric, 3) from shares)::text,
       (select round(percentile_cont(0.50) within group (order by share)::numeric, 3) from shares)::text,
       (select round(percentile_cont(0.90) within group (order by share)::numeric, 3) from shares)::text,
       null, (select round(n) from n_min)::text
union all
select 'B peer-set coverage',
       'live symbols drawn from S, per overnight minute: min / p05 / p50',
       (select min(live_in_s) from peer_live)::text,
       (select round(percentile_cont(0.05) within group (order by live_in_s)::numeric) from peer_live)::text,
       (select round(percentile_cont(0.50) within group (order by live_in_s)::numeric) from peer_live)::text,
       null,
       (select count(*) from sig_symbols)::text
order by 1;

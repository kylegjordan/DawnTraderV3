-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- (i-r) ESTIMAND — B-XSTOCK-SESSION-FRESHNESS, plan row 3b.f-c, owner CC-C.
--
-- ⛔ THIS FILE IMPLEMENTS A PRE-REGISTERED CRITERION AND MUST NOT BE EDITED TO SUIT A RESULT.
--    The criterion is `Claude Comms and Packages/Scope Files/
--    B_XSTOCK_SESSION_FRESHNESS_ESTIMAND_REGISTRATION.md`, committed BEFORE this ran.
--    Langston accepted it 2026-09-03 07:34Z with six conditions + two additions, all folded in.
--    ★ At ruling time, re-read §10 AT THE REF and state which ref — never from a memory file
--      (registration §11). A criterion recalled rather than re-read has already drifted.
--
-- THE QUESTION, and it is one question: Kyle will not loosen the xStock freshness standard unless
-- someone proves risk is not increased. For the attempts today's flat 15,000 ms clock REFUSES that
-- a risk-derived budget WOULD admit, did prices actually move more than that budget assumes?
--
-- ⛔⛔ WHAT THE ANSWER CANNOT BE: "the entry gate should be risk-derived because that is consistent
--     with the exit gate." Registration §8 — `floor_ms` (exit) and `active_fill_max_age_ms` (entry)
--     are both 15,000 ms, so ceiling(a) >= L unconditionally and such a gate can NEVER refuse
--     anything the clock admits. It is a PURE ONE-DIRECTIONAL RELAXATION and must be argued as one.
--     ⚠️ And that equality is a COINCIDENCE OF TWO INDEPENDENTLY-SETTABLE VALUES IN DIFFERENT
--     MODULES, not a design guarantee — it inverts silently the first time either moves (§10.6).
--
-- FORMULA PROVENANCE — reproduced from production, read at origin/migration/aws-supabase:
--   sigma-rate.ts:87-106   stddev_samp(per-tick fractional return) / avg(inter-tick seconds)
--   mark-staleness.ts:209  rawMs = (budget / effectiveSigma) * 1000
--   mark-staleness.ts:219  ceilingMs = max(floor, min(cap, rawMs))
--   mark-staleness.ts:180  NO USABLE SIGMA => ceiling = floor, fail-closed, never widen.
--
-- ⚠️ TWO DELIBERATE DEPARTURES FROM PRODUCTION, BOTH STATED, BOTH IN THE CONSERVATIVE DIRECTION:
--  (1) ANCHORING. Production computes sigma over a window ending at NOW(); a retrospective run
--      must anchor it to the ATTEMPT instant instead, or it measures today's volatility against a
--      three-week-old decision.
--  (2) SIGMA-AGE INFLATION IS 1. Production may serve a CACHED sigma up to sigma_max_age_ms old
--      and inflates it, which TIGHTENS the ceiling. An at-attempt sigma is fresh by construction,
--      so this reconstruction yields an UPPER BOUND on ceiling(a), hence an UPPER BOUND on D.
--      ⇒ The risk test therefore runs on a SUPERSET of the attempts a real implementation would
--        admit, which makes a PASS harder to obtain and a FAIL more trustworthy. Conservative for
--        a relaxation claim, which is the direction that matters here.
--
-- POPULATION LIMIT THAT TRAVELS WITH EVERY RATE (registration §2): four gates sit above the
-- freshness check. Gates 1-2 are discharged (`active-dispatch.ts:139` is a LIVE DB read on every
-- dispatch — that line is the argument, not the timestamps). Gates 3-4 are BOUNDED, NOT
-- DISCHARGED: they fail silently into in-memory counters, and are bounded only by consequence —
-- opens landed on all ten trading days. THE LIMIT IS "not a full trading day, on any trading day".
-- It gets no number.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
set statement_timeout = 600000;

with
-- ── the pre-registered constants, in one place so no branch below can quietly disagree ────────
k as (
  select 15000.0::numeric as l_ms,          -- active_fill_max_age_ms, xstock_spot, stamped 06-15
         0.5::numeric     as budget_k,      -- mark_staleness, xstock_spot, stamped 07-22
         15000.0::numeric as floor_ms,      --   "      "        "        "
         300000.0::numeric as cap_ms,       --   "      "        "        "
         200::int         as sigma_min_obs, --   "      "        "        "
         1800000::int     as sigma_window_ms
),
-- ── §2 population + §10.4 the 24/5 trading-calendar filter, NAMED not implied ─────────────────
--    Sunday 20:00 ET -> Friday 20:00 ET. Holidays: none in this window (Independence Day ->
--    Labor Day gap); the FILTER remains holiday-blind and that is a stated defect of it.
att as (
  select v.id, v.symbol, v.inserted_at, v.entry_price, v.stop_loss,
         (v.inserted_at at time zone 'America/New_York') as ny
    from vts_open_trades v
   where v.asset_class = 'xstock_spot'
     and v.inserted_at >= timestamptz '2026-08-20 00:00+00'
     and v.inserted_at <  timestamptz '2026-09-03 00:00+00'
     and v.entry_price is not null and v.entry_price > 0
),
att_open as (
  select * from att
   where not (extract(dow from ny) = 6
              or (extract(dow from ny) = 0 and ny::time <  time '20:00')
              or (extract(dow from ny) = 5 and ny::time >= time '20:00'))
),
-- ── §3 age(a): the gate is NOW() - MAX(captured_at); anchored here to the attempt instant ─────
--    Instrument validated on three known refusals to 67-108 ms, one-directional (UNDERSTATES
--    age). §10.2 bound 150 ms; the near-L flip count is reported below and is not optional.
aged as (
  select a.*,
         (select max(t.captured_at) from xstock_spot_ticker_snap t
           where t.symbol = a.symbol and t.captured_at <= a.inserted_at) as newest_at
    from att_open a
),
aged2 as (
  select aged.*,
         extract(epoch from (inserted_at - newest_at)) * 1000 as age_ms
    from aged
   where newest_at is not null
),
-- ── sigma at the attempt instant, reproducing sigma-rate.ts:87-106 exactly ────────────────────
sig as (
  select a.id,
         s.obs, s.stddev_ret, s.mean_dt_sec,
         case when s.stddev_ret > 0 and s.mean_dt_sec > 0
              then s.stddev_ret / s.mean_dt_sec end as sigma_own
    from aged2 a
    cross join lateral (
      select count(*) as obs, stddev_samp(r.ret) as stddev_ret, avg(r.dt_sec) as mean_dt_sec
        from (
          select (w.last - w.prev_last) / w.prev_last as ret,
                 extract(epoch from (w.captured_at - w.prev_at)) as dt_sec
            from (
              select t.last, t.captured_at,
                     lag(t.last)        over (order by t.captured_at) as prev_last,
                     lag(t.captured_at) over (order by t.captured_at) as prev_at
                from xstock_spot_ticker_snap t, k
               where t.symbol = a.symbol
                 and t.captured_at >  a.inserted_at - make_interval(secs => k.sigma_window_ms/1000)
                 and t.captured_at <= a.inserted_at
                 and t.last > 0
            ) w
           where w.prev_last is not null and w.prev_last > 0 and w.prev_at is not null
        ) r
       where r.dt_sec > 0
    ) s
),
-- ── the classwide fallback: sigma MUST NOT be derivable from a thin symbol's own thin history ──
--    (sigma-rate.ts:28). Below sigma_min_obs the symbol inherits the class-wide upper percentile.
--    ⚠️ APPROXIMATION, STATED: production maintains this in its own cache; here it is the 90th
--    percentile of the qualifying per-attempt own-sigmas in THIS window. Recorded as a departure.
cw as (
  select percentile_cont(0.90) within group (order by sigma_own) as sigma_classwide
    from sig, k where sigma_own is not null and obs >= k.sigma_min_obs
),
-- ── §3 ceiling(a) + §4 D ──────────────────────────────────────────────────────────────────────
calc as (
  select a.id, a.symbol, a.inserted_at, a.age_ms, a.entry_price, a.stop_loss,
         s.obs, s.sigma_own, cw.sigma_classwide,
         case when s.obs >= k.sigma_min_obs and s.sigma_own is not null then 'own'
              when cw.sigma_classwide is not null                       then 'classwide'
              else 'none' end as sigma_src,
         case when s.obs >= k.sigma_min_obs and s.sigma_own is not null then s.sigma_own
              else cw.sigma_classwide end as sigma_eff,
         case when a.stop_loss is not null and a.stop_loss > 0
              then abs(a.entry_price - a.stop_loss) / a.entry_price end as room
    from aged2 a join sig s on s.id = a.id cross join cw cross join k
),
ceil as (
  select c.*,
         -- mark-staleness.ts:180 — no usable sigma => FLOOR. Never widen on an absent sigma.
         -- Since floor_ms = L, such an attempt can never enter D. That is the fail-closed path
         -- contributing nothing, and it is a property worth seeing in the output.
         case when c.sigma_eff is null or c.sigma_eff <= 0 or c.room is null or c.room <= 0
              then k.floor_ms
              else greatest(k.floor_ms,
                     least(k.cap_ms, (k.budget_k * c.room / c.sigma_eff) * 1000.0)) end as ceiling_ms,
         k.l_ms, k.floor_ms, k.cap_ms
    from calc c cross join k
),
flagged as (
  select f.*,
         (f.age_ms > f.l_ms)                             as refused_today,
         (f.age_ms <= f.ceiling_ms)                      as admitted_by_budget,
         (f.age_ms > f.l_ms and f.age_ms <= f.ceiling_ms) as in_d,
         (abs(f.age_ms - f.l_ms) <= 150)                 as near_l_150,   -- §10.2 registered bound
         (abs(f.age_ms - f.l_ms) <= 500)                 as near_l_500,   -- §10.2 stress
         (f.inserted_at >= timestamptz '2026-08-28 00:00+00') as post_fg1 -- §10.5 deploy split
    from ceil f
)
-- ═══ OUTPUT 1 — the population, the split, and D. No verdict is computed here. ═══
select case when post_fg1 then 'post-F-G-1 (08-28 ->)' else 'pre-F-G-1 (-> 08-27)' end as arm,
       count(*)                                            as attempts,
       count(distinct symbol)                              as symbols,
       count(*) filter (where refused_today)               as refused_today,
       count(*) filter (where in_d)                        as n_d,
       count(*) filter (where in_d and sigma_src='own')       as d_sigma_own,
       count(*) filter (where in_d and sigma_src='classwide') as d_sigma_classwide,
       count(*) filter (where near_l_150)                  as flippable_150ms,
       count(*) filter (where near_l_500)                  as flippable_500ms,
       round(min(age_ms))                                  as age_min_ms,
       round(percentile_cont(0.50) within group (order by age_ms)::numeric) as age_p50_ms,
       round(max(age_ms))                                  as age_max_ms
  from flagged
 group by 1 order by 1;

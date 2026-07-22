-- P19-B8.5e (2026-07-21) — risk-derived per-symbol mark-staleness knobs.
-- Replaces the single global `exit_integrity.max_equity_tick_age_ms` (90,000ms) applied to
-- every xStock alike (#548) with a per-symbol ceiling: ceiling_ms = clamp(budget / sigma_rate,
-- floor_ms, cap_ms), where budget = budget_k * (remaining risk-to-stop as a fraction) so a
-- near-stop position gets the tightest tolerance (OBJ-4 solved in the same knob), and sigma_rate
-- is the symbol's TRAILING realized fractional move per ms.
-- Values (CONSERVATIVE seed; Phase-25 calibrates — see #548, and the
-- TIME_EXIT_AND_OPEN_TRADE_REFRESH_RECOMMENDATIONS confound caveat: do NOT tune on the soak):
--   - budget_k = 0.5: tolerate being blind to at most HALF the remaining distance-to-stop.
--   - null_stop_budget_pct = 0.005 (0.5%): fixed conservative budget when a position has NO stop
--     (fail-closed — NEVER fail-open to a wide window).
--   - floor_ms = 15000: never refuse faster than 15s (else we skip constantly on every symbol).
--   - cap_ms = 300000: hard 5-min backstop for a regime break the trailing sigma has not seen —
--     a REAL safety param (Langston), not cosmetic.
--   - sigma_min_observations = 200: a symbol must EARN its own sigma — below this it inherits the
--     conservative class-wide value (a young/thin/volatile entrant reads artificially calm exactly
--     when a stale mark costs most; self-sigma is earned, not assumed).
--   - sigma_classwide_percentile = 0.90: the conservative class-wide sigma a not-yet-earned symbol
--     inherits (upper-percentile = assume-more-volatile = tighter ceiling = safer).
-- ★★ XSTOCK ONLY — crypto is DELIBERATELY NOT SEEDED (Langston ruling 2026-07-22, disposition (a)).
-- An earlier draft of this migration seeded BOTH classes. That was wrong: the σ_rate read-path
-- exists ONLY for xStock (`xstock_spot/price-liveness.ts` reads windowed per-symbol tick history
-- from `xstock_spot_ticker_snap`). Verified at `origin/migration/aws-supabase`: the only runtime
-- references to `crypto_spot_ticker_snap` are partition creation, the retention sweep, the drift
-- dashboard, and archive bootstrap — NO per-symbol tick-history reader. So seeding crypto would
-- ship "a number that reads as governed but is inert" (Langston) — a live-looking ceiling with no
-- runtime source, i.e. the seeded-ceiling smell wearing a migration's clothes.
-- ⇒ We seed NOTHING for crypto rather than seeding an inert row. A MISSING row hits the existing
-- fail-closed `getCachedNumberRequired` refusal (loud), whereas a PRESENT-but-unsourceable row
-- looks governed and silently is not. Absent beats inert.
-- The crypto σ read-path is its own named home (see #548 addendum / RUNNING_ISSUES) — a real build,
-- not a wildcard fill, since `asset_classes/crypto_spot/` has no `price-liveness` sibling today.
-- σ-CACHE knobs (the measurement's tuning, governed alongside the policy it feeds):
--   - sigma_window_ms = 1800000 (30 min): the trailing window sigma is measured over. NOT
--     cosmetic — this materially determines the sigma the ceiling is derived from.
--   - sigma_refresh_after_ms = 300000 (5 min): recompute cadence per symbol. sigma is a slow
--     statistic; refreshing it per-tick would put a DB aggregate in front of every exit check.
--   - sigma_max_age_ms = 900000 (15 min): ★ the FAIL-CLOSED bound. Past this a cached sigma is
--     DROPPED, not used — so a database outage degrades toward the FLOOR (refuse to trust old
--     marks) instead of silently freezing a stale sigma in place and widening windows off it.
--   - sigma_query_timeout_ms = 4000: a wedged read must not pin the refresh slot.
--
-- ★★ NOTE ON LULD: an earlier plan for this batch added a `luld_tier` column plus S&P500 /
-- Russell1000 index-membership plumbing, to cap the ceiling by the regulatory limit-up/limit-down
-- band. DROPPED, on arithmetic (2026-07-22): at `cap_ms` = 300000 (= exactly the 5-minute LULD
-- reference window) the sigma-derived drift for the FASTEST symbol we hold is 2.06%, against a
-- Tier-1 band of 5%. The band would only bind for a symbol with sigma > 1.67e-4/s -- 2.4x MU.
-- ⇒ the sigma ceiling is ALWAYS the tighter constraint at this cap, so LULD would add an
-- index-membership data dependency for a bound that can never be the binding one. Revisit ONLY
-- if `cap_ms` is raised above ~727s. Recorded here, not silently omitted.
--
-- The boot assertion added with the B8.5e code change asserts these rows for **xstock_spot
-- ONLY**; it must NOT require crypto rows or the server will refuse to boot. A missing row is
-- then a deterministic DEPLOY-time failure, never a silent default (§5 no-silent-fallback;
-- mirrors the S20 price-liveness fail-closed posture).
-- Rollback: 2026-07-21-p19-b8-5e-mark-staleness-knobs-rollback.sql (operator-only).

INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('mark_staleness','*','xstock_spot','*','*','budget_k','0.5'::jsonb,'p19-b8.5e'),
  ('mark_staleness','*','xstock_spot','*','*','null_stop_budget_pct','0.005'::jsonb,'p19-b8.5e'),
  ('mark_staleness','*','xstock_spot','*','*','floor_ms','15000'::jsonb,'p19-b8.5e'),
  ('mark_staleness','*','xstock_spot','*','*','cap_ms','300000'::jsonb,'p19-b8.5e'),
  ('mark_staleness','*','xstock_spot','*','*','sigma_min_observations','200'::jsonb,'p19-b8.5e'),
  ('mark_staleness','*','xstock_spot','*','*','sigma_classwide_percentile','0.90'::jsonb,'p19-b8.5e'),
  ('mark_staleness','*','xstock_spot','*','*','sigma_window_ms','1800000'::jsonb,'p19-b8.5e'),
  ('mark_staleness','*','xstock_spot','*','*','sigma_refresh_after_ms','300000'::jsonb,'p19-b8.5e'),
  ('mark_staleness','*','xstock_spot','*','*','sigma_max_age_ms','900000'::jsonb,'p19-b8.5e'),
  ('mark_staleness','*','xstock_spot','*','*','sigma_query_timeout_ms','4000'::jsonb,'p19-b8.5e')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now();

-- ── §18 RETIREMENT: the constant this batch REPLACES ────────────────────────────────────
-- `exit_integrity.max_equity_tick_age_ms` (the single global 90s) has exactly ONE runtime
-- reader, `active-execution-engine.ts`, and the B8.5e code change removes it. Leaving the row
-- behind would be precisely the "looks governed, is inert" state this batch's own migration
-- comment argues against 20 lines above. Blast radius verified by full-repo census
-- (2026-07-22): 2 code references (both rewritten by this batch) + this migration pair. No
-- UI, API, or telemetry reader. Removed here rather than scheduled (§18: decide AT the find).
DELETE FROM module_constants
WHERE module_name = 'exit_integrity' AND constant_name = 'max_equity_tick_age_ms';

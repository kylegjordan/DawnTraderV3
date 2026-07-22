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
-- The boot assertion added with the B8.5e code change therefore asserts these rows for
-- **xstock_spot ONLY**; it must NOT require crypto rows or the server will refuse to boot.
-- Boot assertion (server/startup/b72-warmup.ts, added in the B8.5e code change) asserts these
-- rows exist for both active classes -> a missing row is a deterministic DEPLOY-time failure,
-- never a silent default (§5 no-silent-fallback; mirrors the S20 price-liveness fail-closed posture).
-- Rollback: 2026-07-21-p19-b8-5e-mark-staleness-knobs-rollback.sql (operator-only).

INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('mark_staleness','*','xstock_spot','*','*','budget_k','0.5'::jsonb,'p19-b8.5e'),
  ('mark_staleness','*','xstock_spot','*','*','null_stop_budget_pct','0.005'::jsonb,'p19-b8.5e'),
  ('mark_staleness','*','xstock_spot','*','*','floor_ms','15000'::jsonb,'p19-b8.5e'),
  ('mark_staleness','*','xstock_spot','*','*','cap_ms','300000'::jsonb,'p19-b8.5e'),
  ('mark_staleness','*','xstock_spot','*','*','sigma_min_observations','200'::jsonb,'p19-b8.5e'),
  ('mark_staleness','*','xstock_spot','*','*','sigma_classwide_percentile','0.90'::jsonb,'p19-b8.5e')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now();

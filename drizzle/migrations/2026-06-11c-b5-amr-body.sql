-- ════════════════════════════════════════════════════════════════════════════
-- B-5 AMR BODY (2026-06-11) — schema + seeds
-- Scope: Claude Comms and Packages/Scope Files/B_5_AMR_BODY_SCOPE.md (16 objectives)
-- Rollback: 2026-06-11c-b5-amr-body-rollback.sql (NOT in git per migration policy)
--
-- THRESHOLD PROVENANCE (captured 2026-06-11 ~13:00Z BEFORE seeding, per Pull-in B):
--   crypto friction (12h scanned-universe-equivalent series, n=1402 log samples):
--     min 29 / p50 29 / p95 30 / max 31 — fee-dominated floor at the B-4.5
--     0.8% taker rate ((spread+slip+fee)*1e4/3 with tiny crypto spreads ≈ 29).
--     CHOPPY/STORMY triggers sit ABOVE the observed band: 40 ≈ avg spread
--     blowout to ~0.3%; 60 ≈ ~0.9% (genuine stress). Pool-vs-universe bias
--     note: the pre-B-5 pool read (n=13) and the universe read agree at the
--     fee-dominated floor; shadow ledger re-validates post-deploy.
--   xstock spread distribution (24h xstock_spot_ticker_snap, 21,526 (bucket,symbol)
--     aggregates, ~439-485 names/bucket):
--       RTH slice:  cross-name median p50 0.089% / p95 0.21% -> friction ~31-35
--       overnight:  cross-name median p50 1.64% / p95 3.88% -> friction ~83-100
--     SESSION-BIMODAL by ~18x: thresholds (45/70) put RTH in CALM range and
--     overnight legitimately in CHOPPY/STORMY (real hostile friction — the
--     weather SHOULD tighten overnight; Kyle low-volume!=shutdown ruling is
--     honored by the separate LOW_VOLUME_THIN reason, not by blunting triggers).
--   |DBS| 12h series (n≈1400/class): crypto p50 0.378 / p95 0.460 / max 0.497;
--     xstock p50 0.211 / p95 0.319 / max 0.336. CHOPPY trigger ≈ p95,
--     STORMY ≈ p95 + headroom.
--   Dial seeds: concept-doc symmetry (SURVIVAL trio matches the 11.7S literals
--     shipped since Phase 11) + Langston B1 (AGGRESSIVE floor = NORMAL, NOT
--     0.55) + W2-W3 composition bound (1.25 size x per-strategy multipliers
--     stays inside B3.1-validated geometry). Operator seeds; the shadow
--     ledger re-validates every value before any Phase-19 flip.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Decision ledger ──────────────────────────────────────────────────────
-- ~5,760 rows/day = 2,880 30s MCE cycles x 2 asset classes (one row PER CLASS
-- per cycle). CORRECTED 2026-07-28 (#606): this read "~2,880 rows/day both
-- classes" -- the CYCLE count mislabelled as the ROW count. Measured live:
-- 268,794 rows / 47 days = 5,719/day = 99.3% of the corrected figure. Trusting
-- the old comment made the real total read as 2x expectation and would have
-- confirmed a false two-writer hypothesis. Retention: IN-SERVICE daily
-- 90-day DELETE (amr-weather-report.ts maybePruneLedger — Langston-ratified
-- judgment call 2; the B-NEW-47 partition sweep does NOT apply to this small
-- non-partitioned table and the ledger is deliberately NOT in its registry).
CREATE TABLE IF NOT EXISTS amr_decision_ledger (
  id BIGSERIAL PRIMARY KEY,
  cycle_ts TIMESTAMPTZ NOT NULL,
  asset_class TEXT NOT NULL,
  inputs_schema_version INTEGER NOT NULL,
  weather JSONB NOT NULL,
  continuous_score DOUBLE PRECISION,
  resolved_mode TEXT,
  would_dials JSONB,
  would_blocks JSONB,
  flag_state TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS amr_decision_ledger_class_ts_idx
  ON amr_decision_ledger (asset_class, cycle_ts);

-- ── 2. amr_runtime: the 3-state flag, per class ────────────────────────────
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('amr_runtime', '*', 'crypto_spot', '*', '*', 'mode', '"disabled"'::jsonb, 'b5-amr'),
  ('amr_runtime', '*', 'xstock_spot', '*', '*', 'mode', '"disabled"'::jsonb, 'b5-amr')
ON CONFLICT DO NOTHING;

-- ── 3. amr_response_dials: per (class, mode) ────────────────────────────────
-- NORMAL row values = the 11.7S literals (parity); DEFENSIVE/SURVIVAL = the
-- shipped 11.7S literals; AGGRESSIVE = loosening mirror WITHOUT stop-tighten
-- (the 11.7S size-not-stops doctrine) and WITHOUT floor reduction (B1).
-- slot_cap: operator seed (shadow re-validates); hard_pause false everywhere
-- at seed (STORMY pause is the operator escalation lever, not a default);
-- allowances permissive at seed (no hidden roster change rides the flip).
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by)
SELECT 'amr_response_dials', '*', klass, '*', '*', mode_prefix || dial, val::jsonb, 'b5-amr'
FROM (VALUES ('crypto_spot'), ('xstock_spot')) AS classes(klass)
CROSS JOIN (VALUES
  ('normal_',     'position_size_multiplier',        '1.0'),
  ('normal_',     'stop_loss_distance_multiplier',   '1.0'),
  ('normal_',     'take_profit_distance_multiplier', '1.0'),
  ('normal_',     'entry_cooldown_multiplier',       '1.0'),
  ('normal_',     'hard_pause',                      'false'),
  ('normal_',     'allowed_source_pools',            '["all"]'),
  ('normal_',     'allowed_strategy_families',       '["all"]'),
  ('aggressive_', 'position_size_multiplier',        '1.25'),
  ('aggressive_', 'stop_loss_distance_multiplier',   '1.0'),
  ('aggressive_', 'take_profit_distance_multiplier', '1.2'),
  ('aggressive_', 'entry_cooldown_multiplier',       '0.75'),
  ('aggressive_', 'hard_pause',                      'false'),
  ('aggressive_', 'allowed_source_pools',            '["all"]'),
  ('aggressive_', 'allowed_strategy_families',       '["all"]'),
  ('defensive_',  'position_size_multiplier',        '0.6'),
  ('defensive_',  'stop_loss_distance_multiplier',   '1.2'),
  ('defensive_',  'take_profit_distance_multiplier', '0.8'),
  ('defensive_',  'entry_cooldown_multiplier',       '1.5'),
  ('defensive_',  'hard_pause',                      'false'),
  ('defensive_',  'allowed_source_pools',            '["all"]'),
  ('defensive_',  'allowed_strategy_families',       '["all"]'),
  ('survival_',   'position_size_multiplier',        '0.25'),
  ('survival_',   'stop_loss_distance_multiplier',   '1.5'),
  ('survival_',   'take_profit_distance_multiplier', '0.6'),
  ('survival_',   'entry_cooldown_multiplier',       '2.0'),
  ('survival_',   'hard_pause',                      'false'),
  ('survival_',   'allowed_source_pools',            '["all"]'),
  ('survival_',   'allowed_strategy_families',       '["all"]')
) AS dials(mode_prefix, dial, val)
ON CONFLICT DO NOTHING;

-- slot caps per (class, mode) — distinct values per class, so enumerated:
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('amr_response_dials', '*', 'crypto_spot', '*', '*', 'normal_slot_cap',     '10'::jsonb, 'b5-amr'),
  ('amr_response_dials', '*', 'crypto_spot', '*', '*', 'aggressive_slot_cap', '12'::jsonb, 'b5-amr'),
  ('amr_response_dials', '*', 'crypto_spot', '*', '*', 'defensive_slot_cap',  '6'::jsonb,  'b5-amr'),
  ('amr_response_dials', '*', 'crypto_spot', '*', '*', 'survival_slot_cap',   '3'::jsonb,  'b5-amr'),
  ('amr_response_dials', '*', 'xstock_spot', '*', '*', 'normal_slot_cap',     '8'::jsonb,  'b5-amr'),
  ('amr_response_dials', '*', 'xstock_spot', '*', '*', 'aggressive_slot_cap', '10'::jsonb, 'b5-amr'),
  ('amr_response_dials', '*', 'xstock_spot', '*', '*', 'defensive_slot_cap',  '5'::jsonb,  'b5-amr'),
  ('amr_response_dials', '*', 'xstock_spot', '*', '*', 'survival_slot_cap',   '2'::jsonb,  'b5-amr')
ON CONFLICT DO NOTHING;

-- ── 4. amr_weather_rules: per-class thresholds + dwell + weights ───────────
-- Friction/DBS values: provenance block at file head. EV-gap thresholds are
-- RATIOS of realized shortfall vs predicted edge (0.5 = realized eats half
-- the predicted edge; 1.0 = predicted edge fully eaten). Windows in DISTINCT
-- OBSERVATION EPOCHS (scope A8a), never poll cycles.
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('amr_weather_rules', '*', 'crypto_spot', '*', '*', 'friction_score_choppy',    '40'::jsonb,   'b5-amr'),
  ('amr_weather_rules', '*', 'crypto_spot', '*', '*', 'friction_score_stormy',    '60'::jsonb,   'b5-amr'),
  ('amr_weather_rules', '*', 'crypto_spot', '*', '*', 'dbs_abs_choppy',           '0.45'::jsonb, 'b5-amr'),
  ('amr_weather_rules', '*', 'crypto_spot', '*', '*', 'dbs_abs_stormy',           '0.60'::jsonb, 'b5-amr'),
  ('amr_weather_rules', '*', 'crypto_spot', '*', '*', 'ev_gap_window_n',          '100'::jsonb,  'b5-amr'),
  ('amr_weather_rules', '*', 'xstock_spot', '*', '*', 'friction_score_choppy',    '45'::jsonb,   'b5-amr'),
  ('amr_weather_rules', '*', 'xstock_spot', '*', '*', 'friction_score_stormy',    '70'::jsonb,   'b5-amr'),
  ('amr_weather_rules', '*', 'xstock_spot', '*', '*', 'dbs_abs_choppy',           '0.32'::jsonb, 'b5-amr'),
  ('amr_weather_rules', '*', 'xstock_spot', '*', '*', 'dbs_abs_stormy',           '0.45'::jsonb, 'b5-amr'),
  ('amr_weather_rules', '*', 'xstock_spot', '*', '*', 'ev_gap_window_n',          '30'::jsonb,   'b5-amr')
ON CONFLICT DO NOTHING;
-- class-symmetric rules:
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by)
SELECT 'amr_weather_rules', '*', klass, '*', '*', cname, val::jsonb, 'b5-amr'
FROM (VALUES ('crypto_spot'), ('xstock_spot')) AS classes(klass)
CROSS JOIN (VALUES
  ('flip_window_epochs',     '20'),
  ('regime_flips_choppy',    '3'),
  ('regime_flips_stormy',    '5'),
  ('ev_gap_choppy_ratio',    '0.5'),
  ('ev_gap_stormy_ratio',    '1.0'),
  ('favorable_min_score',    '0.7'),
  ('score_stormy_max',        '0.25'),
  ('score_choppy_max',        '0.45'),
  ('dwell_min_epochs',       '10'),
  ('relax_confirm_epochs',   '10'),
  ('weight_friction',        '0.30'),
  ('weight_dbs',             '0.20'),
  ('weight_flips',           '0.20'),
  ('weight_evgap',           '0.20'),
  ('weight_macro',           '0.10'),
  ('friction_trend_window_epochs', '20')
) AS rules(cname, val)
ON CONFLICT DO NOTHING;

-- ── 5. amr_friction_sample: the xstock store knobs (chunk 0a fail-hards) ───
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('amr_friction_sample', '*', 'xstock_spot', '*', '*', 'freshness_window_seconds', '150'::jsonb, 'b5-amr'),
  ('amr_friction_sample', '*', 'xstock_spot', '*', '*', 'min_fresh_names',          '25'::jsonb,  'b5-amr'),
  ('amr_friction_sample', '*', 'xstock_spot', '*', '*', 'warmup_cycles',            '3'::jsonb,   'b5-amr')
ON CONFLICT DO NOTHING;

-- ── 6. amr_input_health: Obj-15b sentinel rails (R1-R5 folded) ──────────────
-- Stuck-value: distinct-value-COUNT arming (R3, scale-free), faster N at
-- exactly-zero/sentinel. OOB rails quarantine (null-with-reason), never clamp.
-- NOTE the crypto friction series above shows only 3 distinct values in 12h —
-- a legitimately quiet input; with K=5 over 7d it arms only if real variance
-- exists, else honestly disarms (Langston R3 ruling).
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by)
SELECT 'amr_input_health', '*', klass, '*', '*', cname, val::jsonb, 'b5-amr'
FROM (VALUES ('crypto_spot'), ('xstock_spot')) AS classes(klass)
CROSS JOIN (VALUES
  ('stuck_arming_distinct_k',     '5'),
  ('stuck_arming_window_days',    '7'),
  ('stuck_value_epochs_n',        '60'),
  ('stuck_zero_epochs_n',         '10'),
  ('staleness_tolerance_epochs',  '10'),
  ('z_abs_max',                   '6'),
  ('vote_pct_min',                '0'),
  ('vote_pct_max',                '100'),
  ('friction_score_min',          '0'),
  ('friction_score_max',          '100'),
  ('dbs_abs_max',                 '1')
) AS rails(cname, val)
ON CONFLICT DO NOTHING;
-- class-specific external rails:
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('amr_input_health', '*', 'crypto_spot', '*', '*', 'btc_dominance_min',        '20'::jsonb,   'b5-amr'),
  ('amr_input_health', '*', 'crypto_spot', '*', '*', 'btc_dominance_max',        '90'::jsonb,   'b5-amr'),
  ('amr_input_health', '*', 'crypto_spot', '*', '*', 'funding_abs_max',          '0.01'::jsonb, 'b5-amr'),
  ('amr_input_health', '*', 'xstock_spot', '*', '*', 'vix_min',                  '5'::jsonb,    'b5-amr'),
  ('amr_input_health', '*', 'xstock_spot', '*', '*', 'vix_max',                  '100'::jsonb,  'b5-amr'),
  ('amr_input_health', '*', 'xstock_spot', '*', '*', 'dxy_min',                  '70'::jsonb,   'b5-amr'),
  ('amr_input_health', '*', 'xstock_spot', '*', '*', 'dxy_max',                  '130'::jsonb,  'b5-amr'),
  -- R5: CBOE-vs-FRED same-trade-date close divergence (VIX points); ECB-DXY vs
  -- DTWEXBGS is DIRECTION-ONLY (no numeric tolerance row by design — the ECB
  -- 14:15-CET snapshot sits tens of bps off true ICE DXY intraday).
  ('amr_input_health', '*', 'xstock_spot', '*', '*', 'vix_divergence_max_points','2.0'::jsonb,  'b5-amr')
ON CONFLICT DO NOTHING;

-- ── 7. amr_external_equity: Obj-14b feed knobs (sources per Langston ruling:
--      CBOE owner-official delayed JSON primary + FRED VIXCLS keyed cross-check;
--      DXY = ICE formula over frankfurter ECB daily rates, eurofxref-daily.xml
--      documented fallback; Stooq WITHDRAWN on evidence 2026-06-11) ──────────
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('amr_external_equity', '*', 'xstock_spot', '*', '*', 'poll_seconds',             '300'::jsonb, 'b5-amr'),
  ('amr_external_equity', '*', 'xstock_spot', '*', '*', 'z_baseline_observations',  '720'::jsonb, 'b5-amr'),
  ('amr_external_equity', '*', 'xstock_spot', '*', '*', 'min_observations_for_z',   '30'::jsonb,  'b5-amr')
ON CONFLICT DO NOTHING;

-- ── 8. governance_modes: per-class promotion (Obj-2) ────────────────────────
-- Per-class rows COPY the live wildcard values (parity by construction — no
-- retyped literals). AGGRESSIVE floor = NORMAL floor (Langston B1).
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by)
SELECT 'governance_modes', '*', klass, '*', '*', mc.constant_name, mc.value, 'b5-amr'
FROM module_constants mc
CROSS JOIN (VALUES ('crypto_spot'), ('xstock_spot')) AS classes(klass)
WHERE mc.module_name = 'governance_modes' AND mc.asset_class = '*'
  AND mc.constant_name IN ('normal_mode_confidence_floor', 'defensive_mode_confidence_floor', 'survival_mode_confidence_floor')
ON CONFLICT DO NOTHING;
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by)
SELECT 'governance_modes', '*', klass, '*', '*', 'aggressive_mode_confidence_floor', mc.value, 'b5-amr'
FROM module_constants mc
CROSS JOIN (VALUES ('crypto_spot'), ('xstock_spot')) AS classes(klass)
WHERE mc.module_name = 'governance_modes' AND mc.asset_class = '*'
  AND mc.constant_name = 'normal_mode_confidence_floor'
ON CONFLICT DO NOTHING;
-- wildcard AGGRESSIVE fallback row (inactive-class fallback only):
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by)
SELECT 'governance_modes', '*', '*', '*', '*', 'aggressive_mode_confidence_floor', mc.value, 'b5-amr'
FROM module_constants mc
WHERE mc.module_name = 'governance_modes' AND mc.asset_class = '*'
  AND mc.constant_name = 'normal_mode_confidence_floor'
ON CONFLICT DO NOTHING;

-- ── 9. Obj-12 calibration-epoch bump: xstock_spot vts ONLY ──────────────────
-- The static->measured xstock spread flip changes the admit population (a live
-- behavioral write independent of the AMR flag), so xstock vts rows start a
-- new lineage. Crypto untouched (Pull-in B changes a SAMPLING source, not
-- per-trade economics — scope Obj-12 ruling). Class-scoped row rides the
-- module_constants most-specific-wins resolution; the wildcard row remains
-- crypto's (and any future class's) epoch.
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by)
SELECT 'calibration_epoch', '*', 'xstock_spot', '*', '*', 'vts', to_jsonb((mc.value)::text::numeric + 1), 'b5-amr'
FROM module_constants mc
WHERE mc.module_name = 'calibration_epoch' AND mc.asset_class = '*' AND mc.constant_name = 'vts'
ON CONFLICT DO NOTHING;

-- ── 10. Obj-10 (#217 wire-at-shadow): ranking_context_bonus ─────────────────
-- The DOCUMENTED ranking-weights.ts values promoted to DB rows (never applied
-- to live composition until the Phase-19 flip; the shadow ledger validates).
-- bull_compatible_regimes: DB-tunable mapping over the canonical regime enum
-- (Step-2 ruling) — EXTREME_NOISE/STRUCTURAL_TRANSITION map to neither side
-- (omitted = null = no term, the honest unavailable state).
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by)
SELECT 'ranking_context_bonus', '*', klass, '*', '*', cname, val::jsonb, 'b5-amr'
FROM (VALUES ('crypto_spot'), ('xstock_spot')) AS classes(klass)
CROSS JOIN (VALUES
  ('regime_agreement_bonus',     '0.06'),
  ('regime_disagreement_penalty','-0.04'),
  ('confirmation_bonus',         '0.03'),
  ('confirmation_penalty',       '-0.02'),
  ('bull_compatible_regimes',    '{"BULL_STABLE": true, "BULL_VOLATILE": true, "TREND_FRIENDLY_STABLE": true, "IMPULSE_EXPANSION": true, "HIGH_VOL_IMPULSE": true, "BEAR_STABLE": false, "BEAR_VOLATILE": false, "LOW_VOL_CHOP": false, "RANGE_BOUND_STABLE": false, "HIGH_VOLATILITY_UNSTABLE": false}')
) AS rules(cname, val)
ON CONFLICT DO NOTHING;
-- SPY trend knobs (xstock only; lookback <= stored window boot-asserted):
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('ranking_context_bonus', '*', 'xstock_spot', '*', '*', 'spy_trend_lookback_bars',   '16'::jsonb,   'b5-amr'),
  ('ranking_context_bonus', '*', 'xstock_spot', '*', '*', 'spy_bar_staleness_minutes', '45'::jsonb,   'b5-amr'),
  ('ranking_context_bonus', '*', 'xstock_spot', '*', '*', 'spy_trend_threshold_pct',   '0.15'::jsonb, 'b5-amr')
ON CONFLICT DO NOTHING;

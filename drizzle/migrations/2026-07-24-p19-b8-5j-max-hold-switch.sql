-- P19-B8.5j (2026-07-24) — the MAX-HOLD master switch, THREE mode-keyed flags.
--
-- Kyle directive 2026-07-24: "right now, I don't want there to be a maximum hold until we
-- all have a chance to sit around, debate it … just turn that functionality off altogether"
-- + "create a switch for active trading in paper mode and one for live mode, and one for VTS."
--
--   - enabled_paper — gates the active-path max_holding_period force-close when the engine
--                     runs in paper mode (active-execution-engine.ts checkExitConditions).
--   - enabled_live  — same, in live mode.
--   - enabled_vts   — gates the VTS 7-day valve (real pass) + 6h shadow cap, via the
--                     vts-runner call sites passing maxHoldMs: Infinity when OFF.
--
-- These are GLOBAL wildcard rows (asset_class='*') — the switch is keyed by trading LANE
-- (paper/live/vts), NOT by asset class. Resolve with GLOBAL_KEY.
--
-- ★ SEED VALUES ARE ASYMMETRIC — AND DELIBERATELY SO (Langston Step-1/2, 2026-07-24):
--   enabled_paper = FALSE, enabled_live = FALSE  — the 24h TRADE-RULE force-close Kyle wants
--     paused. The switch gates ENFORCEMENT, not stamping, so every already-open position
--     (incl. crypto VVV, ~8h from a 24h force-close at scoping) is protected the moment this
--     deploys. Policy PAUSE, not a value change — the max-hold value debate is deferred.
--   enabled_vts = TRUE  — the VTS "max hold" is NOT a 24h trade rule; it is the 7-day
--     zombie/stale-sim CLEANUP valve (`vts-runner.ts MAX_HOLD_MS = 7 days // safety valve only`,
--     `tec-evaluator.ts:228 "zombie cleanup"`, `:242 "Safety valve, not a normal exit"`).
--     Seeding it OFF (→ Infinity) would RE-INTRODUCE the pre-Batch-18I bug that BATCH_64_SCOPE.md
--     records: illiquid sims stop getting price updates and accumulate unbounded in the trade
--     map — a B63 hotfix set MAX_HOLD_MS=Infinity, Langston flagged it, B64 restored the valve.
--     So VTS ships ON (the switch still EXISTS for Kyle to flip in the debate; the DEFAULT just
--     does not ship a known regression). ★ Kyle's explicit seed decision confirmed BEFORE this
--     migration runs (Langston condition: decide before it lands, not in the completion report).
--
-- ★ FAIL-SAFE (deliberate, differs from TEC requireKey): the readers treat a cold module OR
-- an absent key as OFF (do-not-enforce). ★ THIS IS FAIL-SAFE ONLY BECAUSE NON-ENFORCEMENT IS
-- NON-DESTRUCTIVE FOR THIS SWITCH — a force-close is irreversible, not-closing is not. Do NOT
-- cite B8.5j to default-off a switch whose OFF is the destructive direction (Langston caveat).
-- Rule 11 is not violated: an enable-gate whose OFF is the absence of an irreversible action is
-- not a governed-value silent fallback. Readers compare `=== true`, so a jsonb STRING "false"
-- (JS-truthy) still resolves OFF.
--
-- Value stored as a jsonb boolean (jsonb_typeof='boolean'), mirroring break_even_enabled /
-- trailing_enabled_*. Rollback: 2026-07-24-p19-b8-5j-max-hold-switch-rollback.sql (operator-only).

INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('max_hold_switch','*','*','*','*','enabled_paper','false'::jsonb,'p19-b8.5j'),
  ('max_hold_switch','*','*','*','*','enabled_live','false'::jsonb,'p19-b8.5j'),
  ('max_hold_switch','*','*','*','*','enabled_vts','true'::jsonb,'p19-b8.5j')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now();

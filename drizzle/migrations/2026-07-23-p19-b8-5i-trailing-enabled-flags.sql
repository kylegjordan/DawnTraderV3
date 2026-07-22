-- P19-B8.5i (2026-07-23, #562) — the trailing-exit master switch, TWO flags per asset class.
--
-- Kyle directive 2026-07-22: "create a proper switch/flag for the trailing exit … one for
-- VTS and one for active trading." Gives the variant-K trailing-off decision (Kyle
-- 2026-05-05) a control in the SAME shape as break_even_enabled, replacing the
-- empty-moonbag-allowlist that served as a de-facto off-switch and was independently
-- misread by two readers (CC-B, then Kyle).
--
--   - trailing_enabled_vts    — the passive-learning (VTS) path, and the shadow pass bound to it.
--   - trailing_enabled_active — the live/paper active-trading path.
--
-- Resolved by callerMode at the single isMoonbagQualifier chokepoint ('vts' → VTS flag;
-- 'paper'/'live' → active flag), so the two paths are INDEPENDENTLY controllable — turning
-- VTS trailing on must NOT turn active trailing on.
--
-- ★ BOTH SEEDED false ON ALL FOUR CLASSES — BEHAVIOUR-NEUTRAL BY CONSTRUCTION. With both
-- flags false AND the moonbag list already empty, isMoonbagQualifier returns false exactly
-- as it does today, reproducing the exact live code path (the moonbag-reject close), NOT the
-- non-trailing block. The flags diverge from today ONLY on the deliberate turn-on
-- (flag=true + a non-empty list on that path).
--
-- HARD-FAIL discipline (§5 / B79.0n.TEC TYPE-TEMPLATE-ONLY): resolveTECConfig requireKey()
-- throws if either row is missing per class — no runtime default. ⚠️ APPLY THIS MIGRATION
-- BEFORE THE CODE DEPLOYS, or the first TEC config resolve hard-fails (the B8.5e
-- deploy-ordering lesson: a retiring/adding migration must land WITH or BEFORE its code).
--
-- Value stored as a jsonb boolean (jsonb_typeof = 'boolean'), mirroring break_even_enabled
-- exactly — verified live 2026-07-23 — so drizzle deserializes it to a JS boolean and the
-- requireKey<boolean> cast is honest (a jsonb STRING "false" would be JS-truthy and would
-- silently enable trailing — the failure this explicit ::jsonb boolean cast prevents).
-- Rollback: 2026-07-23-p19-b8-5i-trailing-enabled-flags-rollback.sql (operator-only).

INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('trailing_exit','*','crypto_spot','*','*','trailing_enabled_vts','false'::jsonb,'p19-b8.5i'),
  ('trailing_exit','*','crypto_spot','*','*','trailing_enabled_active','false'::jsonb,'p19-b8.5i'),
  ('trailing_exit','*','crypto_perp','*','*','trailing_enabled_vts','false'::jsonb,'p19-b8.5i'),
  ('trailing_exit','*','crypto_perp','*','*','trailing_enabled_active','false'::jsonb,'p19-b8.5i'),
  ('trailing_exit','*','xstock_spot','*','*','trailing_enabled_vts','false'::jsonb,'p19-b8.5i'),
  ('trailing_exit','*','xstock_spot','*','*','trailing_enabled_active','false'::jsonb,'p19-b8.5i'),
  ('trailing_exit','*','xstock_perp','*','*','trailing_enabled_vts','false'::jsonb,'p19-b8.5i'),
  ('trailing_exit','*','xstock_perp','*','*','trailing_enabled_active','false'::jsonb,'p19-b8.5i')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now();

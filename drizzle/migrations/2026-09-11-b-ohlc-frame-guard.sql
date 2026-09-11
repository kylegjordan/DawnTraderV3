-- B-OHLC-FRAME-GUARD (#1028) — 2026-09-11
--
-- ONE knob row: how many consecutive DISTINCT rejected bars on one symbol raise the OHLC frame
-- guard's sustained-skip alert (pre-audit plan P5). No table, column or data change.
--
-- WHY A KNOB AND NOT A CONSTANT (Step-2 condition C6, J2 ruled): the value cannot be audited before
-- deploy — no skip rate exists until the guard does — so retuning it must not need a deploy.
-- WHY IT IS READ NON-REQUIRED AND SITS IN NO BOOT-ASSERT LIST: a REQUIRED read is what made
-- B-GOV-HYGIENE OBJ-3 a production-down change. The reader carries _recordPriceSkip's cold-default
-- shape (06560c299, Langston-approved) — the ruled exception to "a DB-governed setting fails hard
-- when empty", recorded in the scope's section 15 rather than taken silently.
-- The value 10 is UNAUDITED (pre-audit P5): anchored on rtb-metrics-service.ts:357 and a 24h baseline
-- of 0 NaN in 357,849 one-minute rows.
--
-- Rollback: 2026-09-11-b-ohlc-frame-guard-rollback.sql (operator-only, NOT in MANIFEST).

INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by)
VALUES ('passive_archive','*','*','*','*','ohlc_frame_skip_alert_streak','10'::jsonb,'b-ohlc-frame-guard')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

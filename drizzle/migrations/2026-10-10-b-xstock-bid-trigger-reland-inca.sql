-- B-XSTOCK-BID-TRIGGER-RELAND increment A, P1 (objective 1b) — 2026-10-10
--
-- ONE knob row: the THIRTEENTH book_state row, `ri_abs_spread_ceiling_pct`, the ABSOLUTE spread ceiling (percent of
-- mid) of the ring-independent release on a seedImplausible chain (book-state-tracker.ts, SEED_ESCAPED_RI). Value 1.0:
-- Langston gate 1 r2 (2026-10-10) ruled the 1% seed stands. A change is a DB write recorded PREVIOUSLY/NOW.
--
-- ⛔ ORDER MATTERS AND dt-deploy GETS IT RIGHT: this migration runs BEFORE the restart, and the new code's boot assertion
-- requires EXACTLY thirteen xstock_spot rows. The OLD process never re-asserts after boot, so the row landing first is
-- harmless to it.
-- Rollback: 2026-10-10-b-xstock-bid-trigger-reland-inca-rollback.sql (operator-only, NOT in MANIFEST).

INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by)
VALUES ('book_state','*','xstock_spot','*','*','ri_abs_spread_ceiling_pct','1.0'::jsonb,'b-xstock-bid-trigger-reland')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

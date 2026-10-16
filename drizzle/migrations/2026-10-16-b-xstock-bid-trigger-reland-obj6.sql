-- B-XSTOCK-BID-TRIGGER-RELAND objective 6 (row 2) — 2026-10-16 — `spread_blown` ON, Kyle-directed as a live function.
--
-- ONE knob row: the FOURTEENTH book_state row, `spread_blown_enabled` = 1. With it on, the book-state predicate treats an
-- xStock book wider than the governed absolute ceiling (`ri_abs_spread_ceiling_pct`, 1.0%) as HOLLOW, judged before any
-- comparator, so a paper stop or target does not decide on it — the position is held until the book is plausible.
-- Design: Claude Comms and Packages/Langston Design Asks/B-XSTOCK-BID-TRIGGER-RELAND_spread-blown-arming_r1.md r1-r2.
--
-- ⛔ ORDER MATTERS AND dt-deploy GETS IT RIGHT: this migration runs BEFORE the restart, and the new code's boot assertion
-- requires EXACTLY fourteen xstock_spot rows. The OLD process never re-asserts after boot, so the row landing first is
-- harmless to it. A distinct updated_by (the storage.ts coalesce trap).
-- Rollback: 2026-10-16-b-xstock-bid-trigger-reland-obj6-rollback.sql (operator-only, NOT in MANIFEST). To turn the arm OFF
-- without a code revert, UPDATE this row's value to 0 — that is the supported switch.

INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by)
VALUES ('book_state','*','xstock_spot','*','*','spread_blown_enabled','1'::jsonb,'b-xstock-bid-trigger-reland-obj6')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

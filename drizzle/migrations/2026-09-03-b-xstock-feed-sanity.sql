-- B-XSTOCK-FEED-SANITY (#943; closes #567) — 2026-09-03
--
-- THREE label columns on closed_trades, TWELVE knob rows for the book-state guard, and ONE
-- calibration-epoch class row. NO money column is touched, NO close_reason is touched.
--
-- ⛔ WHY THE COLUMNS ARE NULLABLE WITH NO DEFAULT: a pre-deploy row must stay distinguishable from
-- a post-deploy row whose stamp was missed (#546). Rows are labelled forward by the guard and
-- backward by the re-cut script (scripts/xstock-hollow-recut.ts), each with its BASIS.
--
-- ⛔ WHY THE KNOBS ARE xstock_spot ONLY: the guard reads the xStock equities tick store; there is
-- no crypto read-path, and a seeded crypto row would be a live-looking guard with no runtime
-- source (the mark_staleness precedent, Langston 2026-07-22). The boot assertion asserts EXACTLY
-- twelve xstock_spot rows — their names come from BOOK_STATE_KNOBS in
-- server/asset_classes/xstock_spot/book-state.ts, the one list the resolver and the assertion
-- also read (Langston Step-2 condition C2). Values are the audit's pre-registration (§A.9),
-- written BEFORE any code; a change is a PREVIOUSLY/NOW line in the completion report.
--
-- Rollback: 2026-09-03-b-xstock-feed-sanity-rollback.sql (operator-only, NOT in MANIFEST).

ALTER TABLE closed_trades
  ADD COLUMN IF NOT EXISTS exit_book_state VARCHAR(24),
  ADD COLUMN IF NOT EXISTS exit_book_state_at_fill VARCHAR(24),
  ADD COLUMN IF NOT EXISTS exit_book_state_basis VARCHAR(32);

COMMENT ON COLUMN closed_trades.exit_book_state IS
  'B-XSTOCK-FEED-SANITY (#943): what the book looked like at the DECISION instant - two_sided | hollow | unknown (unknown = the guard LOOKED and had no comparator yet). A LABEL, never money: HONEST_PNL, gross/net, the daily-loss budget and close_reason are untouched. NEVER read without exit_book_state_basis. NULL = no assessment happened: pre-deploy, crypto (no guard), guard disabled / knobs cold / no tick, a flatten that carried no decision verdict, never_filled, engine_stop_cleanup, hard_reset. A NULL is re-cuttable; a value is a look that happened.';
COMMENT ON COLUMN closed_trades.exit_book_state_at_fill IS
  'B-XSTOCK-FEED-SANITY (#943): the same verdict at the FILL instant (closePosition, before the depth read). Written ONLY by the live assessment there, so its basis is guard by construction and it has no basis column. A resting maker fill consulted no book => NULL (no assessment, not unknown). Writers outside closePosition (closeAllPositions, the two manual routes) stamp exit_book_state at their own write and leave this NULL.';
COMMENT ON COLUMN closed_trades.exit_book_state_basis IS
  'B-XSTOCK-FEED-SANITY (#943): what produced exit_book_state - and ONLY exit_book_state (INVARIANT: a non-NULL basis implies a non-NULL exit_book_state; the re-cut touches only rows where BOTH are NULL). guard = a LIVE in-memory frame WAS ASSESSED at the decision instant (the ONLY basis that saw the decision frame) - written only when that is true, never for a guard that did not run; decision_price = this row''s exit_decision_price judged against the archive; market_state_predicate = the archived frame <=5s before close (session bodies only - the archive keeps ONE row per symbol per 4s and misses the handoff decision frames: audit A.11, 2 of 11 handoff closes reproduced vs 10 of 10 bodies); minute_proxy = the close fell in a handoff minute and nothing else is known - a PROXY with an UNMEASURED base rate (26 rows at deploy). A consumer that gates on hollow MUST also require basis IN (guard, decision_price); the fence test enforces it.';

-- ── The twelve book_state knobs (xstock_spot only). Idempotent. ─────────────────────────────────
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by)
VALUES
  ('book_state','*','xstock_spot','*','*','enabled',                          '1'::jsonb,     'b-xstock-feed-sanity'),
  ('book_state','*','xstock_spot','*','*','single_side_departure_k_rel',      '3'::jsonb,     'b-xstock-feed-sanity'),
  ('book_state','*','xstock_spot','*','*','single_side_departure_floor_pct',  '1.0'::jsonb,   'b-xstock-feed-sanity'),
  ('book_state','*','xstock_spot','*','*','other_side_hold_pct',              '0.5'::jsonb,   'b-xstock-feed-sanity'),
  ('book_state','*','xstock_spot','*','*','last_hold_pct',                    '0.5'::jsonb,   'b-xstock-feed-sanity'),
  ('book_state','*','xstock_spot','*','*','trailing_spread_window_snaps',     '20'::jsonb,    'b-xstock-feed-sanity'),
  ('book_state','*','xstock_spot','*','*','feed_read_enabled',                '0'::jsonb,     'b-xstock-feed-sanity'),
  ('book_state','*','xstock_spot','*','*','feed_stub_fraction_f',             '0.10'::jsonb,  'b-xstock-feed-sanity'),
  ('book_state','*','xstock_spot','*','*','feed_stub_window_ms',              '90000'::jsonb, 'b-xstock-feed-sanity'),
  ('book_state','*','xstock_spot','*','*','feed_cohort_floor',                '50'::jsonb,    'b-xstock-feed-sanity'),
  ('book_state','*','xstock_spot','*','*','hollow_skip_cap',                  '60'::jsonb,    'b-xstock-feed-sanity'),
  ('book_state','*','xstock_spot','*','*','own_mark_deviation_d_pct',         '5'::jsonb,     'b-xstock-feed-sanity')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- ── Calibration epoch: a CLASS row for paper_sim / xstock_spot (audit §A.6, epoch question 1). ──
-- The forward xStock closed population changes meaning (post-guard closes exclude hollow stop-outs).
-- calibration-epoch.ts resolves most-specific-wins by class, so a CLASS row marks the boundary
-- without touching the wildcard paper_sim row (= 2) or any other source/class. Same form as
-- 2026-09-02-fg2-obj5c-vts-epoch-bump.sql (vts class rows). Value 3 = wildcard + 1.
-- The outcome-feedback EMA is NOT reset by an epoch bump (Welford resets, the EMA continues -
-- outcome-feedback-store.ts:353-372); the two paper_sim_xstock_spot_* keys are removed by the
-- pre-restart script scripts/reset-outcome-feedback-keys.ts, stated in the completion report.
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by)
VALUES ('calibration_epoch','*','xstock_spot','*','*','paper_sim','3'::jsonb,'b-xstock-feed-sanity')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

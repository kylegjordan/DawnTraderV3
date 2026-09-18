-- B-FEED-MISMATCH-FIX (PHASE_19_PLAN row 3n.u) — the CLOSE-FILL CONTRACT.
--
-- (1) Two new nullable closed_trades columns recording how the taker close fill was graded.
-- (2) The per-class `close_fill_contract` module_constants rows the resolver
--     (server/services/execution/close-fill-contract-config.ts) requires. FAIL-CLOSED:
--     with no rows, not-warm closes are refused, never graded against an invented bound.
--
-- ⛔⛔ `up_tol` = 0.01 IS A CHOICE INSIDE AN EMPTY INTERVAL, NOT A DERIVATION.
-- Measured on staging 2026-09-19, every taker close since the fill-age column went live
-- (crypto from 2026-08-30 23:29Z, xStock from 2026-08-31 00:15Z), walked fill against the
-- ticker witness bid (`exit_ticker_bid`):
--   crypto_spot  n=46, 41 with a witness: -3.79 % .. +0.47 % (max KTA/USD); 0 above +1 %.
--   xstock_spot  n=49, 49 with a witness: 46 exactly 0.00 % (same-row identities — on xStock the
--                witness and the walk read the SAME table), and the only three above +1 % are the
--                three harmful stale walks: SPGI +5.15 %, BABA +5.71 %, CTVA +10.25 %.
-- Nothing was observed between +0.47 % and +5.15 %. 0.01 sits in that gap by choice.
-- ⚠️ crypto_spot has n=0 NOT-WARM closes (the only population this bound ever grades), so its row
--    is a choice with NO population behind it. Re-derive both from post-deploy rows (Step 7) before
--    either value is described as calibrated. (#546: a constant must not wear measured clothes.)
--
-- `cold_refusal_cap` = 60 mirrors `hollow_skip_cap` (the xStock book-state guard's bounded hold) —
-- the same pattern, not a new one: after 60 consecutive refused closes on one position the close
-- YIELDS (walks, stamps `exit_fill_arm = 'walk_yield'`) and raises an alert.

BEGIN;

ALTER TABLE closed_trades
  ADD COLUMN IF NOT EXISTS exit_fill_book_warmth TEXT,
  ADD COLUMN IF NOT EXISTS exit_fill_arm TEXT;

COMMENT ON COLUMN closed_trades.exit_fill_book_warmth IS
  'WARMTH of the book the taker CLOSE fill walked, graded by assessWarmth against fill_depth_gate.warmth_max_age_ms / min_levels at the fill instant: warm | stale_book | thin_book | no_book. NULL on a MAKER fill (a resting fill consults no book) and on rows not written by closePosition. ORTHOGONAL TO exit_book_state_at_fill, which answers HOLLOWNESS (two_sided | hollow | unknown): a book can be warm and hollow, or stale and two-sided. Both are kept. The age itself stays in exit_fill_depth_age_ms. B-FEED-MISMATCH-FIX P1.';
COMMENT ON COLUMN closed_trades.exit_fill_arm IS
  'Which arm of the close-fill contract booked this close: walk (warm book) | walk_stale (not warm, walked fill within up_tol of the witness bid) | walk_no_reference (not warm, no witness bid to grade against - e.g. EUR-quoted pairs, #966) | walk_yield (not warm and refused, cold_refusal_cap reached - walked anyway, alerted) | flatten_walk (stopped-engine flatten walked a book within up_tol, or a warm one) | flatten_walk_diverged (stopped-engine flatten walked a not-warm book above up_tol, or with the contract unseeded - booked because a flatten must go flat; EXCLUDED from learning capture) | synthetic_reference (stopped-engine flatten, no book: booked at the resolved observed price minus the beyond-depth penalty; EXCLUDED from learning capture). NULL on maker fills and on rows not written by closePosition. B-FEED-MISMATCH-FIX P1/P2.';

INSERT INTO module_constants
  (module_name, constant_name, value, asset_class, exchange, regime, strategy, updated_at, updated_by)
VALUES
  ('close_fill_contract', 'up_tol',           '0.01'::jsonb, 'crypto_spot', '*', '*', '*', NOW(), 'b-feed-mismatch-fix'),
  ('close_fill_contract', 'cold_refusal_cap', '60'::jsonb,   'crypto_spot', '*', '*', '*', NOW(), 'b-feed-mismatch-fix'),
  ('close_fill_contract', 'up_tol',           '0.01'::jsonb, 'xstock_spot', '*', '*', '*', NOW(), 'b-feed-mismatch-fix'),
  ('close_fill_contract', 'cold_refusal_cap', '60'::jsonb,   'xstock_spot', '*', '*', '*', NOW(), 'b-feed-mismatch-fix')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

COMMIT;

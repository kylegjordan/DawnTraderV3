-- ROLLBACK for 2026-09-03-b-xstock-feed-sanity.sql (operator-only; NOT in MANIFEST).
-- ⚠️ After the B-XSTOCK-FEED-SANITY code ships, b72-warmup asserts the twelve book_state rows at
-- boot — running this rollback WITHOUT reverting the code makes the server refuse to boot (by
-- design: fail-closed, no silent default). Revert the code first, then run this.
-- The three label columns are LEFT IN PLACE: dropping them destroys the historical re-cut, and a
-- nullable label column with no reader is inert. Drop them by hand only if a full revert is wanted.

DELETE FROM module_constants
WHERE module_name = 'book_state' AND asset_class IN ('xstock_spot')
  AND constant_name IN ('enabled','single_side_departure_k_rel','single_side_departure_floor_pct','other_side_hold_pct',
                        'last_hold_pct','trailing_spread_window_snaps','feed_read_enabled','feed_stub_fraction_f',
                        'feed_stub_window_ms','feed_cohort_floor','hollow_skip_cap','own_mark_deviation_d_pct');

DELETE FROM module_constants
WHERE module_name = 'calibration_epoch' AND asset_class = 'xstock_spot' AND constant_name = 'paper_sim'
  AND updated_by = 'b-xstock-feed-sanity';

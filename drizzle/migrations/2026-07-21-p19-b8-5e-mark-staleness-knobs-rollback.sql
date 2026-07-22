-- ROLLBACK for 2026-07-21-p19-b8-5e-mark-staleness-knobs.sql (operator-only).
-- Removes the mark_staleness knob rows. ⚠️ After the B8.5e code change ships, the b72-warmup
-- boot assertion requires these rows — running this rollback WITHOUT also reverting the code will
-- make the server refuse to boot (by design: fail-closed, no silent default). Revert the code
-- first, then run this. Deleting these rows before the code lands is safe (nothing reads them yet).
DELETE FROM module_constants
WHERE module_name = 'mark_staleness'
  -- xstock_spot ONLY — crypto is deliberately never seeded (Langston disposition (a), 2026-07-22:
  -- no crypto σ_rate read-path exists, so an inert crypto row would be a seeded ceiling).
  -- Left as an IN(...) so a future crypto seed's rollback is a one-token edit, not a rewrite.
  AND asset_class IN ('xstock_spot')
  AND constant_name IN ('budget_k','null_stop_budget_pct','floor_ms','cap_ms','sigma_min_observations','sigma_classwide_percentile');

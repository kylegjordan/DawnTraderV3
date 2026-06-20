-- P19 reorg-B2 (Piece C, 2026-06-20) — movement/reachability filter threshold column.
-- Adds screener_filters.reach_atr_max = the max ATRs-to-floor a pair may need (c·√H, the √H-scaled
-- reachable bound). CONSERVATIVE default 4.00 populates ALL existing rows (per (mode,asset_class,
-- filter_path)) so the filter is active everywhere with a real value — never pass-everything
-- (Langston Step-2). The filter helper (passesReachabilityFilter) fails CLOSED on a missing/null
-- value (rejects the pair), so a future un-seeded row can never silently disable the filter.
-- Phase-25 calibrates the per-class values (xStock's floor + bound come DOWN — RUNNING_ISSUES).
-- Rollback: 2026-06-20b-reorg-b2-reach-atr-max-column-rollback.sql (operator-only).
ALTER TABLE screener_filters ADD COLUMN IF NOT EXISTS reach_atr_max numeric(6,2) DEFAULT 4.00;

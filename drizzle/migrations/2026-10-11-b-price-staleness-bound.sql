-- B-PRICE-STALENESS-BOUND (sprint row 33, plan item P1b; Langston Step-2 condition 2, 2026-10-10).
-- `mark_staleness.cold_mark_max_ms` (xStock only): how long a COLD mark - one the venue has only REPLAYED on a subscribe
-- (a `snapshot` frame, no `update` yet) - may wait for its first change before it is judged as an ordinary stale mark.
-- Its own knob, not `floor_ms`: the floor is a decision-safety quantity, this is a feed-liveness one (Langston: one knob
-- serving two estimands is the atrsToTarget coupling again). The effective allowance is min(this, the per-symbol
-- ceiling) - the ceiling is a CAP, never the value.
-- Seed 15000 = `floor_ms`, so it is byte-equivalent off-session, where sigma samples are 1 of 200 and the ceiling IS the
-- floor. Measured cost of the cold window: 16 of 16 held symbols changed quote within 13.1 s across the last two Sunday
-- reopens (Langston, 2026-10-10). XSTOCK ONLY, like its siblings: crypto has no cold mark.
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by)
VALUES ('mark_staleness','*','xstock_spot','*','*','cold_mark_max_ms','15000'::jsonb,'b-price-staleness-bound')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

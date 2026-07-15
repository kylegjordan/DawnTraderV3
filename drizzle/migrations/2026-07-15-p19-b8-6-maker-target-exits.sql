-- P19-B8.6 — MAKER TARGET-EXITS (paper fill model). Langston Step-1+2 PASS 2026-07-15.
-- Columns are all nullable: NULL = no exit resting / pre-B8.6 row (KEEP-AS-DATA).

-- Exit-rest lifecycle on the open position (the B7.2c entry-rest trio, side flipped):
ALTER TABLE active_open_positions ADD COLUMN IF NOT EXISTS exit_limit_price numeric(20,10);
ALTER TABLE active_open_positions ADD COLUMN IF NOT EXISTS exit_rest_placed_at timestamptz;
ALTER TABLE active_open_positions ADD COLUMN IF NOT EXISTS exit_deadline timestamptz;

-- Exit-side cohort stamps on the closed record (the chosen_entry_mode pattern):
ALTER TABLE closed_trades ADD COLUMN IF NOT EXISTS exit_fee_mode varchar(8);
ALTER TABLE closed_trades ADD COLUMN IF NOT EXISTS exit_rest_outcome varchar(8);
ALTER TABLE closed_trades ADD COLUMN IF NOT EXISTS exit_rested_at_price numeric(20,10);
ALTER TABLE closed_trades ADD COLUMN IF NOT EXISTS exit_rest_duration_ms integer;

-- The exit-rest deadline budget, per class — seeded to the SAME values as the entry-side
-- maker_max_pending_ms (the pre-audit decision: identical tier until measured data says
-- otherwise), copied from the live entry rows by construction rather than restated.
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by)
SELECT module_name, exchange, asset_class, strategy, regime, 'exit_maker_max_pending_ms', value, 'p19-b8-6-maker-target-exits'
FROM module_constants
WHERE module_name = 'maker_taker' AND constant_name = 'maker_max_pending_ms'
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

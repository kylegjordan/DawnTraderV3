-- P19-B8.2 ROLLBACK companion (NOT in MANIFEST — apply manually only if reverting).
-- NOTE: the ghost-row DELETE (§4) and the dawntrader_v2 schema-copy DROP (§5) are
-- data-destructive and are NOT auto-reversed; the deleted ghost row's full values
-- are preserved in the forward migration's §4 comment for manual re-insert if ever
-- genuinely needed.

BEGIN;

-- §6 reverse: remove the seeded knob rows
DELETE FROM module_constants WHERE module_name = 'friction_divergence' AND updated_by = 'p19-b8-2';

-- §3 reverse: drop the ratio-tag columns
ALTER TABLE closed_trades DROP COLUMN IF EXISTS balance_ratio_at_open;
ALTER TABLE closed_trades DROP COLUMN IF EXISTS anchor_balance_at_open;
ALTER TABLE closed_trades DROP COLUMN IF EXISTS anchor_version_at_open;
ALTER TABLE active_open_positions DROP COLUMN IF EXISTS balance_ratio_at_open;
ALTER TABLE active_open_positions DROP COLUMN IF EXISTS anchor_balance_at_open;
ALTER TABLE active_open_positions DROP COLUMN IF EXISTS anchor_version_at_open;

-- §2 reverse: drop the ledger + version column
DROP TABLE IF EXISTS portfolio_anchor_events;
ALTER TABLE portfolio_state DROP COLUMN IF EXISTS anchor_version;

-- §1 reverse: restore the (ghost) defaults + nullability exactly as they were
ALTER TABLE active_engine_sessions ALTER COLUMN starting_balance DROP NOT NULL;
ALTER TABLE active_engine_sessions ALTER COLUMN starting_balance SET DEFAULT 10000;
ALTER TABLE portfolio_state ALTER COLUMN balance SET DEFAULT 1000.00;

COMMIT;

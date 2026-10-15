-- Rollback for B-CLASS-LEG-FILL-MODE (#1170). Not listed in MANIFEST.txt.

BEGIN;

DELETE FROM module_constants
WHERE module_name = 'maker_taker'
  AND constant_name IN ('entry_fill_policy', 'target_exit_fill_policy')
  AND asset_class IN ('crypto_spot', 'xstock_spot')
  AND exchange = '*' AND strategy = '*' AND regime = '*';

ALTER TABLE rtb_signals
  DROP COLUMN IF EXISTS entry_fill_policy,
  ALTER COLUMN chosen_entry_mode SET DEFAULT 'taker';
ALTER TABLE active_open_positions
  DROP COLUMN IF EXISTS entry_fill_policy,
  DROP COLUMN IF EXISTS maker_placed_at,
  DROP COLUMN IF EXISTS target_exit_fill_policy;
ALTER TABLE closed_trades
  DROP COLUMN IF EXISTS entry_fill_policy,
  DROP COLUMN IF EXISTS target_exit_fill_policy;
ALTER TABLE vts_open_trades
  DROP COLUMN IF EXISTS entry_fill_policy,
  DROP COLUMN IF EXISTS maker_placed_at;

COMMIT;

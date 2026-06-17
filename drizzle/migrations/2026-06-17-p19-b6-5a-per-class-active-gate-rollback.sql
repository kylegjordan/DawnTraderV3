-- Rollback P19-B6.5a per-asset-class active gate.
-- Safe: additive column, no data dependency. Reverting restores the pre-B6.5a per-MODE-only gating.
ALTER TABLE system_context
  DROP COLUMN IF EXISTS active_asset_classes;

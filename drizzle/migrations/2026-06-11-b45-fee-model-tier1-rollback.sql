-- Rollback for 2026-06-11-b45-fee-model-tier1.sql (operator-only; auto-skipped
-- by db-migrate). NOTE: rolling back the rows WITHOUT rolling back the code
-- leaves the server unable to boot (warmup hard-fails on the missing module)
-- — this rollback pairs with a code revert, never runs alone.

DELETE FROM module_constants WHERE module_name = 'fee_model' AND updated_by = 'b45-tier1-seed';

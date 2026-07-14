-- ROLLBACK for 2026-07-14-p19-b8-5-strategy-gates-crypto-seed.sql
-- Removes ONLY the rows this seed created (scoped by updated_by). ⚠ NOTE: with the
-- gate-12 activation refusal deployed, rolling this back while crypto_spot is ACTIVE
-- leaves an active class with zero rows — deactivate the class first, or the refusal
-- blocks the NEXT activation (running state is unaffected; the gate itself still
-- default-opens absent rows at read time, unchanged behavior).
DELETE FROM module_constants
WHERE module_name = 'strategy_gates' AND asset_class = 'crypto_spot'
  AND updated_by = 'p19-b8-5-gate12-seed';

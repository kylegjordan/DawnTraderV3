-- Rollback for 2026-10-02-b-pattern-enum-drift-abcd.sql (B-PATTERN-ENUM-DRIFT, #1063).
-- ⚠️ PostgreSQL cannot drop a value from an enum type; removing 'ABCD' or 'TRI_STAR' would mean rebuilding pattern_type and
-- rewriting the three columns that use it, and every row already holding either value would have to be changed first.
-- That is deliberately NOT done here. Leaving the value is safe on every earlier sha: their code already declares
-- 'ABCD' (shared/schema.ts:111) and never writes 'TRI_STAR', so no older code can be broken by the database accepting either.
-- This rollback therefore only clears the ledger row, so a later redeploy re-runs the (idempotent) forward file.
BEGIN;
DELETE FROM _migrations WHERE name = '2026-10-02-b-pattern-enum-drift-abcd.sql';
COMMIT;

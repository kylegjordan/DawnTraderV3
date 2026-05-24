-- B79.0n.STRATEGY Step 0 — Add 'orb' to strategy_type enum
--
-- PG enum DDL constraint: ALTER TYPE ... ADD VALUE cannot run inside a transaction
-- if the enum is referenced in the same tx. This statement ships as its own file
-- so node-postgres' simple-query batch runs it standalone (auto-commit).
--
-- Why now: B79.0d shipped ORB's detect + module_constants rows but didn't add the
-- enum value (ORB wasn't consumed by strategy_settings until B79.0n.STRATEGY's
-- CORE_STRATEGIES update to 19). `npx tsc --noEmit` surfaced the
-- schema-vs-code mismatch when strategy-sync started inserting 'orb' rows.
--
-- IF NOT EXISTS guard makes this idempotent across re-runs.

ALTER TYPE strategy_type ADD VALUE IF NOT EXISTS 'orb';

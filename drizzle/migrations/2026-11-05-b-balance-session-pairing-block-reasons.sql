-- B-BALANCE-SESSION-PAIRING (#618 leg 1; Langston Step-4 BLOCKER, 2026-11-05) — make every guardrail result code storable
-- in execution_attempt_audit.block_reason.
--
-- The defect: the engine writes the guardrail check's result code straight into block_reason
-- (`blockReason: riskCheck.code as any`, active-execution-engine.ts, the BLOCKED audit row), but the column is the
-- pg enum execution_block_reason, and four TradeSafetyResultCode members are not in it. Measured on staging
-- 2026-11-05 (Langston, positive control first): 'MAX_TOTAL_EXPOSURE'::execution_block_reason casts (204,008 rows
-- hold it); 'MONEY_HELD_UNAVAILABLE' and 'GUARDRAIL_READ_FAIL' raise "invalid input value for enum", as do
-- 'ENGINE_STOPPING' and 'CORRELATION_EXPOSURE'. The trade is still refused (fail-closed holds), but the insert throws
-- into the audit write's non-blocking catch and the row recording WHY is discarded. MONEY_HELD_UNAVAILABLE is this
-- batch's new code; the other three are the same pre-existing hole, closed in the same file.
--
-- PG enum DDL: precedent 2026-10-02-b-pattern-enum-drift-abcd.sql. IF NOT EXISTS makes each statement idempotent.
-- One column uses the type: execution_attempt_audit.block_reason. Adding a value rewrites no rows.
-- A drift test (server/tests/unit/b-balance-session-pairing-block-reason-enum.test.ts) fails CI if a result code is
-- ever added to the union without being storable here.

ALTER TYPE execution_block_reason ADD VALUE IF NOT EXISTS 'ENGINE_STOPPING';
ALTER TYPE execution_block_reason ADD VALUE IF NOT EXISTS 'CORRELATION_EXPOSURE';
ALTER TYPE execution_block_reason ADD VALUE IF NOT EXISTS 'GUARDRAIL_READ_FAIL';
ALTER TYPE execution_block_reason ADD VALUE IF NOT EXISTS 'MONEY_HELD_UNAVAILABLE';

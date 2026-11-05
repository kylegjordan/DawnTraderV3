-- Rollback for 2026-11-05-b-balance-session-pairing-block-reasons.sql (B-BALANCE-SESSION-PAIRING, #618 leg 1).
-- ⚠️ PostgreSQL cannot drop a value from an enum type; removing these four would mean rebuilding
-- execution_block_reason and rewriting execution_attempt_audit.block_reason, after changing every row that holds one.
-- That is deliberately NOT done here (precedent: 2026-10-02-b-pattern-enum-drift-abcd-rollback.sql). Leaving the
-- values is safe on every earlier sha: older code can only write values it already emits, and the database accepting
-- four more breaks nothing. This rollback therefore only clears the ledger row, so a later redeploy re-runs the
-- (idempotent) forward file.
BEGIN;
DELETE FROM _migrations WHERE name = '2026-11-05-b-balance-session-pairing-block-reasons.sql';
COMMIT;

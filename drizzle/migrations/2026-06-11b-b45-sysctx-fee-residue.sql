-- B-4.5 R1 (Langston Step-4 verification item fired + R1 ACK w/ amendments) —
-- clear the THIRD baked-in Tier-6 fee copy: system_context.maker_fee_pct /
-- taker_fee_pct carried schema-column DEFAULTS 0.0016/0.0026 (Phase-27 era),
-- auto-stamped at row creation, never operator-set. Because the validator's
-- override-wins semantics honor explicit values, this residue would silently
-- defeat the B-4.5 correction on the active-trading surface.
--
-- (a) NULL the values ONLY where they exactly equal the schema defaults —
--     a deliberately-set operator value that differs survives. (The
--     updated_at=created_at guard Langston floated is deliberately NOT used:
--     system_context rows update constantly (heartbeat/mode fields), so that
--     predicate is false on live rows and would make this fix a no-op.)
-- (b) DROP DEFAULT on both columns so future rows are born NULL.
--     Paired with the same-commit shared/schema.ts .default() removals —
--     without the schema-side change, the next drizzle generate would re-emit
--     the DEFAULT and resurrect Tier-6 (Langston R1 amendment 1).
--
-- After this, the validator falls through to the DB-governed per-class rates
-- (fee_model merge); a FUTURE deliberate operator override — including an
-- explicit 0 (promo tier) — still wins (explicit null-check, unit-locked).
--
-- Rollback: 2026-06-11b-b45-sysctx-fee-residue-rollback.sql (operator-only).

BEGIN;

UPDATE system_context SET maker_fee_pct = NULL WHERE maker_fee_pct = 0.0016;
UPDATE system_context SET taker_fee_pct = NULL WHERE taker_fee_pct = 0.0026;

ALTER TABLE system_context ALTER COLUMN maker_fee_pct DROP DEFAULT;
ALTER TABLE system_context ALTER COLUMN taker_fee_pct DROP DEFAULT;

COMMIT;

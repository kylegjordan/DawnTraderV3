-- B-PATTERN-ENUM-DRIFT (#1063, hotfix; Kyle directed 2026-10-02) — add 'ABCD' and 'TRI_STAR' to the pattern_type enum.
--
-- The defect: shared/schema.ts:111 declares pattern_type with SIX values including 'ABCD'; the database
-- holds five. volatility_edge's pattern-confirmed signals carry 'ABCD' (signal-orchestrator STRATEGY_PATTERN_MAP,
-- pattern-recognizer, volatility-edge), so every one of them fails the position insert
-- ("invalid input value for enum pattern_type: \"ABCD\""), is dropped from the RTB unrestored, and is re-minted
-- the next cycle (#1136). Langston ruled 2026-09-13: once the path is shown to fire, the fix is this value,
-- not a canonicalize-away (a four-site change that would relabel a harmonic structure as a candlestick).
--
-- PG enum DDL: precedent 2026-05-24a-b79-0n-strategy-enum-orb.sql. IF NOT EXISTS makes each statement idempotent.
-- Columns using the type (staging, 2026-10-02): active_open_positions, closed_trades, trades. No views or
-- functions depend on it. Adding a value rewrites no rows.

-- TRI_STAR (Kyle, 2026-10-02): the same gap, latent. It is in the canonical pattern set (canonical-regime-strategy-map.ts:79,
-- :774 and DOJI -> TRI_STAR at :778) and routed to adaptive_flow (hybrid-integration.ts:225), but no detector emits it today
-- (0 insert failures 2026-09-19 -> 10-02 against 22,368 for ABCD). Kyle: it may be unlocked as we calibrate, and must not
-- then be blocked by a known error left unfixed when the same error was fixed for ABCD.
-- Two ADD VALUE statements in one file: PostgreSQL 12+ allows ADD VALUE inside a transaction block (a new value only cannot
-- be USED before commit, and nothing here uses it); CI applies every forward migration to a PostgreSQL 17 container.

ALTER TYPE pattern_type ADD VALUE IF NOT EXISTS 'ABCD';
ALTER TYPE pattern_type ADD VALUE IF NOT EXISTS 'TRI_STAR';

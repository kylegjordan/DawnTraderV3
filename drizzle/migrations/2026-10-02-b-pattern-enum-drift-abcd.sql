-- B-PATTERN-ENUM-DRIFT (#1063, hotfix; Kyle directed 2026-10-02) — add 'ABCD' to the pattern_type enum.
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

-- TRI_STAR deliberately NOT added (r4, 2026-10-02; Langston's Step-4 review, Kyle agreed): no active-path sink can receive
-- it — the sinks write the RAW detector label and the detector never emits TRI_STAR — and an enum value cannot be removed.
-- A future detector label is caught at CI by server/tests/unit/b-pattern-enum-drift.test.ts instead.

ALTER TYPE pattern_type ADD VALUE IF NOT EXISTS 'ABCD';

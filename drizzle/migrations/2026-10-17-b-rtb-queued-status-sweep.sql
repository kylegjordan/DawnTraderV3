-- B-RTB-QUEUED-STATUS-SWEEP (#1204, row 59g, CC-B; Step 2 approved by Langston 2026-10-17) — part 1 of 2: the DEFAULT.
--
-- WHY: rtb_signals has two live statuses ('active' from the one insert, 'reconfirmed' from the refresh). The column
-- defaulted to 'queued' — a status every reader of which this batch deletes, so a row inserted without a status would sit
-- where nothing reads it. Dropped, an insert that omits the status fails; the insert type requires it at compile time.
--
-- SAFE AGAINST THE BUILD STILL RUNNING WHEN THIS COMMITS (dt-deploy migrates BEFORE pm2 restart): the deployed build's one
-- insert already names status 'active' (Directive 8.8.4-A3.R8, ready_to_buy_service.ts), so it never leaned on the default.
--
-- PART 2 — the three writer-less columns (promoted_at, promoted_trade_id, expired_at) — is a CONTRACTION and is NOT in this
-- file (Langston Step-4, expand/contract): dt-deploy commits a migration while the old process still serves and has four
-- abort points after it, and the old build's bare select()/returning() name every column. It ships as its own file in the
-- next deploy after this code is live (HOME: RUNNING_ISSUES #1204, plan row 59g). Until then live Postgres carries three
-- orphan columns shared/schema.ts no longer names — DELIBERATE, not drift; drizzle emits only declared columns.
-- HAND-WRITTEN: migrations/meta/0001_snapshot.json records rtb_signals_symbol_strategy_idx four-wide, so a generated
-- migration would rewrite that unique index; this file does not touch it (#1006 stays open).
-- Rollback: 2026-10-17-b-rtb-queued-status-sweep-rollback.sql.

BEGIN;

ALTER TABLE rtb_signals ALTER COLUMN status DROP DEFAULT;

COMMIT;

# B-DB-POOL-GUARD — CHANGE LIST (`#1239`, owner CC-A)

**DECLARED CHANGE-CLASS:** `architecture` (scope header).
**DOC SET for `architecture`:** scope — present, `Scope Files/B_DB_POOL_GUARD_SCOPE.md` (r1; r2 in progress) · pre-audit — absent, Step 2 not yet run · completion report — absent (Step 11) · BATCH_CATALOG, PHASE_HISTORY, SYSTEM_MANUAL (database chapter still describes the Neon pool, plus `:49`, `:9381`, `:11290`), SYSTEM_IMPACT_MAP (`server/db.ts` row) — absent, Step 10.
**STEP-2 REFERENCE:** `NO STEP 2 — Langston cleared OBJ-1 to implement ahead of scope r2 and before Step 2 (ruling on r1, Discord 1567651432465694905, 2026-11-04): "its evidence is complete and I re-derived all of it, it is the order constraint on OBJ-3 … Ship it as its own commit."`

## Increment 1 — OBJ-1: an ended idle connection no longer crashes the app
**Changed:** `server/db.ts` (+24, after `export const db`): a `pool.on('error')` listener that logs `[B-DB-POOL-GUARD][POOL_IDLE_CLIENT_ERROR] code=… message=… total=… idle=… waiting=… count=…` and counts the event (`getPoolIdleClientErrorCount()`), and nothing else.
**New:** `server/tests/unit/b-db-pool-guard.test.ts` (3): a control proving a pool with no listener throws on the same event; the app pool logs the code and counts without throwing; exactly one listener after a second import.
**Mutation run:** with the listener renamed away, 2 of 3 fail; restored, 3 of 3 pass.
**Why the pool has nothing to repair in the listener:** pg-pool has already removed the client (`index.js:51-62`, `pool._remove(client)` before `emit`); the next acquire opens a new one.
**Improves on the precedent:** `crew-coordination.ts:101` registers `pool.on('error', () => {})`, an empty swallow with no log; that file is removed by `B-CREW-BOARD-REMOVAL`, so it is not the reference.
**Staging check (Step 7):** end ONE `dawntrader_main` backend whose `state = 'idle'` with `pg_terminate_backend`; PASS = PM2 restart count unchanged and one `POOL_IDLE_CLIENT_ERROR code=57P01` line.

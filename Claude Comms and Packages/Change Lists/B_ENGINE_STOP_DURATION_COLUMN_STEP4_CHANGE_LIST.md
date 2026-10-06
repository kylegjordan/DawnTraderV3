# B-ENGINE-STOP-DURATION-COLUMN — Step-4 change list (Langston code review)

**Batch:** `B-ENGINE-STOP-DURATION-COLUMN` · `#1067` · sprint row 2a0 · owner CC-B.
**Graded ref:** `origin/migration/aws-supabase` at the follow-up commit named in the dispatch — two commits: `77ee8cf2b` (the batch, 9 paths) + a follow-up (the in-queue flag clear below, found by my own caller census before dispatch).
**CI:** run recorded in the dispatch post.

## DISPATCH HEADER
**(i) DECLARED CHANGE-CLASS:** `non_architecture` (scope header; confirmed by you at Step 2 with a pre-registered flip criterion — new active-path emission / changed balance-anchor source / a table other than `active_engine_sessions`; none in this diff).
**(ii) DOC SET for `non_architecture`, at this ref:**
| document | state |
|---|---|
| batch `SCOPE` | **present** — `Scope Files/B_ENGINE_STOP_DURATION_COLUMN_SCOPE.md` |
| batch `PRE_AUDIT` | **present** — `Scope Files/B_ENGINE_STOP_DURATION_COLUMN_PRE_AUDIT.md` (§4 = your approval) |
| `SYSTEM_MANUAL.md` | **present, updated in this commit** (judged applicable: the stop/resume lifecycle it documents changed) |
| `SYSTEM_IMPACT_MAP.md` | **present, updated in this commit** (new session-row lifecycle block) |
| `RUNNING_ISSUES.md` | **present, updated** — #1067 Step-3 annotation (#1158 filed at Step 2) |
| `COMPLETION_REPORT` | absent — Step 11 |
| `BATCH_CATALOG.md`, `PHASE_HISTORY.md` | absent — Step 10 |
| `DELETED_COMPONENTS_LOG.md` (the time-limit option + two columns) | absent — Step 10, after the migration runs on staging |
| active plan, task list, shared + own MEMORY, your MEMORY | Step 10 (yours OWED until written) |
**(iii) STEP-2 REFERENCE:** the pre-audit above, §4.

## 1. Plan item → change
| pre-audit §2 item | change |
|---|---|
| 1. delete the time limit | `startActiveEngine` options lose `runForMs`; the `endsAt` computation and both create fields go; `/status` loses `runForMs`/`endsAt`; `shared/schema.ts` loses both columns; migration `2026-10-06-b-engine-stop-drop-time-limit-columns.sql` (registered) + `-rollback.sql` (tracked, not registered) |
| 2. both wrong-object writes | stop and resume-refused write `{ status, stoppedAt }` only |
| 3. teardown not hostage | stop's session write in try/catch; teardown continues; `success:false` + breakage alert; `shouldBroadcast: true` so the flag is still cleared |
| 4. leftover-row close | adopt branch gated on `isEngineActive`; flag false ⇒ `closeLeftoverSessionRow` (one retry, alert + throw if unclosable) then a fresh session |
| 5, 6 | homed at Step 2: `#1158`, row 2a0b (heartbeat + `/status`) |
| 7. records | SYSTEM_MANUAL, SYSTEM_IMPACT_MAP, RUNNING_ISSUES #1067 |
| 8. tests | NEW `server/tests/unit/b-engine-stop-duration-column.test.ts` (8) |
No item `UNAUDITED`.

## 2. Load-bearing hunks
**Stop — the write and its failure path:**
```diff
-        await storage.updateActiveEngineSession(existingSession.id, {
-          status: 'stopped',
-          stoppedAt: stoppedAt,
-          runForMs: runDuration,
-        });
+        let sessionWriteError: string | null = null;
+        try {
+          await storage.updateActiveEngineSession(existingSession.id, { status: 'stopped', stoppedAt: stoppedAt });
+        } catch (writeErr: any) {
+          sessionWriteError = writeErr?.message ?? String(writeErr);
+          console.error(`[B-ENGINE-STOP-DURATION-COLUMN][SESSION_WRITE_FAILED] ...`);
+          // addAlert({ category: 'breakage', severity: 'warning', metadata: { sessionId },
+          //            dedupe_key: 'engine-stop-session-write-failed-paper' })  (own try/catch)
+        }
   ... reset24hWindow / resetHourlyScanHistory / clusterBus.emit('active_engine_stopped') / stop_ack / logBalanceReconciliation — unchanged, now always reached ...
+        if (sessionWriteError) {
+          // FOLLOW-UP COMMIT: clear the flag INSIDE the queue job, awaited, before returning
+          try { await tradingStateSync.setEngineActive(userId, false, 'paper'); } catch (flagErr) { console.error(...); }
+          return { success: false, message: `Paper trading stopped, but recording session ... failed: ...`,
+                   error: `session write failed: ...`, data: { ..., flatten: flattenReport, sessionWriteFailed: true },
+                   shouldBroadcast: true };   // the outer block then runs setEngineActive(userId, false) + the flag verification
+        }
```
**Start — the adopt branch:**
```diff
+        let leftoverClosed = false;
+        if (existingSession && !existingManager) {
+          const engineMeantToRun = (await storage.getSystemContext(mode))?.isEngineActive === true;
+          if (!engineMeantToRun) {
+            await closeLeftoverSessionRow(existingSession.id, existingSession.sessionId);
+            leftoverClosed = true;
+          }
+        }
-        if (existingSession && !existingManager) {
+        if (existingSession && !existingManager && !leftoverClosed) {
           // Reconcile: DB session exists but manager was lost (e.g., server restart)   — unchanged body
```
After `leftoverClosed`, control falls through to the existing fresh-session code (the `!existingSession && existingManager` branch cannot match; the `startingBalance` requirement at the create still applies).
`closeLeftoverSessionRow` (new, module-private): `updateActiveEngineSession(rowId, { status: 'stopped', stoppedAt: new Date() })`, up to 2 attempts; on a second failure `addAlert(... dedupe_key: 'engine-start-leftover-row-unclosable-paper')` and `throw` — the start's existing catch turns that into `success:false`.
**The flag census behind the gate:** true-writers of `system_context.isEngineActive` are `tradingStateSync.setEngineActive(userId, true)` in the start path (after the create) and `routes.ts` start route's `updateSystemContext({ isEngineActive: true })` "AFTER successful engine start". False-writers: every stop (outside the queue), resume-refused, flag-no-session. Other `isEngineActive:` occurrences are response/broadcast payloads, not DB writes.
**Migration:** `ALTER TABLE active_engine_sessions DROP COLUMN IF EXISTS run_for_ms, DROP COLUMN IF EXISTS ends_at;` in a transaction, `lock_timeout 5s`. Rollback re-adds both (nullable, empty) and deletes the ledger row.

**Why the follow-up (found before dispatch, by enumerating the stop's callers):** `routes.ts` B8.2 START (`:11186-11190`) calls `stopActiveEngine` and then `startActiveEngine` straight away. The outer flag clear is fire-and-forget (`setEngineActive(...).then(...)`, not awaited), so after a failed session write the immediate start could still read the flag ON and ADOPT the leftover row — the exact case item 4 closes. In-queue and awaited, the flag is off before the next queued job (the start) can read it. The normal success path is unchanged: its row is already `stopped`, so the race cannot matter there.
**Other stop callers, checked:** `routes.ts:3884` (stop route, result ignored — the flag is still cleared), `:3982` (force-stop, try/catch), `:11356` (`POST` stop with `reason`, returns 400 on `!success` — the reset script's path, correct to refuse), `guardrail-policy.ts:433` (kill switch, result ignored, sets the flag false itself), `auto_test_harness.ts:172`.

## 3. Tests (8, payload-based per your C3)
1. Stop of a 30-day-old session: exactly one `stopped` write; payload keys `['status','stoppedAt']`, no `runForMs`.
2. Resume-refused 40-day-old session: payload keys `['status','stoppedAt']`.
3. Forced session-write throw: **the flag clear has COMPLETED when the stop returns** (a 20 ms mock: completed-at-return = 1 with the follow-up, 0 against `77ee8cf2b` — this assertion alone fails there), `success:false`, `error` names the session write, `data.sessionWriteFailed`; `reset24hWindow`, `resetHourlyScanHistory`, `active_engine_stopped` emit, `logBalanceReconciliation('paper','stop_reset')`, `setEngineActive('u1', false, 'paper')` all called; one `breakage` alert with the dedupe key and `metadata.sessionId`.
4. Start, flag false: leftover row closed (`['status','stoppedAt']`), one NEW session created, `sessionId !== 'paper_OLD'`, **`startingBalance === '820'` (the caller's, not the row's `2250.00`)**, no `runForMs`/`endsAt` keys.
5. Start, flag true: `wasReconciled`, no create, no stop write, manager started `'api'`.
6. Unclosable leftover: `success:false`, no create, alert `engine-start-leftover-row-unclosable-paper`.
7. Fence (e): no code form of `runForMs`/`run_for_ms`/`endsAt`/`ends_at` (field access, property key, column literal) in `server/`, `shared/`, `client/`; tests exempt (your nit); walk positive-controlled (>100 files).
8. MANIFEST: forward registered, rollback not.
**Mutation:** against the pre-change `active-engine-service.ts` + `shared/schema.ts`, 6 of 8 fail; the two that pass (5, 8) assert behaviour the batch deliberately leaves unchanged.
**Regression:** every unit test touching the engine service or the session table (9 files, 103 tests) passes; tsc baseline 338 = 338.

## 4. Honest residual
- Observed in test 6's run: when the leftover cannot be closed, the start's pre-existing catch-rollback (`getRunningEngineSession` → `status: 'failed'`) attempts a third write on that same row. Harmless (it would only mark a dead row `failed`), pre-existing, left as is.
- `logBalanceReconciliation` can still throw after the write and fail the stop (unchanged behaviour; it is diagnostics, not the session write this batch decouples).
- `POST` stop (`:11356`) turns `success:false` into a 400; the reset script refuses on it — correct, since the row is still `running` until the next start closes it. The plain stop route (`:3884`) and the kill switch ignore the result — the engine is still stopped and the flag cleared.
- `auto_test_harness` (`routes.ts:5543`) will now fail its start where a leftover row used to satisfy it — named in `#1158`, as you ruled.

## 5. Asks
1. PROCEED or BOUNCE on the diff.
2. Is returning `success:false` with `shouldBroadcast: true` the right shape for "stopped, but not recorded" (flag cleared, caller told)?
3. Is refusing the start on an unclosable leftover (rather than proceeding with two running rows) right?

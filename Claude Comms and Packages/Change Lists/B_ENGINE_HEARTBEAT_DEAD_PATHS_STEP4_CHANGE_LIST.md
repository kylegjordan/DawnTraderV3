# B-ENGINE-HEARTBEAT-DEAD-PATHS — Step-4 change list (Langston code review)

**Batch:** `B-ENGINE-HEARTBEAT-DEAD-PATHS` · `#1158` (merged into `#521`) · sprint row 2a0b · owner CC-B.
**Graded ref:** commit `4a17ca8f435a49dc6d977dcb15e4d05edb137b54` on `origin/migration/aws-supabase` (one commit, 20 paths incl. 2 migrations).
**CI:** run recorded in the dispatch post.

## DISPATCH HEADER
**(i) CHANGE-CLASS:** `non_architecture` (scope header; you confirmed it at Step 1, SIM named as owed).
**(ii) DOC SET for `non_architecture`, at this ref:**
| document | state |
|---|---|
| batch `SCOPE` | present — `Scope Files/B_ENGINE_HEARTBEAT_DEAD_PATHS_SCOPE.md` (§6 = your Step-1 ruling) |
| batch `PRE_AUDIT` | present — `Scope Files/B_ENGINE_HEARTBEAT_DEAD_PATHS_PRE_AUDIT.md` (§4 r2, §5 your Step-2 approval) |
| `SYSTEM_IMPACT_MAP.md` | **updated in this commit** (session-row lifecycle block) |
| `SYSTEM_MANUAL.md` | N/A — judged: no strategy / regime / filter / pipeline / math content (your Q4) |
| `STORAGE_POLICY.md` (T2) | updated — `cluster_bus_event` row + delete-only exemption |
| `DELETED_COMPONENTS_LOG.md` (T2) | updated — the entry + the `:392` correction |
| `RUNNING_ISSUES.md` (T2) | updated — `#1158` Step 3; `#521` closes at Step 11 |
| `COMPLETION_REPORT`, `BATCH_CATALOG`, `PHASE_HISTORY`, plan, task list, MEMORYs (yours OWED) | Steps 10-11 |
**(iii) STEP-2 REFERENCE:** the pre-audit, §4 (r2) and §5 (approval).

## 1. r2 item → change
| r2 item | change |
|---|---|
| 1 one orphan rule, serialized | `stopAndClearOrphanManager(mode, source)` + `healOrphanManagerQueued()` in `active-engine-service.ts`; start path's orphan branch uses it; `clearStaleBusyFlag` deleted; `operation-queue.ts` action `'orphan-heal'` |
| 2 liveness bound | stated in the heartbeat header and the SIM block (no instrument) |
| 3 publish removed, no backlog migration | both `clusterBus.publish` calls gone with the heartbeat rewrite |
| 4 harness removed | file + route + import deleted; `classify-baseline.mjs` regex; `.tsc-baseline.json` synced 338→337 |
| 5 retention | `PLAIN_RETENTION_TABLES` entry + seed migration (same deploy); `getRecentEvents`/`cleanup` deleted; `STORAGE_POLICY` |
| 6 `/status` | `isRunning = hasManager` |
| 7 both flag writes | `raiseEngineFlagWriteAlert('start'|'stop')` on the two fire-and-forget chains |
| 8 records | SIM, STORAGE_POLICY, DELETED_COMPONENTS_LOG, RUNNING_ISSUES |
| 9 tests | `b-engine-heartbeat-dead-paths.test.ts` (17) |

## 2. Load-bearing hunks
**The helper (new, `active-engine-service.ts`):**
```ts
export async function stopAndClearOrphanManager(mode: ActiveEngineMode, source: string): Promise<boolean> {
  const manager = getGlobalActiveEngineManager(mode);
  if (!manager) return false;
  const running = await storage.getRunningEngineSession(mode);
  if (running) return false; // re-read inside the job: a heal queued behind a start finds the new row and does nothing
  console.warn(`[B-ENGINE-HEARTBEAT-DEAD-PATHS][ORPHAN_MANAGER] mode=${mode} source=${source} — …stopping, then clearing`);
  try { await manager.stop(); } catch (stopErr: any) { console.error(`… stop failed … clearing anyway …`); }
  clearGlobalActiveEngineManager(mode);
  return true;
}
export async function healOrphanManagerQueued(): Promise<boolean> {
  return activeOperationQueue.enqueue(
    () => stopAndClearOrphanManager('paper', 'heartbeat'),
    { userId: 'system', mode: 'paper', action: 'orphan-heal' },
  );
}
```
**Start path:**
```diff
         if (!existingSession && existingManager) {
-          console.warn('[ActiveEngineService] Orphaned manager detected without DB session - clearing');
-          clearGlobalActiveEngineManager();
+          await stopAndClearOrphanManager(mode, 'start');
         }
```
(Already inside `activeOperationQueue`, so it calls the helper directly — calling the queued variant there would deadlock.)
**Heartbeat — whole file now** (`active-engine-heartbeat.ts`): `start()` → `setInterval(30 s)` → `runHeartbeatCheck()` = `await healOrphanManagerQueued()` in a try/catch. No storage, no bus, no `startActiveEngine`. Header: not the Central Clock; what was removed and why; the liveness bound.
**Boot (`server/index.ts`):** `recoverSessions(AUTO_RESUME_SIMULATIONS)` removed; `activeEngineHeartbeat.start()` kept.
**Flag writes:**
```diff
       tradingStateSync.setEngineActive(userId, true, mode)
+        .catch((err) => { void raiseEngineFlagWriteAlert('start', err); throw err; })
         .then(() => tradingStateSync.setTradingMode(…))
...
       tradingStateSync.setEngineActive(userId, false, mode)
+        .catch((err) => { void raiseEngineFlagWriteAlert('stop', err); throw err; })
```
The rethrow keeps the existing chain's own `.catch` logging unchanged. Alert: `breakage`, dedupe `engine-start-flag-write-failed-paper` (warning) / `engine-stop-flag-write-failed-paper` (**critical** — the next boot would resume an operator-stopped engine); bodies say "then resolve".
**Status:** `isRunning: hasManager` (was `!!dbSession || hasManager`).
**Retention:** `{ table: 'cluster_bus_event', timestampColumn: 'created_at', retentionConstantName: 'cluster_bus_event.hot_retention_days' }` + migration `INSERT … ('data_lifecycle','*','*','*','*','cluster_bus_event.hot_retention_days','30'::jsonb, …) ON CONFLICT DO NOTHING` (registered in MANIFEST; rollback deletes the row, header says revert the code first).

## 3. Tests (17) and their honest strength
Behaviour: stop-before-clear with order asserted (the manager is still mapped inside `stop()`); a throwing stop still clears; a running row ⇒ no stop/no clear; a paper heal never touches a live manager and never queries the live row; the start path's orphan branch stops the old manager; a heartbeat cycle heals through the queue with no session write, no create, no publish; **two concurrent heals stop the manager once** (queue dedupe); `/status` four (row, manager) cases; both flag-write alerts with their keys. Fences: harness file + route gone, heartbeat has no dead methods and no `cluster-bus` import, `clearStaleBusyFlag`/`getRecentEvents`/`cleanup` gone, the `orphan-heal` action present, the retention registration + 30-day seed + MANIFEST (rollback unregistered).
**Mutation proof, single-rule, run on the committed service (each mutant applied, confirmed present by count, file restored after):** M1 delete `await manager.stop()` in the helper → **4 fail** · M2 restore `isRunning: !!dbSession || hasManager` → **1 fail** (row=true, manager=false) · M3 drop the stop-side `raiseEngineFlagWriteAlert` → **1 fail** · M4 put the start path's bare `clearGlobalActiveEngineManager()` back → **1 fail**. (Against the whole pre-change files the suite also fails, at import.)
Regression: 13 test files touching the changed modules, 163 tests pass; tsc baseline 337 = 337.

## 4. Residual
- The queue has no per-job timeout; a hung `manager.stop()` holds it (same exposure as every stop today) — stated in SIM.
- `trading_scheduler.ts:66` subscribes to the clock in code but was not live — open observation (your Step-2 note).
- `#1159` (row 2a0c) decides whether `cluster_bus_event` persistence stays at all; `#1161` (row 2a0d) retires the root-level scanner twin.
- Step 7 must read: the sweep's `[B75 sweep][plain] cluster_bus_event: deleted N rows …` line AND the other tables' lines on the first post-deploy run; zero `missing required fields` lines; zero heartbeat rows minted after deploy.

## 5. Asks
1. PROCEED or BOUNCE on the diff.
2. The rethrow shape on the two flag chains (keeps the existing log, adds the alert) — acceptable?

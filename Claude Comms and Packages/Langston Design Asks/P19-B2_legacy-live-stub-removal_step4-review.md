# P19-B2 — Legacy live-trading stub removal — Step-4 code review

> Kyle directed deleting the `live-trading-service.ts` stub NOW (your Q3 ACK, folded into P19-B2 close). You required "delete on the spot still means reviewed." Here is the diff + the blast-radius verification. **INFRASTRUCTURE NOTE: do NOT cd to /mnt/gdrive or run git on the mount.** Diff embedded below; full files via `ssh staging` if needed.

## Verification BEFORE this diff (certainty-before-cutting)
- **tsc baseline gate: GREEN** in the C:\dev bench — current 474 errors vs baseline 494, **no regressions above baseline**, and critically **no new TS2307 "cannot find module './live-trading-service'"** anywhere → proves zero dangling imports survive.
- **vitest: running** (will confirm green before commit).
- **Modern live path untouched:** the Phase-21-gated engine-start (409 `LIVE_ENGINE_PHASE21_GATED`) does NOT use this file.
- **UI untouched:** `top-bar.tsx` "Confirm & Start Live Trading" → `useTrading().startTrading({type:'live'})` → modern gated path, NOT `/live-trading/*`. The confirm modals stay.
- **Dead approval action:** `start_live_trading` has NO emitter in the live tree (only a permission-type string + an old context doc) → the approval branch was dead.
- **Left intentionally (noted, not removed):** `useUserRole.ts` permission strings (`start_live_trading` etc.) + `shared/schema.ts:181 "startLiveTrading"` — forward-looking permission taxonomy Phase-21 live will use, not dead executable code.

## Diff (4 files, +6 / −593)

**1. DELETED `server/services/live-trading-service.ts`** (464 lines) — the stub: fake placeholder object `{userId, mode:'live', isRunning:true}`, no Kraken, no TEC, no execution; emitted a false "live trading active" broadcast.

**2. `server/routes.ts`** — removed the 4 orphaned routes (pure deletion):
```
-  apiRouter.post('/live-trading/start', ...)   // → liveTradingService.startLiveTrading
-  apiRouter.post('/live-trading/stop', ...)    // → liveTradingService.stopLiveTrading
-  apiRouter.get('/live-trading/status', ...)   // → liveTradingService.checkLiveTradingStatus
-  apiRouter.post('/live-trading/approve', ...) // → liveTradingService.activateLiveTrading
```
and removed the dead approval-action branch (logic change — kept the paper branch):
```diff
-      // Phase 27.2: Execute action-based approvals (e.g., start_live_trading)
+      // Phase 27.2: Execute action-based approvals
+      // (legacy start_live_trading action removed P19-B2 2026-06-13 — see DELETED_COMPONENTS_LOG.md)
       if (approval.action) {
-        if (approval.action === 'start_live_trading') {
-          const { liveTradingService } = await import('./services/live-trading-service');
-          const result = await liveTradingService.activateLiveTrading(userId);
-          executionResult = { success: result.success, message: result.message, data: result.data };
-          console.log(`[Phase 27.2] Executed start_live_trading:`, executionResult);
-        } else if (approval.action === 'start_paper_simulation') {
+        if (approval.action === 'start_paper_simulation') {
           const { startPaperSimulation } = await import('./services/paper-sim-service');
           ...
```

**3. `server/services/auto_test_harness.ts`** — removed the import + the scenario registration (line 62) + the entire `createLiveTradingScenario()` method (pure deletion; the harness keeps its paper-sim + heartbeat scenarios).

**4. `server/services/data-archive/exit-decision-archiver.ts`** — removed the stale `'live-trading-service'` source-type member + fixed the comment (it named a now-deleted file AND the wrong future architecture — live reuses the paper engine):
```diff
 export type ExitDecisionSource =
   | 'vts-runner'
-  | 'paper-execution-engine'
-  | 'live-trading-service';
+  | 'paper-execution-engine';
```

## Governance done alongside
- Archived to `1-system-manual/_archive/deleted-code/live-trading-service.ts.20260613-P19B2.removed`.
- New deletion-record doc `1-system-manual/DELETED_COMPONENTS_LOG.md` (per the new never-leave-legacy-lingering policy).

## Ask
Review the diff. Confirm: (1) the removal is complete + clean (nothing real depended on it), (2) the approval-branch collapse to a single `if (start_paper_simulation)` is correct, (3) the archiver source-type narrowing is the right call given live reuses the paper engine, (4) nothing else should come out in the same sweep. Reply APPROVE or name what to fix.

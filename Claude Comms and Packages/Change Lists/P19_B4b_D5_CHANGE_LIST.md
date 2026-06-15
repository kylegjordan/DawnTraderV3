# P19-B4b D5 — Change List (for Langston Step-4 code review)

**Batch:** P19-B4b D5 (paper/live split-brain isolation — the Phase-21 co-run precondition) · **Author:** Claude New (CC-B) · **Date:** 2026-06-15
**Design basis:** D1 audit (`P19_B4b_PRE_AUDIT.md`) + Langston Step-2 PROCEED-WITH-CONDITIONS + the R1/R2 refinements you AGREED to (`P19_B4b_D5_DESIGN_REFINEMENTS.md`): R1 = route the dormant #297 sites through the mode-aware accessor (mode='paper', behavior-preserved, #297 note added); R2 = key the Kraken limiter by CREDENTIAL IDENTITY (not mode, not bare userId).

**INFRASTRUCTURE NOTE: do NOT cd to /mnt/gdrive or git on the FUSE mount. Diff snippets embedded below.**

Verify-before-edit discipline (#297 lesson) applied to every site. Status as I write: chunks 1 (S1) + 2 (liveness) implemented; 3 (S3) + 4 (S4) + 5 (S6/S13/S8) in progress.

---

## Chunk 2 — Liveness consolidation (H1 + H2), `server/services/trading-state-sync.ts`

**H1 — write-then-broadcast ON COMMIT (kills the `setTimeout(…,0)` deferred-write root cause).**
BEFORE: instant `contextBridge.broadcast(...)` fired, THEN `setTimeout(async () => { storage.updateSystemContext(...); clusterBus.emit(...); broadcastUserUpdate() }, 0)` — DB SSOT trailed the broadcast by a tick.
AFTER: stamp the settling window → `await storage.updateSystemContext(mode, {isEngineActive})` FIRST → only then broadcast (contextBridge + clusterBus.emit + secondary snapshot). If the write throws, NOTHING is broadcast (no derived reader is told a state the DB never persisted). Secondary `broadcastUserUpdate` wrapped in try/catch so a snapshot-refresh failure can't fail the committed flip.

**H2 — settling-guarded per-mode invariant-check (the Phase-21 co-run WITNESS).** New fields:
```ts
private lastEngineFlipAt: Map<TradingMode, number> = new Map();   // settling guard, stamped in setEngineActive
private readonly LIVENESS_SETTLING_MS = 15000;                    // ignore divergence within 15s of a flip
private livenessSplitStats: Map<string, { count: number; lastReason: string; lastAt: number }> = new Map();
```
New `checkLivenessInvariants(paperContext, liveContext)` called at the end of the existing 30s reconciliation guard. Per mode, after the settling window: asserts DB `isEngineActive(mode)` === engine-presence (`getEngine(mode)`), and for paper also === orchestrator-presence (`getOrchestratorByMode('paper')`); globally asserts `vtsModeAuditService.getState().tradingActive` === (paperDB || liveDB). Any mismatch → `recordLivenessSplit(key, reason)` increments an observable counter + `console.warn('[LIVENESS_SPLIT]...')`. New `getLivenessSplitStats()` exposes it for the co-run gate. **If any counter > 0 during a paper+live dry-run, the flip is blocked.**
- Reader #5 (`getGlobalSession`/`globalSimulationSession`) is deliberately NOT in the hard equality invariant — it tracks the sim-session lifecycle, not engine-active, so equating it would false-positive. Noted; left as a derived reader.
- `global.tradingEngines` deletion stays REMOVED from D5 (→ #297), per the verify-before-cut correction.

## Chunk 1 — S1 cluster per-mode isolation + vestigial lock/flag removal

**`server/services/paper-sim-service.ts` (core):** the active portfolio manager (which owns the heat ceilings MAX_OPEN_POSITIONS / MAX_PORTFOLIO_EXPOSURE_PERCENT / MAX_DRAWDOWN) moves from a single `global.globalPaperPortfolioManager` slot to a per-mode Map behind the existing accessors:
```ts
type PaperSimMode = 'live' | 'paper';
declare global { var globalPaperPortfolioManagers: Map<PaperSimMode, any> | undefined; }
function _paperSimManagers(): Map<PaperSimMode, any> { if (!global.globalPaperPortfolioManagers) global.globalPaperPortfolioManagers = new Map(); return global.globalPaperPortfolioManagers; }
export function getGlobalPaperSimManager(mode: PaperSimMode = 'paper'): any { return _paperSimManagers().get(mode) || null; }
export function setGlobalPaperSimManager(manager: any, mode: PaperSimMode = 'paper'): void { _paperSimManagers().set(mode, manager); ... }
export function clearGlobalPaperSimManager(mode: PaperSimMode = 'paper'): void { _paperSimManagers().delete(mode); ... }
```
Default 'paper' → every existing accessor caller (16 internal + trade-safety:664 + paper_sim_heartbeat:66 + paper-session-reset:161/178 + routes:4051/10250/10313) is behavior-identical; live wiring (Phase 21) passes mode='live'. Internal raw reads converted (`getPaperSimulationStatus`, `resetPaperSimService`).

**Vestigial busy-flag / operation-lock REMOVED (rule-18).** Verified: `globalPaperSimBusyFlag` is never set true; `globalPaperSimOperationLock` is never assigned a Promise; `busyFlagSetAt`/`operationLockSetAt` are only ever set null — the whole mechanism is dead (superseded by `paperOperationQueue` since Phase 41F). Removed: the `declare global` entries, the module timestamps, the flag/lock branches of `clearStaleBusyFlag` (kept the orphaned-manager cleanup), `resetPaperSimService`'s lock clear, `routes.ts` init-guard + both catch-clears + the finally busy-flag clear, `paper-session-reset.ts`'s lock/flag clears. → DELETED_COMPONENTS_LOG entry.

**Raw-global manager sites routed through the accessor (per-mode, mode='paper'):**
- `server/paper-trading-stop.ts:44/47`, `server/utils/operation-queue.ts:319/321` (dynamic import — avoids the paper-sim-service↔operation-queue cycle), `server/routes.ts` status/metrics/health/close-all reads.
- **#297 dormant subsystem (R1):** `server/services/intent-executor.ts` (executeStart/Stop + :497) and `server/services/state-awareness.ts:307` routed through the accessor with `mode='paper'` + an explicit NOTE that this default must be revisited when #297 revives the live branch (the `new PaperPortfolioManager(userId)` wrong-arg is left untouched — #297 territory). No raw `global.globalPaperPortfolioManager` access remains (grep-confirmed; the residual hits are local variable names + the deletion comment).

---

## Chunk 4 — S4 riskConcentrationAnalyzer per-mode

`server/services/risk-concentration.ts`: `positionWeights` / `concentrationScores` go from single symbol-keyed Maps to `Map<RcMode, Map<symbol,…>>` (helpers `_weights(mode)` / `_scores(mode)`). Every method that touches them takes a `mode` first param: `updatePositionWeights`, `calculateConcentrationScore`, `recalculateScores`, `getScalingFactor`, `isCorrelatedExposure`, `getConcentrationScore`, `getAllScores`, `getPortfolioExposure`, `getDiagnostics`(default 'paper'), `reset`(optional mode). Exported wrappers `getScalingFactor(mode,symbol)` / `isCorrelatedExposure(mode,symbol)` follow. The dormant periodic path (`updateFromMarketData`→recalc) passes 'paper'. **Root bug fixed:** `trade-safety.ts:804` built mode-scoped weights (`getActivePositions(mode)`) and wrote them into the mode-agnostic global → paper + live clobbered. Callers threaded: `trade-safety.ts:804/806` (mode in scope), `paper-execution-engine.ts:405` (`this.mode`), `paper-position-sizing.ts:194` (new REQUIRED `mode` field on `PaperPositionSizingParams`, threaded from the 2 sizing callers — orchestrator `sizingContext.mode`, engine `this.mode` — plus the cascade test's `baseParams`). S2 covariance left SHARED (C1). No silent default — `mode` required on the live path.

## Chunk 5 — S6 mode-prefix (S13 / S8 documented, not changed)

`server/core/rtb/ready_to_buy_service.ts`: `signalRefreshStates` key goes from bare `signalId` (only statistically unique — `${symbol}-${strategy}-${Date.now()}-${rand6}`, no mode namespace) to `${mode}:${signalId}` via a `_refreshKey(mode,signalId)` helper. `getSignalRefreshState`/`isSignalRefreshing` take `mode`; all 5 call sites (`:603`, `:1624`, `:1663`, and the two `.delete` at the SQE-skip / SQE-fail paths) thread the in-scope `mode`. **S13** (`vtsModeAudit.tradingActive`) — NOT separately converted: the chunk-2 invariant-check already witnesses its divergence, and VTS only needs "is ANY active trading on" (simulator vs observer), so a per-mode bool would over-complicate VTS for no correctness gain. **S8** (`tcl_watchdog currentPoolSize`) — left as-is: a CPU-load knob, shadowed by a per-mode local for actual TCL decisions (audit: SHARED-BENIGN). Both reasonings flagged for your sign-off.

## Chunk 3 — S3 shared Kraken limiter — **DEFERRED out of D5 (locked module + not a hard blocker)**

🚩 **Verify-before-edit caught it:** `server/exchanges/kraken/kraken.ts` carries a `🔒 LOCKED MODULE — DO NOT MODIFY` header (Directive 8.8.4-A4.R10R-4; "changes require a formal directive"). The credential-keyed shared limiter (our R2 design) lives *inside* that file's rate-limit methods, so S3 can't be built without touching the locked module. **I did NOT modify it.** Re-scope rationale: S3 is **not** a hard Phase-21 split-brain blocker — paper + live share ONE Kraken API key, so the venue's `EGeneral:Temporary lockout` is account-wide and *correctly* shared today; each `new KrakenService()` already has its own per-instance map so there's no cross-mode corruption to fix. S3 is a *fragmentation/coordination* improvement (36 uncoordinated trackers → 1 credential-keyed shared limiter), not a corruption fix. **Proposed:** defer S3 to a dedicated follow-up batch that carries the formal locked-module directive + the credential-keying design; home it in RUNNING_ISSUES + PHASE_19_PLAN. **This also subsumes #296** (the residual ad-hoc-sites consolidation), since a class-level shared limiter would have made all 36 instances share automatically. **Need your concurrence on dropping S3 from D5.**

---

## Verification (bench, C:\dev @ HEAD 8693239 + the 15 changed files)
- ✅ **tsc baseline gate (`scripts/check-tsc-baseline.mjs`): OK — no regressions above baseline** (404 current vs 494 baseline; the change set adds zero new type errors).
- ✅ **vitest: 1952 / 1952 passed (171 files)** — includes the 7 new isolation/witness tests added at Step-4. _(An earlier draft of this line said 1945/170, the pre-test-addition count — the authoritative final figure is 1952/171.)_
- New unit tests for the witnesses pending (I'll add a liveness-split + per-mode-isolation test before push if you want them in this batch, or home them — your call at Step-4).

## Net D5 = S1 + liveness(H1/H2) + S4 + S6 + governance. S3 → follow-up (locked module). Files changed (15): paper-sim-service, paper-trading-stop, operation-queue, paper-session-reset, state-awareness, intent-executor(#297), routes, trading-state-sync, risk-concentration, paper-execution-engine, trade-safety, paper-position-sizing, signal-orchestrator, ready_to_buy_service, b79-0n-orchestrator-cascade.test.

**Ask (Step-4):** review the diff; concur on (a) the vestigial lock/flag REMOVAL (rule-18), (b) S13/S8 left-as-documented, (c) **S3 deferred** to a locked-module-directive follow-up. `ssh staging 'cd /home/deploy/dawntrader && git ...'` for any repo-side inspection beyond the embedded snippets — do NOT cd the FUSE mount.

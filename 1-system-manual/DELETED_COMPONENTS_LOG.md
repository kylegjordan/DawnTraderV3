# DELETED COMPONENTS LOG

> **Tier-2 governance (Kyle directive 2026-06-13).** When legacy code is removed, it is recorded here — never left stubbed/commented/deprecated/lingering in the live tree. Each entry: what was removed, why, the blast-radius verification that proved it safe, the archive copy path, and the removal commit. Archived copies live under `1-system-manual/_archive/deleted-code/` with a `.removed` suffix (non-compilable). The git history is the authoritative full archive; the `_archive` copy is for quick browsing.
>
> **Why this exists:** lingering legacy code creates confusion and the risk that dead paths accidentally re-enter the live system. See CLAUDE.md §5 rule 18 (legacy-removal policy, 2026-06-13 strengthening).

---

## 2026-06-13 — Legacy live-trading STUB cluster (P19-B2)

**Removed:** the pre-cleave `LiveTradingService` stub and its orphaned surface.

| Item | Location (pre-removal) | What it was |
|---|---|---|
| `live-trading-service.ts` | `server/services/live-trading-service.ts` | Phase 22.3 / Phase 41F stub. On "activate" it built a **fake placeholder object** `{ userId, mode:'live', isRunning:true }` — no Kraken, no TEC, no execution. Its own comments: *"Initialize trading engine (placeholder for now)… In production this would initialize the actual TradingEngine."* Also emitted a misleading "live trading active" broadcast off the do-nothing object (operator-integrity hazard). |
| 4 legacy routes | `server/routes.ts` `/live-trading/{start,stop,status,approve}` | Orphaned HTTP endpoints wiring to the stub. **No client/server caller** (verified). |
| Dead approval branch | `server/routes.ts` `if (approval.action === 'start_live_trading')` | Imported the stub's `activateLiveTrading`. The `start_live_trading` approval action is **never emitted anywhere** in the live tree (verified — appears only as a permission-type string and in an old context doc). |
| Test-harness scenario | `server/services/auto_test_harness.ts` | `createLiveTradingScenario()` + its registration + the `./live-trading-service` imports. Exercised the stub only. |

**Why removed:** legacy userId-coupled stub predating the June-10 three-way (VTS/paper/live) cleave; contradicts the mode-based architecture; carried an active false-"live-ON" broadcast bug. Kyle directive 2026-06-13: delete now, do not leave lingering.

**Blast-radius verification (certainty-before-cutting):**
- The **modern** live-start path (the Phase-21-gated engine start, `routes.ts` 409 `LIVE_ENGINE_PHASE21_GATED`) does **NOT** use this file — it is untouched.
- The client UI "Confirm & Start Live Trading" button (`top-bar.tsx` → `useTrading().startTrading({type:'live'})`) routes to the **modern gated path**, NOT the legacy `/live-trading/*` routes — UI unaffected.
- `start_live_trading` approval action has **no emitter** in the live tree — the approval branch was dead.
- `auto_test_harness` keeps its other scenarios (paper-sim start/stop, heartbeat); only the live-trading scenario was removed.
- **Left intentionally (forward-looking Phase-21 permission taxonomy — NOT dead executable code; do not mistake for a missed sweep when grepping `start_live_trading`):** `client/src/hooks/useUserRole.ts` permission-type strings (`start_live_trading`/`stop_live_trading`); `shared/schema.ts:181` (`"startLiveTrading": true` default-permission flag); `server/config/permissions.ts:202` (`'start_live_trading': 'trade_live'` permission→capability mapping — Langston Step-4 catch). All three are the permission MODEL Phase-21 live will use, independent of which file implements live.

**Archive copy:** `1-system-manual/_archive/deleted-code/live-trading-service.ts.20260613-P19B2.removed`
**Removal commit:** _(recorded at P19-B2 close)_
**Reviewed by:** Langston (Step-4 diff review) — _pending_

---

## 2026-06-15 — Hardcoded `enabledStrategies` allowlist + orchestrator Set machinery (P19-B4a C5)

**Removed:** the hardcoded strategy allowlist and all of its now-orphaned in-class machinery, replaced by the DB-resolved per-asset-class gate.

| Item | Location (pre-removal) | What it was |
|---|---|---|
| Two 9-element inline literals | `server/services/trading-engine.ts:57-67` + `server/services/paper-portfolio-manager.ts:194-204` | The `enabledStrategies: ['vwap_pullback', … 'dhma']` config arrays passed into `new SignalOrchestrator({…})` at both live constructor sites. Hardcoded which strategies the orchestrator ran — static, not per-asset-class. |
| Config field | `server/services/signal-orchestrator.ts` `SignalOrchestratorConfig.enabledStrategies?: string[]` | Optional config knob the two literals fed. |
| The Set + 17-element default | `server/services/signal-orchestrator.ts` `private readonly enabledStrategies: Set<string>` field + its constructor construction (`new Set(config.enabledStrategies || [ …17 strategies… ])`) | The in-memory allowlist. The 17-element default (the "Directive 12.3.2 all canonical strategies" literal) is gone with it. |
| Dead public methods | `server/services/signal-orchestrator.ts` `isStrategyEnabled(strategyId)` + `getEnabledStrategies()` | Read-only accessors over the Set. **Zero external callers** (sweep-verified). |
| Log / stat sites | `server/services/signal-orchestrator.ts` `start()` banner + telemetry (`this.enabledStrategies.size`); `[8.8.3-B][SELECTION]` log (`Array.from(this.enabledStrategies)`); `strategiesRun += this.enabledStrategies.size`; Site E (`new Set([...this.enabledStrategies].filter(s => regimeStrategies.has(s)))`) | All consumers of the Set. Re-sourced: log/telemetry/stat counters → `Object.keys(STRATEGY_DISPLAY_NAMES)` (canonical universe); Site E → `new Set(regimeStrategies)` (the regime allowlist is the per-symbol selector; the DB gate is now the per-class authority). |

**Why removed:** the hardcoded allowlist was a static, asset-class-blind override that contradicted the per-asset-class-config default (CLAUDE.md §5 rule 15). It is replaced by `isStrategyEnabledForAssetClass` (`strategy_gates` DB) at the `buildSizedSignalForStrategy` chokepoint — the single per-class authority, reachable by BOTH pipes (crypto via `evaluateSymbol`, xStock via `dispatchExternalSignal`) because the stamped asset class lives there. Leaving the literals alongside the new gate would mean two competing authorities; leaving the orphaned Set/methods would be a lingering-legacy stub. Kyle directive 2026-06-13 (rule 18): delete now, do not leave lingering.

**Design decision (approved):** `isStrategyEnabledForAssetClass` stays DEFAULT-OPEN (returns `true` when no `strategy_gates` row matches). "Fail-hard" is satisfied by deleting the hardcoded list (the DB resolver becomes the sole authority and already throws on cold cache via `b72-warmup` prefetch). An explicit crypto allowlist seed is out of C5 scope (it would black out all crypto until a seed migration; crypto_spot has no rows today and stays default-open).

**Blast-radius verification (certainty-before-cutting):**
- **2 live constructor sites** (`trading-engine.ts` + `paper-portfolio-manager.ts`) — both edited; the field is optional, so removing it compiles.
- **0 external callers** of the removed public methods `isStrategyEnabled` / `getEnabledStrategies` (`server/`-wide sweep: only the orchestrator's own former definitions).
- The gate reads the 9-wide `StrategyType` (`'range_trading'`) but the DB rows + `STRATEGY_DISPLAY_NAMES` use the canonical `'range_trade'`; a one-entry reverse-alias (`range_trading → range_trade`) bridges this at the gate (mirror of the C2 forward-alias). `normalizeStrategy()` does NOT bridge it (silent default-open), hence the explicit alias.
- **⚠️ Left intentionally / FLAGGED (NOT a missed sweep):** the `/reb-2-12F/strategy-health` admin diagnostic (`server/routes.ts:10617-10630`) does NOT call the removed methods — it reads `signal-orchestrator.ts` **as source text** and regex-matches the `enabledStrategies = new Set([…])` literal and `this.enabledStrategies.has('dhma')` block. Removing that source machinery breaks the diagnostic's `orchestratorStrategies`/`dhmaWired` outputs (it will report empty + `dhmaWired=false`). This is a source-text coupling, outside the 4 files this chunk edits, and was surfaced to Langston for a follow-up home (re-point the diagnostic at `STRATEGY_DISPLAY_NAMES` / the regime map, or retire it). It does not affect the runtime signal pipeline.

**Archive copy:** none — this is inline literals + in-class machinery (not whole files), so there is no `.removed` archive file; git history is the authoritative archive (per this log's preamble).
**Removal commit:** _(recorded at C5 close)_
**Reviewed by:** Langston (Step-4 diff review) — _pending_

---

## 2026-06-15 — Vestigial paper-sim busy-flag / operation-lock mechanism (P19-B4b D5)

**Removed:** the `globalPaperSimBusyFlag` + `globalPaperSimOperationLock` start/stop concurrency mechanism and all of its now-dead supporting code, surfaced while isolating the S1 portfolio-manager cluster per-mode.

| Item | Location (pre-removal) | What it was |
|---|---|---|
| Two `declare global` vars | `paper-sim-service.ts:248-249` | `var globalPaperSimOperationLock: Promise<void> \| null` + `var globalPaperSimBusyFlag: boolean`. |
| Two module timestamps | `paper-sim-service.ts:36-37` (+ 2 threshold consts `:38-39`) | `busyFlagSetAt` / `operationLockSetAt` (and `BUSY_FLAG_STALE_THRESHOLD_MS` / `OPERATION_LOCK_STALE_THRESHOLD_MS`) — only ever set to `null`. |
| `clearStaleBusyFlag` flag/lock branches | `paper-sim-service.ts:42-61` | The stale-flag and stale-lock auto-clear branches. The function's orphaned-manager cleanup (the part that does real work) was KEPT. |
| `resetPaperSimService` lock clear | `paper-sim-service.ts:1126-1129` | `if (global.globalPaperSimOperationLock) { … = null }`. |
| Route catch/finally clears | `routes.ts` paper-sim start (init-guard `:5745-5746`, catch `:11236`, finally busy-flag `:11238-11242`) + stop catch (`:11266`) | Five `(global as any).globalPaperSim{OperationLock,BusyFlag} = null/false` dead writes. |
| Reset-service clears | `paper-session-reset.ts:296-297` | `(global as any).globalPaperSimOperationLock = null; …BusyFlag = false`. |

**Why removed:** the entire mechanism is **vestigial** — superseded by `paperOperationQueue` (Phase 41F: "use operation queue instead of busy flag and operation lock"). It is provably dead, not just unused: `globalPaperSimBusyFlag` is **never set `true`** anywhere; `globalPaperSimOperationLock` is **never assigned a Promise** anywhere; `busyFlagSetAt`/`operationLockSetAt` are **only ever set to `null`** — so `clearStaleBusyFlag`'s guards (`if (flag && setAt)`) are unreachable. Leaving dead split-brain-shaped globals while the batch's whole purpose is to isolate per-mode state would be exactly the lingering-legacy hazard rule 18 forbids; mode-keying dead state would be a NO-PATCHES violation (maintaining dead code).

**Blast-radius verification (certainty-before-cutting, #297 discipline):**
- Repo-wide grep for `globalPaperSimBusyFlag` / `globalPaperSimOperationLock` / `busyFlagSetAt` / `operationLockSetAt` enumerated **every** reference — all are either the removed declarations or dead null/false clears; **zero truthy acquisition** anywhere.
- The live start/stop concurrency control is `paperOperationQueue.enqueue(...)` (`paper-sim-service.ts:439`) — untouched.
- tsc baseline gate after removal: **no regressions** (the typed `global.globalPaperSim*` references that would have errored on the removed `declare global` were all removed; the remaining `(global as any)` casts were also removed).
- vitest 1945/1945 after removal.

**Archive copy:** none — inline machinery (not a whole file); git history is the authoritative archive.
**Removal commit:** _(recorded at D5 close)_
**Reviewed by:** Langston (Step-4 diff review) — _pending_

---

## P19-B4b.1 (2026-06-16) — the RTH liquid-fill-window FILL gate + the flat paper slippage constant

**Batch:** P19-B4b.1 (paper fill fidelity). **Removal commit:** `b74526dc3`. **Reviewed by:** Langston Step-4 APPROVE.

| Removed | Location | What |
|---|---|---|
| RTH liquid-fill-window FILL gate block | `xstock_spot/active-dispatch.ts` (the `if (!isXstockLiquidFillWindowET(...))` skip + `_outOfSessionSkips` counter + the `getXstockActiveDispatchStats` field + the `isXstockLiquidFillWindowET` import) | The time-of-day proxy that gated active xStock fills to US RTH. Retired as a FILL gate (#295) — replaced by the 24/5 book-depth-sufficiency gate at the engine open seam. |
| Flat slippage on the active fill seam | `paper-execution-engine.ts` (the `SLIPPAGE_PERCENT` field + the `CANONICAL_SLIPPAGE` import) + `order-placer.ts` (the `slippagePercent` constructor arg + the flat `intendedPrice ± slippage%` math) | The flat 0.05% paper slippage. Replaced by the honest depth-walk (`execution/depth-walk.ts`). |

**Why removed:** #295 — the RTH clock was a proxy for "is the book deep enough", wrong in both directions (blocked fillable off-hours books, passed thin RTH books); B4b.1 measures depth directly. The flat slippage is superseded by the real book-walk (no magic % on the active seam — Langston Q-A / C-Q5).

**★ RETAINED (verify-before-cut correction — NOT removed):** `isXstockLiquidFillWindowET` (the predicate) + its two `module_constants xstock_fill_safety.liquid_fill_window_*` keys are KEPT — the grep sweep caught that `equity-spot-archiver.ts:316` (the silent-stall watchdog) still uses them to select its RTH-vs-off-RTH reconnect threshold (a feed-cadence use, NOT a fill-quality use). Deleting them would have regressed the watchdog. Only the FILL-gate use was removed. Confirmed in staging: 2 `liquid_fill_window_*` keys live in the DB post-deploy.

**★ LEFT INTENTIONALLY — scheduled for deletion with #300 / P19-B4b.2 (rule-18; do NOT read these as a missed sweep):**
- `slippage-fee-model.ts:91-125 calculatePriceImpact` — the proven book-walk math B4b.1 PORTED into the fresh deterministic `depth-walk.ts` helper; the original is now reachable only from dead-on-active-path code (it stays as the golden-test reference until #300 deletes its dead callers).
- `realtime-paper-executor.ts` — dead on the active path (referenced only by a diagnostic endpoint).
- `pre-execution-validator.ts` — dead on the active path; its removal coordinates with the #297 investigation (its only non-diagnostic caller is #297's `intent-executor`).
- the SECOND, dormant WS `book` connection `market-data-ws.ts` → `market-data-coordinator.getLatestOrderBook` — a duplicate of the active adapter's book, feeding only the dead executor + diagnostics.

**Blast-radius verification:** repo-wide grep (`server/` only) for the retired symbols → the only remaining `isXstockLiquidFillWindowET` consumer is the watchdog (`equity-spot-archiver.ts`) + tests; no remaining `SLIPPAGE_PERCENT`/`CANONICAL_SLIPPAGE` on the active fill seam (a separate legacy manual-close route in `routes.ts:12200` keeps its own flat slippage — out of B4b.1 scope, noted). tsc baseline no-regression (404<494); vitest 1979.

**Archive copy:** none — inline blocks; git history (`b74526dc3`) is the authoritative archive.

---

## P19-B4b.2 (2026-06-16) — dead paper-fill machinery sweep (#300)

**Batch:** P19-B4b.2. **Removal commit:** `977f3be08`. **CI:** `27598725568` all-4-green. **Deployed:** restart#394, root HTTP200, `/api/execution/metrics` → 404. **Reviewed by:** Langston Step-1/2/4 APPROVE; Step-8 _pending_.

| Removed | Location | What |
|---|---|---|
| `realtime-paper-executor.ts` (WHOLE FILE, −255) | `server/services/realtime-paper-executor.ts` | The Phase-8-era real-time paper executor. `executeTrade()` had **0 callers**; `recordPaperTrade()` was never finished (*"just log - will integrate with storage in next step"*). Only live surface was `getStatus()` — a pass-through wrapper over mdCoordinator/executionTiming/rateControl. |
| `GET /api/execution/metrics` | `server/routes.ts` | Dead diagnostic endpoint backed by the executor's `getStatus()`. **0 client consumers** (the UI's `ExecutionMetricsPanel` reads a different surface); already returned a stale `killSwitch: undefined`. The adjacent `/api/execution/timing/export` (reads `executionTiming` directly) was KEPT. |
| order-book read sub-path | `server/services/market-data-coordinator.ts` | `latestOrderBooks` map + the `wsClient.on('orderbook')` handler (its re-`emit('orderbook')` had **0 listeners**) + `getLatestOrderBook()` (its **only caller** was the deleted executor). |
| dead `'orderbook'` emission | `server/services/market-data-ws.ts` | the `snapshot` construction + `this.emit('orderbook', snapshot)` in the `book`-channel handler. |

**Consumer reroute (NOT a removal):** `system-health-monitor.getExecutionMetrics()` — swapped `realtimePaperExecutor.getStatus()` for direct reads of `getMarketDataCoordinator().getStatus()` + `rateControl.getStatus('private')` + `executionTiming.getMetrics(10)`. **Value-identical** (Langston-verified line-by-line): the executor's `getStatus()` was already a pass-through over exactly these three singletons; the `try/catch` + `'N/A'` defaults are untouched.

**Why removed:** rule-18 — never leave legacy lingering; a dead paper-fill path could accidentally re-enter the live system once paper trading turns on. #300 named home.

**Blast-radius verification (certainty-before-cutting):**
- `executeTrade()` 0 callers (the two `.executeTrade(` grep hits are `trading-engine`'s own method + a different `engine` object). **0 test imports** of the file/endpoint/accessor (`grep server/tests` + `**/*.test.ts` → 0 — Langston diff-guard #3).
- ⚠️ **Framing correction vs the original #300 plan:** the "dup 2nd WS book path" is NOT a clean module cut — `market-data-coordinator` + `market-data-ws` are LIVE shared infra (imported by `feed-integrity-monitor`, `health-monitor`, `parity-gate`). Only the order-book SUB-PATH was dead. The `book` SUBSCRIPTION + the midpoint-`'tick'` emission are LIVE (load-bearing for the live tick stream) and were KEPT (Langston diff-guard #1: `market-data-ws.ts` `lastTickTimestamp` line preserved between the two removal targets).
- tsc baseline no-regression; vitest 1979/1979.

**Left intentionally (NOT a missed sweep — do not re-grep as dead):**
- `slippage-fee-model.ts:91-125 calculatePriceImpact` — KEPT as the `depth-walk.ts` golden-test reference; its parent module is still imported by `pre-execution-validator` (#297) + `routes.ts`.
- `pre-execution-validator.ts` — LEFT pending the #297 investigation (its only non-diagnostic caller is #297's `intent-executor`).
- the whole `MarketDataCoordinator`/`MarketDataWebSocket` subsystem — likely vestigial (zero `subscribeToPair` callers) but its removal is a SEPARATE liveness-then-remove audit → homed **#301**.
- `OrderBookSnapshot` interface export (`market-data-ws`) — KEPT (`slippage-fee-model` type-imports it).

**Archive copy:** `1-system-manual/_archive/deleted-code/realtime-paper-executor.ts.removed`.
**Reviewed by:** Langston Step-1/2/4 APPROVE; Step-8 _pending_.

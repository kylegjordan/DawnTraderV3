# DELETED COMPONENTS LOG

> **Tier-2 governance (Kyle directive 2026-06-13).** When legacy code is removed, it is recorded here — never left stubbed/commented/deprecated/lingering in the live tree. Each entry: what was removed, why, the blast-radius verification that proved it safe, the archive copy path, and the removal commit. Archived copies live under `1-system-manual/_archive/deleted-code/` with a `.removed` suffix (non-compilable). The git history is the authoritative full archive; the `_archive` copy is for quick browsing.
>
> **Why this exists:** lingering legacy code creates confusion and the risk that dead paths accidentally re-enter the live system. See CLAUDE.md §5 rule 18 (legacy-removal policy, 2026-06-13 strengthening).

---

## 2026-07-01 — In-queue maker "make-then-take" resting-order machinery (P19-B7.2b / wrong-stage)

**Removed:** the B7.2 OBJ-4 in-RTBQ maker-pending / convert-safety lifecycle — the code that tried to WORK a resting maker order while a signal sat in the ready-to-buy queue. **Wrong stage** (Kyle model clarification 2026-07-01): a queued signal carries a maker/taker **DECISION only** and works NO order; the maker order is placed only at **PROMOTION** (Kraken in live; simulated for paper+VTS), so its resting/fill/timeout/convert lifecycle belongs post-promotion, not in the queue.

| Item | Location (pre-removal) | What it was |
|---|---|---|
| `markMakerPending()` method | `server/core/rtb/ready_to_buy_service.ts` | Marked a queued signal maker-pending + stamped `maker_posted_at`/`maker_limit_price`/`maker_budget_expires_at` — as if a resting order existed in-queue. |
| `processMakerPending()` method | `server/core/rtb/ready_to_buy_service.ts` | The per-refresh in-queue maker-order lifecycle driver (budget-expiry → convert-to-taker-or-drop) — the "make-then-take" ladder, run at the wrong stage. |
| `refreshSingleSignal` maker-pending branch | `server/core/rtb/ready_to_buy_service.ts` | Top-of-refresh `if ((signal as any).makerPending === true) { … }` early-branch that ran the in-queue lifecycle instead of the normal reconfirm. |
| `getRankedSignals` mutual-exclusion filter | `server/core/rtb/ready_to_buy_service.ts` | The filter that excluded maker-pending rows from ranking — needed only because in-queue signals were (wrongly) holding orders. Removed: every queued signal now ranks on its `chosen_net_ev` decision, uniformly. |
| Promotion-loop maker-POST branch | `server/services/paper-execution-engine.ts` | The promotion path that called `markMakerPending` to post an in-queue maker order. Replaced by a comment noting the maker order is placed AT promotion (paper+VTS sim = B7.2c; live Kraken resting order = Phase-21). |
| 4 `rtb_signals` columns | `shared/schema.ts` + DROP migration `2026-07-01-p19-b7-2b-fee-mode-columns.sql` | `maker_pending`, `maker_posted_at`, `maker_limit_price`, `maker_budget_expires_at` — the in-queue lifecycle state. Never populated in prod (active trading OFF since Phase 8), so the DROP is clean. |

**Why removed:** CLAUDE.md §5 rule 18 (never leave lingering legacy) + the wrong-stage correction. Leaving the in-queue lifecycle stubbed would risk a dead path re-entering the live system when Phase-19 flips active trading ON, and would contradict the locked model (RTBQ = decision only). Delete-on-the-spot (§15(a)), full workflow.

**Blast-radius verification (certainty-before-cutting — Langston Step-4 gate #2):**
- **Zero remaining references to `processMakerPending` / `markMakerPending`** anywhere in `server/` + `client/` (repo-wide grep — only doc/comment mentions of the removal survive).
- **Zero remaining readers of the 4 columns:** no `select *` reader, no ORM field (the drizzle column definitions were removed from `schema.ts` — comment-only marker remains), no view/materialized read, no `makerPending`/`makerPostedAt`/`makerLimitPrice`/`makerBudgetExpiresAt` field access. "Never populated" justifies the drop; "never referenced" is what makes it safe.
- **`tsc --noEmit` clean** after the type-field removal + the mutual-exclusion branch came out of `getRankedSignals` (bench-verified).
- **Migration is forward-only** with an HONEST down-migration: the rollback `…-rollback.sql` re-adds the 4 columns as nullable/default (recreate-as-nullable) — the data was never populated so no value is lost either direction.
- **Left intentionally:** the maker/taker DECISION service (`decideMakerTaker`, `maker-taker-decision.ts`) and the `chosen_entry_mode`/`chosen_net_ev`/`taker_net_ev`/`maker_net_ev_adjusted` snapshot columns STAY — they are the correct in-queue artifact (decision only). Only the resting-order MACHINERY was wrong-stage.

**Interim-constraint note (Langston Step-4 intent gate):** with the in-queue maker machinery gone, a `decideMakerTaker`→**maker** verdict has its execution path built in the **very next sub-batch B7.2c** (the post-promotion pending maker-fill simulation for paper + VTS), which lands BEFORE active trading is switched ON (P19-B8). Live Kraken resting-order = Phase-21. So there is no window where active trading is ON with a maker verdict the executor cannot honor.

**Archive copy:** none as whole-file (the host files `ready_to_buy_service.ts` / `paper-execution-engine.ts` / `schema.ts` remain in the live tree); git history is the authoritative archive for the removed blocks.
**Removal commit:** _(recorded at P19-B7.2b close)_
**Reviewed by:** Langston Step-4 diff review — _pending_ (the delete-on-the-spot disposition was pre-agreed in the B7.2b design round, 2026-07-01).

## 2026-06-29 — Stranded legacy guardrails-tab UI (P19-B6.8 / #302)

**Removed:** the old pre-v2 guardrails tab component and its orphaned copy-to-live modal.

| Item | Location (pre-removal) | What it was |
|---|---|---|
| `guardrails-tab.tsx` (`GuardrailsTab`) | `client/src/components/goals/guardrails-tab.tsx` | The OLD guardrails UI (pre-`guardrails_v2` era). Read/wrote the DEPRECATED `/api/guardrails` (GET→v2 but **PUT→`upsertGuardrails` which THROWS** `[9.7] deprecated`) + the GLOBAL `/api/settings` (which now allow-lists ONLY `timezone`, rejecting risk fields). **Imported in `goals-engine.tsx` but NEVER RENDERED** — the live guardrails tab mounts only `<CoreFourGuardrails/>` (the v2 component). So every guardrail save it offered was a dead/throwing path with zero user impact. Stranded-dead, superseded by the landed v2 migration. |
| `copy-to-live-modal.tsx` (`CopyToLiveModal`) | `client/src/components/goals/copy-to-live-modal.tsx` | The paper→live guardrail-copy modal, imported ONLY by `guardrails-tab.tsx` (grep-confirmed sole importer) — orphaned the moment GuardrailsTab is removed. |

**Why removed:** CLAUDE.md §5 rule 18 (never leave lingering legacy). Surfaced during the P19-B6.8 verification that the live guardrails tab (`CoreFourGuardrails` → `/api/guardrails-v2`, per-mode) already works, making GuardrailsTab a confusing dead duplicate. **Blast-radius (certainty-before-cutting, Langston Step-1):** GuardrailsTab's only reference was the one `goals-engine.tsx:2` import (no conditional/feature-flag render swap); copy-to-live-modal's only importer was GuardrailsTab; tsc-trace after removal = zero dangling references (grep-confirmed across client/ + server/). Stranded-dead, NOT an unfinished intended-replacement (CoreFourGuardrails uses the newest [9.7] `/api/guardrails-v2` and IS the rendered forward UI).

**Archive copy:** `1-system-manual/_archive/deleted-code/guardrails-tab.tsx.removed` + `copy-to-live-modal.tsx.removed` (git history authoritative).
**Removal commit:** (this batch P19-B6.8).
**Reviewed by:** Langston Step-1 consensus (stranded-dead accepted) + Step-4 diff review (pending).
**NOTE — NOT removed here (separate dated home P19-B6.10):** the old `guardrails` TABLE + `PUT /api/guardrails` + `upsertGuardrails` throw-stub stay until their live server callers migrate to v2 (`reasoning-orchestrator.ts:500` reads the old table directly; `intent-executor.ts:418` calls the throwing upsert) — cross-blast-radius (§15(b)), scheduled P19-B6.10.

## 2026-06-26 — Vestigial secondary market-data WebSocket subsystem (P19-B6.7 / #301)

**Removed:** the "Directive 8.9.0-B Secondary WebSocket Adapter" and its coordinator wrapper.

| Item | Location (pre-removal) | What it was |
|---|---|---|
| `market-data-ws.ts` | `server/services/market-data-ws.ts` | A second Kraken WS adapter (`getMarketDataWS()` singleton), separate from the primary `kraken-websocket-adapter.ts`. Connected on construction but **never delivered a tick or completed a subscription in its entire logged history** (`MD-WS_TICK`=0, `Sub OK`=0 since Apr 3). Live-spammed `[MD-WS] Data stale` every 30s (30s heartbeat vs 2s stale threshold; tick-timestamp only bumped by pongs). |
| `market-data-coordinator.ts` | `server/services/market-data-coordinator.ts` | `getMarketDataCoordinator()` singleton wrapping the 2nd WS + a never-exercised REST-fallback bookkeeping (`usingFallback`/`dataSource`). Its `'tick'`/`cortex-update` outputs were dead-ended; only `getStatus()` was consumed. |

**Why removed:** a dead feed that every health/safety consumer mis-read as "connected/healthy" because the dead socket kept a TCP connection open. **Phase-19 landmine:** `feed-integrity-monitor` (boot-started, 5-min cron) graded this dead feed and would raise false CRITICAL `feed_health` alerts every 5 min once Phase-19 lifts dormant-mode suppression; `parity-gate` false-PASSED the Phase-21 go-live WS gate off it. CLAUDE.md §5 rule 18: delete now, do not leave lingering.

**Blast-radius verification (certainty-before-cutting):**
- **Tick-output consumers: ZERO** (`coordinator.on('tick')`/`getLatestTick`/`getDataSource`) — the only historical consumer (realtime-paper-executor) was already deleted in #300/B4b.2.
- **`subscribeToPair` callers: ZERO** — the current build never drove a subscription (so the historical "Sub Error" log volume was pre-#300 residue).
- **The 4 status-only consumers were re-pointed FIRST** at the primary `krakenWebSocketAdapter` (parity-gate, health-monitor, system-health-monitor, feed-integrity-monitor), then `tsc --noEmit` proved zero dangling references BEFORE deletion, then a repo-wide grep confirmed no remaining code reference.
- **Primary adapter ⟂ this subsystem: PROVEN** — `kraken-websocket-adapter.ts` had zero reference to it, and no price-cache / VTS / warmup / signal path touched it.
- `OrderBookSnapshot` (the one still-used export, type-only) re-homed inline into its sole consumer `slippage-fee-model.ts`.
- **Left intentionally:** nothing — the symbol-canonicalizer header comment listing `MarketDataCoordinator` was also removed.

**Archive copies:** `1-system-manual/_archive/deleted-code/market-data-ws.ts.20260626-P19B6.7.removed`, `…/market-data-coordinator.ts.20260626-P19B6.7.removed`
**Removal commit:** `d0a40fabc` (P19-B6.7 Step-3 5/N; deployed staging restart#421, CI `28266067266` all-4-green).

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

---

## P19-B6 (2026-06-16) — orphaned `paper-metrics.ts::calculate24hPL()` method

| Removed | File | Detail |
|---|---|---|
| `calculate24hPL()` method | `server/services/paper-metrics.ts` (was lines ~122-166) | A rolling-24h P/L calculator on `PaperMetricsService`. **ZERO live callers** (re-verified: `grep -rE "\.calculate24hPL\(" server/ client/ shared/` → 0; the only hits are old training-data backups under `.claude/worktrees/`). An orphaned remnant of the deleted Phase-8 `risk-manager.ts::calculate24hPL`. |

**Why removed:** rule-18 / §15 — never leave two sources of truth. P19-B6 RESTORES the authoritative rolling-24h loss evaluator at `server/services/daily-loss-budget.ts` (re-homing the deleted Phase-8 `risk-manager.ts::checkKillSwitch` + `calculate24hPL`); this orphan was a stale duplicate that would have been a second, divergent 24h-P&L computation. Deleted in the same batch that establishes the authoritative one.

**Blast-radius verification (certainty-before-cutting):** `.calculate24hPL(` call-site count across `server/`/`client/`/`shared/` = **0**. The method was self-contained (used `storage.getAllPaperTrades` + `this.getPortfolioMetrics`); no other method referenced it. tsc baseline no-regression (bench).

**Archive:** git history (single-method removal within a still-live file — no `.removed` file). Commit: P19-B6 Step-3 service chunk.
**Reviewed by:** Langston Step-4 _pending_.

---

## 2026-06-17 — Dead RTB capacity-block insertion path (P19-B6.5b)

**Removed:** the unused `queueSignal` RTB variant + its input type + the orphaned `storage.insertRtbSignal`.

| Item | Location (pre-removal) | What it was |
|---|---|---|
| `queueSignal()` | `server/core/rtb/ready_to_buy_service.ts` (was ~line 1202, ~90 lines) | The "capacity-block" RTB insertion variant. Wrote via `storage.upsertRtbSignal`. **Distinct from the LIVE admission path** `queueSQESignal` (the only path the orchestrator calls). Also **class-blind** — built `InsertRtbSignal` with no `assetClass`, so reviving it would re-introduce the exact pre-stamp-at-source bug. |
| `RTBSignalInput` interface | `server/core/rtb/ready_to_buy_service.ts` (was ~line 71) | The input type used **only** by `queueSignal`. |
| `insertRtbSignal()` | `server/storage.ts` IStorage decl (~645) + impl (~4005) | Plain insert (no upsert). **Zero callers at all** — `queueSignal` itself used `upsertRtbSignal`, not this. |
| 2 test-mock stubs | `b79-0n-rtb-fsm-isolation.test.ts`, `b79-0n-rtb-isolation.test.ts` | `insertRtbSignal: vi.fn(...)` stubs that mocked the storage method but never called it. Removed with the impl (both test files still pass — 9 tests). |

**Why removed:** rule 18 (never leave legacy lingering) + Langston Q4 delete-on-the-spot ruling (P19-B6.5b Step-2). A class-blind RTB insertion variant lingering is precisely the accidental-re-entry risk rule 18 targets; B6.5b's #320 work hardens the per-class gate, so a parallel un-gated insertion path is exactly what must not survive.

**Blast-radius verification (certainty-before-cutting):** repo-wide grep `server/ client/ shared/ scripts/`: `queueSignal` (excluding the `queueSQESignal` substring) = **definition + 1 doc-comment only, ZERO callers**; `insertRtbSignal` = interface decl + impl + 2 test-mock stubs (no callers). tsc baseline = no regression (bench). Affected isolation tests re-run green (19 tests across the 2 isolation files + the 2 new B6.5b files). Langston Step-4 diff review pending.

**Left intentionally (NOT dead — do not read as a missed sweep):** `storage.upsertRtbSignal` (the LIVE admission writer — `queueSQESignal` uses it); `queueSQESignal` (the live SQE-qualified admission chokepoint, now carrying the B6.5b #320 defense-in-depth guard).

**Archive copy:** `1-system-manual/_archive/deleted-code/p19-b6-5b-rtb-deadcode.removed`
**Removal commit:** _(recorded at P19-B6.5b Step-4/push)_
**Reviewed by:** Langston Step-4 _pending_.

---

## 2026-06-17 — Redundant pattern double-emission loop + fabricated `pattern_*` strategy + leftover `cwqi` column (P19-B6.5c)

**Removed (three items, the two crypto signal→RTB breaks the B6.5b dry-run surfaced):**

| Item | Location (pre-removal) | What it was |
|---|---|---|
| Site-2 pattern emission loop | `server/services/signal-orchestrator.ts` (the `// Convert pattern signals to trade signals and add to queue` `for (const patternSig of patternSignals)` block in `evaluateMarket`, ~L2054-2088) | A second emitter that, for every detected BUY pattern, built a raw signal labeled with the invalid `pattern_*` strategy and **sized it under a hardcoded `'breakout'`** while the label said pattern. Redundant double-emission. |
| `strategy` field on `patternToTradeSignal` | `server/services/pattern-recognizer.ts` (`patternToTradeSignal` return type + `strategy: \`pattern_${pattern.pattern.toLowerCase()}\``) | The origin of the `pattern_abcd / pattern_pinbar / …` values — non-canonical strings outside the `strategy_type` enum. Patterns are TRIGGERS, not strategies, so the recognizer should never have asserted one. Function now returns geometry/confidence only. |
| `rtb_signals.cwqi` column (staging DB) | `rtb_signals` table on staging | A `numeric NOT NULL`-no-default column the code removed long ago (not in `shared/schema.ts`; documented removed in `server/legacy/metrics_archive.ts`). The Drizzle insert no longer sent it → NOT-NULL violation on every row (16,930 dry-run drops, ALL strategies). Dropped via migration `2026-06-17-p19-b6-5c-drop-rtb-cwqi.sql`. |

**Why removed:** the two breaks blocked 100% of crypto signals from reaching the ready-to-buy queue (the B6.5b dry-run proved the front half healthy; ZERO reached RTB). The `pattern_*` value also poisoned `paper_sim_trades.strategy_name` + `trades.strategy` downstream — so the fix is at the source (the recognizer stops asserting a strategy; the orchestrator resolves the CANONICAL consuming strategy via `resolvePatternConsumingStrategy`, exact-match-or-drop). The site-2 loop was redundant: the `activeStrategies` dispatch above it already evaluates every pattern-consuming strategy (morning_star / inside_bar_reversal / support_bounce / pivot_shift / reverse_impulse / defensive_hedge / adaptive_flow / volatility_edge) via `detect*()` fed the matching pattern by `buildPatternInputForStrategy` (B57 routing); the pattern-pool path (site 1) now emits canonically. Canonicalizing the duplicate instead of removing it would double-count (Langston D4).

**Blast-radius verification (certainty-before-cutting):**
- **cwqi (DB-level dependency check, live staging):** no views, no CHECK/FK constraints, no triggers, no generated columns/defaults reference cwqi. The only dependent object — index `rtb_signals_cwqi_idx` — is auto-dropped with the column. Table had 0 rows. Code-side, cwqi appears only in `legacy/metrics_archive.ts` (archival) + tests asserting its removal. Migration uses `DROP COLUMN IF EXISTS` (idempotent); rollback re-adds nullable (documented asymmetry — the original NOT-NULL-no-default was itself the bug).
- **`patternToTradeSignal.strategy` consumers (repo-wide):** the two orchestrator sites (site 1 now uses the resolver; site 2 removed) + `b79-0n-pattern-detect-byte-identity.test.ts` (two `.strategy` assertions updated to geometry-only). VTS + xStock eval-cycle do NOT call `patternToTradeSignal` (they use `selectContextAwareStrategy` directly) — unaffected.
- **Site-2 loop removal:** the `activeStrategies` dispatch (same function, lines ~1689-2040) provides full coverage of pattern-consuming strategies. RTB dedup key is `(mode, symbol, strategy)` (`storage.ts` `upsertRtbSignal` on-conflict) so any pattern-path/quant-path overlap on the same canonical strategy collapses to one row — no double-count after removal.
- **`selectContextAwareStrategy` (shared with VTS/xStock):** UNTOUCHED — the exact-match logic is a strictly-additive sibling (`resolvePatternConsumingStrategy`), so the fallback contract VTS/xStock rely on is unchanged (locked by a regression test).

**Left intentionally (NOT dead):** `selectContextAwareStrategy` (shared fallback resolver, VTS/xStock); `scanPatterns` + the 6 detect functions (pattern DETECTION, unchanged); `patternToTradeSignal` itself (still the geometry converter, now strategy-free); `abcd_long` (a real QUANT strategy — distinct from the ABCD pattern that feeds `volatility_edge`).

**Archive copy:** none — inline orchestrator block + a return-field + a DB column (not whole files); git history is the authoritative archive (per this log's preamble). The cwqi migration + rollback SQL are versioned in `drizzle/migrations/`.
**Removal commit:** _(recorded at P19-B6.5c Step-4/push)_
**Reviewed by:** Langston Step-4 _pending_.

---

## P19 reorg-B2 (2026-06-20) — deprecated hardcoded ROI bounds (Kyle directive; never-leave-legacy rule 18)

| Item | Location (pre-removal) | What it was |
|---|---|---|
| `ROI_MIN` (0.010), `ROI_MAX` (0.040), `ROI_FLEX_MULTIPLIER` (0.6), `FRICTION_SAFETY_BUFFER` (1.1), `ADAPTIVE_THRESHOLDS_CONFIG`, + the `[11.7C][Config]` boot log line | `server/config/adaptive-thresholds.ts` | The original hardcoded ROI-gate bounds + friction buffer. **DEPRECATED since B72 (2026-05-05)**, which migrated the LIVE ROI gate to `module_constants` (`expectancy_gates.roi_absolute_min/max/roi_flex_multiplier/friction_safety_buffer` + `roi_gating.min_roi`). The consts lingered as dead-but-loaded code (still logged at boot). |

**Why removed:** Kyle directive 2026-06-20 — the deprecated bounds must be completely deleted so they can never be accidentally re-wired, especially as reorg-B2 Piece B makes the bounds **per-class in the DB**. Lingering dead constants that shadow the live DB-governed values are exactly the §15 / rule-18 hazard.

**Blast-radius verification (certainty-before-cutting):** repo-wide grep — `server/config/adaptive-thresholds.ts` has **exactly ONE importer**, `server/core/calculations/expectancy.ts` (`:51-53`), importing ONLY `DEFAULT_SLIPPAGE` (kept). The deleted symbols have **ZERO importers** anywhere; their only remaining references are stale doc-comments in `expectancy.ts` (historically accurate). Confirmed by the tsc baseline gate staying GREEN after deletion (no new errors).

**Left intentionally (NOT dead):** `DEFAULT_SLIPPAGE` — still imported by `expectancy.ts`; kept as a re-export from the canonical `exchange-defaults` source.

**Archive copy:** none — a handful of const declarations (not a whole file); git history is the authoritative archive.
**Removal commit:** _(recorded at reorg-B2 Step-3/push)_
**Reviewed by:** Langston Step-4 _pending_ (Discord).

---

## B-DIAG-387 (2026-06-25) — dead xStock filter-diagnostics "reference shape" scaffolding (#387; never-leave-legacy rule 18)

| Item | Location (pre-removal) | What it was |
|---|---|---|
| `byStrategy`, `totalEvaluated`, `totalNulls`, `totalSignals`, `totalRejected`, `totalTrades`, `byReason`, `byRegime` locals | `server/routes.ts` `/api/xstocks/filter-diagnostics` (~L7412-7417, the block self-labeled "declaration scaffolding for the existing reference shape") | Permanently-empty locals. They were only ever no-op fallbacks: `(lt?.X ?? 0) \|\| totalX`, `live[r] ?? byReason[r] ?? 0`, `lt?.map ?? byReason`. |
| `rejectedReasons: { netEvBelowFloor: byReason['net_ev_below_floor'] \|\| totalRejected }` read | same endpoint (~L7846) | **The #386 bug itself** — it read the empty `byReason` map → reported the xStock Net-EV-floor rejection count as `0` forever, which is what fooled CC-B into the retracted #386 "xStock clears EV" claim. |
| `signalRejections: { total: totalRejected, byReason, byRegime }` response field | same endpoint (~L7889) | An always-`{ total:0, byReason:{}, byRegime:{} }` field on the xStock payload. No client consumer. |
| `signalRejections` required-ness on `FilterDiagnosticsData` | `client/src/pages/machine-learning.tsx` (~L173) | Relaxed to optional (NOT deleted) — the **crypto** endpoint still emits a populated `signalRejections`; only xStock stopped. |

**Why removed:** the dead `byReason`/`totalRejected` scaffolding was the direct cause of #386 (a decision-grade dashboard counter reading 0 forever). Per rule 18 it can't be left as commented/orphaned fallbacks where it could mislead again. All consumption now sources from the live `lt`/`ec`/`live` accumulators (the real Net-EV-floor count comes from `nullReasonAggregate['net_ev_rejected']`, written at the single reject site `eval-cycle.ts:716`).

**Blast-radius verification (certainty-before-cutting):**
- **Client consumers (repo-wide grep of `client/src`):** ZERO readers of `.signalRejections` or `.byRegime` for the xStock tab (or any tab) — only the type declaration, now made optional. The real per-reason rejection data is surfaced via `vtsEvaluation` (`rejectedReasons` + `nullReasonDetail` + the per-lane detail maps), which the panel does read.
- **Crypto endpoint UNTOUCHED:** `server/routes/vts.ts` keeps its own populated `signalRejections` (from `getSkippedSignalsSummary`); this removal is scoped to the xStock endpoint only.
- **tsc baseline GREEN after removal** (no new errors above baseline) — confirms no dangling reference to the deleted locals.

**Left intentionally (NOT dead):** `signalRejections` on `FilterDiagnosticsData` (kept optional for the crypto payload shape); the crypto endpoint's `signalRejections` emission; all `lt`/`ec`/`live` accumulator fields (the live source of truth).

**Archive copy:** none — inline endpoint locals + one response field (not a whole file); git history is the authoritative archive.
**Removal commit:** `1c451f5b5`.
**Reviewed by:** Langston Step-4 APPROVED (Discord, 2026-06-25) — the dead-scaffold excision was condition (1) of his approval.

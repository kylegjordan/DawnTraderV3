# P19-B4b.2 — Scope + Pre-Audit (dead paper-fill machinery sweep, RUNNING_ISSUES #300)

**Batch:** P19-B4b.2 · **Date:** 2026-06-16 · **Author:** Claude New (CC-B)
**Run mode:** AUTONOMOUS with Langston (Kyle directive 2026-06-16 — iterate the full 11-step workflow to verified-complete + verified-correct; escalate to Kyle only on no-consensus). This doc combines Step-1 (scope) + Step-2 (pre-audit / SIM + blast-radius) because the batch is a small surgical sweep and the trace below is already pre-audit-grade.
**Sequenced:** BEFORE B7b (PHASE_19_PLAN §1 row, already queued). DORMANT-path only — turns ON no trading, changes no fill behavior.

> 🚨 **§9.1 SCAFFOLDING-VS-FUNCTIONAL:** B4b.2 is a pure dead-code removal. It does NOT add or change any capability. The active paper engine (B4b.1's depth-walk) is untouched. Risk profile = "prove it's dead, then cut," not "build."

---

## 1. Objective

Per rule-18 (never leave legacy lingering — a dead path can accidentally re-enter the live system) + §9.4 (#300 has a named home: this batch), remove the genuinely-dead Phase-8-era paper-fill machine **`realtime-paper-executor.ts`** and its dead order-book read tendrils, so the only paper-fill path left in the codebase is the active `PaperExecutionEngine` depth-walk (B4b.1).

---

## 2. ⚠️ CORRECTED BLAST RADIUS — the directive's "3 clean cuts" framing was inaccurate in 2 places

I re-traced every reference scoped to `server/` (the broad repo grep was polluted by docs/audit-dump copies). Two corrections to the #300 framing recorded in DELETED_COMPONENTS_LOG + the resume note:

**(A) `realtime-paper-executor` is NOT referenced by "only a diagnostic endpoint" — it has THREE live tendrils:**
1. `routes.ts:10937-10971` — `GET /api/execution/metrics` diagnostic endpoint (`realtimePaperExecutor.getStatus()`). **0 client consumers** (no `client/` reference to `execution/metrics`), and it already reads `execStatus.killSwitch` which `getStatus()` no longer returns (stale `undefined` — the secondary kill-switch was removed in REB_8.8.3). Dead diagnostic.
2. `system-health-monitor.ts:288-312` `getExecutionMetrics()` (`realtimePaperExecutor.getStatus()`) → consumed at :261 in the health snapshot. Already best-effort (try/catch → `'N/A'` defaults). Every value it pulls is independently available from `executionTiming` / `mdCoordinator` / `rateControl` directly (the executor's `getStatus()` is a pure pass-through wrapper of those three).
3. Constructor side-effect (`realtime-paper-executor.ts:44-47`): on import, the singleton registers an `mdCoordinator.on('tick')` listener that maintains `slippageFeeModel.updatePriceHistory()`. `slippageFeeModel` is consumed only by `realtime-paper-executor` (dying) + `pre-execution-validator` (#297, deferred) — so this listener is dead-path-only; it dies cleanly with the file. (Note for #297: when pre-execution-validator is eventually exercised, slippage price-history will no longer be auto-populated — but pre-execution-validator is itself dormant until #297's intent-executor exists.)
   - `executeTrade()` itself = **0 callers** (the two `.executeTrade(` grep hits are `trading-engine`'s OWN method and a different `engine` object). `recordPaperTrade()` was never even finished (`:216` "just log - will integrate with storage in next step"). Genuinely dead.

**(B) The "dup 2nd-WS-book path" is NOT a clean cut — the modules are LIVE shared infrastructure; only the order-book SUB-PATH is dead, AND the book channel is load-bearing for a live tick stream:**
- `market-data-coordinator` is imported by `feed-integrity-monitor`, `health-monitor`, `parity-gate` (+ the dying executor). `market-data-ws` is imported by `feed-integrity-monitor`, the coordinator, and a **type-only** import in `slippage-fee-model` (`OrderBookSnapshot`). The 3 live consumers all use `getStatus()` / tick-level data — **none touch order books** (verified). So the modules + their types STAY.
- DEAD sub-path: `coordinator.getLatestOrderBook()` (only caller = dying executor) + `latestOrderBooks` Map + the `wsClient.on('orderbook')` handler that fills it; the coordinator's re-`emit('orderbook')` has **zero listeners**. In `market-data-ws`, the `this.emit('orderbook', snapshot)` (:205) + the snapshot object (:197-202) feed only that dead coordinator path.
- ⚠️ **Entanglement caught:** the WS `book`-channel handler ALSO emits a midpoint `'tick'` (:207-221) for "stable pricing." So the `book` SUBSCRIPTION is NOT removable — it's load-bearing for the live midpoint tick stream. Only the dead `'orderbook'` emission + the coordinator's order-book storage/accessor are removable. The directive's "feeds only the dead executor + diagnostics" was wrong on this point.

**(C) NEW finding to HOME separately (§9.4) — DO NOT fold into B4b.2:** `coordinator.subscribeToPair` has **zero production callers** (grep: only the coordinator's internal delegation + the WS reconnect re-subscribe loop). So the 2nd Kraken WS connects but **subscribes to no pairs** → its ticker AND book streams are dead in production, and its 3 monitors observe an idle connection. The whole `MarketDataCoordinator` + `MarketDataWebSocket` subsystem looks **vestigial**, superseded by `kraken-websocket-adapter` (the real live WS that B4b.1's `getBookForFill` reads). Removing it is a *separate* audit (must trace the 3 monitors' actual liveness first). **Proposed home: a NEW RUNNING_ISSUES item (#301), not B4b.2.** Folding it in would be scope creep + violate certainty-before-cutting.

---

## 3. Proposed cut set (precise, surgical)

**TIER A — confirmed-clean (the genuine dead paper-fill machine):**
- **A1.** DELETE `server/services/realtime-paper-executor.ts` (whole file → archive to `_archive/deleted-code/realtime-paper-executor.ts.removed`, log in DELETED_COMPONENTS_LOG).
- **A2.** `routes.ts` — DELETE the dead `GET /api/execution/metrics` endpoint (:10937-10971). **Rationale:** 0 client consumers, stale `killSwitch` ref, only reason it imports the executor. *(Open Q1 — alternative is reroute; I recommend delete.)* The adjacent `/api/execution/timing/export` (:10973) imports `executionTiming` directly, NOT the executor — it STAYS untouched.
- **A3.** `system-health-monitor.ts` — REROUTE `getExecutionMetrics()` to read directly from `getMarketDataCoordinator().getStatus()` + `executionTiming.getMetrics()` + `rateControl.getStatus('private')` (drop the executor wrapper + its import at :4). Keeps the health-snapshot `execution` block + its shape + the try/catch identical; only removes the dead indirection. *(Open Q2 — alternative is remove the execution block entirely; I recommend reroute to avoid changing the health snapshot shape, which I have not confirmed is UI-absent.)*

**TIER B — dead order-book sub-path (surgical, inside live modules):**
- **B1.** `market-data-coordinator.ts` — remove `latestOrderBooks` Map (:20), the `wsClient.on('orderbook')` handler (:62-65), `getLatestOrderBook()` (:133-138), and the now-unused `OrderBookSnapshot` import. KEEP everything else (tick handling, getStatus, fallback monitor, subscribe/unsubscribe — all live).
- **B2.** `market-data-ws.ts` — remove ONLY the dead `this.emit('orderbook', snapshot)` (:205) + the `snapshot` object construction (:197-202). KEEP the `book`-channel subscription, the stateful mini-book, the midpoint-`'tick'` emission (:207-221), and the `OrderBookSnapshot` interface export (`slippage-fee-model` type-imports it). *(This is the conservative read of "certainty before cutting" — the subscription stays because it feeds live midpoint ticks.)*

**STAYS (per directive + trace):**
- `slippage-fee-model.ts` `calculatePriceImpact` — golden-test reference; its parent module is still imported by `pre-execution-validator` (#297) + `routes.ts`. No change. (Removal gated on #297 + this batch both landing; not met yet.)
- `pre-execution-validator.ts` — LEAVE (#297; its only non-diagnostic caller is #297's intent-executor).

---

## 4. Verification plan
- Bench: copy changed files to `C:\dev`, `node scripts/check-tsc-baseline.mjs` (must be no-regression — removals should DROP error count or hold) + `npx vitest run` (confirm no suite imported the removed file; the golden `depth-walk.test.ts` is comment-only on `calculatePriceImpact`, unaffected). Update/remove any test that referenced the deleted endpoint or executor (expect none).
- CI all-4-green on the head commit. Deploy to staging, HTTP 200, clean boot (no missing-module / undefined-route errors), confirm `GET /api/execution/metrics` now 404s (removed) and the health snapshot still renders its execution block.
- §9.3 staging UI not strictly required (no UI change intended) — but I'll confirm the health/diagnostics surface didn't regress.

## 5. Governance (bounded)
- SIM §2992 (B-4.5 fee model) caller list `pre-execution-validator + realtime-paper-executor` → `pre-execution-validator` only. SIM §3006 (AMR gates) downstream `paper-execution-engine + realtime-paper-executor` → drop the RT consumer + its known warns-and-skips asymmetry note. SIM registry / §9.14 note the dead-path removal.
- System Manual §7 (`:487` Status line) — drop `realtime-paper-executor` from "ACTIVE in the dormant ... paths"; leave `pre-execution-validator` (#297).
- Tier-1: BATCH_CATALOG, PHASE_HISTORY (plain-language), PHASE_19_PLAN §1 (B4b.2 → done) + §5, RUNNING_ISSUES (#300 RESOLVED + #301 NEW vestigial-subsystem), DELETED_COMPONENTS_LOG (A1/A2/B1/B2 + "left intentionally": calculatePriceImpact, pre-execution-validator, the market-data-ws book subscription), MEMORY (4-way).

---

## 6. Questions for Langston
- **Q1:** `GET /api/execution/metrics` — DELETE the dead endpoint (my rec: 0 consumers, stale field) vs reroute it to the underlying services? Either way it stops importing the executor.
- **Q2:** `system-health-monitor.getExecutionMetrics()` — REROUTE to the 3 underlying services (my rec, preserves snapshot shape) vs remove the execution block? Do you know offhand if the health snapshot's `execution` block is UI-surfaced?
- **Q3:** Concur that the vestigial `MarketDataCoordinator`/`MarketDataWebSocket` subsystem (zero `subscribeToPair` callers → idle 2nd WS) is OUT of B4b.2 and homed to a NEW #301 for a separate liveness-then-remove audit? Or do you want it in-scope here?
- **Q4:** Concur B2 keeps the `book` subscription (load-bearing for the midpoint tick) and removes only the dead `'orderbook'` emission? Or is even that midpoint-tick path dead given C (no subscriptions) — in which case it folds into #301, not here?

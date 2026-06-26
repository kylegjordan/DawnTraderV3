# P19-B6.7 — Scope

change-class: architecture

**Batch:** P19-B6.7
**Author:** Claude New (CC-B)
**Date:** 2026-06-26
**Phase:** 19 (turn paper-mode active trading back ON)
**Issues:** #301 (vestigial 2nd WebSocket), #396 (feed/scanner errors)
**Predecessor context:** P19-B4b.2 / #300 already removed the dead order-book SUB-PATH of this subsystem; B6.7 removes the REST.

---

## 1. Why this batch (the real stakes — not cosmetic)

The system carries a **second, vestigial Kraken WebSocket** (`server/services/market-data-ws.ts`, "Directive 8.9.0-B Secondary Adapter," wrapped by `server/services/market-data-coordinator.ts`). It is **separate from the primary `kraken-websocket-adapter.ts`** that actually feeds trading/VTS/price-cache. Pre-audit established, certainty-grade:

- **It has never worked.** `MD-WS_TICK: 0` and `Sub OK: 0` across the entire logged history (Apr 3 → now). It has never delivered a single tick or completed a single subscription.
- **It live-spams now.** `[MD-WS] Data stale: ~30000ms` every 30 s (heartbeat interval 30 s vs stale threshold 2 s; `lastTickTimestamp` only bumped by pongs → the stale check trips on every heartbeat). Confirmed firing in the live PM2 stream this session.
- **It poisons the safety/health layer.** Because the dead socket keeps a TCP connection open (it just never receives data), `wsConnected = true`, so every consumer that reads its status reports it as **connected/healthy — a false all-clear**:
  - **`feed-integrity-monitor`** is **boot-started** (`server/index.ts:603`), runs **every 5 min** (`feed-integrity-auto-check.ts` cron `*/5 * * * *`), grades the dead feed, and calls `AlertsService.createAlert(alertType:'feed_health', severity:'critical')` when tick-age ≥ 10 s. It is **currently masked only by dormant-mode suppression** (active trading OFF). **Phase 19's whole job is to turn active trading ON — the moment it does, suppression lifts and this fires false CRITICAL feed-health alerts every 5 minutes off a dead feed.** This is a Phase-19 landmine, not cosmetics.
  - **`parity-gate`** (the paper→live go-live readiness gate) computes WS uptime from the dead socket's `wsConnected`/`reconnects` (`parity-gate.ts:85-94`) → reads ~100 % uptime → **false-PASSES** the go-live WS check on a dead feed. Latent Phase-21 hazard.
  - **`system-health-monitor`** + **`health-monitor`** report the dead socket's `dataSource`/`lastTickAgeMs`/`connected` in execution + market-data health (telemetry; passive but misleading).

Separately, **#396** logged ~35 k feed errors. Pre-audit split them: **"Data stale" (10.2 k) is the live 2nd-WS heartbeat spam** (removed by this batch); **"Sub Error: Method(s) not found" (14.6 k) is historical** (pre-#300, when subscribes were still wired; the current build has zero `subscribeToPair` callers). The **"Underfilled batch 43/300" (9.8 k)** is a **genuinely separate** scanner-universe issue (OBJ-4 below).

---

## 2. Objectives + verification criteria

### OBJ-1 — Remove the vestigial second WebSocket subsystem (#301)
Delete `server/services/market-data-ws.ts` and `server/services/market-data-coordinator.ts` (§15 legacy-disposition: delete-on-the-spot — full caller trace complete, see OBJ-2/3; archive to `_archive/deleted-code/` with `.removed` suffix + `DELETED_COMPONENTS_LOG.md` entry). Re-home the one still-used export `OrderBookSnapshot` (type-only-imported by `slippage-fee-model.ts:1`) into a surviving types location.
**Verify:** `tsc --noEmit` clean (no dangling references); `grep` shows zero live references to `getMarketDataWS`/`getMarketDataCoordinator`/`MarketDataWebSocket`/`MarketDataCoordinator` outside the archive; `slippage-fee-model` still type-checks against the re-homed `OrderBookSnapshot`.

### OBJ-2 — Re-point the status-consumers at the PRIMARY feed (clean, no shim)
Re-point `parity-gate.ts:78`, `health-monitor.ts:523`, `system-health-monitor.ts:294` (and feed-integrity-monitor per OBJ-3) at the primary `krakenWebSocketAdapter` health surface (`getStatus()` / `getDiagnostics()` / `getI8EWsHealth()` / `get90HealthMetrics()`). Drop the REST-fallback dimension (`dataSource`/`usingFallback`) — coordinator-only concept belonging to the dead subsystem; **no shim** (a "primary, not-falling-back" stub is lingering legacy, rule 18). **Per-consumer aggregate (Langston+CC-A guardrail):** the per-symbol tick-age must be aggregated **worst-case**, NOT "any symbol fresh" (that re-creates the symbol-level false-all-clear). Safety gates (parity-gate) use a conservative proportion-of-subscribed-symbols-fresh; a pure status display may use freshest-symbol but must say so. **Verify none of the consumers BRANCH on `usingFallback`** (§9.3 trap: each must render a sensible health state off the new shape, not undefined-as-blank).
**Verify (critical):** unit test that `parity-gate`'s WS check PASSES on a healthy primary adapter and BLOCKS on a stale/disconnected primary adapter — the dead-feed false-PASS (a dangerous Phase-21 go-live hazard) is gone. parity-gate re-point is IN B6.7 (not deferred).

### OBJ-3 — Re-point feed-integrity-monitor so the feed-health ALARM survives + watches the real feed
**Decision (Langston+CC-A, evidence-locked): RE-POINT, do not retire.** Pre-audit trace proved feed-integrity-monitor is the **SOLE** component that escalates feed staleness to an operator alert (`createAlert(feed_health, critical)`); nothing else alerts on primary-feed staleness. The primary adapter MEASURES real per-symbol tick-age (`getI8EWsHealth().ageMs/isStale`) but raises no alarm off it. So re-point feed-integrity-monitor to grade off the primary adapter's REAL tick-age — retiring it would remove the only feed-health alarm exactly as Phase 19 turns active trading ON. Confirm the dormant-mode suppression key (`tradingStateSync.isEngineActive` — trading-active state, NOT a feed/symbol id) is unaffected by the deletion.
**Verify (the actual Phase-19 unblock — explicit TESTED objective):** stale LIVE primary feed → a real critical `feed_health` alert FIRES; fresh primary feed → SILENT. Prove both directions; do not merely remove the dead feed.

### OBJ-4 — Instrument the scanner short-universe underfill (#396) — telemetry ONLY in B6.7
`market-scanner.ts:556-567` builds `allPairs` from `getTicker()` ⋈ `getTradablePairs()` filtered by `p.pairInfo`; the refill at :592-608 tops up FROM `allPairs`, so it cannot rescue a short universe. The "43/300" = the universe fetch itself short (transient REST hiccup vs. `pairInfo` join dropping keys). **B6.7 ships PURE telemetry only** (no behavior change, no blast-radius expansion): when `krakenUniverseSize < BATCH_SIZE`, log which of the two REST calls was short + the join-drop count, so the root cause is captured from live data. **The FIX itself is a separate named home — P19-B6.9** (B6.8 is taken by the per-mode guardrail batch), closed when the captured evidence justifies it. OBJ-4 must NOT block or hold OBJ-1..3 (the Phase-19 landmine ships on its own timeline).
**Verify:** instrumentation lands as pure telemetry + captures ≥1 real short-universe event with attribution; the fix is homed at P19-B6.9 in RUNNING_ISSUES (#396).

### OBJ-5 — Governance (the deferred doc updates land here)
SIM (add vestigial-deletion note for the 2nd-WS singletons + the consumer re-point; the Liveness Registry currently does not name them), System Manual (market-data feed-health architecture change), DELETED_COMPONENTS_LOG, RUNNING_ISSUES (#301 RESOLVED, #396 dispositioned), PHASE_19_PLAN §1/§5, BATCH_CATALOG, PHASE_HISTORY, completion report. Plus the roadmap/plan updates Kyle deferred from the B6.7-fold-in decision.
**Verify:** governance-checker (architecture doc-set) green for P19-B6.7.

---

## 3. Design decisions — RESOLVED (Langston + CC-A consensus, 2026-06-26)

**A. Re-point shape → CLEAN re-point, NO shim.** Drop `dataSource`/`usingFallback` (no fallback feed exists to switch to; a stub is lingering legacy, rule 18). Aggregate per-symbol tick-age **worst-case, per-consumer** (safety gates conservative; display may use freshest, stated). Verify no consumer branches on `usingFallback`. → folded into OBJ-2.

**B. feed-integrity-monitor → RE-POINT (not retire).** Trace proved it is the SOLE feed-health alarm; the primary adapter measures tick-age but raises no alert. Retiring = shipping a hole right as Phase 19 goes active. Re-point it at the primary adapter's real tick-age + a tested stale-feed→alarm objective. → folded into OBJ-3.

**C. OBJ-4 → instrument (telemetry only) in B6.7; FIX = its own home P19-B6.9.** Must not block OBJ-1..3. → folded into OBJ-4.

**§15 order (CC-A):** re-point all consumers FIRST → `tsc` prove zero dangling refs → THEN delete both files + DELETED_COMPONENTS_LOG + `_archive`. Re-run the 0-tick-consumer / 0-`subscribeToPair` blast-radius grep at Step-4 diff time, not just pre-audit.

---

## 4. Out of scope
- The #395 `setNullReason` return-value refactor (separate future item).
- Any change to the primary `kraken-websocket-adapter` beyond reading its existing public health API.
- Turning active trading ON (that is the broader Phase-19 work; B6.7 removes a blocker).

---

## 5. Workflow
Full 11-step. Bench (tsc baseline + vitest) before push; CI all-4-green before deploy; Langston Step-1 (this scope), Step-2 (pre-audit `P19_B6_7_PRE_AUDIT.md`), Step-4 (diff before push — §15 blast-radius trace), Step-8 (second-pass verify). Deploy + restart; confirm the `[MD-WS] Data stale` 30 s spam is gone from the live stream post-deploy.

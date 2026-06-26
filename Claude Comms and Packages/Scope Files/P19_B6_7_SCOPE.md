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

### OBJ-2 — Re-point the 4 status-consumers at the PRIMARY feed
Re-point `parity-gate.ts:78`, `health-monitor.ts:523`, `system-health-monitor.ts:294`, and `feed-integrity-monitor.ts:97-98` at the primary `krakenWebSocketAdapter` health surface (`getStatus()` / `getDiagnostics()` / `getI8EWsHealth()` / `get90HealthMetrics()`), per the design decision in §3. The REST-fallback dimension (`dataSource`/`usingFallback`) is dropped — it was a coordinator-only concept belonging to the dead subsystem; the real feed is the primary adapter.
**Verify (the critical one):** `parity-gate`'s WS-uptime check now reflects the REAL trading feed — prove with a unit test that a healthy primary adapter passes and a stale/disconnected primary adapter blocks; the dead-feed false-pass is gone. The other three report primary-adapter health.

### OBJ-3 — Kill the feed-health landmine before Phase 19 flips active trading on
Either re-point `feed-integrity-monitor` at the primary adapter, OR retire it as redundant with the primary adapter's own health surface (§3 design question B). Whichever path: after this batch, with active trading ON, the system must NOT raise `feed_health` alerts sourced from a dead/again-nonexistent secondary feed.
**Verify:** with active trading ON (or dormant-suppression bypassed in a test), no `feed_health` critical alert is produced from a feed other than the primary adapter; the grading inputs (reconnects, tick-age, uptime) trace to the primary adapter.

### OBJ-4 — Root-cause the scanner short-universe underfill (#396, separate)
`market-scanner.ts:556-567` builds `allPairs` from `getTicker()` ⋈ `getTradablePairs()` filtered by `p.pairInfo`; the refill at :592-608 tops up FROM `allPairs`, so it cannot rescue a short universe. The "43/300" cases are the **universe fetch itself** coming back short (transient REST hiccup vs. the `pairInfo` join dropping keys). Add **instrumentation** that, when `krakenUniverseSize < BATCH_SIZE`, logs which of the two calls was short and the join-drop count — so the root cause is captured from live data — then fix the identified cause (e.g. retry/validate the universe fetch, or fix the join). 
**Verify:** instrumentation lands and captures ≥1 real short-universe event with attribution; the fix is justified by that captured evidence (not speculative). If root-causing proves to need a longer soak, OBJ-4 may split into its own follow-up sub-batch (flagged to Kyle) rather than hold OBJ-1..3.

### OBJ-5 — Governance (the deferred doc updates land here)
SIM (add vestigial-deletion note for the 2nd-WS singletons + the consumer re-point; the Liveness Registry currently does not name them), System Manual (market-data feed-health architecture change), DELETED_COMPONENTS_LOG, RUNNING_ISSUES (#301 RESOLVED, #396 dispositioned), PHASE_19_PLAN §1/§5, BATCH_CATALOG, PHASE_HISTORY, completion report. Plus the roadmap/plan updates Kyle deferred from the B6.7-fold-in decision.
**Verify:** governance-checker (architecture doc-set) green for P19-B6.7.

---

## 3. Open design decisions for Langston (Step-1/2 consensus)

**A. Re-point shape.** The primary adapter exposes richer, PER-SYMBOL health (no global `lastTickAgeMs`, no `dataSource`/`usingFallback`). Recommendation: re-point consumers at the primary adapter and (i) drop the now-meaningless fallback dimension, (ii) derive a single "feed fresh?" signal from an aggregate of `getI8EWsHealth()` (e.g. freshest-symbol age, or "any subscribed symbol fresh within N s"). Agree, or keep a thin coordinator-shaped shim?

**B. feed-integrity-monitor: re-point vs retire.** Its purpose is feed-health grading + alerting. The primary adapter already self-monitors (`getDiagnostics`, `getI8EWsHealth`, `get90HealthMetrics`, `isHealthy`). Is feed-integrity-monitor **redundant** (→ retire under §15) or does it add value the primary adapter lacks (→ re-point)? This is the "does it duplicate an existing component?" check. My lean: re-point only if it adds a distinct alerting/grading capability; otherwise retire. Want your read before I build.

**C. OBJ-4 split.** Acceptable to keep OBJ-4 as an instrument-now / fix-when-attributed objective inside B6.7, splitting to a follow-up only if the root cause needs a multi-day soak? Or carve it out from the start?

---

## 4. Out of scope
- The #395 `setNullReason` return-value refactor (separate future item).
- Any change to the primary `kraken-websocket-adapter` beyond reading its existing public health API.
- Turning active trading ON (that is the broader Phase-19 work; B6.7 removes a blocker).

---

## 5. Workflow
Full 11-step. Bench (tsc baseline + vitest) before push; CI all-4-green before deploy; Langston Step-1 (this scope), Step-2 (pre-audit `P19_B6_7_PRE_AUDIT.md`), Step-4 (diff before push — §15 blast-radius trace), Step-8 (second-pass verify). Deploy + restart; confirm the `[MD-WS] Data stale` 30 s spam is gone from the live stream post-deploy.

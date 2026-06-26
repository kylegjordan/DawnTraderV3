# P19-B6.7 — Completion Report

**Batch:** P19-B6.7 · **change-class:** architecture · **Owner:** Claude New (CC-B) · **Date:** 2026-06-26
**Issues:** #301 (vestigial 2nd WebSocket — RESOLVED) · #396 (feed/scanner errors — telemetry shipped; fix homed P19-B6.9)
**Deploy:** staging restart **#421**, HTTP 200, migration applied (**5 `module_constants` rows under `module_name='feed_health'`** — NOT a `feed_health` table; per-class warning/critical age + xStock warmup grace, `updated_by p19-b6-7`) · **CI:** run `28266067266` all-4-GREEN on head `b337ede36`
**Langston:** Step-1 / Step-2 / Step-4 (APPROVE w/ 2 fixes, both folded) / Step-8 (independent PASS) ✅

> ⚠️ **RUNTIME-PROVEN SCOPE (Langston Step-8 §5 caveat, recorded honestly):** this batch is **deploy-proven + structurally-proven + bench-tested**, NOT live-alarm-runtime-proven. The DELETION + re-point + the 30s `[MD-WS] Data stale` spam removal ARE live/functional now. The new feed-health **ALARM logic** (per-class freshest-age grade, market-hours gate, warmup grace, staleness sentinel) is **DORMANT** on staging — `[FeedIntegrity:auto]` skips under dormant mode (active trading OFF), so the alarm path is exercised only by the 27 unit tests + structural reasoning, and will first run end-to-end when Phase-19 turns active trading ON (§9.1 forward-instrumentation).

---

## Objectives

| # | Objective | Status | Evidence |
|---|---|---|---|
| OBJ-1 | Remove the vestigial 2nd WebSocket subsystem | **YES** | `market-data-ws.ts` + `market-data-coordinator.ts` deleted → `_archive/deleted-code/*.20260626-P19B6.7.removed` + DELETED_COMPONENTS_LOG; `OrderBookSnapshot` re-homed inline into `slippage-fee-model.ts`; `tsc --noEmit` clean POST-delete (zero dangling); repo-wide grep clean. |
| OBJ-2 | Re-point the status-consumers at the PRIMARY feed (no shim, drop fallback dim) | **YES** | parity-gate / health-monitor / system-health-monitor re-pointed at `krakenWebSocketAdapter` via the tested `assessWsReadiness` / `freshestSymbolAgeMs`; no consumer branches on the dropped `usingFallback`. parity-gate dead-feed false-PASS killed (unit-tested both directions). |
| OBJ-3 | Re-point feed-integrity so the feed-health ALARM survives + watches the real feed | **YES (dormant)** | `gradePerClassFeedLiveness` — per-class freshest-age; xStock per-symbol `isXstockMarketOpenUTC` gate + post-open warmup grace + market-closed suppression; latency = smoothed `avgHeartbeatLatency` proxy; null-driven-critical staleness sentinel. 27 tests incl. pos/neg(real illiquid cadence)/silent/market-closed/half-day/warmup/warmup-expiry. DB per-class thresholds = 5 `module_constants` rows under `module_name='feed_health'` (no table). Live alarm exercised at Phase-19 turn-on. |
| OBJ-4 | Instrument the #396 scanner short-universe underfill (telemetry only) | **YES** | `market-scanner.ts` logs `getTicker`/`getTradablePairs`/pairInfo-join-drop attribution when `krakenUniverseSize < BATCH_SIZE`. Pure telemetry, no behavior change. **The FIX is homed P19-B6.9.** |
| OBJ-5 | Governance | **YES** | SIM (S21 + 2.1.1 + 2nd-WS removal), System Manual (§16 per-class alarm architecture + §8 REMOVED), DELETED_COMPONENTS_LOG, BATCH_CATALOG, PHASE_HISTORY, PHASE_19_PLAN §1/§5, RUNNING_ISSUES (#301 RESOLVED, #396 + uptime-trap homed P19-B6.9), this report, MEMORY (CC-B + Langston). |

## Headline result (verified)
The **30s `[MD-WS] Data stale` spam is structurally GONE** — the emitter lived in the deleted `market-data-ws.ts` heartbeat. Proof (Langston Step-8, independent): last MD-WS line frozen at 21:25:59 (pre-restart), out.log flowed clean to 21:30:10 — a ~4m10s dead window where ~8 lines would have appeared at the 30s cadence; 0 in the last 200 lines. The **Phase-19 false-CRITICAL landmine is removed** (the alarm no longer grades a dead feed) and the **Phase-21 go-live false-PASS is killed** (parity-gate requires real freshness, not just a connected socket).

## Langston Step-4 fixes (both folded, in the deployed build)
1. **Latency source** → `getHealthMetrics().avgHeartbeatLatency` (smoothed inter-heartbeat-interval proxy, orthogonal to liveness, clear of the 2s warning boundary). Framing corrected: it is a PROXY, not true RTT (Kraken v2 heartbeats are server-pushed); the old TODO is NOT claimed fixed.
2. **Null-driven-critical staleness sentinel** — a dead feed (no symbol ever ticked) now reports the class critical threshold as `stalenessSec`, not a misleading `0s`.

## Follow-ups homed (§13)
- **P19-B6.9** (new): the #396 scanner short-universe FIX (after the telemetry attributes the cause) **+** the parity-gate uptime-from-cumulative-`reconnectAttempts` trap (Langston Step-4 — a long-lived process could spuriously fail the Phase-21 go-live gate; re-base/window before go-live).

## Governance files changed
`SYSTEM_IMPACT_MAP.md` (S21 + 2.1.1), `SYSTEM_MANUAL.md` (§16 + §8), `DELETED_COMPONENTS_LOG.md`, `BATCH_CATALOG.md`, `PHASE_HISTORY.md`, `PHASE_19_PLAN.md` (§1/§5), `RUNNING_ISSUES.md` (#301/#396/uptime-trap), `drizzle/migrations/2026-06-26-p19-b6-7-feed-health-seed.sql` (+MANIFEST), `MEMORY_CC_B.md` (+ Langston MEMORY), this report + scope/pre-audit/change-list.

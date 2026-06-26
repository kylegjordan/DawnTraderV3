# P19-B6.7 — Pre-Implementation Audit (Step 2)

change-class: architecture
**Batch:** P19-B6.7 · **Author:** Claude New (CC-B) · **Date:** 2026-06-26
**Method:** direct code reads + live-runtime probes (PM2 stream, pm2 logs) + SIM read + 2 Explore sub-agent traces, cross-verified by hand on the load-bearing claims.

---

## A. SIM + System Manual consultation (mandatory)

**SIM "Cross-Cutting Runtime State, Singletons & Liveness Registry":**
- `S2` (`covarianceEngine.returnHistory`), `S5/S14` (`restRateLimiter`, `UnifiedPriceCache`) — market-data feed state, tagged 🟢 PER-MODE-SAFE / mode-invariant (`SYSTEM_IMPACT_MAP.md:94-95`).
- `P19-B4b.1` (`SYSTEM_IMPACT_MAP.md:70`) registers the **primary** adapter's `KrakenWebSocketAdapter.bookUpdatedAt: Map<symbol,ms>` as mode-invariant fill-warmth state.
- **GAP:** the **secondary** subsystem (`market-data-coordinator.ts`, `market-data-ws.ts`) is **NOT named** in the registry, despite being process-global singletons. Per the registry's own rule ("any batch that adds/removes/re-keys a module-singleton MUST update this registry in the same batch"), B6.7 must record the removal. → OBJ-5.
- System Manual: the market-data feed-health architecture is in scope (a feed source + its health monitors change). → OBJ-5 System Manual update.

No scope/manual contradiction found.

## B. The vestigial subsystem — definitive liveness evidence

- **`server/services/market-data-ws.ts`** — "Directive 8.9.0-B Secondary WebSocket Adapter," singleton `getMarketDataWS()` (:401). Subscribes ticker+book (`:255-276`), emits `'tick'` (`:138`, `:218`), heartbeat 30 s (`:313`), stale threshold 2 s (`:59`).
- **`server/services/market-data-coordinator.ts`** — singleton `getMarketDataCoordinator()` (:190), wraps the WS, adds REST-fallback bookkeeping (`usingFallback`), forwards `'tick'` (`:50`), exposes `getStatus()` (`:154`).
- **Liveness (runtime probe, certainty-grade):** across the full logged history (out.log Apr 3 → now), **`MD-WS_TICK` count = 0** and **`Sub OK` count = 0**. The secondary feed has **never delivered a tick or completed a subscription since April.** It is unambiguously dead.
- **Current live spam:** PM2 live stream shows `[MD-WS] Data stale: ~29974ms` + `[MD-Coordinator] WebSocket data stale` every 30 s. Mechanism: heartbeat fires every 30 s; `lastTickTimestamp` is only bumped by pongs (~30 s apart); so `ageMs ≈ 30 000 > 2 000` on every heartbeat → guaranteed stale emit. (Note: the `~/.pm2/logs/dawntrader-error.log` file is a rotated stub — read the live stream via `pm2 logs --nostream`, not that file.)

## C. Blast-radius trace (the §15 cut certainty)

**Consumers of the secondary subsystem — exhaustive (`grep` over server/client/shared):**
| Consumer | Site | Uses | Disposition |
|---|---|---|---|
| parity-gate | `parity-gate.ts:78-94` | `getStatus().wsConnected/wsReconnects` → WS-uptime go-live gate | re-point to primary adapter (OBJ-2) |
| feed-integrity-monitor | `feed-integrity-monitor.ts:97-98` | holds `coordinator` + `ws`; `recordSnapshot()` reads both | re-point OR retire (OBJ-3, §3-B) |
| health-monitor | `health-monitor.ts:523-540` | `getStatus()` → market-data health | re-point to primary adapter (OBJ-2) |
| system-health-monitor | `system-health-monitor.ts:294` | `getStatus().dataSource/lastTickAgeMs` → exec metrics | re-point to primary adapter (OBJ-2) |
| slippage-fee-model | `slippage-fee-model.ts:1` | **type-only** import of `OrderBookSnapshot` | re-home the interface (OBJ-1) |

- **Tick-output consumers (`coordinator.on('tick')` / `getLatestTick` / `getDataSource`): ZERO.** The `'tick'` emission is dead-ended (the only historical consumer, the realtime-paper-executor, was deleted in #300/B4b.2 — this overturns #300's note that the midpoint-tick was "load-bearing").
- **`subscribeToPair` callers: ZERO.** The current build never drives a subscription → so the historical "Sub Error: Method(s) not found" (14.6 k, #396) are **pre-#300 residue**, not current.
- **Conclusion:** all four live consumers read `getStatus()` only. Removing the subsystem requires re-pointing exactly these four + re-homing one type. No trading/VTS/price-cache/order-routing path touches it.

## D. Why every consumer mis-reads the dead feed (the false all-clear)

The dead socket keeps its TCP connection open (it just never receives data), so `isConnected = true` → `getStatus().wsConnected = true`:
- **parity-gate** (`:85-94`): `wsUptimePercent = wsConnected ? (1 - reconnects/checks)*100 : 0` → reads ~100 % → **false-PASSES** the go-live WS gate on a dead feed (latent Phase-21 hazard).
- **health-monitor** (`:527`): `wsConnected → 'connected', ok:true` → **false healthy**.
- **system-health-monitor** (`:294-305`): reports dead `dataSource:'ws'` + stale `lastTickAgeMs` in exec metrics (passive, misleading).

## E. The Phase-19 landmine (B6.7's real importance)

- `feed-integrity-monitor` is **boot-started**: `server/index.ts:603 registerFeedIntegrityJob()` → `feed-integrity-auto-check.ts` cron `*/5 * * * *` (:249) + initial check at +30 s.
- Each run, `recordSnapshot()` (`feed-integrity-monitor.ts:299`) reads `this.coordinator.getStatus()` + `this.ws.getAndResetReconnectCount()` (the DEAD feed), grades A–F (`categorizeHealthBySpec` :225, critical when `tickAgeSec ≥ 10`), and on warning/critical calls `AlertsService.createAlert({alertType:'feed_health', severity:'critical'})` for admin users (`feed-integrity-auto-check.ts:137-154`).
- **Currently masked** by dormant-mode suppression (`:102-132`): when no trading is active (paper AND live both off), user-facing alerts are suppressed. **Phase 19's job is to turn active trading ON → suppression lifts → false CRITICAL `feed_health` alerts every 5 min off a feed dead since April.** This is the concrete Phase-19 blocker B6.7 removes.

## F. Re-point target (primary adapter) + the gaps

Primary `krakenWebSocketAdapter` — singleton export `kraken-websocket-adapter.ts:3244`:
- `getStatus()` (:1625) → `{isConnected, isConnecting, subscribedCount, pendingCount, reconnectAttempts, healthy}`
- `getDiagnostics()` (:1378) → `{wsConnected, reconnectAttempts, lastPongAgeMs, staleSymbols[], averageIntervalMs, …}`
- `getI8EWsHealth()` (:1557) → per-symbol `{ageMs, isStale, ticksPerMinute, …}`; `getPerSymbolTimingStats()` (:1430) → per-symbol `lastTickAgeMs`; `isHealthy()` (:1338); `get90HealthMetrics()` (:3237).
- **Gaps vs the secondary `getStatus()`:** (i) NO `dataSource`/`usingFallback` — REST-fallback was a coordinator-only abstraction belonging to the dead subsystem; (ii) tick-age is PER-SYMBOL, not a single global. → design decision §3-A: drop the fallback dim; derive one freshness signal from a `getI8EWsHealth()` aggregate (e.g. "any subscribed symbol fresh within N s," or freshest-symbol age).

## G. "Does it duplicate an existing component?" check → RE-POINT (resolved, evidence-locked)

The deciding question (CC-A): does the primary adapter measure ACTUAL per-symbol tick ARRIVAL/AGE, or just socket-connected? Answer: it measures real tick-age (`getI8EWsHealth().ageMs/isStale`, `getPerSymbolTimingStats().lastTickAgeMs`) — decision-grade liveness. BUT (trace J-3) **nothing converts that into an alert.** `feed-integrity-monitor` is the SOLE component that escalates feed staleness to an operator alert. So self-monitoring (`isHealthy`/`getDiagnostics`) and alerting (`createAlert(feed_health)`) are different layers; retiring the monitor removes the only feed-health ALARM exactly when Phase 19 turns active trading ON. **Decision: RE-POINT feed-integrity-monitor at the primary adapter's real tick-age** (worst-case aggregate over the active set), not retire. The Phase-19 unblock is a TESTED objective: stale live feed → critical alert fires; fresh → silent.

## J. Step-2 verification traces (the two Langston/CC-A flags + decision-B trace)

1. **`OrderBookSnapshot` importers — sole = `slippage-fee-model.ts:1`** (type-only, lines 50/95/213). No other importer in server/client/shared. Re-home target: inline into `slippage-fee-model.ts` (sole consumer) or a surviving `server/services/market-data/` types file — both surviving locations, NOT removal candidates. ✓ flag-1 satisfied.
2. **Primary adapter ⟂ secondary subsystem — PROVEN separate:** (a) `kraken-websocket-adapter.ts` has ZERO reference to `market-data-coordinator`/`market-data-ws`/`getMarketDataWS`; (b) no price-cache / VTS / warmup / boot-orchestrator / signal path references `getMarketDataCoordinator`/`getMarketDataWS`. The only refs are the 4 status-consumers in §C. ✓ flag-2 satisfied — deletion blast-radius rests on proven separation, not assertion.
3. **Sole feed-health alarm — PROVEN:** no `createAlert`/`AlertsService` `feed_health` path exists outside `feed-integrity-auto-check.ts`; no other consumer of `getStaleSymbols`/`get90HealthMetrics` raises an alert. → decision B = re-point (above).
4. **Dormant-suppression safe:** suppression is keyed on `tradingStateSync.isEngineActive('paper'|'live')` (`feed-integrity-auto-check.ts:105-110`) — trading-active state, NOT a feed/symbol id — so deleting the 2nd WS does not strand the suppression key. ✓ (CC-A flag).

## H. OBJ-4 — #396 scanner short-universe (separate subsystem)

`market-scanner.ts:556-567`: `allPairs` = `getTicker()` ⋈ `getTradablePairs()` filtered by `p.pairInfo`; `krakenUniverseSize = allPairs.length`. Refill `:592-608` tops up from `allPairs`, so it **cannot** rescue a short universe. The "43/300" = the universe fetch itself short — either a transient Kraken REST hiccup, or the `pairInfo` join dropping ticker keys with no `pairsObj` entry. **Plan:** instrument the `krakenUniverseSize < BATCH_SIZE` branch to log which of the two REST calls was short + the join-drop count → capture live attribution → fix the identified cause (retry/validate, or fix the join). This subsystem is independent of the 2nd-WS work; may split to a follow-up if attribution needs a soak (§3-C).

## I. Risk + rollback
- **Risk:** low-moderate. The cut removes a never-functional subsystem; the only behavioral change is the four monitors now read the REAL feed (a correctness improvement). Main care: the parity-gate re-point must be value-correct (unit-tested both directions) so the go-live gate neither false-passes nor false-blocks.
- **Rollback:** standard — revert the batch commit + redeploy; the archived `.removed` files restore the subsystem if ever needed (git history authoritative).
- **Bench:** tsc baseline (no new errors) + vitest, on `C:\dev`; CI all-4-green before deploy.
- **Post-deploy proof:** the `[MD-WS] Data stale` 30 s spam is GONE from the live stream; parity-gate + feed health reflect the primary adapter.

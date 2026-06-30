# P19-B6.9 — Pre-Audit (Step-2)

**Batch:** P19-B6.9 — #398 parity-gate WS-uptime rolling-window fix + #396 §13-park.
**Step-1 consensus:** Langston APPROVED (multi-round). Scope = #398 code fix + #396 park. change-class **non_architecture** (NOT SIM-exempt — content notes land this batch).

---

## Verified findings (code + staging, 2026-06-30)

**#398 bug (state-independent, code-verified):** `server/services/market-data/feed-health-aggregate.ts:85-88` — `assessWsReadiness` computes `uptimePercent = isConnected ? max(0, (1 − status.reconnectAttempts / max(120, durationMs/5000)) × 100) : 0`. `status.reconnectAttempts` is **CUMULATIVE/lifetime** (from `krakenWebSocketAdapter.getStatus()`). A long-lived process accretes lifetime reconnects → uptimePercent monotonically drifts below the `minWsUptime: 99` floor (`parity-gate.ts:32`) → `passed:false` → the Phase-21 go-live WS gate spuriously FAILS on a fresh feed. Only caller: `parity-gate.ts:89` (`runParityCheck`), **dormant until Phase-21** (verified: not in the active trading path).

**Reuse target verified:** `feed-integrity-monitor.ts` keeps a rolling ring `healthHistory: HealthSnapshot[]`, `MAX_HISTORY = 12` (= **1 hour at 5-min snapshot intervals**, `recordSnapshot()`:388-438). Each snapshot carries `reconnectsSinceLastCheck` (the per-interval delta off the cumulative adapter counter, computed at :394) + `wasConnected`/`wasHealthy`. **DO NOT reuse `calculateTimeBasedUptime()` (:361-369)** — it is `healthyMinutes / elapsedMinutes since uptimeStartTime` = **cumulative-since-boot**, i.e. the same lifetime-drift class as the bug. `getHealthMetrics().uptimePercent` returns that cumulative value (:210/:224) → also not reusable for the gate.

**#396 (not reproducing):** B6.7 OBJ-4 attribution telemetry (`market-scanner.ts:572-585`, marker `[AdaptiveScan][11.4C.1][#396] SHORT UNIVERSE …`, fires only when `krakenUniverseSize < BATCH_SIZE`) is deployed on staging but **silent across 12k log lines**. Universe stable ~1506; evaluated 342-361/cycle; no "Underfilled batch"; the "Available=1 → rotational expanded to 299" lines are the normal backfill path. → **PARK** (not chase).

---

## Design (OBJ-1 #398 fix)

1. **New windowed getter on `feed-integrity-monitor`** — owns the ring math:
   `getRollingWindowReadiness(): { ready: boolean; uptimePercent: number | null; samplesPresent: number; windowReconnects: number }`.
   - **★ DENOMINATOR (explicit, per Langston):** `samplesPresent = healthHistory.length` — the snapshots **present in the rolling ring** (capped at `MAX_HISTORY = 12` by the ring's own `.shift()` trim, :433-435). **NOT** "intervals since boot," **NOT** `elapsedMinutes`. As old snapshots roll off, a bad hour ages out → self-healing (the property the cumulative metric lacked).
   - **windowReconnects** = Σ `reconnectsSinceLastCheck` over the ring.
   - **uptimePercent** (above floor) = `clamp(0,100, (1 − windowReconnects / samplesPresent) × 100)` — reconnect-stability over the window, faithful to the original reconnect-based intent but windowed.
   - **★ MIN-SAMPLE FLOOR (explicit, per Langston) = `MIN_READINESS_SAMPLES = 6`** (= 30 min = half the 1h ring). **Below-floor behavior (fail-closed, deterministic warm-up):** if `samplesPresent < 6` → return `{ ready:false, uptimePercent:null, samplesPresent, windowReconnects }`. Rationale: a go-live readiness decision must rest on ≥30 min of recent feed-health intervals; with ≤2 samples one blip = a 50% swing, so a computed % would be misleading — the gate reports "warming up / not ready" rather than a degenerate number. This is the one failure mode the rolling window introduces that the cumulative one didn't, so it is handled explicitly, not patched.

2. **Re-base `assessWsReadiness`** (`feed-health-aggregate.ts`): drop the cumulative `reconnectAttempts`/`estimatedChecks`/`simulationDurationMs` formula. New inputs: `isConnected` + the windowed `uptimePercent` (number|null) from the getter. Logic: `passed = isConnected && uptimePercent !== null && uptimePercent >= minWsUptimePercent && freshPercent >= minSymbolsFreshPercent`. `uptimePercent === null` (warming up) → `passed:false`, surfaced reason "WS readiness: warming up (N/6 samples)". The freshPercent axis is unchanged. `simulationDurationMs` removed from `WsReadinessOpts` (no longer used).

3. **`parity-gate.ts:89`** — pass `feedIntegrityMonitor.getRollingWindowReadiness()` + `krakenWebSocketAdapter.getStatus().isConnected` into the re-based `assessWsReadiness`; build the blocking-reason string for the warming-up case.

## Known interaction flagged for Phase-21 (NOT changed in B6.9 — out of scope, gate dormant)
With a 12-snapshot/1h window, the **99% floor + coarse granularity** means even 1 reconnect in the last hour → 91.7% → fails the gate. That may be too strict for go-live (a single transient reconnect/hour shouldn't necessarily block). **This is a go-live THRESHOLD-CALIBRATION question for Phase-21**, not the drift bug B6.9 fixes — recorded here + to be carried into the Phase-21 go-live gate calibration (POST_AUDIT_ROADMAP §3.5). B6.9 fixes the drift (cumulative→rolling); it does not re-tune the 99% floor.

## Tests
- `feed-health-aggregate` re-base: (a) high *lifetime* reconnects but windowed uptime=100 + connected + fresh → **passed:true** (today's false-fail, now fixed); (b) windowed uptime below floor (e.g. 80) → passed:false; (c) `uptimePercent=null` (warming up) → passed:false.
- `feed-integrity-monitor` getter: denominator = samplesPresent (not since-boot); below MIN_READINESS_SAMPLES → `ready:false, uptimePercent:null`; old snapshots roll off (self-heal); windowReconnects = Σ over ring.

## Governance (lands THIS batch)
RUNNING_ISSUES (#398 → resolved-by-fix; #396 → PARK w/ telemetry-evidence + concrete `[#396] SHORT UNIVERSE` re-trigger), **SIM** (Cross-Cutting Runtime State / Liveness Registry: parity-gate ↔ feed-integrity-monitor rolling-window consumption; readiness uptime cumulative-lifetime → rolling-1h, dormant till Phase-21), **SYSTEM_MANUAL** (WS-readiness gate window semantics note + the Phase-21 99%-floor-vs-granularity flag), BATCH_CATALOG, PHASE_19_PLAN §1/§5, completion report. POST_AUDIT_ROADMAP §3.5 — add the floor-calibration note.

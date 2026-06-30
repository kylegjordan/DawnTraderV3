# P19-B6.9 — Completion Report

**Batch:** P19-B6.9 — parity-gate WS-uptime rolling-window fix (#398) + scanner short-universe §13-park (#396) — pre-Phase-21 go-live-path hardening
**change-class:** non_architecture (no migration; NOT SIM-exempt — content updates landed)
**Owner:** Claude New (CC-B) · **Reviewer:** Langston (Step-1 consensus / Step-4 APPROVE / Step-8)
**Closed:** 2026-06-30 (pending Kyle ack)
**Head:** `c1e5ef80c` · **CI:** all-4-green · **Deploy:** staging restart, HTTP 200, **no migration**

---

## Objectives + results

| OBJ | Description | Met | Evidence |
|---|---|---|---|
| 1 (#398) | Re-base the go-live parity-gate WS-uptime off cumulative lifetime reconnects onto a rolling-1h window | ✅ YES | code-verified fix + 37/37 tests incl. the exact-failure regression |
| 2 (#396) | Disposition the scanner short-universe per §13 | ✅ YES (PARKED, not chased) | telemetry silent across 12k staging lines → parked w/ concrete re-trigger |

## ★ Verify-everything Step-2 reshaped the batch (Kyle standing rule)
- **#398 is a real code-verified bug** (state-independent): `feed-health-aggregate.ts:85-88` computed `uptimePercent = max(0,(1 − status.reconnectAttempts / max(120, durationMs/5000))×100)` with `reconnectAttempts` **cumulative/lifetime** → a healthy long-lived process drifts below `minWsUptime:99` (`parity-gate.ts:32`) → `passed:false` → the Phase-21 go-live WS gate spuriously FAILS on a fresh feed. Only caller `parity-gate.ts:89`, dormant until Phase-21.
- **#396 is NOT reproducing:** B6.7's deployed OBJ-4 telemetry (`market-scanner.ts:572-585`, marker `[#396] SHORT UNIVERSE`, fires when `krakenUniverseSize < BATCH_SIZE`) is **silent across a 12k-line staging window**; universe stable ~1506, evaluates 342-361/cycle, no underfilled-batch. The "Available=1 → rotational expanded to 299" lines are the normal backfill path, not a short fetch.

## Implementation (OBJ-1 #398 — 4 files, no migration)
- **`feed-health-aggregate.ts`** — NEW pure `computeRollingWindowReadiness(reconnectsPerInterval[], minSamples)`: `uptime = clamp(0,100, (1 − Σreconnects / samplesPresent) × 100)`; **denominator = samples PRESENT** in the ring (NOT since-boot → self-healing as a bad hour rolls off); `Math.max(0,n)` per element guards the reset edge. Below `minSamples` → `ready:false, uptimePercent:null` (fail-closed warm-up). Re-based `assessWsReadiness` to consume `{ isConnected, windowedUptimePercent }`; cumulative formula + `simulationDurationMs` opt REMOVED (not stubbed, §15); added `warmingUp`; `uptimePercent` widened `number|null`.
- **`feed-integrity-monitor.ts`** — `MIN_READINESS_SAMPLES = 6` (30 min = half the 1h/12-snapshot ring); `getRollingWindowReadiness()` delegates to the pure helper, mapping the ring's `reconnectsSinceLastCheck` deltas. `calculateTimeBasedUptime()` (cumulative-since-boot) left untouched + unreused (different purpose).
- **`parity-gate.ts`** — caller feeds `getFeedIntegrityMonitor().getRollingWindowReadiness().uptimePercent` + `isConnected`; blocking reason distinguishes warming-up vs below-floor; `ParityCheckResult.checks.wsUptime.actual` widened `number|null` (report + JSON consumer null-safe); `runParityCheck(simulationDurationMs)` signature unchanged.
- **tests** — re-based 4 `assessWsReadiness` tests + the #398 regression (high lifetime reconnects + clean recent window → PASS) + 7 new `computeRollingWindowReadiness` tests (denominator=samples-present, self-heal, min-sample floor, cold-start, clamp, boundary).

## Langston's load-bearing Step-4 check (confirmed)
`reconnectsSinceLastCheck` IS a true per-interval delta, not cumulative: `feed-integrity-monitor.ts:424` `intervalReconnects = Math.max(0, wsStatus.reconnectAttempts − this.lastReconnectAttempts)`; `:425` updates the baseline; `:456` stores it. → ring-sum is window-bounded; #398 not reintroduced one layer down.

## #396 — §13 park (CC-B + Langston consensus)
PARKED in RUNNING_ISSUES with the telemetry-evidence + a **concrete re-trigger**: reopen + fix the moment the deployed `[#396] SHORT UNIVERSE` telemetry fires (it attributes the cause → targeted fix). Scheduled-on-evidence, not unscheduled-watch.

## Phase-21 calibration flag (deliberately NOT changed in B6.9)
With a 12-snapshot/1h window the 99% floor means 1 reconnect/hr → 91.7% → fails. A go-live THRESHOLD-calibration decision homed as a numbered roadmap item **POST_AUDIT_ROADMAP §3.5 item 21-3b**. B6.9 fixes the drift, not the floor (gate dormant until Phase-21).

## Verification
Bench tsc-baseline GREEN (no regressions) + 37/37 tests. CI all-4-green on `c1e5ef80c`. Deployed HTTP 200, no migration. **§9.3 (Claude-in-Chrome UI) N/A** — this is a server-side go-live-gate metric with no UI surface; verification is code/test/log-based + Langston independent Step-8 (staging up).

## Governance files changed
RUNNING_ISSUES.md (#398 RESOLVED / #396 PARKED), SYSTEM_IMPACT_MAP.md (§2.1.1 rolling-window consumption CONTENT), SYSTEM_MANUAL.md (§16 gate window-semantics CONTENT), POST_AUDIT_ROADMAP.md (§3.5 item 21-3b), BATCH_CATALOG.md, PHASE_19_PLAN.md (§1 + §5), PHASE_HISTORY.md, scope + pre-audit, MEMORY (CC-B + Langston). No migration; no DELETED_COMPONENTS_LOG (the removed cumulative formula was an inline expression, not a component).

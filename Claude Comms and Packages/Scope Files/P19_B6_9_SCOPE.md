# P19-B6.9 — Scope (Step-1)

**Batch:** P19-B6.9 — scanner short-universe (#396) + parity-gate WS-uptime trap (#398) — pre-Phase-21 go-live-path hardening
change-class: non_architecture
> Rationale: observability + a dormant go-live-gate metric fix; no strategy/regime/filter/signal-pipeline/math change. NOT SIM-exempt — #398 changes a cross-cutting go-live-gate's consumption relationship (parity-gate → feed-integrity ring), so SIM + SysManual got CONTENT updates at close (Langston Step-1/8 confirmed).
**Owner:** Claude New (CC-B) · **Reviewer:** Langston
**Homes:** P19-B6.7 §13 (both issues homed here). RUNNING_ISSUES #396, #398.

---

## ★ Step-2 reality (verified on staging + in code 2026-06-30 — read before the objectives)

**#396 is NOT currently reproducing.** B6.7's OBJ-4 attribution telemetry (`market-scanner.ts:572-585`, marker `[AdaptiveScan][11.4C.1][#396] SHORT UNIVERSE …`, fires only when `krakenUniverseSize < BATCH_SIZE`) **is deployed on staging but completely silent** across a 12,000-line log window. The Kraken universe fetch returns a stable ~1506 pairs; the scanner evaluates 342–361 pairs/cycle; no "Underfilled batch" lines appear either. The "Available=1 → underflow-protection expands rotational to 299" lines are the NORMAL batch-composition path (only 1 *ideal*-quality candidate, backfilled to 300 rotational) — that is candidate-quality, NOT a short universe fetch. So the historical "43/300" symptom is not firing now (transient, or the historical underfill had a different mechanism than the short-universe hypothesis the telemetry tests).

**#398 is a real, code-verified bug** (independent of live state). `feed-health-aggregate.ts:85-88`: `uptimePercent = max(0, (1 − status.reconnectAttempts / max(120, durationMs/5000)) × 100)` with `reconnectAttempts` **cumulative (lifetime, never reset)**. A long-lived process accretes lifetime reconnects → uptimePercent falls below the `minWsUptime: 99` floor (`parity-gate.ts:32`) → `assessWsReadiness` returns `passed:false` → the Phase-21 go-live WS gate spuriously FAILS on a perfectly fresh feed. Only caller: `parity-gate.ts:89` (`runParityCheck`), **dormant until Phase-21** (not in the active trading path). The correct per-interval/rolling-window pattern already exists in `feed-integrity-monitor.ts:126-200` (ring buffer of 12 snapshots, per-interval reconnect delta).

---

## Objectives

**OBJ-1 (#398 — the definite fix).** Re-base the WS-uptime axis of `assessWsReadiness` (`feed-health-aggregate.ts`) off a **rolling-window / per-interval reconnect measure**, NOT cumulative lifetime `reconnectAttempts` over a fixed-120 denominator. **Prefer REUSE** of the rolling-window uptime the `feed-integrity-monitor` already computes (Step-2 to confirm it exposes a getter — do not duplicate the computation; my standing rule: does this logic already live in an existing component?). If no reusable getter, compute reconnects-within-the-measurement-window (delta from window start) in the parity-gate. The freshPercent axis (already correct) is untouched. Add a unit test: a process with high *lifetime* reconnects but zero/low *recent-window* reconnects + connected + fresh → `passed:true` (today it wrongly fails).

**OBJ-2 (#396 — disposition; OPEN for Langston Step-1 consensus).** The attribution telemetry is deployed + silent → the short-universe condition isn't occurring. Two options:
- **(A) RECOMMENDED — defensive retry-on-short guard:** if `getTicker()`/`getTradablePairs()` returns a universe below `BATCH_SIZE`, retry the REST fetch once (short backoff) before composing the batch; if still short, the existing telemetry logs it and we proceed with what we have. Cause-agnostic self-heal for the most likely cause (a transient REST hiccup) — proper durable hardening for the pre-live path, not a patch. Cheap, self-limiting, fires only on a genuinely short fetch.
- **(B) watch-only:** keep the deployed telemetry as the canary; defer any code fix until/unless it actually fires (re-home to "fix if recurs"). Avoids adding a guard for a condition that isn't currently happening.
- **My lean: (A)** — pre-live, a transient short fetch scanning a thin slice of the market is a real (if rare) risk, and a retry is the right self-healing fix. But it's insurance, not a live-bug fix — Langston's call welcome. **If the telemetry later attributes a STRUCTURAL cause (persistent pairInfo-join-drops), that is a separate targeted fix, not this guard.**

## Verification criteria
- OBJ-1: unit test proves the long-lived-process false-fail is gone; bench tsc-baseline GREEN; confirm no active (non-Phase-21) caller is affected.
- OBJ-2(A if chosen): the retry fires only on a short fetch (test with a stubbed short universe); the telemetry still logs a persistent short; no behavior change when the fetch is healthy (the common case — proven by the silent telemetry).
- CI 4-green; deploy HTTP 200; §9.3 not strictly applicable (no UI surface) — verification is log/test/code-based, stated as such.

## Governance plan
RUNNING_ISSUES #396 + #398 (update with the Step-2 reality + resolution), SIM §2.1.1 (parity-gate uptime detail), SYSTEM_MANUAL / PHASE7 §16 (parity-gate readiness — the rolling-window correction), PHASE3 §4 (#396 telemetry/guard note if OBJ-2A), BATCH_CATALOG, PHASE_19_PLAN §1/§5, completion report.

## Open questions for Langston (Step-1)
1. OBJ-2 disposition: (A) defensive retry-guard now, or (B) watch-only/defer? (My lean: A.)
2. OBJ-1: is reusing the feed-integrity-monitor's rolling uptime the right shape, or compute window-delta in parity-gate? (Step-2 confirms what's exposed.)
3. change-class: non_architecture acceptable given #398 is a dormant go-live-GATE metric? (Fail-closed: if you read it as architecture, I'll redeclare.)

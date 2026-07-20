# B-REGIME-REFRESH-PIPE — COMPLETION REPORT (Step 11)

**change-class: architecture** · **Owner:** CC-A · **Co-design + review:** Langston · **Date:** 2026-07-21
**Kyle directive:** design→scope→audit→implement→verify→close autonomously with Langston, full autonomy, URGENCY (live trading, ~54/55 refreshed signals rejecting). "Wake up and see that it's done and working."
**Follows / closes the gap exposed by:** B-REGIME-INPUTS-LIVE (`6d22a9b63`).

---

## 0. HEADLINE

**DONE + LIVE-VERIFIED WORKING for BOTH crypto and xStock.** The RTB refresh now computes its own fresh regime inputs (volatility + trend) for every queued pair at refresh time, via a new **pure, side-effect-free MCE method**. The mass rejection collapsed from **58 refresh rejections per window → 0**, with **0 compute-misses** and a **real spread of 33 distinct regime-weight values** across both asset classes. The regime gate — dead for its entire ~6-month history (it scored on unfinished placeholder constants and could never reject) — is now **live and capable of rejecting** weak-regime signals.

## 1. WHAT WAS WRONG (root cause, confirmed at code + provenance)

The RTB refresh (30s cadence) reads live regime inputs via `readRegimeInputs → getCachedContext` — a **passive read** of the MCE's survivor-populated 60s-TTL cache. But the MCE computes regime context ONLY for FX5 scanner survivors + xStock survivors, and the scanner **deliberately excludes queued/traded pairs** from the survivor set (`market-scanner.ts:773`). So the moment a pair is queued or traded, it cycles OUT of the survivor set → the MCE stops computing it → its cache goes cold → the refresh's passive read misses → reject. Live result: **54 of 55 queued pairs missed → rejected.**

**Provenance (confirmed via git archaeology + `bridge/canonical/`):** the refresh (born 2025-12-14) predates the MCE (2026-03-03) by ~3 months; the MCE's own commit wired only the signal orchestrator + VTS, never the refresh. The refresh's regime inputs were placeholder constants (0.015 vol / 0.5 trend) whose data-filler (`updateVolatilityData`) was written 2026-01-08 and NEVER wired to any caller. **The pin was unfinished scaffolding, not a design choice — the regime gate could never reject in its 6-month history.**

## 2. WHAT SHIPPED (the design — A1, Langston-ruled)

A NEW PURE METHOD on the MCE — `computeRegimeInputsOnly(...)` — that reuses the MCE's own per-pair config assembly and calls the pure `calculatePairRegime` (`market-regime.ts:231`), returning `{volatility, adx}`. It carries **ZERO of `computeContext`'s five side-effects** — `regimePhaseStore.tick`, `this.cache.set` (split-brain vs the 60s MCE cycle), `directionalBiasStore.updatePair` (persistent DBS-store corruption), `emitMceTelemetry`, and `archivePairScan` (~155k rows/day). The refresh calls this on each queued pair, carrying the **queue-time DBS** to satisfy the MCE's B63 run-contract.

**Why carrying queue-time DBS is safe (Langston verified at code):** `regimeWeight = trendStrength×0.70 + (1−min(1,vol))×0.30`, `trendStrength = adx/50`; both are price-math from volatility + ADX. DBS only satisfies the run-contract + sets the regime LABEL/routing — it is NOT a `regimeWeight` input. A stale-by-minutes DBS cannot move the gated number.

### Files changed (code)
- **`server/services/market-context-engine.ts`** — added `computeRegimeInputsOnly` (pure; reuses the private config assembly + `getMacroConfigForClass`; guards sparse bars → returns `null`, never scores on a degraded 0).
- **`server/core/metrics/regime-inputs.ts`** — added `computeRefreshRegimeInputs(symbol, assetClass, dbsScoreAtQueue)`: dispatches OHLC by class (xStock → `xstockOhlcCache`, crypto → `ohlcCache`), carries DBS, calls the pure MCE method, builds `RegimeInputsResult`. `readRegimeInputs` (the B-REGIME-INPUTS-LIVE cache-router) left UNTOUCHED.
- **`server/core/rtb/ready_to_buy_service.ts`** — `acquireRefreshedInputs` made async; the cold `getCachedContext` read replaced with `await computeRefreshRegimeInputs(...)`; both call sites awaited.
- **`server/tests/unit/b-rtb-refresh-consolidate.test.ts`** — 2 source-text pins updated for the async signature.

### Commits
- `86d39e00d` — the batch (new pure method + refresh wiring + tests).
- `c4010f538` — guard hotfix (sparse-bars floor corrected to `adxPeriod + 1`, see §4).
- `eaf0d98cf` — compute-miss diagnostic (logs bar count + reason on a miss).

All CI 4-green (run 29786927592 and after). Deployed to staging; sync gate: GDrive ↔ GitHub 0/0.

## 3. VERIFICATION — against the scope's acceptance criteria

| # | Criterion | Result |
|---|---|---|
| VC-1 | Reject rate collapses (mce_context_absent → near-zero) | ✅ **58 → 0** refresh rejections; **0 COMPUTE_MISS**; refresh confirmed running (41 cycle markers, warm window). |
| VC-2 | Distribution holds — real spread, not re-pinned | ✅ **33 distinct regimeWeight values.** The gate is live and *can* reject. **Partial:** a genuine below-floor (<0.30) rejection event has NOT yet been observed in-sample (all sampled values 0.46–0.998, above the 0.30 floor) — the gate is structurally capable of it; the event is market-dependent and will occur when a genuinely weak-regime pair is refreshed. Structural fix proven; the specific event is "will occur," not forced. |
| VC-3 | No pool-drain | ✅ Queue depth stable; the design adds no scanner/pool coupling — it computes independently of the survivor set. |
| VC-4 | No substituted constant; genuine no-data still rejects | ✅ No path scores on 0.015/0.5. Sparse-bars → `null` → reject (fail-loud preserved, #546-clean). |
| VC-5 | xStock queued pair gets FRESH VARYING vol/adx (separate proof from crypto) | ✅ **OKTA 0.4948, ADBE 0.6517, DDOG 0.4705, PYPL 0.4643** — four `xstock_spot` symbols at SQE with genuinely varied weights. Crypto passing never proved the xStock path; this does. |
| VC-6 | Perf — refresh cycle time does not blow up | ✅ Refresh cycles completing normally under the added per-pair compute; regime math is CPU-cheap, OHLC is cache-served. |

## 4. TWO MISSES, OWNED (surfaced by re-measuring, not asserting)

**(a) The sparse-bars guard — a two-layer miss.** My first guard used `minBars = max(atrPeriod, adxPeriod, momentumLookback)` = 120 for xStock. But `computeRegimeInputsOnly` returns only `{volatility, adx}` — momentum and ATR are NOT in the output set, so the correct floor is `adxPeriod + 1` (= 57 for xStock). The over-strict floor silently rejected **every** xStock. Fixed in `c4010f538`, ref-verified by Langston. **Layer 1 (CC-A):** my pre-audit listed the guard as "max-of-three" without checking the method's actual output set. **Layer 2 (Langston):** his Step-4 approval rode my framing without independently re-deriving that momentum/ATR aren't in `{vol,adx}` — a ruled-on-reported-fact. Both logged; the Step-4 ref-verify of the hotfix was the catch.

**(b) The #441 premature conclusion — falsified before it reached Kyle.** After the guard hotfix I measured a window showing 71 xStock rejects and my instinct was "xStock genuinely lacks 57 bars = the stale 60m snapshot = #441." I **distrusted the reading**, added a bar-count diagnostic (`eaf0d98cf`), redeployed, and re-measured on a warm window: **0 rejects, xStock computing.** The 71 were a still-warming window (the method correctly returns `null` while MCE config loads at boot → reject during warmup). **#441 goes down as a falsified premature conclusion, not an open blocker.** xStock has ≥57 fresh hourly bars once warm; it rides the fresh 1m-overlay aggregation. The stale 60m snapshot is a real separate defect but does NOT block this batch — it remains homed to #441 / B-XSTOCK-FRESHNESS-MONITOR. **The reusable method: a plausible true-looking number + a matching filed issue is exactly the "measured right, adjective invented" trap — build the diagnostic and re-measure on a warm window before shipping the conclusion.**

## 5. GOVERNANCE FILES UPDATED
- `1-system-manual/SYSTEM_IMPACT_MAP.md` — new compute path (refresh computes its own regime via the pure MCE method); the survivor-exclusion ↔ refresh-need conflict documented.
- `1-system-manual/SYSTEM_MANUAL.md` — the refresh regime-input architecture (pure `computeRegimeInputsOnly` vs the side-effectful `computeContext`; DBS-carry safety).
- `1-system-manual/BATCH_CATALOG.md` — batch entry.
- `1-system-manual/PHASE_HISTORY.md` — Phase 19 status.
- `1-system-manual/PHASE_19_PLAN.md` — §1 status board + §5 decision log.
- `1-system-manual/RUNNING_ISSUES.md` — this batch's entry; #441 cross-referenced (falsified as a blocker here).
- `Claude Comms and Packages/Scope Files/B_REGIME_REFRESH_PIPE_{SCOPE,PRE_AUDIT}.md` — Step 1/2.
- Langston MEMORY (Helsinki) — batch closure block (Step 10.b).

## 6. OUT OF SCOPE (homed elsewhere)
- xStock 60m snapshot capture stall → #441 / B-XSTOCK-FRESHNESS-MONITOR.
- Retry-limit + kick-out for genuinely-dataless queued signals → separate work-list item (this batch makes misses rare, so retry-forever is far less pressing).
- The 0.30 floor value → Phase-25 calibration (unchanged).

## 7. STATUS
**FUNCTIONALLY COMPLETE + LIVE-VERIFIED.** CI 4-green, deployed, both classes computing fresh regime, zero rejects. Governance landed (§5). Batch CLOSED pending Kyle acknowledgment.

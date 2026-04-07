# Batch Report: Batch 52 — Filter Diagnostics Fixes

> **Date:** 2026-04-06 to 2026-04-07
> **Status:** Fixes 1-19 deployed. VTS running, pipeline numbers reconciling. 24h data converging. Strategy counters fixed, By-Strategy table improved.
> **Commits:** `9566e6c2` (Fix 2), `01040658` (Fix 3), `a712f5c1` (Fix 4B+4C), `e0a328ab` (Fix 5-8), `3a14e021` (Fix 6 Last Scan), `c67c7364` (Fix 6 24h), `ed022b05` (Fix 9), `ffa4f753` (Fix 10A-10D), `7c0a1a29` (Fix 10E), `de7442f2` (Fix 11), `e8d3bd63` (Fix 12), `16baee96` (Fix 13 revert), `95acfc7e` (Fix 14), `f77b76d8` (Fix 15), `763da50c` (Fix 16), `39db69f9` (Fix 17), `1813e05b` (Fix 18), `ee8b77e2` (Fix 19A), `26d6ab1e` (Fix 19B), `49dca020` (Fix 19C), `c5ea5aaa` (Fix 19D)
> **DB Changes:** screener_filters lq_min updated 20→47→43 for all 24 rows
> **Branch:** migration/aws-supabase
> **Staging:** 188.245.193.8

---

## ⚠️ CRITICAL: VTS Autonomous Simulation Broken After Restarts

**Impact:** No new VTS simulated trades are being opened. The VTS Signal Funnel data (Pair-Pool Evaluations, Strategy Evaluations, etc.) is FROZEN from before the B52 deploys. Open simulated trades that existed before the session have likely expired/closed but no new ones are being created.

**Root Cause:** Every code deploy triggers a PM2 restart. On restart, the VTS boot sequence in `boot_orchestrator.ts` fails with: `[BOOT][VTS] Could not determine passive learning state: ReferenceError: Cannot access 'fx5Scanner2' before initialization`. This is a circular dependency in the bundled code — `fx5Scanner` is not fully initialized when the boot orchestrator tries to check config and start the autonomous simulation.

**Why this wasn't visible before B52:** The app had been running continuously without restarts. VTS was working because it was started during a previous boot (before the circular dependency was introduced — likely by a bundler/import order change in a recent batch).

**Fix 15 attempted a fallback** but it also hits the same circular dependency when calling `startAutonomousSimulation()`.

**What needs to happen in next session:**
1. Fix the VTS boot initialization order so `startAutonomousSimulation()` can run on restart
2. Verify VTS is producing new simulated trades after the fix
3. Verify the diagnostic logging (Fix 14) produces HANDOFF/RECONCILE output
4. Then resume the VTS Destination vs Pair-Pool reconciliation work

**This is the #1 priority for the next session.**

---

## Fix 1 — Last Scan Full Pipeline Restored (`a1b3225c`)
**Status:** CONFIRMED COMPLETE (Kyle verified)

## Fix 2 — Pipeline Summary VTS Breakdown + Label Fixes (`9566e6c2`)
**Status:** CONFIRMED COMPLETE (Kyle verified)

## Fix 3 — Add Total Column to Last Scan Filter Breakdown (`01040658`)
**Status:** CONFIRMED COMPLETE (Kyle verified)

## Fix 4 — LQ Threshold + Fallback Cleanup + Benchmark Exclusion
### Fix 4A — LQ Threshold Update: DB lq_min 20→47 (later adjusted to 43 in Fix 5)
### Fix 4B — Remove Dead Code Fallbacks (`a712f5c1`): Removed from imf-metrics.ts
### Fix 4C — Benchmark Exclusion Before VTS (`a712f5c1`): Counter fixed + benchmarks removed from VTS batch
**Status:** ALL DEPLOYED + VERIFIED IN LOGS

---

## Fix 5 — LQ Threshold Recalibration (DB change)
**Trigger:** Kyle reviewed UI — LQ 47 was largest filter, too aggressive.
**Change:** DB lq_min 47→43 (~$20K/day) for all 24 rows.
**Status:** COMPLETE

## Fix 6 — Pipeline Flow Visibility (`3a14e021`, `c67c7364`)
**Trigger:** Kyle wanted explicit flow: survivors → benchmarks removed → VTS destination.
**Changes:**
- Last Scan: Added "IMF Survivors (incl. benchmarks)" → "Benchmarks Removed" → "VTS Destination (post-benchmark)" rows
- 24h Pipeline Summary: Added "Benchmarks Removed" and "VTS Destination" rows
**Status:** DEPLOYED — benchmark display issues identified (see Fix 10 below)

## Fix 7 — Move Cooldown Exclusions to Bottom (`e0a328ab`)
**Change:** Moved Cooldown card below VTS Signal Funnel (later removed entirely in Fix 9).
**Status:** SUPERSEDED by Fix 9

## Fix 8 — Cooldown Numbers Investigation
**Finding:** All 1297 pairs genuinely in active cooldown — pairs that permanently fail filters get perpetually re-added. Count is accurate but misleading. Led to Fix 9.
**Status:** COMPLETE — led to Fix 9

## Fix 9 — Remove PairFailureTracker Cooldown (`ed022b05`)
**Trigger:** Kyle directive — cooldown is redundant. Batch size fixed at ~300/cycle regardless. Adaptive ratio manager controls pair selection.
**Changes:**
- adaptive-scan-manager.ts: Bypassed cooldown filtering, stopped recording failures
- vts.ts: Removed cooldownState from API (schema v1.4)
- machine-learning.tsx: Removed Cooldown Exclusions card entirely
**Langston Review:** Pre-approved.
**SYSTEM_IMPACT_MAP audit:** LOW blast radius. No downstream dependencies.
**Status:** DEPLOYED

---

## Fix 10 — Benchmark Display Issues (ALL RESOLVED)

**Trigger:** Kyle UI review after Fix 6 deployment identified multiple issues with benchmark counting and VTS Destination display.

### 10A — VTS Destination row missing quant/pattern columns
- **Fix:** Restored per-path quant/pattern columns in VTS Destination row across all 3 tables (Last Scan, 24h Pipeline Summary, 24h Rolling Aggregates).
- **Status:** RESOLVED (`ffa4f753`, then corrected in `7c0a1a29`)

### 10B — Pattern Benchmark Bypassed shows 0 in 24h Pipeline Summary
- **Root cause:** Missing aggregation line in fx5-scanner.ts — `aggPatternImf.benchmarkBypassed` was never incremented in the 24h rolling loop.
- **Fix:** Added `aggPatternImf.benchmarkBypassed += d.pattern.imf.benchmarkBypassed ?? 0` to aggregation loop.
- **Status:** RESOLVED (`ffa4f753`)

### 10C — Last Scan benchmark counts constant (always 18 quant / 16 pattern)
- **Finding:** Correct behavior. benchmarkBypassed counts UNIQUE benchmark pairs, which is constant because the same benchmark pairs pass filters every cycle. The number doesn't change because the same ETH, USDC, XBT variant pairs always survive IMF.
- **Status:** RESOLVED — not a bug, expected behavior

### 10D — 24h Rolling Aggregates missing pipeline flow rows
- **Fix:** Added full pipeline flow section to 24h Rolling Aggregates: IMF Survivors (incl. benchmarks) → Benchmarks Removed → VTS Destination with quant/pattern/total columns.
- **Status:** RESOLVED (`ffa4f753`)

### 10E — VTS Destination total incorrect
- **Root cause:** Total column used backend `destinationCount` which was based on fan-out entry counting, not matching the per-path unique-pair subtraction (survivors - benchmarkBypassed). Kyle identified: quant=93 + pattern=16 should = 109, but total showed 0.
- **Fix:** Total column now uses simple arithmetic: `(quant.survivors - quant.benchmarkBypassed) + (pattern.survivors - pattern.benchmarkBypassed)`. Applied to all 3 tables.
- **Status:** RESOLVED (`7c0a1a29`) — Kyle verified totals working correctly

## Fix 11 — Last Scan Display Cleanup (`de7442f2`)
**Trigger:** Langston code review flagged two presentation issues; Kyle confirmed both.
**Changes:**
1. Removed standalone "Benchmark Bypassed" row after Failed DI — redundant (only showed quant, pattern was a dash), inconsistent with pipeline flow section below, and out of sequence.
2. Moved pipeline flow rows (IMF Survivors → Benchmarks Removed → VTS Destination) to below the Family Path IMF Breakdown (after Oscillator Family). The narrative now reads: filters → family fan-out → family detail → pipeline flow → VTS Signal Funnel.
**Langston Review:** Both items flagged by Langston; fix addresses his exact recommendations.
**Status:** CONFIRMED COMPLETE (Kyle verified)

## Fix 12 — Correct Benchmark Counting Units (`e8d3bd63`)
**Trigger:** Kyle identified that benchmark removal should count fan-out entries, not unique pairs. If BTC passes 3 families, that's 3 removals.
**Changes:**
- `benchmarkBypassed` (quant) now counts benchmark entries per family pool (fan-out), matching `survivors` units
- `patternBenchmarkBypassed` simplified to only count `isBenchmark` (bypass flags were redundant — identical to isBenchmark)
- Verified: UI VTS Destination (46) matches server `destinationCount` (46)
**Status:** CONFIRMED WORKING (API verification)

## Fix 13 — Pair-Pool Double Fan-Out (REVERTED) (`2107e135` → `16baee96`)
**Trigger:** Attempted to fix pair-pool counting by changing to +1 per entry. Theory was FX5 already fans out, so VTS re-expanding was double-counting.
**Result:** WRONG. Pair-pool dropped to 29 when VTS dest was 66. The VTS evaluation loop processes unique symbols and needs the family expansion. Reverted.
**Lesson:** Do not touch pair-pool counting logic until diagnostic logging proves exactly where the gap occurs.

## Fix 14 — VTS Handoff Diagnostics + Pre-Eval Skip Rows (`95acfc7e`)
**Changes:**
- Backend: Added `[52][HANDOFF]` trace logging at getIdealPoolPairs and VTS loop entry. Added `[52][RECONCILE]` post-loop summary showing evaluated + skipped + unaccounted.
- Frontend: Added pre-evaluation skip rows between VTS Destination and Pair-Pool Evaluations (No Price Data, Insufficient OHLC, Max Open Trades). Only shown when counts > 0.
**Status:** DEPLOYED — awaiting VTS evaluation cycles to produce diagnostic data

## Fix 15 — VTS Boot Fallback (`f77b76d8`)
**Trigger:** VTS autonomous simulation not starting after restart. Boot error: `Cannot access 'fx5Scanner2' before initialization` (circular dependency in bundled code).
**Change:** Added fallback in boot_orchestrator.ts catch block — if config check fails, assume passive learning mode and start autonomous simulation anyway.
**Status:** DEPLOYED — VTS boot error persists (fallback may also hit same circular dep). Needs deeper investigation in next batch.

---

## Fix 16 — VTS Boot Circular Dependency Fix (`763da50c`)
**Trigger:** VTS dead for 14+ hours after Fix 14 deployment. Every PM2 restart crashed with `Cannot access 'fx5Scanner2' before initialization`.
**Root cause:** Fix 14 added `fx5Scanner.getLastScanDiagnostics()` at line ~1585 of vts-runner.ts using the static import (line 48). This changed how esbuild ordered module initialization, causing the singleton to be accessed before assignment on boot.
**Changes:**
- **16A (vts-runner.ts):** Changed `fx5Scanner.getLastScanDiagnostics()` from static import to dynamic import (`await import('./fx5-scanner.js')`). Other Fix 14 diagnostic logs (HANDOFF/RECONCILE) kept — they use existing variables.
- **16B (vts-runner.ts):** Moved `isAutonomousRunning = true` to AFTER first cycle succeeds. Previously set before the cycle, so if it crashed, the flag stayed true and the Fix 15 fallback returned "already running" without starting anything.
- **16C (boot_orchestrator.ts):** Fixed misleading error message "Could not determine passive learning state" — actual failure was inside `startAutonomousSimulation()`, not config check.
**Langston Review:** Approved. Confirmed diagnosis credible, dynamic import correct, flag timing fix clean.
**Verification:** VTS confirmed running — Cycle 4 completed: 74 loop entries, 61 evaluated, 13 skipped (noPrice), 0 unaccounted.
**Status:** CONFIRMED COMPLETE

## Fix 17 — Pair-Pool Counting + Skip Visibility (`39db69f9`)
**Trigger:** VTS Destination vs Pair-Pool Evaluations gap persisted. Diagnostic data showed 39 VTS Dest vs 101 Pair-Pool — N×N overcounting.
**Root cause:** Quant pair-pool counter at line ~1832 of vts-runner.ts added ALL families per symbol per loop entry. Since the VTS batch already contains fan-out entries (one per family per symbol from FX5), each entry was counted N times instead of 1. SOL/USD in 3 families: 3 entries × 3 families = 9 pair-pool evals instead of 3.
**Changes:**
- **Backend (vts-runner.ts):** Changed quant pair-pool counter from `+= quantFamilyCount` to `+= 1` per loop entry.
- **Frontend (machine-learning.tsx):** Added Pair-Pool Evaluations + Pre-Evaluation Skips rows to 24h Pipeline Summary between VTS Destination and Strategy Evaluations. Made skip rows permanent in Last Scan (always shown, not conditional on count > 0).
**Langston Review:** Approved approach — keep both handoff/input and evaluation/fan-out bases visible with explicit labels.
**Verification:** 5 consecutive cycles verified: VTS Dest - Skips = Pair-Pool Evals, 0 unaccounted in all cycles.
**Status:** CONFIRMED COMPLETE

## Fix 19 — Strategy Counter Fixes + By-Strategy Table Improvements (`ee8b77e2`, `26d6ab1e`, `49dca020`, `c5ea5aaa`)
**Trigger:** Kyle identified multiple issues in the By Strategy table: "Setups Found" column showed 0, "Hit Rate" showed 100%, Net EV Below Floor showed 0 despite threshold change.
**Changes (4 sub-fixes):**
- **19A (`ee8b77e2`):** Renamed columns "Setups Found" → "Signals", "Hit Rate" → "Null %". Added preRejectionSignals + rejected counter increments. Changed VTS_NET_EV_FLOOR from -0.02 to -0.01.
- **19B (`26d6ab1e`):** Fixed 24h rolling aggregation — byStrategy loop only copied evaluated/nulls/signals, dropping preRejectionSignals + rejected fields. Updated type definition.
- **19C (`49dca020`):** Fixed double-counting — preRejectionSignals and rejected were incremented BOTH inside generatePhase10Signal AND in the caller. Removed inner function counter increments; caller is now single source of truth.
- **19D (`c5ea5aaa`):** Moved Duplicate Position + Max Open Trades from "Post-Signal Rejections" to new "Pre-Evaluation Skips" section. These fire before strategy.detect() is called, not after signal generation.
**Langston Review:** 19A approved. 19B-D pending review (counter fixes + UI relabeling).
**Verification:** Signals column now shows true signal count (no double-counting). Net EV Below Floor = 0 confirmed genuine (no signals have netEV ≤ -1%, verified in PM2 logs). Pre-Evaluation Skips section correctly shows Duplicate Position, Max Open Trades, Regime Has No Strategies, Family Filter Mismatch.
**Status:** DEPLOYED

## Fix 18 — Merge 24h Rolling Aggregates + VTS Eval Breakdown (`1813e05b`)
**Trigger:** Kyle directive — two separate cards (24h Rolling Aggregates stopping at VTS Destination, VTS Evaluation Breakdown starting with Pair-Pool) created a visual disconnect. Pipeline should flow continuously.
**Changes:**
- **Frontend (machine-learning.tsx):** Merged VTS Evaluation summary rows (Pre-Eval Skips, Pair-Pool Evals, Strategy Evals, Strategy Nulls, Signals Generated) into the 24h Rolling Aggregates card, directly below VTS Destination. Renamed separate card to "VTS Evaluation Detail" for strategy-level and null reason breakdowns.
**Status:** DEPLOYED

---

## RESOLVED: VTS Boot Circular Dependency
**Status:** RESOLVED — Fix 16 (`763da50c`)

## RESOLVED: VTS Destination vs Pair-Pool Reconciliation
**Status:** RESOLVED — Fix 17 (`39db69f9`). Numbers reconcile perfectly at Last Scan level. 24h rolling will converge after stale data ages out (~24h from Fix 17 deploy at 10:23 UTC April 7).

---

## IMF Governance Audit (discovered during Fix 4)
- DB is sole authority for LQ/VN/DI/CORR thresholds
- Partially cleaned (imf-metrics.ts). Remaining files still have ?? fallback operators.

## Process Established
- Pre-implementation: Langston review + SYSTEM_IMPACT_MAP
- Post-implementation: Visual verification + Langston code+UI review
- Running report updated after each fix

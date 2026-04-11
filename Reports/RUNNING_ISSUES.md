# DawnTrader V3 — Running Issues List

> **Last Updated:** 2026-04-09 (Batch 54 session — Pattern recognizer relaxations, DI 12→10, ai-analyst removed, hardcoded defaults removed, ML service installed)
> **Status Key:** OPEN = not started, IN PROGRESS = work begun but not finalized, RESOLVED = done, DEFERRED = intentionally postponed

---

## Filter Diagnostics / UI Issues

| # | Issue | Status | Notes |
|---|-------|--------|-------|
| 1 | **Last Scan missing full pipeline** — survivors shown but pairs evaluated, nulls, signals, rejections, trades were removed in B50, partially restored in B51-HF2 | RESOLVED | **2026-04-06 — Kyle verified, Langston retroactively approved.** B51-HF2 verified working. VTS Signal Funnel renders correctly with last-cycle data. |
| 2 | **Pipeline Summary missing combined VTS destination total** — shows quant family IMF passed but does not include pattern survivors + parity overlaps as explicit combined total | RESOLVED | **2026-04-06 — Kyle verified, Langston pre-approved.** Commit `9566e6c2`. VTS Batch Size row now shows quant/pattern breakdown. Label renamed to "IMF Survivors". |
| 3 | **24h pair-pool data still accumulating** — new quantPairPoolEvaluations/patternPairPoolEvaluations fields only exist since B51 deploy (~4h). No historical backfill. | RESOLVED | **2026-04-09 — Closed per Kyle.** Last scan and 24h counters closely aligned. Data fully accumulated. No further action needed. |
| 4 | **IMF survivors > IMF passed confusion** — row labels confusing because family fan-out multiplies the count | RESOLVED | **2026-04-09 — Closed per Kyle.** Labels acceptable as-is. |
| 5 | **DI reconciliation mismatch** — IMF metrics shows DI=0 failures but Family Path shows DI=2300+ failures. Different scopes (global vs family) but UI makes them look contradictory. | RESOLVED | **2026-04-09 — Display clarity issue, not a bug.** Global IMF DI stage removed in B43. Family-level DI filters run with different thresholds per family. Numbers are correct at their respective scopes. Kyle accepted. |
| 6 | **Empty Guardrails tabs** — Telemetry Snapshot and Filter Performance show no data | RESOLVED | **2026-04-09 — Kyle confirmed fixed.** |
| 7 | **Screeners tab missing family IMF thresholds** — only shows 4 base paths, not family-specific | RESOLVED | **2026-04-08 — B53 Fix 4 (`69ce68e6`).** Quant IMF cards now show "Family-specific (see table below)" instead of misleading global values. Kyle confirmed. |
| 8 | **Cooldown Exclusions card deployed** — new card showing pairs in cooldown | RESOLVED | **2026-04-07 — Cooldown functionality removed entirely (Fix 9).** Card removed from UI, cooldown filtering bypassed in adaptive-scan-manager.ts, cooldownState removed from API (schema v1.4). Redundant with fixed ~300 pair batch size. Kyle directive. |

## Strategy / Signal Pipeline Issues

| # | Issue | Status | Notes |
|---|-------|--------|-------|
| 9 | **Zero-signal strategy audit** — 8 strategies with 0% signal rate categorized into 4 buckets | RESOLVED | **2026-04-09 — Audit complete.** abcd_long VWAP fixed (B50). B53 completed full 17-strategy audit with 8 threshold relaxations. B54 relaxed pattern recognizer. Remaining 0% strategies are regime-gated (not threshold issues). Individual items tracked in #12b-12f. |
| 10 | **abcd_long VWAP always undefined** — Kraken OHLC index [5] not mapped | RESOLVED | Fixed in B50. VWAP now mapped. Post-fix: strategy still has 84% pattern detection failure (structural, not a bug). |
| 11 | **Pattern path 100% strategy null** — all pattern strategy evaluations return null | RESOLVED | **2026-04-09 — Fixed across B53-B54.** B53: 8 threshold relaxations for pattern-dependent strategies. B54: Pattern recognizer relaxed (PINBAR, INSIDE_BAR, THREE_SOLDIERS, MORNING_STAR). Post-deploy VTS immediately detected patterns. Remaining 0% strategies are regime-gated, not pattern-blocked. |
| 12 | **Additional strategies need threshold audit** — adaptive_flow, pivot_shift, liquidity_trap (10K+ evals, 0%) | RESOLVED | **2026-04-09 — Full audit completed in B53.** All 17 strategies audited. These 3 are regime-gated by design (pivot_shift→TREND_FRIENDLY/STRUCTURAL_TRANSITION, liquidity_trap→STRUCTURAL_TRANSITION). adaptive_flow is mapped to RANGE_BOUND_STABLE but still 0% — potential separate investigation. |
| 12a | **Strategy audit incomplete** — only 8 of 17 strategies audited (zero-signal only). 9 strategies NOT audited: vwap_pullback, morning_star, mean_reversion, reverse_impulse, range_trade, support_bounce, sma_trend_ride, breakout, vwap_bounce | RESOLVED | **2026-04-08 — B53 completed full 17-strategy audit.** All strategies audited. Threshold relaxations deployed for 7 strategies (B53 Fix 1). |
| 12b | **dhma thresholds too strict** — DHMA_MIN_SEPARATION/LOOKBACK need relaxation for crypto. Zero signals. | RESOLVED | **2026-04-09 — Regime-gated, not threshold issue.** DHMA mapped exclusively to IMPULSE_EXPANSION regime. Current regime is RANGE_BOUND_STABLE. Will activate when market enters that regime. No code change needed. |
| 12c | **volatility_edge still 0% after B47 relaxation** — A-point detection logic may need review | RESOLVED | **2026-04-09 — Regime-gated, thresholds fully tuned.** B47: 2.0→1.5, B53: 1.5→1.3 + VWAP gate softened. Primary blocker is regime-gating to IMPULSE_EXPANSION. Will activate when market enters that regime. |
| 12d | **inside_bar_reversal still 0% after B47 relaxation** — pattern detection may be too strict | RESOLVED | **2026-04-09 — Regime-gated, thresholds fully tuned.** B47: 1.5→1.3, B53: MAX_COMPRESSION 0.80→0.85, B54: 0.1% containment tolerance in pattern recognizer. Primary blocker is regime-gating to HIGH_VOLATILITY_UNSTABLE. |
| 12e | **Regime-gated strategies dormant** — adaptive_flow, pivot_shift, liquidity_trap only eligible in specific regimes | DEFERRED | **2026-04-09 — Deferred per Kyle.** Accept dormancy until more evidence. Note: adaptive_flow IS mapped to RANGE_BOUND_STABLE (current regime) but still 0% — may warrant separate investigation when ready. |
| 12f | **defensive_hedge inactive** — not active in current regime mapping | RESOLVED | **2026-04-09 — Regime-gated by design.** defensive_hedge is mapped to DEFENSIVE regime in Directive 11.7F canonical regime-strategy map. Current regime is RANGE_BOUND_STABLE. Not a bug — strategy is dormant because its regime hasn't been entered. Langston consensus: defer. |
| 13 | **Strategy nulls inflated by post-signal rejections** — generatePhase10Signal returned null for both true nulls AND rejections | RESOLVED | Fixed in B50. setNullReason() calls added before return null. Caller now distinguishes true nulls from post-signal rejections. |
| 14 | **Post-Signal Rejections pct() denominator bug** — used totalStratNulls instead of totalStrategyEvaluations | RESOLVED | Fixed in B50 with pctOfEvals() helper. |
| 15 | **DI 12→8 threshold decision** — analysis sent recommending wait for VTS outcome data | RESOLVED | **2026-04-09 — B54 Fix 2.** Staged relaxation 12→10 (not 8) per Langston recommendation. DB updated for both active_trend and vts_trend. Breakout already at 10/8 respectively. Trend family gained 5 additional pairs. |
| 16 | **Fixed % thresholds → ATR-relative** — Langston Batch 18H finding | RESOLVED | **2026-04-09 — Already implemented.** All 8 strategy files use getEffectiveATR() with ATR multipliers for stops/targets. No fixed-% thresholds remain. Confirmed via code audit. |
| 17 | **Duplicate scanPatterns() call** — deferred from Batch 41 | RESOLVED | **2026-04-09 — Already resolved.** B44 preDetectedPatterns refactor eliminated the duplicate call. Pattern detection runs once, results cached and reused. |
| 17a | **Zero-duration closed simulated trades** — trades opening and closing in same/next cycle. Root cause: entry/stop/target calculated from OHLC but current market price already past stop or target. DEFENSIVE mode (×0.8 TP) compounds the issue. Duration display floored to minutes (0-59s = "0m"). | RESOLVED | **2026-04-08 — B53 Fix 2 (`bdb2b89e`).** Entry validation guard: before opening trade, verifies market price is above stop and below target with 2× friction minimum distance. Duration display now shows seconds for sub-minute ("45s" not "0m"). Langston approved A+C approach. Guard verified active in logs (catching ONDO/USD etc). |

## Architecture / Counting Issues

| # | Issue | Status | Notes |
|---|-------|--------|-------|
| 18 | **PairFailureTracker cooldown** — was hidden, now visible. Reduced from 10min/30min to 2min/5min. Pre-filter at batch selection. | RESOLVED | B51 reduced durations → B52 Fix 9 removed entirely. Cooldown bypassed in adaptive-scan-manager.ts, recording stopped. Kyle directive: redundant with fixed batch size. |
| 19 | **VTS Parity duplication (Directive 19F)** — pairs passing both quant+pattern get duplicated in VTS batch | RESOLVED | **2026-04-09 — Display fixed in B52.** Commit `9566e6c2` added VTS Destination row with quant/pattern breakdown and combined total. Parity duplication now visible in Pipeline Summary. |
| 20 | **Pair-pool evaluation counting** — new counters track pair+family combinations | RESOLVED | **2026-04-09 — Closed per Kyle.** Counters deployed in B51, Langston-reviewed counting logic working correctly. Data fully accumulated. |

## Infrastructure / Comms Issues

| # | Issue | Status | Notes |
|---|-------|--------|-------|
| 21 | **Langston voice note transcription** — audio arrives but platform transcription doesn't fire for main agent | RESOLVED | **2026-04-09 — Closed per Kyle.** CCDT workaround in place. Langston transcribes himself per SOUL.md instructions. |
| 22 | **Non-fatal DB column errors** — Neon schema export missing columns from later batches | RESOLVED | **2026-04-09 — Kyle confirmed fixed.** DB columns now populated correctly. |
| 23 | **ai-analyst.ts disabled** — OpenAI imports commented out, null stubs in place | RESOLVED | **2026-04-09 — B54 Fix 3 (`a4ee84fa`).** All 8 route handlers stubbed with 501. aiAnalyst variable and import removed from routes.ts. Service file retained for reference only. |
| 24 | **ML service not running** — python3 not in PATH | RESOLVED | **2026-04-09 — B54.** Created venv at /home/deploy/dawntrader/ml_venv, installed flask 3.1.3 + numpy + scikit-learn. Registered with PM2 as 'ml-service'. Health check confirmed: `{"status":"READY"}` on port 5001. |
| 25 | **Pattern path min_price rejecting 193 pairs** — threshold may be too strict | RESOLVED | **2026-04-09 — Not a problem.** DB min_price is $0.01 for pattern path. 193 rejections are all sub-penny tokens — correct behavior. No change needed. |

## Governance Debt

| # | Issue | Status | Notes |
|---|-------|--------|-------|
| 26 | **Governance catch-up batch** — BATCH_CATALOG, PHASE_HISTORY, SYSTEM_IMPACT_MAP, CHANGES_AND_FIXES all need updating for B48-B51 | RESOLVED | **2026-04-09 — B54 Governance sweep.** Full Tier 1+2 update: BATCH_CATALOG (B53-54 entries), PHASE_HISTORY (Phase 14.7 extended), SYSTEM_IMPACT_MAP (4 new entries), SYSTEM_MANUAL (pattern thresholds), CCPI, MEMORY.md, Completion Report. |
| 27 | **B51-HF2 missing Langston review** — pushed without code review, workflow violation | RESOLVED | **2026-04-06 — Langston retroactively reviewed and approved.** Code confirmed using last-cycle data via getLastVTSCycleSnapshot(). |
| 28 | **Batch 51 Completion Report** — cannot be written yet, objectives not fully verified | RESOLVED | **2026-04-09 — Already exists.** Combined B48-51 HF report at `Reports/Batch Completion/Batches_48-51_HF_Report_04.06.26.md`. B54 Completion Report also written. |

## Batch 52 — New Issues Discovered (2026-04-06)

| # | Issue | Status | Notes |
|---|-------|--------|-------|
| 29 | **LQ threshold at 47 may be too aggressive** — now the largest filter by far. Kyle reviewing. | RESOLVED | **2026-04-09 — Lowered to 43 per Kyle.** Settled at 43 after review. Closed per Kyle directive. |
| 30 | **IMF fallback defaults scattered across codebase** — LQ/VN/DI/CORR have hardcoded defaults in 6+ files. Dead code since DB always provides values, but creates governance risk. | RESOLVED | **2026-04-08 — B53 Fix 3 (`2cf8414a`).** Removed hardcoded LQ_MIN=35 and VOL_NOISE_MAX=0.93 from CORE_METRIC_THRESHOLDS in analysis-utils.ts. passesCoreMetricFilters() now requires DB-driven thresholds (no optional fallback). |
| 31 | **Benchmark pairs were entering VTS** — quant benchmarkBypassed counter hardcoded to 0. Benchmarks not excluded from VTS batch. | RESOLVED | **2026-04-06 — Fixed in commit `a712f5c1`. Kyle directive.** Counter fixed. Benchmarks now removed before VTS batch. Verified in logs: 51 entries removed per cycle. |
| 32 | **Pipeline flow visibility** — IMF passed → benchmarks bypassed → final survivors not shown clearly in UI | RESOLVED | **2026-04-07 — Fixed in B52 Fixes 6+10.** Pipeline flow rows (IMF Survivors → Benchmarks Removed → VTS Destination) added to all 3 tables with quant/pattern/total columns. |
| 33 | **Cooldown Exclusions interrupts pipeline flow** — card position in Filter Diagnostics tab breaks the logical flow | RESOLVED | **2026-04-07 — Cooldown card removed entirely (Fix 9).** No longer in UI. |
| 34 | **Cooldown numbers seem too high** — 1318/1268 pairs in cooldown when Kraken has ~1400-1500 total | RESOLVED | **2026-04-07 — Moot. Cooldown removed entirely (Fix 9).** Investigation showed all pairs genuinely in perpetual cooldown. Functionality was redundant. |
| 35 | **Filter Diagnostics UI not in SYSTEM_IMPACT_MAP** — governance gap discovered during B52 audit | RESOLVED | **2026-04-08 — B53 governance sweep.** 6 new component entries added to SYSTEM_IMPACT_MAP including Filter Diagnostics UI, VTS Entry Validation Guard, Pattern Recognizer, etc. |
| 36 | **CRITICAL: VTS autonomous simulation not starting after PM2 restart** — Boot error: `Cannot access 'fx5Scanner2' before initialization`. Fix 14 added a static `fx5Scanner.getLastScanDiagnostics()` call that changed esbuild module ordering. Fix 15 fallback ineffective due to `isAutonomousRunning` flag stuck at true. | RESOLVED | **2026-04-07 — Fix 16 (`763da50c`).** 16A: Changed static import to dynamic import for diagnostic call. 16B: Moved `isAutonomousRunning` flag to after first cycle success. 16C: Improved error message in boot_orchestrator. VTS confirmed running, producing cycles with 0 unaccounted pairs. Langston approved. |
| 37 | **VTS Destination vs Pair-Pool Evaluations gap** — Quant pair-pool counter was N×N overcounting: each fan-out loop entry added ALL families instead of +1. | RESOLVED | **2026-04-07 — Fix 17 (`39db69f9`).** Changed quant pair-pool counter to +1 per loop entry (VTS batch already contains fan-out entries). Verified across 5+ cycles: VTS Dest - Skips = Pair-Pool Evals, 0 unaccounted. Also added Pair-Pool + Skip rows to 24h Pipeline Summary, made skip rows permanent in Last Scan. Fix 18 (`1813e05b`) merged 24h Rolling Aggregates + VTS Eval Breakdown into one continuous card. Langston approved approach. |
| 38 | **By Strategy table counters broken** — preRejectionSignals never incremented (always 0), rejected only counted Net EV, Hit Rate showed 100%, Signals column was double-counted. VTS_NET_EV_FLOOR at -2% too permissive. | RESOLVED | **2026-04-07 — Fix 19A-D.** 19A (`ee8b77e2`): Renamed columns, added counter increments, VTS_NET_EV_FLOOR -2%→-1%. 19B (`26d6ab1e`): Fixed 24h aggregation dropping preRejectionSignals+rejected fields. 19C (`49dca020`): Fixed double-counting — removed inner function counter increments, caller is single source of truth. 19D (`c5ea5aaa`): Moved Duplicate Position + Max Open Trades from "Post-Signal Rejections" to "Pre-Evaluation Skips" (they fire before strategy.detect()). Net EV=0 confirmed genuine (no signals ≤ -1%). |

---

## CI / Build Issues

| # | Issue | Status | Notes |
|---|-------|--------|-------|
| 39 | **TypeScript Check CI job failing** — `storage.ts` has pre-existing TS errors (TradingMode type not found, cash/cryptoValue properties, enum narrowing). Also `inside-bar-reversal.ts` comparison warning, `market-events.ts` EXTREME_NOISE enum, `validate-canonical.ts` JSON module resolution. These errors are in the CI environment `tsc` check — Build, Tests, and Docker all pass. The overall CI workflow passes due to `continue-on-error: true` on the TypeScript Check job. | OPEN | Discovered during B58 push. These errors are NOT from B58 files — verified zero TS errors in adjustment-registry.ts, authority-baseline.ts, routes.ts, boot_orchestrator.ts. The TS check may have been failing since B57 (all historical CI runs accessible show TS Check as failure). Needs investigation: either fix storage.ts types or determine when the regression occurred. |

---

## Summary Counts
- **RESOLVED:** 37 (#1-5, #6-8, #9-11, #12, #12a-12d, #12f, #13-17, #17a, #18-21, #22-28, #29-38)
- **DEFERRED:** 1 (#12e — regime-gated strategy dormancy, awaiting evidence)
- **CRITICAL:** 0
- **IN PROGRESS:** 0
- **OPEN:** 1 (#39 — CI TypeScript Check failing)

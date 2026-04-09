# DawnTrader V3 — Running Issues List

> **Last Updated:** 2026-04-09 (Batch 54 session — Pattern recognizer relaxations, DI 12→10, ai-analyst removed)
> **Status Key:** OPEN = not started, IN PROGRESS = work begun but not finalized, RESOLVED = done, DEFERRED = intentionally postponed

---

## Filter Diagnostics / UI Issues

| # | Issue | Status | Notes |
|---|-------|--------|-------|
| 1 | **Last Scan missing full pipeline** — survivors shown but pairs evaluated, nulls, signals, rejections, trades were removed in B50, partially restored in B51-HF2 | RESOLVED | **2026-04-06 — Kyle verified, Langston retroactively approved.** B51-HF2 verified working. VTS Signal Funnel renders correctly with last-cycle data. |
| 2 | **Pipeline Summary missing combined VTS destination total** — shows quant family IMF passed but does not include pattern survivors + parity overlaps as explicit combined total | RESOLVED | **2026-04-06 — Kyle verified, Langston pre-approved.** Commit `9566e6c2`. VTS Batch Size row now shows quant/pattern breakdown. Label renamed to "IMF Survivors". |
| 3 | **24h pair-pool data still accumulating** — new quantPairPoolEvaluations/patternPairPoolEvaluations fields only exist since B51 deploy (~4h). No historical backfill. | IN PROGRESS | Will have full 24h window by ~2026-04-05 16:15 UTC. |
| 4 | **IMF survivors > IMF passed confusion** — row labels confusing because family fan-out multiplies the count | IN PROGRESS | Partially addressed in B43/B51 but Kyle still finding display unclear. |
| 5 | **DI reconciliation mismatch** — IMF metrics shows DI=0 failures but Family Path shows DI=2300+ failures. Different scopes (global vs family) but UI makes them look contradictory. | OPEN | Not addressed in B50-51. |
| 6 | **Empty Guardrails tabs** — Telemetry Snapshot and Filter Performance show no data | RESOLVED | **2026-04-09 — Kyle confirmed fixed.** |
| 7 | **Screeners tab missing family IMF thresholds** — only shows 4 base paths, not family-specific | RESOLVED | **2026-04-08 — B53 Fix 4 (`69ce68e6`).** Quant IMF cards now show "Family-specific (see table below)" instead of misleading global values. Kyle confirmed. |
| 8 | **Cooldown Exclusions card deployed** — new card showing pairs in cooldown | RESOLVED | **2026-04-07 — Cooldown functionality removed entirely (Fix 9).** Card removed from UI, cooldown filtering bypassed in adaptive-scan-manager.ts, cooldownState removed from API (schema v1.4). Redundant with fixed ~300 pair batch size. Kyle directive. |

## Strategy / Signal Pipeline Issues

| # | Issue | Status | Notes |
|---|-------|--------|-------|
| 9 | **Zero-signal strategy audit** — 8 strategies with 0% signal rate categorized into 4 buckets | IN PROGRESS | Analysis sent to Kyle. abcd_long VWAP fix done (B50). Other 7 strategies NOT fixed — categorized as regime-gated, disabled, pattern-dependent, or needing threshold audit. No code changes for those. |
| 10 | **abcd_long VWAP always undefined** — Kraken OHLC index [5] not mapped | RESOLVED | Fixed in B50. VWAP now mapped. Post-fix: strategy still has 84% pattern detection failure (structural, not a bug). |
| 11 | **Pattern path 100% strategy null** — all pattern strategy evaluations return null | IN PROGRESS | Identified but not root-caused. Need specific investigation of what kills pattern strategies. |
| 12 | **Additional strategies need threshold audit** — adaptive_flow, pivot_shift, liquidity_trap (10K+ evals, 0%) | OPEN | Identified in audit. No code changes made. |
| 12a | **Strategy audit incomplete** — only 8 of 17 strategies audited (zero-signal only). 9 strategies NOT audited: vwap_pullback, morning_star, mean_reversion, reverse_impulse, range_trade, support_bounce, sma_trend_ride, breakout, vwap_bounce | RESOLVED | **2026-04-08 — B53 completed full 17-strategy audit.** All strategies audited. Threshold relaxations deployed for 7 strategies (B53 Fix 1). |
| 12b | **dhma thresholds too strict** — DHMA_MIN_SEPARATION/LOOKBACK need relaxation for crypto. Zero signals. | OPEN | Recommendation made, no code change. Kyle decision needed. |
| 12c | **volatility_edge still 0% after B47 relaxation** — A-point detection logic may need review | OPEN | Vol mult relaxed 2.0→1.5 but no improvement. |
| 12d | **inside_bar_reversal still 0% after B47 relaxation** — pattern detection may be too strict | OPEN | Vol mult relaxed 1.5→1.3 but no improvement. |
| 12e | **Regime-gated strategies dormant** — adaptive_flow, pivot_shift, liquidity_trap only eligible in specific regimes | IN PROGRESS | By design, not a bug. Kyle decision: accept dormancy or relax regime eligibility? |
| 12f | **defensive_hedge inactive** — not active in current regime mapping | OPEN | Kyle decision: remove entirely or activate? |
| 13 | **Strategy nulls inflated by post-signal rejections** — generatePhase10Signal returned null for both true nulls AND rejections | RESOLVED | Fixed in B50. setNullReason() calls added before return null. Caller now distinguishes true nulls from post-signal rejections. |
| 14 | **Post-Signal Rejections pct() denominator bug** — used totalStratNulls instead of totalStrategyEvaluations | RESOLVED | Fixed in B50 with pctOfEvals() helper. |
| 15 | **DI 12→8 threshold decision** — analysis sent recommending wait for VTS outcome data | RESOLVED | **2026-04-09 — B54 Fix 2.** Staged relaxation 12→10 (not 8) per Langston recommendation. DB updated for both active_trend and vts_trend. Breakout already at 10/8 respectively. Trend family gained 5 additional pairs. |
| 16 | **Fixed % thresholds → ATR-relative** — Langston Batch 18H finding | OPEN | Not addressed. |
| 17 | **Duplicate scanPatterns() call** — deferred from Batch 41 | OPEN | Not addressed. |
| 17a | **Zero-duration closed simulated trades** — trades opening and closing in same/next cycle. Root cause: entry/stop/target calculated from OHLC but current market price already past stop or target. DEFENSIVE mode (×0.8 TP) compounds the issue. Duration display floored to minutes (0-59s = "0m"). | RESOLVED | **2026-04-08 — B53 Fix 2 (`bdb2b89e`).** Entry validation guard: before opening trade, verifies market price is above stop and below target with 2× friction minimum distance. Duration display now shows seconds for sub-minute ("45s" not "0m"). Langston approved A+C approach. Guard verified active in logs (catching ONDO/USD etc). |

## Architecture / Counting Issues

| # | Issue | Status | Notes |
|---|-------|--------|-------|
| 18 | **PairFailureTracker cooldown** — was hidden, now visible. Reduced from 10min/30min to 2min/5min. Pre-filter at batch selection. | RESOLVED | B51 reduced durations → B52 Fix 9 removed entirely. Cooldown bypassed in adaptive-scan-manager.ts, recording stopped. Kyle directive: redundant with fixed batch size. |
| 19 | **VTS Parity duplication (Directive 19F)** — pairs passing both quant+pattern get duplicated in VTS batch | IN PROGRESS | Architecture understood and explained to Kyle. The parity-added pattern entries explain why VTS evaluates MORE than single-scan family IMF survivors. Not a bug — intentional for sim-to-live parity. But needs to be properly reflected in Pipeline Summary display. |
| 20 | **Pair-pool evaluation counting** — new counters track pair+family combinations | IN PROGRESS | Deployed in B51. Langston-reviewed counting logic (pattern=1 per pair, quant=non-pattern families). Data accumulating. |

## Infrastructure / Comms Issues

| # | Issue | Status | Notes |
|---|-------|--------|-------|
| 21 | **Langston voice note transcription** — audio arrives but platform transcription doesn't fire for main agent | IN PROGRESS | Diagnosed as OpenClaw platform bug. CCDT workaround in place. Langston SOUL updated with instructions. Kyle says Langston should transcribe himself. |
| 22 | **Non-fatal DB column errors** — Neon schema export missing columns from later batches | RESOLVED | **2026-04-09 — Kyle confirmed fixed.** DB columns now populated correctly. |
| 23 | **ai-analyst.ts disabled** — OpenAI imports commented out, null stubs in place | RESOLVED | **2026-04-09 — B54 Fix 3 (`a4ee84fa`).** All 8 route handlers stubbed with 501. aiAnalyst variable and import removed from routes.ts. Service file retained for reference only. |
| 24 | **ML service not running** — python3 not in PATH | OPEN | Non-blocking, app runs in degraded mode. |
| 25 | **Pattern path min_price rejecting 193 pairs** — threshold may be too strict | OPEN | Not investigated. |

## Governance Debt

| # | Issue | Status | Notes |
|---|-------|--------|-------|
| 26 | **Governance catch-up batch** — BATCH_CATALOG, PHASE_HISTORY, SYSTEM_IMPACT_MAP, CHANGES_AND_FIXES all need updating for B48-B51 | OPEN | Kyle approved deferral but it needs to happen. |
| 27 | **B51-HF2 missing Langston review** — pushed without code review, workflow violation | RESOLVED | **2026-04-06 — Langston retroactively reviewed and approved.** Code confirmed using last-cycle data via getLastVTSCycleSnapshot(). |
| 28 | **Batch 51 Completion Report** — cannot be written yet, objectives not fully verified | OPEN | Depends on post-deploy audit and Kyle UI verification. |

## Batch 52 — New Issues Discovered (2026-04-06)

| # | Issue | Status | Notes |
|---|-------|--------|-------|
| 29 | **LQ threshold at 47 may be too aggressive** — now the largest filter by far. Kyle reviewing. | IN PROGRESS | DB updated 20→47 in B52. Research showed 20 was no-op (~$100/day). 47 = ~$50K/day. Kyle wants consensus on right level. |
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

## Summary Counts
- **RESOLVED:** 25 (#1, #2, #6, #7, #8, #10, #12a, #13, #14, #15, #17a, #18, #22, #23, #27, #30, #31, #32, #33, #34, #35, #36, #37, #38)
- **CRITICAL:** 0
- **IN PROGRESS:** 7 (#3, #4, #9, #11, #12e, #19, #20, #21, #29)
- **OPEN:** 8 (#5, #12, #12b, #12c, #12d, #12f, #16, #17, #24, #25, #26, #28)

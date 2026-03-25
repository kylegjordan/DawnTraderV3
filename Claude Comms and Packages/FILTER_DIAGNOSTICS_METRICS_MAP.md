# Filter Diagnostics — Metrics Map

**Created**: 2026-03-25
**Purpose**: Canonical reference for every metric displayed in the Filter Diagnostics tab. Maps each metric to its intended meaning, data source, and known issues.

---

## SECTION 1: Last Scan — Filter Breakdown (Global Filters)

| Metric | Intended Meaning | Data Source | File | Known Issues |
|--------|-----------------|-------------|------|--------------|
| Min Volume | Pairs rejected for volume < threshold | FX5 scanner global filter loop | fx5-scanner.ts → market-scanner.ts ~line 650 | None known |
| Max Spread | Pairs rejected for bid-ask spread > threshold | FX5 scanner global filter loop | market-scanner.ts ~line 660 | None known |
| Daily Range | Pairs rejected for daily range < threshold | FX5 scanner global filter loop | market-scanner.ts ~line 670 | None known |
| Min Price | Pairs rejected for price < threshold | FX5 scanner global filter loop | market-scanner.ts ~line 680 | None known |
| Stablecoin | Pairs rejected by stablecoin regex | FX5 scanner global filter loop | market-scanner.ts ~line 640 | None known |
| Quote Currency | Pairs rejected for non-USD quote | FX5 scanner global filter loop | market-scanner.ts ~line 690 | None known |
| Min History | Pairs rejected for insufficient history days | FX5 scanner global filter loop | market-scanner.ts ~line 700 | None known |
| Market Cap | Pairs rejected for market cap < threshold | FX5 scanner global filter loop | market-scanner.ts ~line 710 | None known |
| Guardrail Risk | Pairs rejected by guardrail risk check | FX5 scanner global filter loop | market-scanner.ts ~line 715 | None known |
| Correlation | Pairs rejected for correlation > threshold | FX5 scanner global filter loop | market-scanner.ts ~line 720 | None known |
| Already Active | Pairs skipped because already in active pool | FX5 scanner global filter loop | market-scanner.ts ~line 630 | None known |
| Passed All | Pairs surviving all global filters | Sum of survivors | fx5-scanner.ts ~line 800 | None known |

**Columns**: Quant Global (from `active_quant` or `vts_quant` DB row) | Pattern Global (from `active_pattern` or `vts_pattern` DB row)

---

## SECTION 2: IMF Metrics (Post-Global)

| Metric | Intended Meaning | Data Source | File | Known Issues |
|--------|-----------------|-------------|------|--------------|
| Failed LQ | Pairs where Liquidity Quality score < lqMin threshold | FX5 scanner IMF filter | fx5-scanner.ts ~line 950 | **All zeros** — LQ threshold may be too low (see Issue #7) |
| Failed VN | Pairs where VolNoise score > vnMax threshold | FX5 scanner IMF filter | fx5-scanner.ts ~line 955 | None known |
| Failed DI | Pairs where DI score outside diMin-diMax range | FX5 scanner IMF filter | fx5-scanner.ts ~line 960 | Pattern path: 580 failures — original problem not fully addressed (Issue #8) |
| Benchmark Bypassed | Benchmark pairs that skip IMF filtering | FX5 scanner benchmark logic | fx5-scanner.ts ~line 940 | **Shows 0 for pattern** — unclear if pattern path has bypass logic (Issue #9) |

**Columns**: Quant IMF | Pattern IMF

---

## SECTION 3: Family Path IMF Results (24h)

| Metric | Intended Meaning | Data Source | File | Known Issues |
|--------|-----------------|-------------|------|--------------|
| Trend (survivors/total) | Pairs surviving trend family IMF thresholds | FX5 scanner family filter loop | fx5-scanner.ts ~line 970 (Batch 22) | DI thresholds calibrated to 12/10 in Batch 23 HF |
| Reversal (survivors/total) | Pairs surviving reversal family IMF thresholds | FX5 scanner family filter loop | fx5-scanner.ts ~line 970 | None known |
| Breakout (survivors/total) | Pairs surviving breakout family IMF thresholds | FX5 scanner family filter loop | fx5-scanner.ts ~line 970 | DI thresholds calibrated to 10/8 in Batch 23 HF |
| Oscillator (survivors/total) | Pairs surviving oscillator family IMF thresholds | FX5 scanner family filter loop | fx5-scanner.ts ~line 970 | None known |
| Total Survivors (24h) | Sum of unique pairs surviving at least one family path | Aggregated across 24h scans | fx5-scanner.ts rolling diagnostics | In-memory only — does not persist across restart |
| LQ:X VN:Y DI:Z annotations | Failure counts per filter within each family | FX5 scanner family filter diagnostics | fx5-scanner.ts familyImfDiagnostics | Confusing display — pattern path annotations mixed with family rows (Issue #17) |

**Columns**: Quant families only (left) | Pattern total (right, separate filter path)

---

## SECTION 4: Signal Rejection Breakdown (24h)

| Metric | Intended Meaning | Data Source | File | Known Issues |
|--------|-----------------|-------------|------|--------------|
| Duplicate_Position_Max | Signals rejected because pair+strategy combo already has open VTS trade | logSkippedSignal() in vts-runner.ts ~line 893 | skipped-signals-logger.ts (disk: logs/vts_skipped_signals/) | **Vanishes after restart** — openVirtualTrades Map is in-memory, clears on restart, so guard never fires until trades rebuild (Issue #6). Also: SkipReason type was missing this value until Batch 24/25 |
| Net_EV_Negative / Net_EV_Below_VTS_Floor | Signals rejected because expected value below VTS minimum | logSkippedSignal() in vts-runner.ts | skipped-signals-logger.ts (disk) | None known |
| Low_ROI | Signals rejected for insufficient ROI | logSkippedSignal() | skipped-signals-logger.ts (disk) | None known |
| FinalScore_Low | Signals rejected for low FinalScore | logSkippedSignal() | skipped-signals-logger.ts (disk) | None known |
| RegimeWeight_Low | Signals rejected for low regime weight | logSkippedSignal() | skipped-signals-logger.ts (disk) | None known |
| ADX_Guard | Signals rejected by ADX < 25 guard | logSkippedSignal() | skipped-signals-logger.ts (disk) | None known |
| Duplicate_Position | Legacy duplicate position reason | logSkippedSignal() | skipped-signals-logger.ts (disk) | Overlaps with Duplicate_Position_Max — confusing (Issue #11) |
| BLOCKED_GOVERNANCE | Signals blocked by governance rules | logSkippedSignal() | skipped-signals-logger.ts (disk) | None known |
| LEARNING_DEFERRED | Signals deferred during learning mode | logSkippedSignal() | skipped-signals-logger.ts (disk) | None known |
| Confidence_Floor | Signals rejected for confidence below floor | logSkippedSignal() | skipped-signals-logger.ts (disk) | None known |
| Illiquid_USD | Signals rejected for illiquidity | logSkippedSignal() | skipped-signals-logger.ts (disk) | None known |
| Unique Combos Blocked (sub-row) | Distinct pair+strategy combos that triggered duplicate guard | Computed from disk logs in getSkippedSignalsSummary() | skipped-signals-logger.ts ~line 160 | Requires reason key match — fixed in Batch 22 HF6 |

**Data persistence**: Disk-persisted (logs/vts_skipped_signals/YYYY-MM-DD.json). Survives restarts.
**Known issue**: Zero-count categories were hidden — fixed in Batch 25 with ALL_REJECTION_REASONS constant.

---

## SECTION 5: VTS Evaluation Breakdown (24-Hour Rolling)

| Metric | Intended Meaning | Data Source | File | Known Issues |
|--------|-----------------|-------------|------|--------------|
| Pairs Evaluated (sampled per cycle) | Number of pairs VTS actually ran strategy evaluation on | vtsEvalCounters.quantPairsEvaluated + patternPairsEvaluated | vts-runner.ts ~line 1589 | **Doesn't match FX5 survivors** — VTS samples pairsPerCycle, OHLC gate drops pairs (Issue #3). Label now says "sampled per cycle" |
| Pattern Detection (pattern pool only) | Patterns detected vs not detected for pattern-pool pairs | vtsEvalCounters.patternDetected / patternNoDetection | vts-runner.ts ~line 1605-1608 | **Shows 0 for quant** — by design, quant pairs don't run scanPatterns() directly. But quant pairs CAN have pattern strategies via hybrid confluence (Issue #5) |
| Total Strategy Evaluations | Total detect() function calls across all pairs and strategies | vtsEvalCounters.totalStrategyEvaluations (old) + quantStrategyEvaluations + patternStrategyEvaluations (Batch 24) | vts-runner.ts ~line 1690 | **BUG: Duplicate guard increments nulls without incrementing evals** — so nulls > evals is possible (Issue #1b) |
| Strategy Returned Null | Strategy detect() returned null/undefined | vtsEvalCounters.quantStrategyNulls + patternStrategyNulls (Batch 25) | vts-runner.ts ~lines 1672, 1695 | **BUG: Can exceed Total Strategy Evaluations** because duplicate guard path increments nulls but NOT evals (Issue #1b) |
| Signals Generated | Successful signals from detect() that pass all VTS guards | vtsEvalCounters.signalsGenerated + quantSignalsGenerated + patternSignalsGenerated (Batch 24) | vts-runner.ts ~line 1701 | **15 pattern signals shown but Kyle can't see 15 pattern trades** — counter may count signals that don't lead to trade creation |

**Data persistence**: Disk-persisted since Batch 22 HF7 (logs/vts_eval_history/YYYY-MM-DD.json). Survives restarts.
**Columns**: Quant Pool | Pattern Pool | Total

---

## SECTION 6: By Strategy Breakdown

| Metric | Intended Meaning | Data Source | File | Known Issues |
|--------|-----------------|-------------|------|--------------|
| Strategy name | Each strategy evaluated | vtsEvalCounters.byStrategy[key] | vts-runner.ts ~line 1690 | None known |
| Evaluated | Number of times detect() was called for this strategy | byStrategy[key].evaluated | vts-runner.ts ~line 1690 | None known |
| Nulls | Number of times detect() returned null for this strategy | byStrategy[key].nulls | vts-runner.ts ~line 1694 | None known |
| Signals | Number of successful signals from this strategy | byStrategy[key].signals | vts-runner.ts ~line 1699 | None known |
| Hit Rate | signals / evaluated as percentage | Computed in UI | machine-learning.tsx | None known |
| TOTAL row | Sum of all strategies | Computed in UI (Batch 22 HF4) | machine-learning.tsx | None known |

---

## SECTION 7: Null Reason Breakdown (24h)

| Metric | Intended Meaning | Data Source | File | Known Issues |
|--------|-----------------|-------------|------|--------------|
| Strategy Conditions Not Met | detect() returned null — strategy setup not present | vtsEvalCounters.nullReasons.conditionsNotMet | vts-runner.ts ~line 1696 | Catch-all — doesn't distinguish WHY conditions weren't met |
| Duplicate Position | Pair+strategy combo already has open VTS trade | vtsEvalCounters.nullReasons.duplicatePosition | vts-runner.ts ~line 1673 | Different from Signal Rejection's Duplicate_Position_Max — this is VTS eval counter (in-memory + disk), that is skipped-signals-logger (disk only) (Issue #11) |
| Net EV Below Floor | Expected value below VTS minimum threshold | vtsEvalCounters.nullReasons.netEvBelowFloor | vts-runner.ts | Wired in Batch 23 |
| ADX Guard (< 25) | ADX below 25 guard for sma_trend_ride | vtsEvalCounters.nullReasons.adxGuard | vts-runner.ts | Wired in Batch 23 |
| Max Open Trades | Portfolio at maximum open trade capacity | vtsEvalCounters.nullReasons.maxOpenTrades | vts-runner.ts | Wired in Batch 23 |
| No Strategies for Regime | No enabled strategies matched the pair's regime | vtsEvalCounters.nullReasons.regimeNoStrategies | vts-runner.ts | Wired in Batch 21 |

**Data persistence**: In-memory (vtsEvalHistory array), persisted to disk since Batch 22 HF7.
**Known issue**: Categories should have bullet-point explanations underneath per Langston/Kyle agreement (Issue #16). Categories should match Langston's proposed taxonomy.

---

## CRITICAL INVARIANTS (must always hold true)

1. **Total Strategy Evaluations >= Strategy Returned Null + Signals Generated** (CURRENTLY VIOLATED — Issue #1b)
2. **Pairs Evaluated >= Pairs with Pattern Detection results** (pattern detection is a subset of evaluation)
3. **Signal Rejection total + Signals remaining = Total signals attempted** (not currently displayed — Issue #15)
4. **Per-pool columns must sum to Total column** (was violated by time-window mismatch — fixed by Batch 25 reset)

---

## DATA SOURCE LEGEND

| Source | Storage | Persistence | Restart Behavior |
|--------|---------|-------------|------------------|
| FX5 Scanner Diagnostics | In-memory (lastScanDiagnostics + rolling24h) | **Does NOT persist** | Resets to empty, rebuilds within 30 seconds |
| VTS Eval History | In-memory array + disk (logs/vts_eval_history/) | **Persists** (since HF7) | Hydrates from disk on startup |
| Skipped Signals Logger | Disk only (logs/vts_skipped_signals/) | **Persists** | Full 24h available immediately |
| Open Virtual Trades | In-memory Map only | **Does NOT persist** | Clears on restart — trades must rebuild |

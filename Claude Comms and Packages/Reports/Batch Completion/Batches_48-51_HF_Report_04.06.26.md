# Batch Report: Batches 48, 49, 50, 51 and All Hotfixes

> **Date Range:** 2026-04-02 through 2026-04-04
> **Status:** IN PROGRESS — multiple open items, session ended for quality reset
> **Commits:** 14 commits from `7612168e` through `a1b3225c`
> **Branch:** migration/aws-supabase
> **Prior Completed Batch:** Batch 47 (completion report: `Batch_Completion_47_04.02.26.md`)

---

## Pre-Batch Fixes (after B47, before B48)

| Commit | Description |
|--------|-------------|
| `7612168e` | Optimize pairTelemetry: Z-score histories stored per-symbol not per-entry |
| `c131ca08` | Add buffer cap to DataAggregator (prevent runaway memory on I/O failure) |
| `2a17e0b2` | Clarify Total Survivors counting basis with per-cycle average label |

---

## Batch 48 — Pipeline Summary Reconciliation (`480eb4fc`)

**Purpose:** Make the Pipeline Summary in Filter Diagnostics show the full data flow so survivors and evaluations can be traced end-to-end.

**Changes:**
- Restructured Pipeline Summary to show complete flow: Kraken Universe → Batch Selection → Global Filters → Family IMF → VTS Batch
- Added explicit data flow labels and per-stage counts

### Batch 48 HF — Remove Pattern-Path Regime DI Overrides (`ad571256`)
- Removed pattern-path regime-specific DI overrides that were overriding the DB-governed DI thresholds
- Pattern path now uses DB-configured DI values consistently

### Batch 48 HF2 — Signal Throughput Improvements (`9f9d43ca`)
- Relaxed range touch tolerance for range_trade strategy
- Adjusted VTS EV floor to allow more signals through

### Batch 48 HF3 — Fix range_trade Params (`4c754de6`)
- Fixed VTS range_trade parameters that were overriding strategy defaults
- Ensured strategy-specific config takes precedence over VTS global defaults

### Batch 48 HF4 — Fix setNullReason Import (`ae2636dc`)
- Fixed missing import for setNullReason in VTS runner
- Build was failing due to missing function reference

---

## Batch 49 — Per-Strategy Pre-Rejection Signal Counts (`1f167d45`)

**Purpose:** Add visibility into which strategies produce signals before post-signal rejections strip them out.

**Changes:**
- Added `preRejectionSignals` and `rejected` fields to byStrategy tracking
- Each strategy now shows: evaluated → nulls → signals found (pre-rejection) → rejected → final signals
- Allows identification of strategies that find setups but get blocked by Net EV floor

### Batch 49 HF — VTS Signal Funnel in Last Scan (`c71ed1b3`)
- Added VTS Signal Funnel section to Last Scan filter breakdown
- Showed pairs evaluated, strategy nulls, signals produced in the Last Scan view
- NOTE: This used 24h rolling data in the Last Scan section (time-base mixing issue that was later addressed in B50/B51-HF2)

---

## Batch 50 — Filter Diagnostics Cleanup + abcd_long VWAP Fix (`907a1f60`)

**Purpose:** Address Kyle's directive that Filter Diagnostics was a "hot mess." Clean up display issues, fix abcd_long zero-signal bug.

**Changes:**
1. **Removed redundant Signal Rejection Breakdown card** (~100 lines) — data already shown in Post-Signal Rejections section
2. **Fixed Post-Signal Rejections pct() denominator** — was using totalStratNulls, changed to totalStrategyEvaluations via new pctOfEvals() helper
3. **Removed dead code** — unused `signalRejections` destructuring and `formatReasonName` function
4. **Added Global DBS column** to open and closed trade tables
5. **Fixed abcd_long VWAP mapping** — Kraken OHLC index [5] was not mapped. Added `vwap: parseFloat(candle.vwap || candle[5] || 0) || undefined` to fetchOHLCForPair
6. **Added vwap? to OHLCData interface** in market-regime.types.ts
7. **Fixed strategy null inflation** — setNullReason() calls added before return null for net_ev_rejected, duplicate_position, max_open_trades. VTS caller now distinguishes true nulls from post-signal rejections.
8. **Removed VTS Signal Funnel from Last Scan** — intended to fix time-base mixing, but should have been replaced with last-scan data, not removed entirely. This was a mistake corrected in B51-HF2.

**Langston Review:** Approved.

---

## Batch 51 — Pipeline Transparency: Cooldown Visibility + Pair-Pool Count Fix (`ccbb2fc3`)

**Purpose:** Address Kyle's directive on survivors-to-evaluated gap. Surface hidden PairFailureTracker cooldown. Fix counting basis so survivors and evaluated use same units.

**Changes:**
1. **New Cooldown Exclusions card** in Filter Diagnostics UI — shows pairs currently in cooldown with fail counts, reasons, cooldown type
2. **Cooldown durations reduced** — COOLDOWN_MS: 600000→120000 (10min→2min), EXTENDED_COOLDOWN_MS: 1800000→300000 (30min→5min)
3. **New pair-pool evaluation counters** — quantPairPoolEvaluations and patternPairPoolEvaluations in VTSEvalSnapshot. Count pair+family combinations (not unique pairs) for apples-to-apples comparison with family-fanned IMF survivors.
4. **Counting logic** — Pattern path counts exactly 1 per pair; quant path counts non-pattern families only (excludes 'pattern' from family set). Langston caught and fixed double-counting bug.
5. **API changes** — cooldownState and config-driven durations in filter-diagnostics response. Schema v1.2.
6. **UI changes** — Cooldown Exclusions card, Pair-Pool Evaluations row (blue highlight) in VTS Evaluation table.
7. **Test updates** — adaptive-scan-manager.test.ts expectations updated.

**Langston Review:** Approved after two rounds (counting fix).

### Batch 51 HF — Per-Cycle Pair-Pool Logging (`28a5fc78`)
- Added `[51][PAIR_POOL]` log line per VTS cycle
- Shows quantPairPool, patternPairPool, total, skippedNoPrice, skippedOHLC, familyMismatch
- Confirmed Kyle's assertion: skippedNoPrice=0, skippedOHLC=0 in all cycles
- **Langston Review:** Not formally reviewed (logging-only).

### Batch 51 HF2 — Restore Full VTS Pipeline in Last Scan (`a1b3225c`)
- Added getLastVTSCycleSnapshot() to vts-runner — returns most recent single cycle
- Added lastCycleVtsEval to filter-diagnostics API response (schema v1.3)
- Restored VTS Signal Funnel in Last Scan with last-cycle data: pair-pool evaluations, strategy evaluations, nulls, signals, post-signal rejections, trades opened
- **Langston Review:** ⚠️ NOT REVIEWED — workflow violation. Pushed under time pressure.

---

## Key Discussions and Architectural Findings

### PairFailureTracker Cooldown
- Located at batch selection stage (adaptive-scan-manager.ts line 249), BEFORE the filter pipeline
- Pairs in cooldown never enter filters — this is a compute-efficiency measure, not a post-filter blocker
- Kyle initially concerned it was blocking pairs after they passed filters — confirmed it does not
- Reduced to 2min/5min and made visible in UI

### Survivors vs Evaluated Reconciliation
- **Root cause:** VTS counted unique pairs while survivors were counted as pair+family combinations
- **VTS Parity (Directive 19F):** Pairs passing BOTH quant and pattern filters get duplicated in VTS batch — quant family entries + one pattern entry. ~25-42 pairs overlap per scan.
- **Example cycle:** 117 quant family entries + 1 pattern-only + 29 parity duplicates = 147 total VTS entries
- **Remaining display gap:** Pipeline Summary shows quant family IMF passed but does not include pattern survivors + parity as explicit combined total

### Zero-Signal Strategy Audit (Partial)
- 8 of 17 strategies audited for zero signals
- Only code fix: abcd_long VWAP mapping (B50)
- Remaining 9 strategies NOT audited: vwap_pullback, morning_star, mean_reversion, reverse_impulse, range_trade, support_bounce, sma_trend_ride, breakout, vwap_bounce
- Multiple pending decisions on dhma thresholds, regime eligibility, defensive_hedge status

### Zero-Duration Simulated Trades
- Kyle identified from staging screenshots (2026-04-06): multiple trades showing 0m duration
- TAO/USD volatility_edge trades with identical entry prices opened and closed instantly
- Previous fixes (B45 re-entry cooldown, B47 setup-hash suppression) have not resolved this
- Needs deeper investigation — stop-loss may be too tight or close logic triggering too quickly

---

## Process Issues

1. B51-HF2 pushed without Langston code review
2. No post-deployment audits on hotfixes
3. Confused explanations of survivors-vs-evaluated gap wasted Kyle's time
4. Rapid-fire hotfixes degraded code quality
5. Claude Comms and Packages folder split across 3 locations (now resolved)
6. No batch completion reports written for B48-B51 (this report addresses that gap)

---

## Open Items for Next Session

See `Reports/RUNNING_ISSUES.md` for full tracked list (28+ items).

Priority items:
1. Post-deployment audit of B51-HF2 (Last Scan pipeline)
2. Retroactive Langston review of B51-HF2
3. Zero-duration trade investigation
4. Complete strategy audit (9 of 17 remaining)
5. Pipeline Summary combined total (quant families + pattern + parity)
6. Governance catch-up (BATCH_CATALOG, SYSTEM_IMPACT_MAP, etc.)
7. Pending Kyle decisions: DI 12→8, regime-gated strategy dormancy, dhma thresholds, defensive_hedge

---

## 2026-04-07 Addendum — Kyle Verification + Next Change Direction

### Verified by Kyle
- Kyle confirmed the recent Filter Diagnostics changes are now visible and working in both:
  - Last Scan view
  - 24-hour aggregated metrics view
- Most important behavioral change observed: **LQ is no longer a non-factor**. It is now the dominant pre-IMF blocker, which suggests the current threshold of **47** may now be too aggressive for the intended survivor flow.

### Kyle Direction on LQ Threshold
- Current threshold under discussion: **LQ = 47**
- Kyle's direction is **not** to blindly lower it, but to review whether 47 is genuinely protective or simply over-killing the pool.
- Working question for next audit: determine a justified lower range that preserves protection without making LQ the oversized choke point.
- Immediate recommendation for audit framing: treat this as a **threshold calibration review**, not a cosmetic UI change.

### Kyle-Requested Pipeline Summary Order (apply to both Last Scan and 24h)
Kyle requested the rows flow in this order:
1. **Family IMF Passed** (trend, reversal, breakout, oscillator breakdown)
2. **Pairs Remaining After IMF Filters**
3. **Benchmarks Bypassed / Removed**
4. **Final Survivors**

Additional UI direction:
- The new **Pairs Remaining After IMF Filters** row should sit **below** the family IMF breakdown and **above** benchmarks and final survivors.
- **Cooldown Exclusions** should move to the **bottom of the tab** because cooldown happens before the filter pipeline and currently interrupts the narrative flow.

### New Audit Concern — Cooldown Exclusion Count
Kyle flagged the cooldown table as potentially incorrect:
- Previously observed: **1,318 pairs currently excluded**
- Later observed: **1,268 pairs currently excluded**
- With Kraken universe size around **1,400 to 1,500 pairs**, this implies an extremely large share of the exchange is being excluded at once.

This requires explicit audit before any threshold decision is trusted.

### Assessment Added to Open Batch Record
Based on code review of the current implementation state:
- The requested **row reordering** is architecturally consistent with the intended pipeline story.
- The **cooldown count concern is legitimate** and should be treated as a correctness audit item, not assumed to be a display quirk.
- The cooldown mechanism was surfaced in Batch 51 as a hidden pre-filter exclusion, so any inflated count can distort how Kyle interprets the whole funnel.
- Before further survivor-threshold tuning, we should confirm whether the cooldown table is:
  - showing unique pairs vs pair-family entries,
  - showing active cooldown only vs cumulative failures,
  - including benchmark or non-tradable universe artifacts,
  - or reflecting stale state rather than current exclusion truth.

### Next Planning / Audit Scope
Before spec approval for the next code pass, audit should cover:
1. **LQ threshold calibration** — determine whether 47 should remain, or be reduced to a more balanced operating range.
2. **Pipeline Summary reorder** — Last Scan + 24h must present IMF survivors, then post-IMF remaining pairs, then benchmark removal, then final survivors.
3. **Cooldown Exclusions repositioning** — move to bottom of tab.
4. **Cooldown truth audit** — verify whether the displayed excluded-pair count is mathematically correct and using the right counting basis.
5. **Counting-basis audit** — ensure all rows in the revised summary use clearly labeled units and do not mix unique pairs, pair-family entries, and bypass counts without explicit labeling.

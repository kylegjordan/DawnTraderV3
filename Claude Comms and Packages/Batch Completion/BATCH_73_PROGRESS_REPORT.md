# Batch 73 — Progress Report (OPEN — multi-week observation underway, B73.1 hotfix + B73.2 follow-up shipped 2026-04-30)

## 2026-04-30 afternoon — B73.2 + Factor Calibration UI panel

**Triggered** by Kyle observation that B73.1 morning fix was structurally working but variants STILL all collapsed to identical rows. Direct Kraken OHLC pull on AIXBT/USD (90 min, BE_stop): max bar high +0.5%; BE trigger threshold (proxy ATR) +5.9%. No bar's high crossed the trigger. Yet live trade DID latch BE — sub-minute pricing-service tick movement that 1-min OHLC bars don't expose.

**Per Langston cc-inbox #866** (TWO separate questions, TWO separate fixes):
- Q1 headline ("does live BE-stop convert TPs to BEs?") → answered by Variants F/K with EXTENDED post-exit window
- Q2 parameter comparison → answered by A-E with TRIGGER thresholds that fire at bar resolution

**Implementation** (`a98ce7ff`, PM2 #119):
- Bar-derived ATR (14-bar TR average over 14 1-min bars BEFORE entry). Variant triggers use this instead of `(target-entry)/1.5` proxy
- OHLC window extended to `entryTime + maxHoldMs` (7d), pagination enabled (10080 candle cap, 14 batches, 500ms delay)
- `atr_live` + `atr_bar_derived` both logged in metadata of every variant row for diagnostic validation
- Wiped 180 useless inherited-only B73 rows from B73.1 window

**Plus Factor Calibration UI panel** — Kyle observation that pre-B67.5 the Factor Ablation Comparison panel was decoratively dead. Underlying data IS captured in JSONB. Surfaced via new endpoint + UI panel:
- `GET /api/analytics/factor-calibration` returning per-factor confidence-shift distribution + tertile WR + predictive lift
- New `FactorCalibrationSection` rendered above the existing Factor Ablation Comparison panel
- Existing panel marked SUBSTRATE with pre-B67.5 explanatory note; stays in UI per Kyle directive
- Decision-grade threshold: n ≥ 150 per tertile bucket (Langston cc-inbox #856)
- Mid-window decision logic: lift > +7pp with n ≥ 50/bucket and monotonic ordering = ship factor early; lift solidly negative = drop factor early

## 2026-04-30 morning — B73.1 + B67.0.1 combined hotfix sub-batch

Kyle observed both ablation panels were producing un-decision-grade data. Diagnosis + fixes per Langston cc-inbox #864 (Q1-Q4 all approved):

**B67.0 — Factor Ablation: 0/1406 replay matches.** Root cause: vts-runner emit ID `vsig_p10_*` ≠ JSONL `signal.id = vts_<sym>_<strat>_<ts>`. Switched to natural-key tuple `(pair_symbol, evaluated_at±60s, strategy)`. Added `strategy` column + composite index to `regime_factor_alternates`. Updated emit signature + both call sites (vts-runner, signal-orchestrator). Wiped 1477 NULL-strategy pre-fix rows.

**B73 — Exit-Strategy Ablation: 11/12 variants identical across 39 trades.** Three structural causes — (a) ATR proxy `(target-entry)/1.5` mis-scaling BE triggers, (b) TIMEOUT exit synthesizing identical last-bar mid, (c) Variant A re-simulating instead of being live truth. Fixes: (a) plumb real `atrAtOpen` through trade record → B73 hook, (b) `timeoutExit` inherits realized exit values, (c) `mkVariantAFromRealized` returns realized truth directly. Wiped 480 bad pre-fix rows. Tests rewritten.

**drift-dashboard aggregator alignment** (additional hotfix): aggregator queried `notes='admit_admit_no_delta'` but emitter writes `'pre_b67_5_both_admit'`. Aligned to actual shape.

**Commits:** `3afd8ed2` (combined fix) + `f6a0bb87` `67cf66d9` (aggregator + backtick-in-template build hotfix). PM2 #117 → #118.

**Verified end-to-end:** ad-hoc `npm run b67:replay-ablation` matched 4 rows (FLOW/USD strong_bull_trend close); API returns `bothAdmit=1 replayed=1` per factor; B73 first post-fix close populated 12 differentiated rows (A=`source: realized_truth`, B-L=`source: realized_inherited` with metadata explaining why each didn't fire).

**v2 watchpoint** (Langston Q4): 720-bar OHLC cap could systematically TIMEOUT trades >12h. Not blocking — max TIMEOUT duration on pre-fix data was 283 min, well under 12h. Add multi-call pagination if observation period reveals long-duration trades being capped.

---

# Batch 73 — Progress Report (original entry)

**Type:** Exit-Strategy Ablation Framework (observation only)
**Triggered by:** Kyle 2026-04-29 review of 7d closed-trades CSV showing 509 BE_STOP (44%) vs 22 TP (2%); long winning streaks gone
**Parent batch:** Independent (parallel to B67 calibration window)
**HEAD commit:** `a747b646` (data layer ship, 2026-04-29)
**PM2:** #115

---

## Sub-deliverable status

| # | Sub-deliverable | Status |
|---|---|---|
| 1 | Counterfactual investigation (n=87) | ✅ DONE — 18.4% would have hit TP first; net +1.18% per trade vs ~0% with BE-stop. n too small to act on alone. |
| 2 | 12-variant scope + pre-audit | ✅ DONE — `BATCH_73_SCOPE.md` + `BATCH_73_PRE_AUDIT.md`. Langston Steps 1/2 cc-inbox #861/#862. |
| 3 | Data layer (migration + replay service + VTS hook) | ✅ SHIPPED — commit `a747b646`, PM2 #115. Langston Step 4 cc-inbox #863. |
| 4 | API endpoint `GET /api/analytics/exit-strategy-ablation` | ✅ SHIPPED — commit `a4bd0e6c`, PM2 #116. Returns per-variant Sharpe-like score, paired-diff vs Variant A baseline, exit-reason breakdown, per-regime filter. |
| 5 | UI panel "Exit Strategy Ablation" in analytics page | ✅ SHIPPED — commit `a4bd0e6c`. Rendered under Analytics → Drift Dashboard tab alongside DriftDashboardSection + AblationComparisonSection. Sortable by Δ vs A. Sharpe color-coded. Per-regime dropdown. READY/ACCUMULATING badge. |
| 6 | Unit tests (12 variants + state machine + edge cases) | ✅ SHIPPED — commits `49c711d2` (initial) + `f53b9d60` (3 float-precision assertion fixes). CI run `25136181772` Test Suite/Build/Docker green. 916 total tests passing. |
| 7 | Multi-week observation (n=200 total + n=50 per-regime min) | ⏳ Accumulating starting first VTS close post-deploy. Currently 0 rows. |
| 8 | Variant winner declaration via Sharpe-like metric | ⏳ When n thresholds met (~1.3 days at 160 trades/day for headline; longer for per-regime). |

---

## What shipped tonight (data layer)

### Files

| File | Type | Lines |
|---|---|---|
| `drizzle/migrations/2026-04-30-b73-exit-strategy-alternates.sql` | NEW | 60 |
| `drizzle/migrations/2026-04-30-b73-exit-strategy-alternates-rollback.sql` | NEW | 5 |
| `server/services/exit-strategy-replay.ts` | NEW | 407 |
| `server/services/exit-strategy-replay-service.ts` | NEW | 219 |
| `server/services/vts-service.ts` | MODIFIED | +34 |

Total: +725 lines, 5 files, 1 commit (`a747b646`).

### Architecture

Parallel to B67.0 ablation framework but post-trade instead of pre-trade.

- New `exit_strategy_alternates` table — 12 rows per closed VTS trade
- 12 variant evaluators (BE A-F, Trail G-J, Combined K-L) in `exit-strategy-replay.ts`
- Async fire-and-forget orchestrator in `exit-strategy-replay-service.ts`
- Hook in `vts-service.persistRealPriceTrade` (VTS path only — paper-execution-engine intentionally skipped)
- 13 module_constants in new `exit_strategy_replay` module

### Variants

**BE-stop (A-F):**
| ID | Name | Logic |
|---|---|---|
| A | current_BE_stop_baseline | Latch BE when 1×ATR favorable (anchors on `b73_baseline_*` snapshot) |
| B | atr_padded_BE_plus | Latch at BE + 0.5×ATR pad |
| C | higher_BE_trigger | Latch only after 1.5×ATR favorable move |
| D | trailing_instead_of_BE | No BE; activate trailing at 1×ATR favorable |
| E | vol_conditional_skip | Skip BE entirely on high-vol pairs (vol > P75 threshold) |
| F | no_BE_stop | Pure original SL only — true counterfactual |

**Trailing (G-J):**
| ID | Name | Logic |
|---|---|---|
| G | current_trailing_baseline | 1×ATR trail distance |
| H | tighter_trail | 0.5×ATR |
| I | looser_trail | 2.0×ATR |
| J | no_trailing | Skip trailing entirely |

**Combined (K-L):**
| ID | Name | Logic |
|---|---|---|
| K | no_BE_no_trail | Pure target/SL — minimum-intervention baseline |
| L | BE_plus_and_looser_trail | BE + 0.5×ATR pad → trailing at 2×ATR after target_lock_r |

### Workflow gates

| Step | Status | Evidence |
|---|---|---|
| 1 — Scope | ✅ | `BATCH_73_SCOPE.md` `a7c48007`. Langston cc-inbox #861. |
| 2 — Pre-audit | ✅ | `BATCH_73_PRE_AUDIT.md` `f0374418`. SIM consultation. Langston cc-inbox #862. |
| 3 — Implementation | ✅ | 5 files, +725 lines. |
| 4 — Code review | ✅ | 760-line diff. Langston cc-inbox #863. |
| 5 — Push + CI | ✅ | `a747b646` pushed. |
| 6 — Migration + Deploy | ✅ | 13 INSERTs applied; PM2 #115 online. |
| 7 — First-pass verification | ⏳ | Awaiting first VTS trade close to populate 12 rows. |
| 8 — Second-pass (Langston) | ⏳ | After first verification data. |
| 10 — Governance | ✅ this report + BATCH_CATALOG + PHASE_HISTORY + SIM + CHANGES_AND_FIXES + MEMORY |
| 11 — Completion ack | ⏳ Pending Kyle (after follow-up commits + observation period) |

---

## Selection criterion (PRE-REGISTERED — do not data-mine)

Per Langston cc-inbox #858:
```
score(variant) = (mean_pnl_variant - mean_pnl_baseline) / std(pnl_variant - pnl_baseline) × sqrt(n)
```
- Penalizes variance, rewards consistency
- Paired-diff metric: each trade contributes a per-variant difference vs Variant A baseline
- **n=200 total minimum** for headline winner declaration
- **n=50 per regime minimum** for regime-specific recommendations

---

## Conventions + edge cases

- **1-min OHLC granularity.** Within-bar wick precision lost. Convention: any bar where `low ≤ level` (BUY) or `high ≥ level` (SELL) → triggered. Conservative; matches real-stop semantics.
- **Variant A baseline isolation.** Reads from `b73_baseline_be_trigger_r` and `b73_baseline_trail_distance_atr` snapshot constants (NOT live `trailing_exit`). Paired-diff Sharpe stays valid across TEC tuning.
- **Trailing state machine.** Stateful per-trade: `peak_price`, `current_trail_level`, `atr_multiplier`. Updated per bar.
- **Moonbag/ladder replay deferred to v2** per Langston cc-inbox #859.
- **OHLC window cap.** `min(actualExit + 1h buffer, entryTime + maxHoldMs=7d)` per Langston cc-inbox #861 Q6.
- **Hit-check ordering on simultaneous bars.** Target check before SL check (optimistic interpretation). Acceptable for observation framework — affects absolute P&L but not variant ranking. v2: add `gap_bar=true` metadata flag.

---

## v2 enhancements (deferred)

1. **Real ATR plumbing** through trade record. Currently approximated as `Math.abs(target - entry) / 1.5` (target_lock_r proxy). Consistent across all 12 variants so relative comparisons valid; absolute thresholds slightly off.
2. **`b73_variant_l_target_lock_r` module_constant.** Currently hardcoded at 1.5 in `replayCombined()`. Should be DB-tunable like other variant params.
3. **`gap_bar=true` metadata flag** when bar hits both target AND stop simultaneously. Lets post-hoc analysis quantify edge-case frequency.
4. **Moonbag/ladder replay** as full v2 framework if combined variants show enough signal to pursue.

---

## Why no paper-execution-engine hook (Kyle directive 2026-04-29)

B73 is a **research-mode framework** for multi-week observation → variant selection. Active trading is currently OFF, so paper-execution-engine isn't closing trades anyway. Per Kyle: "Once we pick variants, we either modularize or just tune live TEC config." Forward-compat hook to inactive paths is speculative complexity. If active trading reactivates BEFORE B73 conclusion, the paper hook is a 5-line addition at that moment.

This matches B67's symmetry: B67.0 ablation framework hooks into `signal-orchestrator.ts` (active path) and `vts-runner.ts` (VTS path) — but NOT `paper-execution-engine.ts`, because paper-execution-engine just executes signals that signal-orchestrator already produced ablation rows for. Both frameworks rely on the pre-paper hook points.

---

## Same-day follow-ups all shipped tonight

1. ✅ **API endpoint** `GET /api/analytics/exit-strategy-ablation?window=<>&regime=<>` — commit `a4bd0e6c`. Returns per-variant: n, mean_pnl, mean_diff_vs_baseline, std_diff, sharpe_score, win_rate, exit_reason_breakdown, mean_duration_min. Reads `b73_min_n_total` and `b73_min_n_per_regime` from module_constants for ready-state badge.
2. ✅ **UI panel** "Exit Strategy Ablation" — commit `a4bd0e6c`. Rendered under Analytics → Drift Dashboard tab. Variants sorted by Δ vs A descending. Sharpe color-coded (>1.0 emerald-bold, >0.5 emerald, <-0.5 red). Per-regime dropdown (All / TFS / HVU / RBS / IE / ST). Window selector (24h / 7d / 30d / Since latest). READY vs ACCUMULATING badge. Top-3 exit reasons inline per row. Reading-guide footer with all 12 variant definitions.
3. ✅ **Unit tests** in `server/tests/unit/b73-exit-strategy-replay.test.ts` — commits `49c711d2` (initial) + `f53b9d60` (float-precision fixes):
   - INSUFFICIENT_DATA path (all 12 variants when no OHLC bars)
   - Variant A: TP-direct, BE-retrace (canonical "BE protects from drawdown"), SL-no-latch, TIMEOUT
   - Variant F: TP after retrace ("leaves money on table" scenario from n=87 counterfactual finding)
   - Variant B: BE+pad exits at 101 vs A's BE=100 on same bar
   - Variant C: doesn't latch on 1×ATR move (only on 1.5×ATR)
   - Variant E: vol-conditional A→F switch (low-vol = A, high-vol = F)
   - Trailing state machine (G/H/I): activation, peak update, trail level computation, tighter exits earlier than baseline, looser exits later
   - Variant J: hits target through volatility (no trail interference)
   - Variant L combined: phase transitions pre→be_latched→trailing
   - SELL trade direction (inverted target/SL checks)
   - Gap-bar edge case (target wins per Langston cc-inbox #863)
   - Return shape (12 variants in correct order with correct names)
   - **CI run `25136181772` Test Suite + Build + Docker GREEN. 916 total tests passing.**
4. **NOT included** (Kyle directive 2026-04-29): paper-execution-engine close-path hook. B73 is research-mode framework; active trading OFF; B67-style symmetry — neither framework needs paper hook today.

---

## Verification SQL (use post-first-close to confirm population)

```sql
-- Should return 12 rows per closed trade and 12 distinct variant_ids
SELECT count(*) AS rows, count(DISTINCT variant_id) AS variants
FROM exit_strategy_alternates;

-- Per-variant breakdown
SELECT variant_id, variant_name, count(*) AS n,
       round(avg(virtual_pnl_pct)::numeric, 3) AS avg_pnl,
       round(avg(virtual_pnl_pct - baseline_pnl_pct)::numeric, 3) AS avg_diff_vs_baseline
FROM exit_strategy_alternates
GROUP BY variant_id, variant_name
ORDER BY variant_id;

-- Per-regime per-variant
SELECT regime, variant_id, count(*) AS n,
       round(avg(virtual_pnl_pct)::numeric, 3) AS avg_pnl
FROM exit_strategy_alternates
GROUP BY regime, variant_id
ORDER BY regime, variant_id;
```

---

*This report is OPEN. Next update when (a) follow-up commits land tomorrow, (b) n=200 threshold met, (c) winner declared.*

---

# B73.3 — F/J Variant Simulator Fix (correctness)

**Status:** SHIPPED 2026-05-04. PM2 #140. Commit `17a35c50` (1 file, +104/-2).
**Trigger:** Kyle observation 2026-05-04 reviewing the Exit Strategy Ablation table — F (no_BE_stop), J (no_trailing), and K (no_BE_no_trail) all showed identical numbers: +0.315 mean P&L, Sharpe 1.84, 69.5% win rate, 148 min avg duration. Three variants with different definitions producing byte-identical outcomes is a smell that turned out to be a real bug.

## Root cause

All three variants routed to `replayPureSlTp(inputs, id, params)` where `params = { allowBe, trailMultiplier }`. The function destructured `params` but **never used `allowBe` or `trailMultiplier` anywhere in the function body.** The function only checked: target hit / original SL hit / timeout. No BE logic, no trailing logic. F and J ran K's pure-SL/TP semantic regardless of their intended distinct behavior.

## Net effect on prior calibration data

The "remove BE-stop adds 0.090 P&L" finding from earlier reads actually measures **K** (remove BOTH BE + trailing). We had no isolated measurement of "BE alone" vs "trailing alone" effects. K's signal stands as "remove all post-entry protection beats baseline at Sharpe 1.84" — that's still real and meaningful. But the recommendation can't be refined to "BE specifically" or "trailing specifically" until F and J produce real differentiated data.

## Fix

Two new dedicated simulators in `exit-strategy-replay.ts`:

**`replayNoBeWithTrailingTake` (Variant F):**
- Pre-target phase: walks bars checking only original SL or target hit. **No BE-lock at +1×ATR.**
- On target hit: switch to trailing-after-target (moonbag) phase.
- Trailing phase: peak-tracking trail at `trailMultiplier × ATR`. Exit when price retraces to trail level.
- Distinct from G/H/I which trail INSTEAD of BE (activate trailing at +1×ATR trigger).

**`replayBeOnlyNoTrail` (Variant J):**
- Pre-trigger phase: SL at original stop, TP at target.
- Hit +1×ATR favorable → latch BE (stop ratchets to entry).
- BE-latched phase: SL at entry (BE_stop), TP at target.
- **Target hit: exit at target. No trailing afterwards.**

K (`replayPureSlTp`) unchanged — its existing pure-SL/TP semantic IS correct for K's intended behavior. K stays as the reference "remove all protection."

## What we'll learn next

After the next 04:00 UTC nightly replay-ablation cron runs, F and J will produce differentiated results from K. Within 7-10 days we'll have clean data to distinguish:
- "BE-stop is the problem, trailing is fine" → J would beat A but F/K wouldn't
- "Trailing is the problem, BE is fine" → F would beat A but J/K wouldn't
- "Both are problems" → all three (F/J/K) beat A by similar margins
- "The interaction is the problem" → K beats A but F and J alone don't

K's +0.090 / Sharpe 1.84 result is what was previously reported for F/J/K and stands as the "remove all protection" reference. The earlier read "turn off BE-stop" needs to be walked back to "K wins; need F/J data to know which specific layer to remove."

## Verification asks (post-compact)

After the 04:00 UTC replay cron runs:
1. Check that F, J, K rows in the Exit Strategy Ablation table now show **differentiated** numbers (different Δ vs A, different Sharpe).
2. Check that K's row still shows roughly +0.090 vs A — that signal should be preserved since K's simulator didn't change.
3. F's exit-reason distribution should show TRAIL_hit on a meaningful fraction of trades (since F runs trailing after target).
4. J's exit-reason distribution should show BE_stop and TP_target_hit but no TRAIL_hit (J never trails).
5. Wait 7-10 days for n to grow before forming any operational decision.

## Final BE/trailing decision deferred

The earlier "turn off BE-stop" recommendation is walked back. Wait for differentiated F/J data to mature, then decide between:
- Disable BE only (J's answer if J wins)
- Disable trailing only (F's answer if F wins)
- Disable both (K — current preliminary read)
- Keep current (A — if F/J/K all collapse to baseline-level once measured properly)

Earliest defensible decision: ~2026-05-11 if signal holds; ~2026-05-15 to align with the broader B67.4 calibration window.

---

*B73.3 closure section complete 2026-05-04. Report stays OPEN pending winner declaration once n=200 threshold met across all variants.*

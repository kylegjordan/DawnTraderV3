# Batch 73 — Progress Report (OPEN — multi-week observation underway)

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

# BATCH 73 — Exit-Strategy Ablation Framework

**Owner:** Kyle (decisions), Claude Code (implementation), Langston (review)
**Date opened:** 2026-04-29
**Status:** Step 1 — scope drafted, awaiting Langston review
**Type:** Observation-only (NO exit-behavior changes)
**Triggered by:** Kyle's 7d data review showing 509 BE_STOP (44%) vs only 22 take-profit-hits (2%); long winning streaks gone

---

## §1 Why this batch exists

7-day VTS data (1,165 closed trades):
- **44% BREAK_EVEN_STOP** — most common outcome
- **2% TAKE_PROFIT** — rare; only 1 streak of 3+ TPs
- 52 BE-streaks of 3+ (longest 32), 45 SL-streaks (longest 74), only 1 TP streak

Kyle's hypothesis: **BE-stop is converting what would have been TPs into break-evens.** Price retraces to BE due to volatility, BE stops it out, then climbs back to target.

Counterfactual analysis on 87 BE_STOP trades with `originalStopPrice` populated (Kraken OHLC walk-forward, 8h window):
- 18.4% would have hit TP first → avg +8.98%
- 28.7% would have hit original SL first → avg −1.98%
- 52.9% chopped sideways → avg +0.18%
- **Net: +1.18% per trade vs ~0% with BE-stop**

n=87 too small to act on alone. **B73 builds the multi-week observation framework** to confirm or refute the hypothesis at statistical significance, and to evaluate alternatives.

## §2 What it does (and doesn't do)

**Does:**
- On every closed trade, replay 12 exit-strategy variants against the trade's actual OHLC bar history
- Record what each variant WOULD have exited at (price, time, reason, P&L)
- Persist to a new `exit_strategy_alternates` table (parallel to B67.0's `regime_factor_alternates`)
- New dashboard panel for variant comparison (per-regime breakdown supported)

**Does NOT:**
- Change actual exit behavior (zero contamination with B67 calibration window)
- Process tick-level data (1-min OHLC sufficient — same as replay-ablation.ts)
- Require any prerequisite fix (`originalStopPrice` 100% populated on new trades since 2026-04-29)

## §3 Variant set (12 variants)

### BE-stop variants (A-F)

| ID | Name | Logic |
|---|---|---|
| **A** | Current BE-stop (baseline) | Latch SL to BE when favorable move ≥ 1×ATR |
| **B** | ATR-padded BE+ | Latch SL to BE + 0.5×ATR (volatility buffer above BE) |
| **C** | Higher trigger threshold | Latch BE only after 1.5×ATR favorable move (currently 1×ATR) |
| **D** | Trailing instead of BE | No BE latch; activate trailing stop at 1×ATR favorable |
| **E** | Volatility-conditional skip | Skip BE-stop entirely on high-vol pairs (vol > P75 of universe) |
| **F** | NO BE-stop | Pure original SL only — true counterfactual baseline |

### Trailing-stop variants (G-J)

| ID | Name | Logic |
|---|---|---|
| **G** | Current trailing (baseline) | Existing TEC trailing logic with 2×ATR trail distance |
| **H** | Tighter trail | 1×ATR trail distance |
| **I** | Looser trail | 3×ATR trail distance |
| **J** | NO trailing | Skip trailing entirely; let target/SL fire |

### Combined variants (K-L)

| ID | Name | Logic |
|---|---|---|
| **K** | NO BE + NO trail | Pure target/SL only — minimum-intervention baseline |
| **L** | ATR-padded BE+ AND looser trail | Best-of-both candidate from §3 + I |

## §4 Replay precision

**1-min OHLC** from existing `ohlc-cache.ts`. Matches `replay-ablation.ts` pattern. Acceptable trade-off:
- Within-bar wick precision lost: BE-stop level may have been touched and bounced within a single 1-min bar
- Convention: **any bar where low ≤ BE level → stop triggered** (conservative; matches how real stops fire on level-crossing)
- Documented assumption per Langston cc-inbox #859

**Trailing-stop replay state machine** (per Langston cc-inbox #859):
- Stateful per-trade: `trail_active`, `current_trail_level`, `peak_price`
- Per bar: update peak; if active, compute new trail level = peak − (atr × multiplier); if low ≤ trail level → exit
- Skip moonbag/ladder replay for v1 (too stateful; v2 enhancement if signal warrants)

## §5 Selection criterion

Per Langston cc-inbox #858: **Sharpe-like metric, NOT total P&L × n**:

```
score(variant) = (mean_pnl_variant - mean_pnl_baseline) / std(pnl_variant - pnl_baseline) × sqrt(n)
```

Where:
- `mean_pnl_variant` = avg per-trade P&L if this variant had been used
- `mean_pnl_baseline` = avg per-trade P&L of variant A (current BE-stop)
- `std(...)` = std dev of per-trade differences (paired)
- `n` = number of trades replayed

This penalizes variance and rewards consistency. **Pre-registered in this scope so we don't data-mine the metric after seeing results.**

## §6 Per-regime breakdown

Dashboard supports filtering by regime — optimal variant may differ per regime (e.g., Variant E might win for HVU, Variant F for TFS). The final decision can be per-regime if data supports it.

Per-regime score = same Sharpe-like formula, restricted to trades classified into that regime.

## §7 Schema

New table `exit_strategy_alternates`:

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| trade_id | varchar | FK to closed trade (paper_sim_trades.id OR JSONL trade.id) |
| trade_source | text | 'paper' \| 'vts' |
| variant_id | varchar | 'A' through 'L' |
| variant_name | varchar | 'current_BE_stop', 'atr_padded_be_plus', etc. |
| virtual_exit_price | numeric | What this variant would have exited at |
| virtual_exit_reason | varchar | 'TP_target_hit', 'SL_hit', 'BE_stop', 'TRAIL_hit', 'TIMEOUT' |
| virtual_exit_time | timestamptz | When the virtual exit would have fired |
| virtual_pnl_pct | numeric | P&L if this variant had been used |
| virtual_duration_min | int | Trade duration if this variant |
| baseline_pnl_pct | numeric | Variant A's P&L for the same trade (for paired difference) |
| regime | text | Regime at trade open |
| strategy | text | Strategy name |
| metadata | jsonb | Variant params (ATR multiplier, etc.), edge cases (insufficient OHLC) |
| created_at | timestamptz | row timestamp |

Indexes: `(trade_id, variant_id)` unique, `(variant_id, created_at)` for dashboard queries.

## §8 Population mechanism

Hook into trade-close path (paper-execution-engine + vts-service `persistRealPriceTrade`). Async fire-and-forget call to new service `exit-strategy-replay.ts`:

```typescript
// In trade-close flow:
exitStrategyReplay.replayAndPersist(trade).catch(e =>
  console.error('[B73][exit-replay]', e)
);
```

Service:
1. Loads OHLC bars for the trade window from `ohlc-cache.ts` (entry_time → exit_time + 1h buffer)
2. For each of 12 variants: simulates the variant's exit logic, computes virtual_exit
3. Bulk-inserts 12 rows into `exit_strategy_alternates`

Trade close path is unblocked — replay errors don't affect actual close.

## §9 Numbered Objectives

**A. Schema + migration**
- A.1 Migration `2026-04-30-b73-exit-strategy-alternates.sql` creates the table + indexes
- A.2 Forward + rollback files

**B. Replay service**
- B.1 New file `server/services/exit-strategy-replay.ts`: 12 variant implementations, each as a pure function `(trade, ohlcBars, params) → VirtualExit`
- B.2 BE-stop variants (A-F): stateless level-crossing checks
- B.3 Trailing-stop variants (G-J): simplified state machine (peak + level + multiplier)
- B.4 Combined variants (K-L): compose BE + trailing logic
- B.5 Variant params resolved from `module_constants` (per §0.9 governance)

**C. Trade-close integration**
- C.1 Hook in `paper-execution-engine.ts` close path (active trading — currently OFF; forward-compat)
- C.2 Hook in `vts-service.ts:persistRealPriceTrade` (VTS path — current production data)

**D. Module constants**
- D.1 12+ new constants in `exit_strategy_replay` module: per-variant ATR multipliers, BE+ pad, trigger thresholds, vol percentile threshold for variant E

**E. Dashboard panel**
- E.1 New panel "Exit Strategy Ablation" alongside existing B67.0 ablation panel
- E.2 Variant leaderboard sorted by Sharpe score
- E.3 Per-regime filter dropdown
- E.4 API endpoint `GET /api/analytics/exit-strategy-ablation?regime=<filter>` returning aggregated metrics

**F. Tests**
- F.1 Unit tests per variant: synthetic OHLC scenarios with known correct virtual exits
- F.2 Replay state machine tests for trailing variants (peak update, trail level computation, exit trigger)
- F.3 Edge cases: trade closed at first bar (insufficient post-exit OHLC), all variants timeout, etc.

**G. Observability**
- G.1 `[B73][exit-replay]` log lines on every replay (success + error paths)
- G.2 PM2 metric: replay success rate, error rate, processing time
- G.3 Replay errors are non-blocking (catch + log, don't throw into trade-close)

**H. Governance**
- H.1 Update `BATCH_CATALOG.md` + `PHASE_HISTORY.md` + `MEMORY.md` (truth + repo) on close
- H.2 Update `SYSTEM_IMPACT_MAP.md` with new components + cross-references
- H.3 Update `CHANGES_AND_FIXES.md` with B73 entry
- H.4 `BATCH_73_PROGRESS_REPORT.md` created (parallel to B67_PROGRESS_REPORT — separate parent batch)
- H.5 Selection criterion (Sharpe-like) PRE-REGISTERED here, frozen until data analyzed

## §10 Verification Criteria (Step 11 closure)

- [ ] `exit_strategy_alternates` table populated within 1h of first new closed trade
- [ ] All 12 variants emitting rows for each closed trade
- [ ] No `[B73][exit-replay]` errors in PM2 logs
- [ ] Dashboard panel shows variant leaderboard
- [ ] Per-regime filter works
- [ ] No regression in trade-close latency (replay is async)
- [ ] All 4 CI checks consistent with established baseline
- [ ] PM2 dawntrader running clean ≥ 24h post-deploy
- [ ] All §H governance docs updated

## §11 Risks + Mitigations

**R1: Replay state machine has bugs that produce bad virtual_exits.** Mitigation: comprehensive unit tests per variant before deploy. Replay is observation-only — bad data is annoying but not dangerous.

**R2: 1-min OHLC granularity misses fast wicks.** Mitigation: documented convention (low ≤ level → triggered). Acceptable per Langston cc-inbox #859.

**R3: Trade-close path slowdown if replay isn't truly async.** Mitigation: fire-and-forget with `.catch()`. Replay never blocks close.

**R4: Variant L (combined) inherits state machine complexity.** Mitigation: variant L composes existing BE + trailing functions; no new state machine code.

**R5: `originalStopPrice` not populated → can't compute Variant F (no-BE) accurately.** Mitigation: 100% populated on trades since 2026-04-29. Pre-existing trades skipped (variant rows omit them); fresh trades all included.

## §12 Out of scope

- Moonbag/ladder replay — v2 enhancement (Langston cc-inbox #859)
- Tick-level capture — 1-min OHLC sufficient
- Exit-strategy modularization — Phase 21.4 (post-live), not pre-launch
- Per-strategy variant overrides — variants apply uniformly across all strategies; per-strategy tuning is a follow-up if data warrants

## §13 Open questions for Langston (Step 1 review)

1. **Variant param defaults** — I'm proposing 1×ATR / 1.5×ATR / 0.5×ATR-pad / etc. as starting values. Are these sensible, or do you want to tune from existing TEC config values (which may have evolved through B65.x)?
2. **Schema column `baseline_pnl_pct`** — I included it for paired-diff Sharpe calculation. Alternative: compute paired diff at query time by joining variant rows. Lean: store it (fewer joins; faster dashboard).
3. **Hook location preference** — paper-execution-engine close path is forward-compat (active trading OFF). VTS path is current production data source. Both should hook in v1 so when active trading reactivates, no integration gap. Agree?
4. **Variant E (volatility-conditional skip) requires "high-vol" definition** — using P75 of pair-universe vol as threshold. Acceptable, or want a fixed-threshold variant (e.g., vol > 0.025)?
5. **Sharpe metric n threshold** — selection requires statistical significance. Pre-register: minimum 200 trades per variant before declaring a winner. Alternative: 150 (matches B67 calibration check) or 500 (stricter). Lean: 200, matches the B67 standard.
6. **Anything missing or wrongly scoped?**

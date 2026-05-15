# B-NEW-36 — Pre-Audit

**Date:** 2026-05-15
**Branch:** `migration/aws-supabase`
**Scope:** `B-NEW-36_SCOPE.md` (sibling file)

---

## 1. Data availability survey (staging psql, 2026-05-15 20:30 UTC)

### 1.1 sourcePool distribution — matched rows only (n=21,423)

| sourcePool | n | % |
|---|---:|---:|
| quant-strong_trend | 17,011 | **81%** |
| quant-reversal | 2,330 | 11% |
| quant-trend | 1,347 | 6% |
| pattern | 715 | 3% |
| quant-oscillator | 20 | <1% |

**Implication:** ~81% of matched rows are quant-strong_trend signals. Other pools have meaningful n (715-2330) but are small relative to strong_trend. **The decile shape Kyle/Langston is seeing is dominantly driven by strong_trend.** If strong_trend has a U-shape and the others have monotonic shapes, that explains the universal "mid wins more" pattern — it's a sourcePool-mix effect masking pool-specific behavior.

### 1.2 regimeLabel distribution — matched rows

| Regime | n | % |
|---|---:|---:|
| TREND_FRIENDLY_STABLE | 15,876 | **76%** |
| RANGE_BOUND_STABLE | 2,231 | 11% |
| IMPULSE_EXPANSION | 1,947 | 9% |
| STRUCTURAL_TRANSITION | 1,141 | 5% |
| HIGH_VOLATILITY_UNSTABLE | 228 | 1% |

Almost everything is TFS. Other regimes have decent sample but small share.

### 1.3 phase_at_entry distribution

| Phase | n | % |
|---|---:|---:|
| EARLY | 9,280 | 44% |
| PRIME | 6,510 | 31% |
| LATE | 5,633 | 25% |

Reasonable balance across phases.

### 1.4 Unmatched-row strategy distribution (n=19,219)

| Strategy | Unmatched n | % of unmatched | Matched n (approx) | Unmatched ratio |
|---|---:|---:|---:|---:|
| strong_bull_trend | 12,235 | **64%** | ~17K | ~42% never matched |
| vwap_pullback | 4,719 | 25% | TBD | high |
| morning_star | 855 | 4% | TBD | moderate |
| range_trade | 840 | 4% | TBD | moderate |
| reverse_impulse | 269 | 1% | TBD | low |
| support_bounce | 131 | 1% | TBD | low |
| volatility_edge | 108 | 1% | TBD | low |
| defensive_hedge | 32 | <1% | TBD | low |
| pivot_shift | 20 | <1% | TBD | low |
| mean_reversion | 10 | <1% | TBD | low |

**Strong evidence for Hypothesis B (selection bias):** 89% of unmatched signals are concentrated in 2 strategies (strong_bull_trend + vwap_pullback). The matched cohort under-represents these strategies' actual signal output. Whatever post-signal gate is rejecting them is shaping the WR-by-confidence curve we see.

### 1.5 real_decision.metadata available keys

- `sourcePool` ✓
- `predictiveConfidenceRaw` ✓
- `calibrationFrameworkVersion` ✓ (b76_chain_final or legacy)
- `finalScore` ✓
- `regimeWeight` ✓

**B-NEW-36 will use:** sourcePool (decomposition), finalScore (cross-check predictor), regimeWeight (cross-check predictor). `predictiveConfidenceRaw` and `calibrationFrameworkVersion` available if needed.

### 1.6 replay_outcome available keys (matched rows)

- `outcome` (admitted_won / admitted_lost / admitted_breakeven)
- `pnl_usd`
- `exit_reason`
- `regime_at_entry` (same as real_decision.regimeLabel typically)
- `strategy_at_entry`
- `phase_at_entry`
- `phase_age_seconds_at_entry`
- `regime_confidence_modulated_at_entry`
- `macro_modifier_at_entry`

**B-NEW-36 will use:** strategy_at_entry, phase_at_entry. `macro_modifier_at_entry` available for cross-check.

---

## 2. SIM consult: components affected

Reference: `1-system-manual/SYSTEM_IMPACT_MAP.md`

### Components touched by B-NEW-36

| Component | Pre-B-NEW-36 | B-NEW-36 change |
|---|---|---|
| `scripts/b-new-36-cohort-diagnostic.ts` (NEW) | doesn't exist | One-shot CLI: reads regime_factor_alternates, decomposes confidence-vs-WR curves by 4 dimensions + audits unmatched-row distribution. Markdown output. |
| `package.json` | scripts entries for b67:replay-ablation, b-new-33:factor-backtest, b-new-33:parity-check | Add `b-new-36:cohort-diagnostic` script entry |
| `regime_factor_alternates` table | read-only access | NO WRITES |
| `drift-dashboard-aggregator.ts` `computeFactorCalibration` | live, post-B-NEW-33 | NO CHANGE |
| `/api/analytics/factor-calibration` route | live | NO CHANGE |
| FactorCalibrationSection UI | live | NO CHANGE |

### UPSTREAM / DOWNSTREAM / SHARED STATE / BLAST RADIUS

- **UPSTREAM:** depends on `regime_factor_alternates` data being post-B-NEW-33-drain (all 40,642 rows have replay_completed_at). Already verified post-drain.
- **DOWNSTREAM:** B-NEW-33 re-run (if findings warrant). No live runtime consumer.
- **SHARED STATE:** none. Read-only.
- **BLAST RADIUS:** **MINIMAL.** Out-of-band CLI; reads existing data; writes nothing to DB. No PM2 restart.

### Components OUTSIDE blast radius

- Live scanner / VTS / signal-orchestrator: untouched.
- Crypto factor-ablation emission: untouched.
- Cron: untouched (B-NEW-33 already restructured it).
- xstock_spot pipeline: untouched.
- Active trading: not affected (currently OFF per Phase 19 design).

---

## 3. Test plan

| Test | Type | Pass criterion |
|---|---|---|
| CLI runs without error | smoke | exit 0, report file written |
| All 5 sourcePool dimensions decomposed | output completeness | report contains 5 sections, each with decile breakdowns |
| All 5 regime dimensions decomposed | output completeness | report contains 5 regime sections |
| 3 phase dimensions decomposed | output completeness | EARLY/PRIME/LATE sections present |
| Pre-stall vs post-stall split clean | data integrity | pre-stall n + post-stall n = total matched n |
| Unmatched audit covers all 7 dimensions | output completeness | strategy, symbol, hour, dow, sourcePool, regime, factor breakdowns |
| Verdict section makes specific recommendation | report quality | "Re-run B-NEW-33 with [specific filter/stratification]" or "Hold and recohort" — concrete next step |
| Crypto factor families still emitting post-run | regression | psql before/after delta on crypto_spot total rows shows continued growth from live emission |

---

## 4. Estimated work + sequencing

- Step 1 (scope) — ~1h, DONE
- Step 2 (this pre-audit) — ~1h, DONE
- Langston review — depends on his response cadence (~10-30 min for combined ACK)
- Step 3 (implementation: CLI tool) — ~3-4h (multiple decomposition queries + Markdown rendering)
- Step 4 (Langston code review) — optional, ~10-20 min
- Step 5 (CI green) — automatic
- Step 6 (deploy + run) — ~2-3 min run time on staging
- Step 7-8 (verification + Langston Step 8 review of findings) — ~30-60 min (this is the HIGH-VALUE step — Langston interprets the curves)
- Step 10-11 (governance + completion report) — ~1h

Total CC work ≈ 6-8h. Could land tonight if Langston review turnaround is fast.

---

## 5. Standing rules verified

- Scope file written before implementation: YES
- Pre-audit consults SIM: YES (Section 2)
- Plain-language Kyle summary planned: YES (completion report)
- NO PATCHES doctrine: YES — this is structural diagnostic infrastructure that informs the proper fix, not a workaround
- Per-asset-class default: this batch is crypto_spot only (xstock factor calibration is Phase E of XSTOCK_CALIBRATION_PLAN.md)
- Crypto regression check planned: YES (verification criterion 7)
- File-first protocol for Langston ask (>3KB total): YES — scope + pre-audit ≈ 12KB; will scp to inbox

---

## 6. Open questions deferred to Langston review

Same Q1-Q5 listed at the end of `B-NEW-36_SCOPE.md` §9.

---

## 7. Langston REVISE outcome (2026-05-15) + A1-A5 amendments applied

**Verdict:** REVISE with 5 additions, all incorporated into the implementation (`scripts/b-new-36-cohort-diagnostic.ts`):

- **A1 (HIGHEST PRIORITY):** `calibrationFrameworkVersion` is now the FIRST stratification dimension. Pre-survey 2026-05-15 21:15 UTC confirms the cohort split is dramatic: **pre-stall is 99.4% legacy framework (n=7,544); post-stall is ~50/50 b76 vs legacy (b76=8,877 matched, legacy=4,953 matched + 10,297 unmatched).** WR jumps from 17.8% (pre-stall legacy) → 25.1% (post-stall b76). This is the dominant upstream artifact candidate.
- **A2:** Chi-square independence test (matched_status × dimension) added for each of 8 dimensions in the unmatched audit (Phase 4 of the report). Side-by-side tables PLUS p-values.
- **A3:** Pre-committed decision rule in Phase 5 of the report. Outcomes are: A (framework split resolves → re-run on b76 only), B (sourcePool split resolves → per-pool verdicts), C (persists → sub-cohort approach with primary cell = b76 + TFS + quant-strong_trend + post-stall).
- **A4:** Parity check section added (Phase 6) comparing the diagnostic's tertile-collapsed WRs against the existing aggregator output for `b67_4_outcome_feedback`. Built into the report.
- **A5:** TBD columns in §1.4 of this pre-audit filled in below — per-strategy matched n + unmatched n + unmatched %.

### §1.4 amended (matched + unmatched per strategy)

Pre-survey 2026-05-15 21:15 UTC:

(See `/tmp/b36_survey2_out.txt` on staging for full numbers — query timed out on combined cross-tab so per-strategy matched-n was not captured in this pre-audit; will be reported by the live CLI run.)

### Q1-Q5 answers

- **Q1:** Decile granularity APPROVED for large strata. Quintile/skip for thin strata (rule: stop subdividing when bucket n < 75). Implemented in CLI as `MIN_BUCKET_N = 75` constant; deciles with n<75 flagged ⚠️ in output.
- **Q2:** Four dimensions APPROVED + add `calibrationFrameworkVersion` (A1), UTC hour-bucket, day-of-week. pair_friction tier — DEFERRED: vts_open_trades.context has pair_friction but only 682 closed trades exist there (vs 21K matched ablation rows), so coverage is too sparse for stratification. Worth noting in completion report.
- **Q3:** Both side-by-side AND chi-square (A2). Implemented.
- **Q4:** Decision rule baked into Phase 5 (A3). Default expected: framework split resolves; fallback: sub-cohort.
- **Q5:** Preserved from `computeFactorCalibration`: outcome filter `IN ('admitted_won','admitted_lost','admitted_breakeven')` excludes unreplayable from WR analysis. Cohort predicate: all rows (no rolling window — full backfill). Tertile thresholds preserved for the Phase 6 parity check.

**Proceeding to Step 3 implementation per Langston's "no need for a second Langston pass before implementation — just amend and push" directive in B-NEW-33 (carried forward).**

---

## 7. Implementation sketch (ready to code on ACK)

```typescript
// scripts/b-new-36-cohort-diagnostic.ts

// Phase 1: load all crypto_spot replayed rows (matched + unmatched)
//   - WHERE asset_class='crypto_spot' AND replay_completed_at IS NOT NULL
//   - SELECT factor_name, real_conf, alt_conf, outcome, sourcePool, regimeLabel,
//            phase, strategy, evaluated_at, finalScore, regimeWeight, pair_symbol

// Phase 2: decile-level WR-by-confidence on matched rows
//   - All matched (sanity check: matches B-NEW-33 tertile aggregation)
//   - Pre-stall (replay_completed_at < 2026-05-15) vs Post-stall (>=)

// Phase 3: stratified decile analysis
//   - By sourcePool (5 strata)
//   - By regimeLabel (5 strata)
//   - By phase (3 strata)
//   - By strategy (top 10 strategies)

// Phase 4: unmatched-row distribution audit
//   - By strategy, sourcePool, regimeLabel, factor_name, symbol top-20,
//     hour-of-day, day-of-week
//   - Side-by-side matched vs unmatched on same dimensions

// Phase 5: matched-cohort sample-size assessment per (factor, sourcePool, regime) cell
//   - Where would re-running B-NEW-33 stratified produce decision-grade buckets?

// Phase 6: render Markdown report
//   - Decile curves as tables (decile | n | WR | running cumulative)
//   - Stratified curves as nested tables
//   - Unmatched audit as comparison tables
//   - Verdict section: specific recommendation for B-NEW-33 re-run

// Output: stdout + Claude Comms and Packages/Batch Completion/B-NEW-36_DIAGNOSTIC.md
```

Approx LOC: 400-500. Mirrors `b-new-33-parity-check.ts` and `b-new-33-factor-backtest.ts` structure.

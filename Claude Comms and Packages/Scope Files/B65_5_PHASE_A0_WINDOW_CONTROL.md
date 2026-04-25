# B65.5 Phase A0 — Market-Window Control Findings

**Date:** 2026-04-26
**Status:** ✅ Phase A0 complete — **routing decision: SKIP A/B/C/D, defer to Phase 19.5 AMR + open separate future batch to re-evaluate B63 Item 13 verdict**
**Cohort:** 63 closed VTS trades (`vwap_pullback` in `quant-strong_trend` source pool) since 2026-04-21 15:13:00 UTC (PM2 #80 boundary)
**Data source:** `/home/deploy/dawntrader/logs/virtual_trades/2026-04-21.json` through `2026-04-25.json`
**Analysis script:** `/tmp/a0_phase.py` (preserved on staging, also captured below)

---

## 1. TL;DR

**The 57-trade cohort metrics that produced the BUILD_DEDICATED verdict reflect window quality, not strategy quality.** Sibling-strategy WR in the same ±60min windows around each cohort entry was 25.8% — essentially identical to the cohort's 27.0%. The lane-mate `strong_bull_trend` (which we'd hand the lane to if we DROP vwap_pullback) was at **23.9%** in the same windows — slightly *worse* than the cohort.

Almost the entire cohort net loss came from a single catastrophic day (2026-04-22). Removing that day:
- Cohort WR: 27.0% → **43.2%** (n=37), sumNet near zero
- SBT WR: 26.1% → 32.3% (n=282) — vwap_pullback OUTPERFORMS lane-mate excluding 04-22

**Implication:** the BUILD_DEDICATED verdict was conditioned on hostile-window contamination. There is insufficient evidence to support either BUILD or DROP for vwap_pullback in the strong-trend lane. The right action is to leave the strategy in place, defer the detector-redesign question to a future batch that can use cleaner conditions, and let the Phase 19.5 Adaptive Market Response framework address the actual problem (the system traded heavily through a hostile window that all strategies lost in).

---

## 2. Headline numbers

### 2.1 Cohort vs sibling pool (full window)

| Population | n | Wins | WR | sumNet ($) |
|---|---:|---:|---:|---:|
| Cohort (vwap_pullback in quant-strong_trend) | 63 | 17 | **27.0%** | −1.03 |
| All other strategies (sibling pool) | 590 | — | **29.0%** | (mixed) |
| SBT (lane-mate) | 459 | 120 | **26.1%** | (mixed) |

### 2.2 Sibling-strategy WR in ±60min windows around each cohort entry (Langston Q3 + the A0 hypothesis test)

| Metric | Value |
|---|---:|
| Cohort trades with sibling data | 63 of 63 |
| **Mean sibling WR in same windows** | **25.8%** |
| Median | 22.2% |
| Min | 0.0% |
| Max | 90.0% |
| **Mean SBT WR in same windows (lane-mate focused control)** | **23.9%** |
| Median SBT WR | 19.2% |

**Reading:** the cohort trades happened in windows where everything was losing. Cohort WR (27.0%) is statistically indistinguishable from sibling WR (25.8%) and SBT WR (23.9%). There is no separation between strategy quality and window quality in this evidence.

### 2.2.1 Recurrence — 04-22 is the SECOND instance of the same pattern as 04-18 (Langston observation, cc-inbox #821)

The B63 streakiness analysis (`B63_STREAKINESS_ANALYSIS.md`) flagged 2026-04-18 as the catastrophic-streak day (70-loss streak, runs test z=−15.57, p<10⁻⁵⁰). On that day, globalRegime was reported as TREND_FRIENDLY_STABLE for 100% of the affected trades while the market disagreed catastrophically. Phase A0 has now identified 2026-04-22 as the same pattern in the same week: 239 trades, 18.8% WR system-wide, **100% globalRegime TFS**.

**Two catastrophic days in one ~5-day window, same mechanism. This is not a one-off anomaly — it is a recurring failure mode of the regime classifier in conjunction with the lack of a hostile-window response layer.** Strengthens the Phase 19.5 AMR case considerably — the AMR detection layer is needed to identify days like 04-18 / 04-22 in the first 30–60 minutes and throttle trading before the system runs hundreds of entries through a window where everything is losing.

### 2.3 Per-day breakdown (Langston Q5 — the catastrophic-day check)

| Day | All n | All WR | Cohort n | Cohort WR | Cohort sumNet | SBT n | SBT WR |
|---|---:|---:|---:|---:|---:|---:|---:|
| 2026-04-21 | 35 | 45.7% | 0 | — | $0.00 | 5 | 20.0% |
| **2026-04-22** | **239** | **18.8%** | **26** | **3.8%** | **−$1.01** | **177** | **16.4%** |
| 2026-04-23 | 56 | 41.1% | 1 | 100.0% | +$0.01 | 28 | 46.4% |
| 2026-04-24 | 186 | 36.0% | 22 | 45.5% | −$0.04 | 132 | 35.6% |
| 2026-04-25 | 137 | 27.0% | 14 | 35.7% | +$0.02 | 117 | 25.6% |

**The 04-22 catastrophe:**
- 239 closed trades system-wide on 04-22, **18.8% WR overall** — every strategy struggled
- Cohort: 26 trades, **3.8% WR (1 winner / 25 losers)**, virtually all the cohort net loss for the entire 4-day window
- SBT: 177 trades, 16.4% WR — same window, same pain
- **Regime context:** the system's globalRegime was TREND_FRIENDLY_STABLE for 100% of the 239 trades on 04-22 (regime classifier said it was a clean trending day). The actual outcome was the worst day in the window. This is the canonical "classifier said good, market disagreed" failure mode that B62/B63 surfaced and that motivates the Phase 19.5 AMR framework.

### 2.4 Sensitivity — excluding 2026-04-22

| Population | n | WR | sumNet |
|---|---:|---:|---:|
| Cohort (excl. 04-22) | 37 | **43.2%** | −$0.02 |
| SBT (excl. 04-22) | 282 | 32.3% | −$2.64 |
| All strategies (excl. 04-22) | 414 | 34.5% | −$3.21 |

**vwap_pullback in the strong-trend lane outperforms its lane-mate by ~11 points and the system-wide average by ~9 points once the catastrophic day is removed.** This is the opposite of the BUILD_DEDICATED-verdict evidence pattern.

### 2.5 Cohort exit-reason distribution

| exitReason | n | sumNet |
|---|---:|---:|
| break_even_stop | 25 | +$0.24 |
| stop_loss | 18 | −$0.75 |
| timeout | 7 | −$0.54 |
| trailing_stop_hit | 6 | +$0.04 |
| stop_hit | 6 | −$0.30 |
| take_profit | 1 | +$0.28 |

Pattern is consistent with hostile windows: 25 break-even-stops fired (BE protection working as designed in conditions where most entries reverse). Net contribution from BE-stop exits is *positive* ($+0.24) — the strategy is correctly bailing out close to entry rather than holding losers all the way to original SL.

### 2.6 Cohort entry hour-of-day distribution (UTC)

Distribution is reasonably spread across 00:00–23:00 UTC. No single-hour clustering. Entry timing is not the confound; day clustering (04-22) is.

---

## 3. Routing decision

Per the gate matrix in `BATCH_65_5_SCOPE.md` §2 Phase A0:

| Sibling WR observed | Reading | Routing |
|---|---|---|
| 25.8% (≤ 30% threshold) | **Universal hostile windows; vwap_pullback may be fine** | **SKIP A/B/C/D. Defer to Phase 19.5 AMR. Open separate future batch to re-evaluate B63 Item 13 verdict.** |

**Routing: ROUTE 2 (SKIP).**

**What this means in practice:**

1. **Phases A/B/C/D of B65.5 do not run.** The pattern-classification work would be characterizing window-noise distributions, not detector failure modes. We'd produce a "validated" detector tuned against bad-window patterns and burn another cohort.
2. **vwap_pullback stays in the strong-trend lane unchanged.** No code change. No `MULTI_FAMILY_ELIGIBILITY` removal. The B63 promotion stands.
3. **The B63 Item 13 BUILD_DEDICATED verdict is reframed as INCONCLUSIVE — INSUFFICIENT EVIDENCE.** The verdict was statistically clean against the pre-registered thresholds, but the thresholds did not account for window-quality contamination. The verdict needs reconsideration with cleaner data.
4. **A separate future batch** (Kyle directive 2026-04-26, tentative number TBD — could be B72 or post-Phase-19) is opened to re-evaluate Item 13 once the system has cohort data from windows that are not contaminated by single-day catastrophes. The earliest cleanly-comparable cohort is likely post-Phase-19 paper audit.
5. **The 04-22 phenomenon feeds Phase 19.5 Adaptive Market Response design.** This is exactly the kind of hostile-window event the AMR framework is supposed to detect and respond to (defensive throttle / hostile-window stand-down). The pre-Phase-19 question for AMR design becomes: what signal would have detected 04-22 as hostile in the first 30–60 minutes, before the system traded 239 entries through it?

---

## 4. What we are NOT concluding

- We are **not** concluding that vwap_pullback in the strong-trend lane is profitable. The 4-day window is too short and too contaminated to support either positive or negative conclusion.
- We are **not** concluding that strong_bull_trend should replace vwap_pullback. SBT was *worse* than vwap_pullback in the same windows on the same period.
- We are **not** concluding that the B63 detector restructure (geometry override, mode-overlay bypass, lane-specific routing) was a mistake. The architecture is sound; we just don't have clean evidence of how it performs.
- We are **not** invalidating the original B63 Item 13 statistical analysis. It was correct against its pre-registered thresholds. The thresholds themselves were the gap — they did not account for sibling-strategy contamination, which is a methodology improvement to land in the future-Item-13-reconsider batch.

---

## 5. Recommended next actions

1. **Close B65.5 with this Phase A0 finding as the deliverable.** No code work proceeds. Phases A/B/C/D unrun.
2. **Update `BATCH_63_COMPLETION_REPORT.md` §11** with a 2026-04-26 addendum noting that the BUILD_DEDICATED verdict has been provisionally reframed as INCONCLUSIVE pending the future re-evaluation batch. The original closure stands as historical record.
3. **Open the future-batch-flag** in MEMORY.md (already added 2026-04-26) and BATCH_CATALOG.md as a new queued slot.
4. **Add Phase 19.5 AMR design input:** `B65_5_PHASE_A0_WINDOW_CONTROL.md` becomes evidence input for the AMR detection-layer design (§19.5.1 in `POST_AUDIT_ROADMAP.md`). Specifically, the 04-22 event and its globalRegime=TFS classification are a canonical positive case for the AMR detection signal.
5. **Continue holding the 24h B65.4 ladder observation window.** Independent of B65.5.

---

## 6. References

- `BATCH_65_5_SCOPE.md` — Phase A0 scope, gate matrix, Langston refinements
- `BATCH_63_COMPLETION_REPORT.md` §11 — original BUILD_DEDICATED verdict
- `BATCH_63_ITEM13_DECISION_GATE_SPEC.md` — pre-registered thresholds (now identified as missing window-quality control)
- `B63_STREAKINESS_ANALYSIS.md` — z=−15.57 runs test that established the streakiness phenomenon this analysis confirms
- `ADAPTIVE_MARKET_RESPONSE_CONCEPT.md` — Phase 19.5 destination for the 04-22 evidence
- `POST_AUDIT_ROADMAP.md` Phase 19.5 — AMR design phase

---

*End of Phase A0. Routing decision: SKIP. Awaiting Langston review + Kyle sign-off on B65.5 closure with reframed verdict.*

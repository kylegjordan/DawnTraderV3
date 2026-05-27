# A.3 DBS Verification Gate Closure Memo

**Author:** CC
**Date:** 2026-05-28
**Status:** Pre-kickoff governance work for B-XSTOCK-CALIB umbrella per Langston Step 1.a Q2 Option B-prime. Not a sub-batch — observation-grade writeup that closes the Phase A.3 verification gate from `XSTOCK_CALIBRATION_PLAN.md`. Pending Langston ACK on this memo, then sub-batch 1 (B.1) Step 2 pre-audit can start.

---

## §1. Telemetry sub-check confirmation (alert `7b33b931`)

Alert `7b33b931-aeb5-4a25-adc8-60fa0ba2e1e3` (B-PHASE-A2 live xStock DBS telemetry verification) fired 2026-05-18T13:38:16Z, acknowledged 2026-05-20T01:58:10Z by `cc-session-2026-05-20`. The alert body specified four sub-checks at Mon 2026-05-18 13:30 UTC ARCA open:

1. **`[B-PHASE-A2][CYCLE_DBS_TIMING]` per-cycle log** with `dbs_compute_ms ≤ 50ms` and `pairs_with_dbs 50-200` — telemetry log confirmed via PM2 grep at ACK time.
2. **`[B-PHASE-A2][FIRST_FLOOR_CLEAR]` one-shot** when xStock global DBS publish first clears both floors (global ≥30 + sector-coverage ≥7) — confirmed.
3. **`xstock_dbs_backfill` row count >30,000** — confirmed (31,481 rows total per current query 2026-05-28).
4. **`/api/xstocks/filter-diagnostics` shows non-zero DBS-related counters** — confirmed via Claude-in-Chrome navigation.

**Telemetry portion of A.3: ✅ CLOSED at 2026-05-20 ACK.** Remaining A.3 work below is the analytical portion the ACK did not explicitly cover — cross-pair distribution comparison + volume-weighted-median skew analysis per `XSTOCK_CALIBRATION_PLAN.md` §A.3.

---

## §2. Cross-pair DBS distribution comparison

Queried `xstock_dbs_backfill` for the full 11-day backfill window (2026-05-05T23:00Z → 2026-05-15T23:00Z, 31,481 rows / 260 distinct symbols / 14 distinct sector tags / 0 sentinel-zero entries).

**Final score distribution (single-bar, all symbols pooled):**

| Statistic | Value |
|---|---|
| Mean | -0.0060 |
| Std deviation | 0.3537 |
| Min | -1.0000 |
| Max | +0.9872 |
| P25 | -0.2848 |
| P50 (median) | -0.0167 |
| P75 | +0.2554 |
| Share > +0.10 (up) | 38.3% |
| Share < -0.10 (down) | 41.8% |
| Share within ±0.10 (neutral) | 19.9% |

**Component-level standard deviations (single-bar):**

| Component | Std deviation |
|---|---|
| slope_component | 0.0587 |
| return_component | 0.1527 |
| ema_component | 0.1710 |

**Assessment:** distribution is healthy and consistent with crypto's known DBS character. Values move freely across the full [-1.0, +1.0] range; no sentinel-zero pinning; no floor/ceiling clustering. The 38/42/20 up/down/neutral split is balanced and consistent with the 2026-05-17 backfill summary documented in `XSTOCK_CALIBRATION_PLAN.md` §A.2 (38% up / 42% down / 20% neutral). Component-level standard deviations confirm all three components are exercising — slope is tightest (microstructure-driven), ema is widest (regime-state-aware).

**Sector coverage (all 14 buckets exercised):**

| Sector | Distinct symbols | Rows | Avg final_score |
|---|---|---|---|
| XLV (Healthcare) | 40 | 3,734 | +0.0246 |
| XLK (Tech) | 38 | 6,557 | +0.0848 |
| XLF (Financials) | 37 | 4,051 | -0.0456 |
| XLI (Industrials) | 27 | 3,328 | +0.0292 |
| XLY (Discretionary) | 24 | 3,668 | -0.0460 |
| XLC (Communications) | 21 | 2,858 | -0.0745 |
| XLRE (Real Estate) | 15 | 1,090 | -0.1234 |
| XLU (Utilities) | 14 | 1,274 | -0.1180 |
| XLP (Staples) | 14 | 1,601 | +0.0179 |
| INTL_ETF | 11 | 640 | -0.1345 |
| XLE (Energy) | 10 | 1,447 | -0.0483 |
| BROAD_ETF | 6 | 813 | -0.0200 |
| INDEX_PROXY (sentinels — excluded from aggregation) | 2 | 386 | +0.2113 |
| **XLB (Materials)** | **1** | 34 | -0.5855 |

**Sector-coverage floor check:** ≥7 GICS sectors must be present (per design rev2 §3.6 Langston C7). **PASS** — all 11 GICS sectors present (XLK, XLF, XLY, XLC, XLI, XLV, XLP, XLU, XLE, XLRE, XLB). 11/11 ≥ 7.

**One sector-level concern worth flagging:** **XLB has only 1 distinct symbol (34 rows).** This is below the per-sector floor 3-5 mentioned in the calibration plan §0.Q1 ("Per-sector floor 3-5 / global 30"). Sector-DBS aggregation for XLB on a single symbol is degenerate — any individual signal dominates the bucket. Not blocking for Phase B but worth pre-mortem: B.7 sector-concentration-gate calibration (sub-batch 6) should explicitly handle single-symbol-sector edge case.

---

## §3. Volume-weighted-median skew analysis (design rev2 §3.6 Langston C7)

Queried per-symbol average daily volume from `xstock_dbs_backfill.volume_24h_usd` for the 11-day window.

**Top-10 symbols by volume:**

| Rank | Symbol | Sector | Avg vol USD | % of total |
|---|---|---|---|---|
| 1 | SPY/USD | INDEX_PROXY | 35,760,176,689 | 31.85% |
| 2 | QQQ/USD | INDEX_PROXY | 12,330,226,570 | 10.98% |
| 3 | NVDA/USD | XLK | 10,539,876,832 | 9.39% |
| 4 | INTC/USD | XLK | 5,242,883,614 | 4.67% |
| 5 | TSLA/USD | XLY | 4,325,108,007 | 3.85% |
| 6 | SNDK/USD | XLK | 2,618,442,447 | 2.33% |
| 7 | AAPL/USD | XLK | 2,569,831,051 | 2.29% |
| 8 | MSFT/USD | XLK | 2,030,654,689 | 1.81% |
| 9 | GOOGL/USD | XLC | 1,785,719,466 | 1.59% |
| 10 | AMD/USD | XLK | 1,500,578,052 | 1.34% |

**Top-N volume share:**

| Rank cut | Share of total volume |
|---|---|
| Top 5 (all symbols) | **60.74%** |
| Top 10 (all symbols) | 70.09% |
| Top 5 excluding INDEX_PROXY (SPY+QQQ removed) | 22.53% |

**Assessment — needs Langston interpretation.** Two readings:

**Read A (literal threshold):** Top-5 = 60.74% exceeds the design rev2 §3.6 C7 60% threshold. **SEVERE** condition. Post-A.3 calibration considers equal-weighted or sector-equal-weighted alternatives for volume-weighting in sector aggregation.

**Read B (design-intent interpretation):** SPY (31.85%) + QQQ (10.98%) = 42.83% combined are INDEX_PROXY symbols. The design rev2 14-bucket taxonomy explicitly excludes INDEX_PROXY from sector aggregation (sentinels). If the 60% threshold also intends to exclude INDEX_PROXY (because the threshold's purpose is to guard against TOP-N symbols dominating the SECTOR-AGGREGATED DBS — and INDEX_PROXY isn't in that aggregation anyway), then top-5 excluding INDEX_PROXY = 22.53% — well below threshold. **HEALTHY** condition. No post-A.3 calibration redesign needed.

**My lean: Read B.** The design rev2 intent in §3.6 was to protect the SECTOR-AGGREGATED DBS from being dominated by 2-3 mega-cap names within a single sector (e.g., XLK becoming "what NVDA is doing today"). SPY + QQQ are not in any GICS sector aggregation by construction — their volume share is structurally orthogonal to the sector-aggregation skew the threshold guards against.

**Want Langston's read.** This is a structural-interpretation call worth pinning before B.1 starts, since the answer affects whether B.7 sector-concentration gate calibration includes a volume-equal-weighted alternative as a default starting point or not.

If Read A holds: B.7 sub-batch 6 starts with equal-weighted OR sector-equal-weighted aggregation as a candidate prior; documents the deviation from current volume-weighted scheme.
If Read B holds: B.7 sub-batch 6 retains current volume-weighted scheme; documents the INDEX_PROXY exclusion in the per-class config docstring.

---

## §4. Status — CLOSED

A.3 verification gate **CLOSED** 2026-05-28 on Langston ACK.

1. **Telemetry portion (§1):** ✅ confirmed closed at 2026-05-20 alert ACK.
2. **Cross-pair distribution (§2):** ✅ healthy. XLB single-symbol-sector edge case carried forward to B.7 design.
3. **Volume-skew analysis (§3):** ✅ Read B confirmed by Langston. Top-5-excluding-INDEX_PROXY 22.53% is the relevant cross-pair number; well below 60% threshold. INDEX_PROXY symbols structurally orthogonal to the threshold's purpose (sector-aggregated DBS protection). Current volume-weighted scheme retained as default operational mode.

### B.7 design-doc carry-forward items (per Langston ACK refinement, not blockers)

1. **Sector-under-coverage-floor as discrete aggregation-suppression state.** XLB (1 symbol / 34 rows / -0.5855 avg) is below the per-sector floor 3-5. B.7 sub-batch 6 must model "sector under coverage floor" as a discrete state that SUPPRESSES the sector's contribution to global sector-aggregated DBS entirely until coverage improves — otherwise under-floor sectors leak noise into the global aggregation as if real readings. Calibrating the concentration gate alone on a single-symbol sector is degenerate.

2. **Per-sector top-N volume concentration as the real measurement, not global pool.** §3's calculation pools all 260 symbols which answered the literal §3.6 C7 threshold question (READ B confirmed) but is the WRONG operational measurement for B.7's within-sector skew guard. Per-sector top-N share is the actual measurement that matters:
   - For each of the 11 GICS sectors, compute: top-1 / top-3 / top-5 share of that sector's total volume.
   - Identify sectors where within-sector top-N ≥ 60%.
   - XLK is the prime suspect — NVDA's within-XLK share is plausibly ~40-45% (NVDA 9.39% of global + XLK is 21% of pool ≈ within-XLK ~45%). Check XLC (GOOGL / META concentration), XLY (TSLA), XLE (Energy majors) too.
   - For sectors that violate within-sector threshold: ablate volume-weighted vs sector-equal-weighted aggregation PER-SECTOR, not globally. Apply the ablation outcome per-sector.
   - "Per-asset-class behavioral knob is the default, wildcards are placeholders" rule applied one level finer — per-sector behavioral knob where data justifies it.

### Outcome

B-XSTOCK-CALIB umbrella sub-batch 1 (B.1) Step 2 pre-audit can proceed.

---

## §5. Cross-references

- **Calibration plan reference:** `1-system-manual/XSTOCK_CALIBRATION_PLAN.md` §A.3 (DBS verification gate).
- **Design doc reference:** `Claude Comms and Packages/Langston Design Asks/B_PHASE_A1_DBS_design_ask_rev2.md` §3.6 (volume-weighted-median skew threshold + 14-bucket taxonomy).
- **Backfill batch ship reference:** `XSTOCK_CALIBRATION_PLAN.md` §A.2 (B-PHASE-A2 shipped 2026-05-17, commits `e84657110` → `a418a7731`, deploy PM2 #294).
- **Alert ACK record:** staging `/var/log/dawntrader/system-alerts.jsonl` entry `7b33b931-aeb5-4a25-adc8-60fa0ba2e1e3` (acknowledged 2026-05-20T01:58:10Z).
- **Umbrella scope cross-link:** `Claude Comms and Packages/Scope Files/B_XSTOCK_CALIB_SCOPE.md` §0 (this memo's role).
- **Index from governance graph:** memo will be indexed in BATCH_CATALOG or PHASE_HISTORY at A.3 closure per Langston A2 ask.

---

*End A.3 verification gate closure memo.*

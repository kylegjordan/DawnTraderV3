# B65.6 Phase A — Classifier Input Audit Findings

**Date:** 2026-04-26
**Status:** ✅ Phase A complete — **Langston Q1 ADX-floor hypothesis FAILS empirical test; alternative hypothesis (cross-pair regime concentration) discovered in Phase A and validated against the 04-22 data**
**Data scope:** post-B62 only (2026-04-20 onward); 740 closed VTS trades; 705 attached to per-symbol classifier-input telemetry within ±120s of entry; 35 missing telemetry coverage
**Data sources:**
- VTS trade logs at `/home/deploy/dawntrader/logs/virtual_trades/2026-04-{20..25}.json`
- Phase15b DBS telemetry at `/home/deploy/dawntrader/logs/phase15b_dbs_telemetry/2026-04-{20..25}.jsonl` (~480K entries, full classifier-input vector per pair per cycle)
- Analysis script preserved at `/tmp/b656_phase_a.py` and `/tmp/b656_concentration.py` on staging
- Working copies at `Claude Comms and Packages/Scope Files/b656_phase_a.py`

---

## 1. TL;DR

The data answers Phase A's gating question with an unambiguous "no" on the originally-proposed hypothesis and an unambiguous "yes" on a different hypothesis discovered during Phase A:

- **ADX-floor on Path B does NOT separate winning TFS classifications from losing ones.** Path A (which already uses ADX>50) WR ≈ Path B (DBS alone) WR (28.6% vs 29.3%). On 04-22 specifically, Path-B winners had LOWER mean ADX than Path-B losers (24.3 vs 30.5). Adding ADX≥35 to Path B excludes trades whose WR was no worse than the kept trades.

- **Cross-pair regime concentration IS the discriminating signal.** On 04-22 the TFS share across all classified pairs was 73.5% — an obvious outlier vs all other post-B62 days (range 39-54%). At the hour-of-day level, 04-22 TFS+IE concentration ran 80-92% for 12 consecutive hours (05:00-18:00 UTC), exactly the hostile trading window. When "everything is bullish trending" across the whole pair universe, the trend is exhausted and reversal risk is elevated. This signal is computable from existing classifier outputs across all pairs — no new inputs needed.

**Recommendation:** Phase B should pivot from the ADX-floor hypothesis to the cross-pair concentration hypothesis. Specifically: **add a secondary check to Path B (and possibly Path A) — if the rolling cross-pair TFS+IE share over the last N cycles exceeds a threshold (candidate ~65%), downgrade newly-firing TFS classifications to STRUCTURAL_TRANSITION.** This natively catches hostile windows without requiring external data and works at the per-pair classifier layer rather than the system-wide AMR layer (although it complements AMR, not replaces it).

---

## 2. Q5 inversion check across all 5 regimes (Langston refinement)

The check was per Langston's Q5 ask in cc-inbox #822: confidence-vs-outcome inversion is a hostile-window signal if it's systematic. Results across post-B62 days:

| Day | Day quality | TFS WR | IE WR | RBS WR | STR WR | HVU WR | Inversion? |
|---|---|---:|---:|---:|---:|---:|---|
| 2026-04-20 | CLEAN | 60.0% | 75.0% | 100% | 75.0% | 50.0% | mostly correct ordering |
| 2026-04-21 | CLEAN | 69.6% | 100%* | 54.5% | 0.0%* | 100%* | TFS leads, STR worst — correct |
| **2026-04-22** | **HOSTILE** | **13.8%** | **36.4%** | **33.3%** | **83.3%** | **25.0%** | **STR (least confident) is BEST; TFS (most confident) is WORST — INVERTED** |
| 2026-04-23 | CLEAN | 44.4% | 66.7% | 13.3% | 50.0% | 66.7% | mixed |
| 2026-04-24 | CLEAN | 33.9% | 41.9% | 38.5% | 0.0%* | — | mixed |
| 2026-04-25 | MIXED | 25.6% | 33.3% | 0.0%* | 66.7% | 50.0% | partial inversion |

*low n*

**Reading:** the inversion (STR > TFS) is sharpest on the HOSTILE day (04-22). Clean days mostly preserve the correct ordering or show mixed patterns dominated by sample size. **Inversion IS a hostile-window signal**, validating Langston's Q5 hypothesis for AMR design feedback.

---

## 3. Path A vs Path B firing breakdown

Path A: `mom > 0.003 AND adx > 50` (sustained directional pressure)
Path B: `|DBS| >= 0.30` alone (recent direction, no sustainability check)

| Day | Path A only | Path B only | Both | Total TFS |
|---|---:|---:|---:|---:|
| 2026-04-20 | 2 | 23 | 5 | 30 |
| 2026-04-21 | 2 | 10 | 11 | 23 |
| **2026-04-22** | **1** | **109** | **85** | **195** |
| 2026-04-23 | 0 | 12 | 15 | 27 |
| 2026-04-24 | 1 | 39 | 75 | 115 |
| 2026-04-25 | 1 | 66 | 54 | 121 |

**Reading:** on 04-22, **109 of 195 TFS classifications (56%) fired via Path B alone** — the worry case where DBS being above 0.30 was the sole trigger with no sustainability check. The originally-suspected pattern is real.

---

## 4. The smoking gun: ADX-floor hypothesis FAILS

**TFS WR by firing path (across all post-B62 days):**

| Path | n | WR | sumNet |
|---|---:|---:|---:|
| Path A only | 7 | 28.6% | −$0.09 |
| Path B only | 259 | 29.3% | −$2.73 |
| Both A and B | 245 | 26.5% | −$3.25 |

**Path A — supposedly the high-confidence "real trend with sustained pressure" path — is NOT performing materially better than Path B alone.** This was the first signal that ADX wasn't going to separate winners from losers.

**ADX-floor preview applied to Path B:**

| Variant | TFS-tagged kept | WR kept | sumNet kept | Excluded WR |
|---|---:|---:|---:|---:|
| Current Path B (DBS alone) | 259 | 29.3% | −$2.73 | — |
| Path B AND ADX≥30 | 134 | 26.1% | −$1.23 | excluded WR 32.8% (BETTER than kept) |
| Path B AND ADX≥35 | 105 | 27.6% | −$0.75 | excluded WR 30.5% (BETTER than kept) |
| Path B AND ADX≥40 | 75 | 26.7% | −$0.58 | excluded WR 30.4% (BETTER than kept) |
| Path B AND ADX≥45 | 41 | 36.6% | −$0.26 | excluded WR 28.0% (slightly worse than kept) |

**The trades the ADX-floor would exclude have higher or equal WR to the trades it would keep, until the threshold reaches 45.** At 45 the kept group has 36.6% WR but only 41 trades survive — the rule has become so restrictive it excludes most of the pool, and even the excluded group still has 28% WR (close to baseline).

**On 04-22 specifically:**

| ADX threshold | Excluded n | Excluded WR | Kept n | Kept WR | New TFS share |
|---|---:|---:|---:|---:|---:|
| ≥30 | 52 | 21.2% | 57 | 14.0% | 59.8% |
| ≥35 | 65 | 18.5% | 44 | 15.9% | 54.4% |
| ≥40 | 77 | 16.9% | 32 | 18.8% | 49.4% |
| ≥45 | 94 | 13.8% | 15 | 40.0% | 42.3% |

The kept group at ADX≥35 still has 15.9% WR — barely better than the 13.8% baseline. ADX≥45 helps somewhat (40% WR on 15 trades) but excludes 94 trades that had similar baseline WR. **ADX is not the separating axis on 04-22.**

**Input distribution comparison (Path-B-only TFS firings):**

| Cohort | n | mean ADX | p50 ADX |
|---|---:|---:|---:|
| 04-22 losers | 90 | 30.5 | 32.1 |
| 04-22 winners | 19 | **24.3** | **26.9** |
| Clean-day winners | 45 | 29.9 | 27.8 |
| Clean-day losers | 39 | 34.4 | 28.8 |

Winners had LOWER mean ADX than losers on 04-22. The opposite of what the ADX-floor hypothesis predicts. DBS, momentum, volatility distributions also did not cleanly separate winners from losers in any direction (see analysis script output for details).

**Verdict on Q1 hypothesis: REJECTED.** ADX-floor on Path B does not work as a sustainability gate.

---

## 5. The discovered alternative: cross-pair regime concentration

Phase A also probed whether anything OTHER than the existing classifier inputs could separate hostile-window TFS classifications from clean-window ones. The answer turned up in cross-pair concentration:

**Day-level TFS share across the entire pair universe (from telemetry, all cycles):**

| Day | Quality | Total cycles | TFS% | IE% | RBS% | STR% | HVU% |
|---|---|---:|---:|---:|---:|---:|---:|
| 2026-04-20 | CLEAN | 50,760 | 40.8% | 9.1% | 16.1% | 31.9% | 2.2% |
| 2026-04-21 | CLEAN | 74,383 | 40.5% | 11.2% | 24.9% | 21.5% | 1.8% |
| **2026-04-22** | **HOSTILE** | **109,432** | **73.5%** | **8.9%** | **6.5%** | **10.3%** | **0.9%** |
| 2026-04-23 | CLEAN | 53,549 | 39.2% | 8.8% | 12.4% | 29.3% | 10.2% |
| 2026-04-24 | CLEAN | 70,972 | 43.3% | 12.7% | 17.5% | 25.0% | 1.5% |
| 2026-04-25 | MIXED | 75,101 | 54.0% | 8.6% | 13.9% | 22.1% | 1.4% |

**04-22 TFS share is 73.5% — completely off-trend vs all other post-B62 days (39-54%).** The classifier was confidently calling almost three-quarters of the pair universe "stable trending." On a calm day the classifier sees the universe as a mix; on 04-22 it saw it as monolithic. That's the fingerprint.

**Hourly TFS+IE share on 04-22 (drilling down on timing):**

| Hour UTC | TFS% | IE% | TFS+IE% |
|---|---:|---:|---:|
| 00:00 | 37.4% | 7.2% | 44.6% (normal) |
| 03:00 | 49.2% | 10.8% | 60.1% (rising) |
| 04:00 | 58.9% | 11.1% | 70.1% (above threshold candidate) |
| **05:00-18:00** | **65-86%** | **6-12%** | **80-92%** (sustained 12-hour hostile band) |
| 19:00 | 74.6% | 7.3% | 81.9% (still elevated) |
| 23:00 | 54.2% | 9.5% | 63.7% (returning to normal) |

**The hostile window is visible in the concentration signal in real time, BEFORE outcomes are known.** A rolling-cycle measure of cross-pair TFS+IE share, sampled every cycle and averaged over the last (say) 60 cycles, would have flipped to "elevated concentration" by ~04:00 UTC on 04-22 and stayed elevated through 18:00 UTC.

---

## 6. Proposed sustainability check (NEW hypothesis for Phase B)

**Replace the ADX-floor hypothesis with a cross-pair concentration hypothesis:**

```
TFS branch:
  Path A: mom > 0.003 AND adx > 50  (unchanged)
  Path B: |DBS| >= 0.30 AND cross_pair_tfs_ie_share_rolling_60_cycles < 0.65

  Where cross_pair_tfs_ie_share_rolling_60_cycles is computed from the
  telemetry aggregator's existing per-pair regime classifications,
  averaged over the most recent 60 classification cycles.

  If the gate fails on Path B, the pair falls through to STRUCTURAL_TRANSITION
  (the existing fallback for "no strong classification").
```

**Why this is a better hypothesis than ADX-floor:**

1. **Empirically supported in Phase A data.** 04-22 concentration (73.5%) is an obvious outlier vs all other post-B62 days (39-54%); ADX is not.
2. **Computable from existing classifier outputs.** No new inputs required. The telemetry aggregator already maintains per-pair regime state.
3. **Catches the hostile pattern at the right layer.** When the system sees concentration, it's BECAUSE the directional bias signal is universally bullish — exactly the condition that makes Path B fire across the whole universe and exactly the condition where reversal risk is highest. Cause and signal align.
4. **Doesn't break clean days.** Clean days never approach 65% concentration in our post-B62 sample. Langston's Q2 guard ("clean-day TFS-tagged WR must not drop more than 3pp from baseline") would be naturally satisfied.
5. **Composable with AMR.** AMR (Phase 19.5) can use the same concentration signal at the system-wide layer to throttle ALL strategy entry, while B65.6 uses it at the per-pair classifier layer to adjust the classification itself. Both layers are compatible and reinforce each other.

---

## 7. What this is NOT

- **Not a rejection of the broader B65.6 framing.** The work that needs to happen (audit Path B, add a sustainability check) is exactly the same; only the specific gate condition pivots from ADX to concentration.
- **Not a substitute for AMR (Phase 19.5).** AMR addresses the system-wide hostile-window detection problem. B65.6 addresses the per-pair classifier confidence inversion. Both are needed; the concentration signal is the shared underlying input that both layers consume.
- **Not a problem with the global aggregation layer.** `getDominantRegime` correctly returns the most-common per-pair regime. The ISSUE is that the per-pair classifier is firing TFS too easily on Path B; concentration is a way to make Path B less promiscuous.
- **Not a rejection of Langston's Q1.** Langston's Q1 was "ADX-floor is the right starting hypothesis" — a reasonable prior given that ADX is already in the input vector. Phase A's job was to test that prior empirically. The data says "no" on this prior and offers a better candidate. That's exactly what Phase A is for.

---

## 8. Recommendations

### 8.1 Phase B pivot

Drop the ADX-floor hypothesis. Phase B writes the cross-pair-concentration hypothesis as a single concrete rule with a specific threshold (candidate: `cross_pair_tfs_ie_share_rolling_60_cycles < 0.65` as the gate). Phase B output: `B65_6_PHASE_B_DETECTOR_HYPOTHESIS.md` with predicted impact on TFS share, flicker, and outcome alignment.

### 8.2 Phase C backtest target adjustment

Phase C threshold (Langston Q2 + Q4) stays the same in spirit, but the SPECIFIC numbers may shift because the new hypothesis acts at a different layer:

- TFS share on 04-22 should drop materially (target stays: 82% → <60%, but the mechanism is different — concentration gate would downgrade ALL excess TFS classifications during the 12-hour hostile band, not just the Path-B-only ones)
- TFS-tagged WR on 04-22 should rise materially (target stays: 13.8% → >20%)
- Clean-day TFS WR must not drop more than 3pp (Langston Q2 guard preserved)
- Flicker: concentration gate is INHERENTLY smoothing (rolling-60-cycle window) so flicker should be lower, not higher. The `classifier_flicker_ceiling_pct` module constant (Langston Q4) is still the safety cap.

### 8.3 New module constant for B65.6 ship (if it ships)

If the concentration hypothesis validates in Phase C, the constant becomes a new `module_constants` entry: `classifier_concentration_gate_pct`, seed value 0.65 (or whatever Phase C lands on). Tunable per (asset_class, exchange) in case different markets behave differently.

### 8.4 Coordinate with AMR design (Phase 19.5)

The concentration signal discovered in Phase A is also exactly the kind of input the AMR detection layer needs (per `ADAPTIVE_MARKET_RESPONSE_CONCEPT.md` §10.4). AMR design should use the same concentration computation; doing it twice would be wasteful. **Suggest the concentration signal lives in `telemetry-aggregator.ts` as a new `getConcentrationShare()` method**, with both the per-pair classifier (B65.6) and the AMR detection layer (Phase 19.5) consuming it.

### 8.5 Sample size caveat

740 trades / 6 days is a small sample. The cross-pair concentration finding rests on one extreme outlier day (04-22 at 73.5% vs others at 39-54%). Phase C historical replay against `phase15b_dbs_telemetry` (which Langston confirmed covers 04-15+ with full classifier inputs) extends the validation window. **If Phase C finds additional pre-cohort days where concentration was ≥65% and outcomes were also poor, the hypothesis is strongly confirmed.** If 04-22 turns out to be the only concentration spike in the available history, the hypothesis is supported by a single data point and we should consider extending observation forward several days before any code change.

---

## 9. Status of B65.6 phases

| Phase | Status |
|---|---|
| A — Input audit | ✅ Complete (this document). Hypothesis pivoted from ADX-floor to cross-pair concentration. |
| B — Single-rule hypothesis | ⏳ Pending Langston review of A + Kyle approval. Will write `B65_6_PHASE_B_DETECTOR_HYPOTHESIS.md` codifying the concentration-gate rule. |
| C — Historical replay backtest | ⏳ Pending B. Will use `phase15b_dbs_telemetry` 04-15+ as replay source. |
| D — Conditional ship | ⏳ Pending C. Will land `cross_pair_tfs_ie_share` computation in `telemetry-aggregator.ts` (shared with AMR) plus the gate condition in `market-regime.ts`. |

---

*End of Phase A. Awaiting Langston Step-1 amendment review of the hypothesis pivot, then Kyle approval to proceed to Phase B.*

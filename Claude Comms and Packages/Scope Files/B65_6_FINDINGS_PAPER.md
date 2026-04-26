# B65.6 Findings Paper — Per-Pair Regime Classifier Audit + Sustainability Gate

**Date:** 2026-04-26
**Status:** B65.6 closed via SKIP (no code change shipped); findings preserved here as the canonical reference for what was tested, what we learned, and why the per-pair-classifier fix was deferred to Phase 19 observational decision.
**Audience:** Kyle, Langston, future-CC during Phase 19 paper-mode review.
**Why this exists:** Kyle directive 2026-04-26 — "I would like you to write up a paper with all of the observations that you've seen, you know, the data, the calculations that you've done in the different scenarios, write all of that up in a document." Phase 19 references this paper at the observational-decision-gate line so the team can look back at exactly what we tested without rebuilding institutional memory from scratch.

---

## 1. Why this work happened

The per-pair regime classifier (`server/core/metrics/market-regime.ts`) sits at the entry-routing layer of the trading pipeline. Every pair, every minute, gets stamped with a regime label — TREND_FRIENDLY_STABLE (TFS), RANGE_BOUND_STABLE (RBS), IMPULSE_EXPANSION (IE), STRUCTURAL_TRANSITION (STR), or HIGH_VOLATILITY_UNSTABLE (HVU). Different strategies are wired to fire on different labels, so the classifier is the gating decision for which strategies even consider which pairs.

The TFS branch fires through one of two paths:

- **Path A:** `mom > 0.003 AND adx > 50` — positive momentum + sustained directional pressure
- **Path B:** `|DBS| >= 0.30` alone — recent directional bias score is moderately strong, with no other check

Path B is the suspect. DBS reflects past realized price direction. On a strongly-bullish day, every pair's recent DBS reading will be elevated, and Path B fires for nearly every pair regardless of whether the move has more room to run, whether volume is supporting, or whether the trend is fresh vs exhausted.

The smoking gun came from B65.5 Phase A0 (the earlier batch): on 2026-04-22, the classifier confidently tagged 195 of 239 traded pairs as TFS via Path B. Strong-bull-trend trades fired into them. Result: 16% WR. Pairs the classifier was LEAST sure about (STRUCTURAL_TRANSITION, n=6) had 83% WR — the classifier's confidence ordering was inverted from outcomes.

B65.6 was scoped as a research-then-design audit to find a sustainability check that could be added to Path B to prevent this kind of misfire. The deliverable was supposed to be either (a) a new condition added to Path B that demonstrably improves outcomes, or (b) a clear empirical case that no such condition exists in the current input space.

The answer turned out to be (b). This paper documents how we got there.

---

## 2. What we tested — phase-by-phase

### 2.1 Phase A0 (predecessor work in B65.5)

**Trigger:** B63 Item 13 BUILD_DEDICATED verdict on vwap_pullback in the strong-trend lane (57 trades / 21.1% WR / sumR −28.99).

**Test:** market-window control. For each cohort entry, computed sibling-strategy WR in the same ±60min window, plus a focused control on `strong_bull_trend` (the lane-mate).

**Result:**
- Cohort WR: 27.0%
- Sibling-strategy WR same windows: 25.8%
- SBT (lane-mate) WR same windows: 23.9%

The cohort wasn't underperforming relative to sibling strategies in the same windows. A single catastrophic day (2026-04-22) drove almost the entire cohort net loss; excluding it, cohort WR jumps to 43.2% and outperforms SBT by ~10 points.

**Conclusion:** the BUILD_DEDICATED verdict was reflecting window-quality contamination, not strategy-quality failure. B65.5 closed via SKIP. Item 13 verdict reframed as INCONCLUSIVE — INSUFFICIENT EVIDENCE.

**Evidence document:** `B65_5_PHASE_A0_WINDOW_CONTROL.md`

### 2.2 B65.6 Phase A: telemetry-derived candidate variables

Tested four candidates from existing telemetry (no OHLC pull needed):

| Candidate | Method | Result |
|---|---|---|
| DBS slope (linear regression over 30 cycles) | rate of change in DBS | Weak signal: 22-losers slope +0.0011, 22-winners +0.00035. Discrimination test gave at best 50% L excluded / 56% W preserved. Not sharp. |
| DBS delta (last − first in 30-cycle window) | absolute DBS change | Mild directional signal but no clean threshold separation. |
| **DBS percentile rank** (vs pair's own 12h distribution) | climactic vs mid-trend | **Best telemetry-derived candidate.** Losers cluster at climactic ranks (median 91st pct, p75=100); winners more spread (median 59). Real signal but not sharp enough alone. |
| ATR ratio (current vs 12h mean) | range expansion | No signal. Distributions essentially identical. |
| DBS sub-components (slope/return/ema) | which sub-input dominates | Telemetry records all zeros — not actually persisted. Untestable from this source. |

**Conclusion:** none of the telemetry-derived variables is a clean discriminator on the 04-22 cohort.

**Evidence script:** `b656_phase_a_track1.py`

### 2.3 B65.6 Phase A Track 2 Step 1: historical hostile-day scan

**Method:** scanned 83 substantive VTS log files going back to 2026-01-17. For each day with ≥20 trades, computed system-wide WR and tagged hostile if WR < 25%.

**Result: 5 hostile days found across 3 months:**

| Day | n | WR | Top losing strategies |
|---|---:|---:|---|
| 2026-03-26 | 46 | 10.9% | mean_reversion, range_trade |
| 2026-04-02 | 57 | 14.0% | range_trade, reverse_impulse |
| 2026-04-12 | 120 | 22.5% | range_trade, reverse_impulse |
| 2026-04-18 | 153 | 9.2% | reverse_impulse, morning_star, vwap_pullback |
| 2026-04-22 | 239 | 18.8% | strong_bull_trend, vwap_pullback |

**Critical pattern:** failure modes are OPPOSITE across these days. Pre-04-22 hostile days = REVERSAL/RANGE strategies destroyed (markets were trending and these strategies fought the tide). 04-22 hostile day = TREND-RIDER strategies destroyed (market looked trending but reversed against entries). **No single "hostile-day" pattern — two distinct opposite patterns.**

**Evidence script:** `b656_track2_step1_hostile_days.py`

### 2.4 B65.6 Phase A Track 2 Step 2: OHLC-derived variable test

**Method:** pulled Binance 1-min OHLC for the trades on all 5 hostile days (~615 trades, ~30 min API time). Computed RSI(14), price distance from MA(20), distance from 60-period swing high, volume trend at each entry.

**Result:** across all 5 hostile days combined (380 losers, 57 winners), every variable points the same direction — winners had STRONGER momentum signals than losers, NOT weaker:

| Variable | Losers (mean) | Winners (mean) |
|---|---:|---:|
| RSI(14) | 50.2 | 59.9 |
| Price distance from MA(20) | −0.04% | +0.32% |
| Distance from 60-period swing high | −0.81% | −0.59% |
| Volume trend (recent/earlier) | 3.80 | 6.08 |

**Pattern holds on 04-22 specifically** (n=130 losers / 28 winners): RSI losers 59 vs winners 69; volume trend losers 2.81 vs winners 4.22.

**Diagnosis revision:** the classifier isn't firing at "exhaustion" (textbook hypothesis). It's firing on "directionally-aligned-but-momentum-weak" setups. Path B doesn't require current-momentum confirmation; DBS is a lagging measure that stays elevated after current momentum has faded.

**But — single variables don't sharply discriminate.** Best single rule: `volume_trend > 0.587` excludes 20% of hostile losers while preserving 88% of hostile winners. Net loser/winner ratio improvement: 6.67 → 6.08 (modest).

**Evidence script:** `b656_track2_step2_ohlc_pull.py`

### 2.5 B65.6 Phase A Track 2 Step 3: clean-day falsification

**Method:** same OHLC pull on 5 strong clean days (04-01, 04-13, 04-16, 04-20, 04-21).

**Result:** clean-day cohort 206 winners + 71 losers. ALL FOUR variables show essentially zero separation:

| Variable | Winners (mean) | Losers (mean) | Hostile gap (for comparison) |
|---|---:|---:|---:|
| RSI(14) | 51.1 | 53.1 | (hostile gap: +10) |
| MA distance | +0.07% | +0.06% | (hostile gap: 0.36) |
| Swing-high distance | −0.73% | −0.78% | (hostile gap: 0.22) |
| Volume trend | 2.12 | 2.07 | (hostile gap: 2.28) |

**Critical finding:** the winners-have-momentum pattern is HOSTILE-DAY-SPECIFIC. On clean days, winners and losers are momentum-indistinguishable. This is a real, replicable discrimination signal that operates only on hostile-day cohorts.

**Implication:** any rule built on these signals would have minimal clean-day cost (because clean-day separation is zero, the rule can't preferentially exclude winners from clean days).

**Evidence script:** `b656_track2_step3_clean_days.py`

### 2.6 B65.6 Phase A — global metrics analysis

**Method:** for each day in the post-2026-04-15 window, computed global signals from telemetry: cross-pair regime concentration (TFS share, TFS+IE share), median |DBS|, sign uniformity, peak hourly TFS+IE share, and early-day (00–03 UTC) TFS+IE share.

**Result correlations vs day WR (11 days, n≥20):**

| Metric | r vs WR |
|---|---:|
| TFS share | −0.399 |
| Median \|DBS\| | −0.339 |
| TFS+IE share | −0.360 |
| Mean \|DBS\| | −0.317 |
| Peak hourly TFS+IE | −0.296 |
| Sign uniformity | −0.188 |
| Early TFS+IE (00–03 UTC) | +0.040 |

**The two hostile days had FUNDAMENTALLY DIFFERENT global signatures:**

| Day | WR | TFS share | TFS+IE share | Sign uniformity |
|---|---:|---:|---:|---:|
| 04-22 | 18.8% | **73.5%** | **82.3%** | **89.6%** |
| 04-18 | 9.2% | 38.1% | 41.9% | 39.5% |

**Cross-pair concentration would have predicted 04-22 but NOT 04-18.** It's a TREND-RIDER-PROTECTION signal specifically — not a universal hostile-day detector.

**Critical leading-indicator finding:** early-day concentration (00–03 UTC) does NOT predict same-day WR (r = +0.04). Concentration emerges as the day progresses, not in the morning. Any concentration-based detector would have to update continuously, not lock in early.

**Evidence script:** `b656_global_metrics.py`

### 2.7 B65.6 Phase A — classifier replay validation

**Method:** per Kyle directive to validate apples-to-apples by replaying the post-B62 classifier on pre-B62 telemetry. Cheap version run on 2026-04-18 (which had telemetry available).

**Result:** B62 was deployed 2026-04-16 morning UTC (commit `b2a446a7`), not 2026-04-19/20 as we'd been quoting. The telemetry confirms identical recorded-vs-replayed values from 04-16 onward (delta = 0.0pp). 04-18 was already running the post-B62 classifier.

**Implication:** the OHLC-derived variable analysis on 04-18 was using the correct routing all along. The "two distinct hostile-day flavors" finding holds apples-to-apples — both 04-18 (TFS+IE = 41.9%, normal) and 04-22 (TFS+IE = 82.3%, extreme) were running the same post-B62 classifier. Different market structures produced fundamentally different concentration signatures under identical classifier code.

**Truly pre-B62 hostile days (03-26, 04-02, 04-12) remain unanalyzed under apples-to-apples.** No telemetry available; would require OHLC reconstruction (~half-day work). Not gating evidence given that 04-18 + 04-22 already establish the two-flavor pattern under post-B62.

**Evidence script:** `b656_classifier_replay_04_18.py`

### 2.8 B65.6 Option C combined-rule test

**Method:** Kyle asked specifically what would happen if we rewrote Path B as a combined-filter rule: `|DBS| >= 0.30 AND momentum > X AND RSI > Y AND price >= MA_20`. Tested 7 threshold combinations from LOOSE to VERY STRICT, against both hostile-day cohort and clean-day cohort, measuring losers blocked / winners blocked / kept-cohort WR change for each.

**Result table:**

| Rule | Hostile L blocked | Hostile W blocked | Clean L blocked | Clean W blocked | Hostile WR Δ | Clean WR Δ |
|---|---:|---:|---:|---:|---:|---:|
| LOOSE (mom>0, RSI>40, price>MA−0.5%) | 46.1% | 24.6% | 40.8% | **50.7%** | +4.3pp | −3.6pp |
| LOOSE+ | 51.8% | 31.6% | 46.5% | **57.1%** | +4.5pp | −4.4pp |
| MEDIUM | 54.2% | 31.6% | 47.9% | **59.5%** | +5.3pp | −5.1pp |
| MEDIUM+ | 60.5% | 35.1% | 52.1% | **66.8%** | +6.7pp | −7.6pp |
| STRICT | 64.5% | 38.6% | 53.5% | **69.3%** | +7.5pp | −8.7pp |
| STRICT+ | 76.3% | 47.4% | 63.4% | **77.1%** | +12.0pp | −9.9pp |
| VERY STRICT | 78.4% | 52.6% | 67.6% | **79.0%** | +11.7pp | −9.1pp |

**Verdict on Option C: REJECTED by the data.** Even the loosest threshold blocks 50.7% of clean-day winners. Net economic effect is negative because clean days dominate volume AND have higher per-trade WR baseline.

**Why Option C fails:** the falsification test from §2.5 showed that on clean days, winners and losers are momentum-indistinguishable. So multi-variable momentum filters on clean days kill winners and losers at roughly equal rates. Since clean days have 74% baseline WR, the rule disproportionately kills good trades.

**Evidence script:** `b656_option_c_test.py`

---

## 3. Decision: close B65.6 via SKIP

Per Kyle directive 2026-04-26 after reviewing all results above:

> *"Okay, so for now, I don't wanna do anything to try and fix what we're seeing. Let's leave VWAP in the trend strong family. As we go through phase 19 and get the paper trading engine going, we will run the paper trading engine as it's working, and we'll be able to observe for some time, you know, whether or not we run into these streaks or these areas where the pair level regime isn't at odds with how the actual signal trades, and we'll run into some of these hostile days. And at that point, we can make a decision on whether or not we wanna move forward the adaptive market response wiring."*

**B65.6 closes with this paper as the deliverable.** No code change shipped. vwap_pullback stays in the strong-trend lane. The per-pair classifier is unchanged.

### 3.1 Why we did not ship Option B (volume_trend > 0.6)

Option B was data-defensible but only modestly improved hostile-day WR (~5pp) at the cost of also degrading clean-day WR slightly (~1-2pp). The improvement vs cost trade-off was net positive but small. Kyle's reasoning for not shipping it:

1. **Phase 19 will reveal whether the streakiness phenomenon manifests at active-trading scale.** At active-trading scale the system has stricter filters than VTS, and the streak phenomenon may attenuate naturally without per-pair-classifier intervention.
2. **Anything we ship now would likely be replaced by Phase 19.5 AMR work later.** AMR is designed to address hostile-window detection at the system layer (which is where the data shows the cleaner signal lives). Shipping a per-pair patch now creates technical debt that AMR has to either incorporate or rip out.
3. **Avoiding "manually-built things we won't remember why we did."** A single-variable threshold rule with a magic number (`volume_trend > 0.587`) introduces an unexplained constant that future-CC has to investigate. Better to leave the classifier as-is and address the underlying issue with the more capable AMR design.

### 3.2 What this leaves on the table

- **VWAP_pullback stays mapped to the strong-trend lane.** The B63 Item 13 BUILD_DEDICATED verdict was already reframed to INCONCLUSIVE. The strategy continues to fire as it does today.
- **Path B continues to fire on `|DBS| >= 0.30` alone.** No sustainability check added.
- **Hostile-day losses remain a known risk** until Phase 19.5 AMR or some equivalent system-layer protection ships.

### 3.3 What Phase 19 has to determine

- Does the streak phenomenon manifest at active-trading scale? VTS is intentionally permissive; active-trading filters are stricter. If active-trading WR doesn't show 04-22-style hostile windows after 1-2 weeks of paper observation, the per-pair issue may have effectively self-resolved at the active-trading layer.
- If hostile windows DO manifest in paper trading, what's their frequency and magnitude? That data informs whether AMR needs to be built pre-launch or whether existing protections (BE-stop, ladder trailing, RTBQ slot caps) absorb the damage adequately.
- What's the daily signal volume at active-trading scale? If it's low, that's the trigger for moving XStocks + Perp Futures forward (more pairs = more opportunities).

---

## 4. Inputs we tested but couldn't ship

These were the candidate variables we evaluated. None became code. All are documented here so future-CC during Phase 19 can pick them up if they validate on active-trading data.

**Telemetry-derived (no OHLC pull needed):**
- DBS slope (rate of change over rolling window)
- DBS delta (last − first in window)
- DBS percentile rank vs rolling distribution
- ATR ratio (current vs rolling mean)
- DBS sub-components — broken; telemetry doesn't persist them

**OHLC-derived (Binance free historical pull required):**
- RSI(14)
- Price distance from MA(20)
- Distance from N-period swing high
- Volume trend (recent vs earlier ratio)
- Momentum (price change over N periods, computable from closes)

**Cross-pair / global:**
- Cross-pair TFS share (rolling cycles)
- Cross-pair TFS+IE share (rolling cycles)
- Mean / median |DBS| across pair universe
- DBS sign uniformity (% of pairs with same sign)
- Peak hourly concentration
- Early-day concentration

**The cleanest hostile-day discriminators in the data, ranked:**

1. Cross-pair TFS+IE concentration (sharp on 04-22, silent on 04-18 — trend-rider-protection only)
2. Volume trend (winners had stronger volume expansion across all hostile days)
3. RSI (winners had stronger RSI across all hostile days)
4. Price distance from MA (winners further above MA)
5. DBS percentile rank (losers cluster at climactic ranks)

None of these were sharp enough, alone or combined, to ship as a per-pair classifier change without unacceptable clean-day cost. Cross-pair concentration is the strongest signal and naturally belongs in Phase 19.5 AMR's multi-input detection layer.

---

## 5. References

**Code:**
- `server/core/metrics/market-regime.ts:147-174` — TFS branch with Path A and Path B
- `server/services/telemetry-aggregator.ts:1216-1254` — `getDominantRegime` global aggregator (correctly wired; NOT the issue)

**Data sources:**
- `/home/deploy/dawntrader/logs/virtual_trades/2026-*.json` — VTS trade logs (~3 months)
- `/home/deploy/dawntrader/logs/phase15b_dbs_telemetry/2026-04-*.jsonl` — per-pair classifier inputs (covers 2026-04-15 onward)
- Binance public REST API — historical 1-min OHLC for the pair universe

**Analysis scripts (preserved in `Claude Comms and Packages/Scope Files/`):**
- `b656_phase_a_track1.py` — telemetry-derived variables on 04-22 cohort
- `b656_track2_step1_hostile_days.py` — historical hostile-day scan
- `b656_track2_step2_ohlc_pull.py` — OHLC variables on hostile days
- `b656_track2_step3_clean_days.py` — clean-day falsification test
- `b656_global_metrics.py` — cross-pair concentration + DBS uniformity
- `b656_classifier_replay_04_18.py` — post-B62 classifier replay validation
- `b656_option_c_test.py` — Option C combined-rule sweep

**Predecessor work:**
- `B65_5_PHASE_A0_WINDOW_CONTROL.md` — original window-control finding that preceded B65.6
- `BATCH_63_COMPLETION_REPORT.md` §11 + §12 — Item 13 verdict and reframe
- `REGIME_CLASSIFIER_INVESTIGATION_2026_04_26.md` — initial classifier investigation that motivated B65.6

**Forward references (Phase 19 work):**
- `POST_AUDIT_ROADMAP.md` Phase 19 — observational decision gate (added 2026-04-26 referencing this paper)
- `ADAPTIVE_MARKET_RESPONSE_CONCEPT.md` §6 + §10 — AMR design where cross-pair concentration belongs

---

*B65.6 closed 2026-04-26 via SKIP. This paper is the canonical reference for the per-pair classifier audit work. Phase 19's observational decision gate references this paper; future-CC reading this during Phase 19 has the full record of what was tested and why no code shipped.*

# B63 Streakiness Analysis — VTS Outcome Clustering

**Author:** Claude Code, 2026-04-22
**Data:** 620 closed VTS trades, 2026-04-15 12:58 UTC → 2026-04-22 12:39 UTC
**Trigger:** Kyle's observation that daily WR swings from 9.9% (04-18) to 76.7% (04-20) feel system-driven, not random
**Scope:** VTS-only observation window. Code-level mechanism trace. No recommendations for immediate deploy — all findings frame as pre-Phase-19 preparation / B66 scope candidates.

---

## Operating-Mode Context (critical re-framing)

**VTS does NOT apply SQE filtering.** Verified directly in `server/services/vts-runner.ts`:

- **No `evaluateSignalQuality` call** in the VTS entry path (confirmed by grep)
- Only comment reference: `"HF9: applyGovernance removed (dead import — governance gate moved to SQE)"` and `"Active trading still enforces ROI gate (in signal-orchestrator.ts / SQE)"` — both confirm SQE is on the paper/live path, not VTS
- `vts-runner.ts` L1036: `// Batch 18L Option C: ROI gate SKIPPED for VTS` — explicit bypass, followed by `console.log` of bypass events for ML learning feature extraction

**What VTS actually filters with:**

| Filter | Location | Effective? |
|---|---|---|
| Strategy `detect()` returning null | per-strategy files | YES — upstream gate, produces all signals |
| DBS pre-filter routing (B63 Item 6) | `strategy-engine.ts` | YES — routes to source pool |
| Governance gate (Directive 11.7R-E) | `strategy-eligibility.ts` | YES — but mostly dormant in 90.6% TFS env |
| Mode overlay (NORMAL/DEFENSIVE/SURVIVAL) | `strategy-modes.ts` | Mostly NORMAL in current env |
| **Net EV floor** | `vts-runner.ts` L1016, floor = −0.01 (−1%) | Loose — mean streak P/L was −2.31%, so some caught but most admitted |
| ROI gate | bypassed (comment L1036) | NO |
| SQE FinalScore threshold | not called | NO |
| SQE RegimeWeight threshold | not called | NO |
| Pattern-pool FinalScore floor | not called in VTS | NO |
| Confidence floor | `meetsConfidenceFloor` — conditional path, largely dormant | Mostly NO |
| ADX guard | `vts-runner.ts` L1051, `sma_trend_ride` only | YES but narrow |
| Structural (duplicate, cooldown, max-open, price-past-stop) | `vts-runner.ts` L1100-1185 | YES but post-admission |

**Implication:** the streakiness in the VTS output is a **consequence of the raw pipeline** — strategy detectors, regime classifier, DBS pre-filter routing, geometry kit, scan cadence — NOT of SQE scoring calibration. Item 18's "FinalScore is anti-predictive" finding identifies what SQE would do to streakiness once it's turned on in Phase 19. The current streakiness is **upstream** of SQE entirely.

---

## Part I — Statistical Evidence

### Wald-Wolfowitz runs test

| Quantity | Value |
|---|---|
| Total closed trades | 620 |
| Overall WR | 41.6% (258 wins / 362 losses) |
| Total runs (W/L sequences) | **114** |
| Expected runs under independence (H₀) | 302.3 |
| σ | 12.09 |
| **z-score** | **−15.574** |
| p-value | < 10⁻⁵⁰ |

**Conclusion:** outcomes are **not independent**. The observed clustering is roughly 10²⁵× more extreme than random noise. This is not a small-sample quirk — it is the strongest rejection of independence I have seen in this project's data.

### Run-length distribution

| Length | Win runs | Loss runs |
|---|---|---|
| 1 | 20 | 25 |
| 2-3 | 18 | 12 |
| 4-6 | 7 | 8 |
| 7-10 | 5 | 2 |
| 11-19 | 4 | 6 |
| 20-34 | 2 | 3 |
| **70** | 0 | **1** |

The 70-loss streak is a 7σ event standalone. Losing runs have a longer tail than winning runs (max 70 vs max 32).

### Post-B62 re-measurement (added 2026-04-22)

The 620 closed trades span both pre-B62 (through 2026-04-19) and post-B62 (from 2026-04-20) windows. B62 closed on 2026-04-19 with DBS added as a regime-classifier input. Segmenting the dataset:

| Metric | Pre-B62 (n=457) | Post-B62 (n=163) | Change |
|---|---|---|---|
| **Runs test z-score** | −14.22 | **−5.43** | 3× reduction in standardized streakiness magnitude |
| **Max loss streak** | **70** | **20** | 3.5× shorter |
| **Max win streak** | 32 | 19 | — |
| **Win rate** | 34.1% | **62.6%** | +28.5pp |
| **Expected runs under H₀** | 206.5 | 77.3 | — |
| **Observed runs** | 70 | 45 | — |

**Interpretation:** B62 alone delivered substantial streakiness reduction. Both windows reject the independence hypothesis (z still < −1.96 post-B62), so the mechanism is present — but the magnitude is ~3× smaller. **B66's success-criteria target of z > −10 is already met** by current post-B62 data, meaning B66 recalibration moves from "fix catastrophic streakiness" to "continue reduction + prepare for Phase 19 paper mode." Cross-references Item 19's H1 severity downgrade (P0 → P1): global regime aggregation now responsive, which is the primary mechanism B62 addressed.

**Caveat:** post-B62 sample is only 163 trades over 3 days. 04-20 was a 76.7% WR day which may reflect favorable tape as much as code fixes. Continued observation through the 48h window + Item 13 gate (2026-04-28) will firm the baseline.

### Daily burden table

| Date | N | WR | Max loss streak | Max win streak |
|---|---|---|---|---|
| 04-15 | 15 | 46.7% | 5 | 3 |
| 04-16 | 66 | 69.7% | 11 | 18 |
| 04-17 | 107 | 54.2% | 16 | 32 |
| **04-18** | **142** | **9.9%** | **70** | **5** |
| 04-19 | 127 | 24.4% | 34 | 13 |
| **04-20** | **43** | **76.7%** | **2** | **19** |
| 04-21 | 81 | 55.6% | 20 | 16 |
| 04-22 (partial) | 39 | 61.5% | 6 | 9 |

Between 04-18 and 04-20 the system went from 9.9% WR to 76.7% WR in 48 hours on similar signal volume. The environment did not change 8× more favorably — the system changed 8× in how it was interpreting the environment.

---

## Part II — The 70-Loss Streak, Fully Decomposed

This section uses a single streak as the instrument to diagnose the mechanism. 70 consecutive losses is statistically improbable enough that the mechanism reveals itself under examination.

### Temporal span

- **First entry:** 2026-04-17 18:42:46 UTC
- **Last entry:** 2026-04-18 11:31:47 UTC
- **Entry window: 16h 49m**
- **First exit:** 2026-04-18 07:44:46 UTC
- **Last exit:** 2026-04-18 13:31:46 UTC
- **Exit window: 5h 47m**

The entries accumulated overnight over ~17 hours. The exits compressed into ~6 hours the next day. That tells us the LOSSES were synchronized by a market event in a narrow 6-hour window, even though entries were spread out. Whatever happened around 04-18 07:44 UTC caused the preceding 16 hours of open trades to roll over into stops together.

### Strategy / regime / source-pool mix (NOT a single-cause event)

| Dimension | Distribution during streak |
|---|---|
| **Strategy** | morning_star 25, reverse_impulse 22, range_trade 12, vwap_pullback 5, support_bounce 4, volatility_edge 2 |
| **Pair regime** | TFS 32, RBS 17, ST 15, HVU 5, IE 1 |
| **Global regime** | TFS 70 (100%) |
| **Source pool** | QUANT-REVERSAL 24, QUANT-TREND 23, PATTERN 23 |
| **Pair DBS bias** | NEUTRAL 23, UP_MODERATE 20, UP_WEAK 17, DOWN_WEAK 6, DOWN_MODERATE 3 |
| **Global DBS bias** | NEUTRAL 48, UP_WEAK 18, UP_MODERATE 2, DOWN_WEAK 2 |
| **Exit type** | STOP_LOSS 68, TIMEOUT 2 (zero wins) |
| **Mean P/L** | −2.31% per trade |
| **Unique pairs** | 42 |

**Critical observation: this was NOT "morning_star in TFS" running badly.** It was 6 different strategies across 5 pair-regimes and 3 source pools, all losing together, over 42 different pairs. The ONLY thing constant across all 70 trades was the **global regime (100% TFS) and the fact that global DBS was hovering near neutral (median 0.000)**.

### Scoring during the streak (what SQE WOULD have seen if it were filtering)

| Score | min | median | mean | max |
|---|---|---|---|---|
| finalScore | 0.319 | 0.642 | **0.588** | 0.738 |
| expectedEdge | 0.0007 | 0.0099 | **0.0145** | 0.1087 |
| regimeWeight | 0.425 | 0.636 | **0.631** | 0.888 |

**The scoring was HEALTHY-LOOKING during the streak.** Mean finalScore 0.588 is well above the 0.35 threshold. Mean regimeWeight 0.631 is well above 0.30. If SQE were filtering on these thresholds in VTS, it would have admitted almost every one of these 70 losing trades. This is the empirical proof of Item 18's "FinalScore is anti-predictive" finding: the scoring was confident on trades that were about to lose at −2.31% mean P/L.

### Simultaneous-entry analysis — correlated pairs as effective position concentration

Representative bursts of simultaneous entries within the streak:

| Entry minute | Pairs |
|---|---|
| 2026-04-18 05:14 | ETH/GBP, ETH/USDT, XRP/GBP, XRP/USD |
| 2026-04-18 05:04 | FARTCOIN/USD, XRP/EUR, ONDO/USD |
| 2026-04-18 06:02 | SOL/USD, SOL/EUR |
| 2026-04-18 09:33 | CRV/USD, ADA/EUR |
| 2026-04-18 10:02 | XDC/EUR, XDC/USD |

The 05:14 burst shows **4 "independent" trades that are effectively 2 bets:** ETH priced in GBP and USDT move together (ETH dominates both); XRP priced in GBP and USD move together (XRP dominates both). If ETH reverses, both ETH/* stop-outs hit within seconds. If XRP reverses, both XRP/* stops hit. The system treated them as 4 independent risk units; the market treated them as 2.

This pattern replicates throughout the data. 42 "unique pairs" in the streak, but many of them are the same crypto priced in different quote currencies. When the underlying (ETH, XRP, SOL, BTC) moves, correlated pairs close together as one cohort.

**Code mechanism:** `server/services/vts-runner.ts` applies duplicate-position checking by exact `symbol` (L1150+), not by underlying. ETH/GBP and ETH/USDT are distinct symbols → both admitted → both stop-out together when ETH moves against them.

---

## Part III — Mechanism Candidates (Code-Level)

Each candidate traces to specific source code and shows how the code produces clustered outcomes.

### Mechanism 1: Global-scope state propagation via 30-second scan cadence

**Code:** `server/services/vts-runner.ts` L371-373

```typescript
const DEFAULT_CONFIG: VTSConfig = {
  autonomousMode: true,
  simulationIntervalSec: 30,  // Batch 18L Option D: was 60, now aligned with FX5 30s scan cycle
  pairsPerCycle: 200,         // Batch 18L Option E: was 100, now captures all FX5 survivors
```

**MCE cadence (corrected 2026-04-22):** MCE is **invoked on-demand per pair** by `vts-runner.ts`, `signal-orchestrator.ts`, and scanner paths. Per-symbol cache TTL = **60 seconds** (set in `server/types/market-context.ts` L78-84: `cacheTTLMs: 60_000`). Beyond 60s, full regime + indicators are recomputed fresh. Langston's Item 19 first-pass "5-minute cycle" was the `phase15b_dbs_telemetry` writer cadence, NOT the MCE compute cadence. This was corrected in the Item 19 audit on 2026-04-22.

**How it produces streaks:** every 30 seconds, VTS evaluates up to 200 pairs. Within the 60-second MCE cache window, roughly **2 consecutive scan cycles share the same cached MCE context per pair**. All pairs evaluated in those 2 scans see the same global DBS, the same regime label, the same indicators. If any global-scope input is wrong or stale, pairs admitted in the stale window are all parameterized against the same stale values and fail together.

The stale window is smaller than the initial framing suggested (~60s, not ~5 min) — but still real, and still large enough to admit dozens of trades during a global-state transition.

**Streak mechanism:** when global state transitions during the 60s cache window, all pairs admitted in that window carry stale global parameters. Since they share the same parameters, they fail together. Further — if the regime-classifier consumes inputs that themselves update slowly (e.g. trendStrength via a rolling window, volatility via recent candles), the regime label can lag the actual market shift by MORE than one cache refresh, compounding the effect.

### Mechanism 2: MCE cache TTL + regime classifier per-pair sampling

**Code:** `server/services/market-context-engine.ts` L124-200 (on-demand compute with 60s cache)

The pair regime label, DBS, and indicators are computed per-pair on-demand with a **60-second cache TTL**. Global regime label is aggregated from pair-level regimes per invocation. Langston's Item 15 §3.9 finding that globalRegime was 90.6% TFS across all 7d trades AND Item 19 H1 finding that global regime never transitioned during the 70-streak window — both reflect a **regime aggregation** that is sticky (pre-B62 fix), not a classifier that refuses to recompute.

**Note (2026-04-22):** Item 19 H1 re-verification on post-B62 data (after 2026-04-19) found global regime aggregation responsive — 2 transitions in 72h, responsive to pair-level consensus. Severity downgraded P0 → P1. The 70-streak period was pre-B62; the mechanism described here is historically real but largely resolved by B62's DBS-informed classifier.

**How it produces streaks:** if the regime classifier is slow to detect a regime transition (e.g. from TFS to something else), the system will continue admitting TFS-appropriate strategies even as the market behaves differently. Between 04-17 18:42 (streak start) and 04-18 07:44 (first stop-out), the classifier never transitioned out of TFS. Downstream consumers continued routing signals through TFS-favoring paths, and the market was punishing TFS-style bets.

**Per Langston's Item 15 finding:** `PredictiveConfidence` uses **all-time cumulative VTS win rate** rather than a rolling window. When 04-17 was a 54% WR day with a 32-win streak, PredConf's cumulative average lifted. On 04-18 morning, it was STILL parameterized on 04-17's reality. Its slow update cadence (cumulative-average-over-all-time has effective update cadence of ~N⁻¹ where N is trade count — slow after hundreds of trades) makes it incapable of reacting to 4-hour regime transitions.

### Mechanism 3: Variant E geometry asymmetric on regime reversal

**Code:** `server/services/vts-runner.ts` L1078-1092

Mode overlay applies stop/target multipliers. When `sourcePool === 'quant-strong_trend'`, Variant E geometry is preserved (4× ATR stop, 3R target — per B63 Item 12). For other pools, default geometry.

**How it produces streaks:** default geometry (`targetProfit: 0.015`, `stopLoss: 0.008` per L380-381) is roughly 1.88:1 RR. In a REVERSING market, stops are tighter than targets, so stops hit first across the entire pair universe simultaneously. Every pair that had an open trade during the reversal period hits its stop before its target. The 70-streak had 68 STOP_LOSS and 2 TIMEOUT — zero take-profit — confirming that stops were the resolution mechanism for every trade in the streak.

**Cross-pair correlation through shared geometry:** if 50 pairs are open with 0.8% stops and 1.5% targets, and the correlation-dominant pair (BTC, ETH) moves 1% against the direction, all 50 pairs that were implicitly leveraged on that move hit stops within seconds. The geometry is shared, the underlying move is shared, the exit is clustered.

### Mechanism 4: Net EV floor (−1%) is too loose to filter streak trades

**Code:** `server/services/vts-runner.ts` L364, L1016-1028

```typescript
const VTS_NET_EV_FLOOR = -0.01;  // Batch 52 Fix 19: Tightened -2.0%→-1.0%.
```

Mean P/L during the 70-streak was **−2.31%**. The Net EV floor is −1.0%. At first glance the floor should have caught these. But Net EV is a PRE-TRADE estimate using the raw EV kernel, not a post-trade reality. The floor is catching trades whose PREDICTED EV is below −1%, not trades whose REALIZED outcome is below −1%.

The streak trades had mean `expectedEdge` of **+0.0145** (+1.45%) — the raw EV kernel was saying "these are positive EV trades." Reality delivered −2.31%. The kernel's prediction-vs-reality gap was ~3.76 percentage points on average.

**Per Langston's Item 15 finding:** `ExpectedEdge vs ActualNet` Pearson r = −0.130 on the full 7d dataset — the edge kernel is systematically overestimating profitability. The 70-streak is the extreme manifestation of this: edge kernel said +1.45%, reality delivered −2.31%, gap of 376 bps per trade × 70 trades = catastrophic aggregate underperformance.

**Streak mechanism:** when the edge kernel's predictions are systematically biased, the Net EV floor — which compares predictions to a threshold — fails to filter out reality-negative trades. It only filters out predictions-negative trades.

### Mechanism 5: Governance gate / mode overlay dormancy in TFS-dominated environment

**Code:** `server/core/governance/strategy-modes.ts` L72-75

```typescript
export const REGIME_TO_MODE_MAP: Record<RegimeStability, StrategyMode> = {
  STABLE: 'NORMAL',
  TRANSITION: 'DEFENSIVE',
  UNSTABLE: 'SURVIVAL',
};
```

Mode overlay activates DEFENSIVE or SURVIVAL only when global regime stability is TRANSITION or UNSTABLE. In the 7d dataset, global regime was 90.6% TFS and therefore global stability was STABLE almost always. **Mode overlay sat at NORMAL throughout the 70-streak.**

**Streak mechanism:** the defensive mechanisms designed to PROTECT the system during regime changes (widening stops, tightening position size, raising confidence floors) never activated. The 04-17 → 04-18 regime shift — visible in outcomes as a 54% → 10% WR collapse — was invisible to the mode-overlay system, which saw global stability as "STABLE TFS" throughout.

Per Langston's Item 15 §3.9 verdict: *"The mode overlay system and governance gates are effectively inactive — they exist in code but the regime concentration means they rarely activate."*

### Mechanism 6: Correlated-pair concentration via symbol-based duplicate detection

**Code:** `server/services/vts-runner.ts` L1150-1155

```typescript
if (hasDuplicatePosition(symbol)) {
  setNullReason('duplicate_position');
  return null;
}
```

`hasDuplicatePosition` checks by exact `symbol` string. ETH/GBP and ETH/USDT are different symbols. Both admit. When ETH moves 1% against the implicit direction, both trades stop out at similar percentage losses within seconds.

**Streak mechanism:** effective position size on a SINGLE underlying (e.g. ETH) can be 4-5× the intended per-pair risk budget because the same underlying can be opened via 4-5 quote-currency pairs simultaneously. The 70-streak showed 42 unique symbols but the underlying diversity was much lower — I estimate ~12-15 distinct underlyings across 42 pairs, meaning each underlying carried ~3 correlated positions on average. When an underlying moved, the streak compounded.

---

## Part IV — Mapping Streak Mechanisms to B66 / Phase 19 Preparation

Each mechanism gets a recommended action. All actions are **pre-Phase-19 preparation** — not immediate deploys during the observation window.

| Mechanism | Code location | B66 action candidate | Priority |
|---|---|---|---|
| Global-state propagation via 30s scan | `vts-runner.ts` L371-373 | Add per-pair freshness check: reject signals whose global state snapshot is older than X ms. Surface staleness in telemetry. | **P1** — directly visible in data |
| MCE cycle cadence / PredConf cumulative | `market-context-engine.ts`, `score-calculator.ts` | Replace all-time cumulative PredConf with rolling 24h or 7d window. Item 19 cadence audit will quantify the required window. | **P0** — Item 15 already flagged |
| Variant E vs default geometry on reversal | `vts-runner.ts` L1078-1092 | Regime-aware geometry selection — reversing regimes should use tighter ratios or disable new entries entirely. | P2 — needs observation |
| Net EV floor vs realized EV gap | `vts-runner.ts` L364 + edge kernel | Add realized-EV-based adaptive floor. When realized EV diverges from predicted EV by > N bps over a rolling window, tighten the floor. | P1 — addresses the edge model bias Item 15 found |
| Mode overlay dormancy | `strategy-modes.ts` L72-75 | Expand stability signals beyond global regime. Add pair-level stability, DBS-transition signals, realized-EV drift as stability inputs. | P1 |
| Correlated-pair concentration | `vts-runner.ts` L1150 + cross-pair correlation | Implement underlying-based position limits. One ETH exposure across all ETH/* pairs, not one-per-symbol. | **P0** — highest impact for active trading |

---

## Part V — Three Pragmatic Takeaways

1. **The streakiness is an outcome signature of multiple upstream mechanisms failing in correlated ways, not a single-cause bug.** No patch to one strategy or one threshold fixes it. B66 will need to treat streakiness as a design criterion ("does this change reduce expected streak length?") rather than a side effect.

2. **SQE calibration is NOT the current streak cause — VTS has no SQE.** Item 18's anti-predictive FinalScore finding is real AND will matter in Phase 19, but recalibrating FinalScore tomorrow would not change the current streakiness at all. VTS continues to produce streaks regardless of SQE state.

3. **The scoring evidence from the streak validates Item 18's anti-predictive finding precisely.** Mean finalScore 0.588 on 70 consecutive losers proves the score is not identifying quality. If SQE were turned on today with current thresholds, it would admit 98% of these losing trades, produce the same streaks, AND lose trust in the gate system. B66's SQE recalibration must land before Phase 19 goes live or paper mode inherits this exact streak pattern with SQE nominally "active."

---

## Appendix A — Data queries used

All data from `/c/Users/kyleg/Downloads/vts_closed_trades_7d_2026-04-22 (1).csv` (620 rows, 2026-04-15 to 2026-04-22 partial). Python analysis scripts available in session history; no new data collection required.

## Appendix B — Code files read for mechanism tracing

- `server/services/vts-runner.ts` (filter map, Net EV floor, mode overlay, duplicate check)
- `server/core/governance/strategy-modes.ts` (mode overlay map, regime → stability → mode)
- Cross-referenced Item 18 and Item 15 findings (PredConf cumulative, ExpectedEdge r = −0.130, mode overlay dormancy)

## Appendix C — Cross-references

- **Item 18** (`B63_ITEM18_SQE_AUDIT.md`): SQE scoring anti-predictive findings that explain why the scores during the streak looked healthy while outcomes were catastrophic. Provides the SQE-mode inheritance risk for Phase 19.
- **Item 15** (`B63_ITEM15_ADAPTIVE_FRAMEWORK_AUDIT.md`): 69-lever inventory, 51 hard-coded. PredConf all-time cumulative finding (§3.1), ExpectedEdge anti-correlation (§3.4), mode-overlay dormancy (§3.9), PredConf self-cancellation (§3.10). All directly cited in Part III mechanism analysis.
- **Item 19** (`B63_ITEM19_CADENCE_LATENCY_AUDIT.md`): not yet started. The streak analysis provides concrete test hypotheses for Item 19: measure T0→T4 regime-transition latency specifically around the 04-17 to 04-18 window; quantify scan-cycle correlation between simultaneously-admitted pairs; measure the global-state propagation window and its effect on outcome clustering.
- **`MODULARIZATION_SYNTHESIS_FROM_B63_AUDITS.md`**: to be written after Item 19 closes. Streakiness findings merge with Items 15/18/19 §E sections to scope B66 and the future modularization phase.

---

*End of analysis. No code changes recommended during current observation window. All P0/P1/P2 actions are B66 scope candidates or pre-Phase-19 preparation.*

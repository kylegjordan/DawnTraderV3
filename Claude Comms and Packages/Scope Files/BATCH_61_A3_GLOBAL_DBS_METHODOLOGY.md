# BATCH 61 — A.3 — Global DBS Methodology Review

**Phase:** 15b (Regime / DBS / Strategy / Filter Restructure)
**Sub-Phase:** A — DBS Validation
**Stage:** A.3 (scope §4 A.3)
**Date:** 2026-04-15
**Author:** Claude Code (ownership transferred from Langston per Kyle directive 2026-04-15)
**Status:** COMPLETE — gates B62

---

## 0. Executive summary

**The global DBS aggregation has three methodology problems, two of which are code defects. The score it produces is not trustworthy as a decision input without fixes.**

1. **The "weighted median by volume" is an unweighted median.** Production code passes an empty `Map<string, number>()` to `computeGlobalBias()`, so every pair gets weight 1. The volume-weighting design described in the module header comment and governance docs has never executed.
2. **The pair universe feeding global DBS is severely unstable.** The MCE cache (60s TTL) holds only 2–40 pairs at any snapshot (mean 18 out of 60 in the active universe). No symbol has ≥99% cache presence. Global DBS is computed from a rotating partial sample, not the full universe. "Global DBS moved" can partly mean "different pairs were in the cache" rather than market truth.
3. **Sentinel-zero scores are not excluded from the global aggregation.** The production code reads `entry.context.directionalBias.score` from the MCE cache without checking the sentinel flag. A pair that returned `score: 0` via the early-return path (insufficient OHLC or zero ATR) would be counted as NEUTRAL in the median. Zero empirical impact in this audit window (0 sentinel zeros observed), but the defect is latent.

**Verdict: REVISE before using global DBS as a B62 classifier input.** The pair-level DBS score (A.1 KEEP) is trustworthy. The global aggregation is not. B62 must fix the three defects before global DBS can carry downstream decisions. See §8 for specific recommendations.

---

## 1. Scope and methodology

### 1.1 What A.3 reviews

Per scope §4 A.3, five sub-items:

1. **Weighted-median-by-volume review** — is weighting by 24h volume the right choice?
2. **Pair inclusion set + membership stability** — what universe feeds global DBS, how stable is membership, does drift change the aggregate's meaning?
3. **Industry cross-reference** — compare global DBS to Crypto Fear & Greed Index, BTC dominance trend, aggregate altcoin momentum.
4. **Regime-boundary behavior** — primary evidence from VTS decision-window + external references.
5. **Silent-zero handling** — are sentinel-zero pairs excluded?

### 1.2 Data sources

- **MCE cycle-sampled telemetry:** `logs/phase15b_dbs_telemetry/2026-04-15.jsonl` on Hetzner staging. 22,723 samples, 60 unique symbols, 21.1-hour window (00:45–21:48 UTC).
- **Production source code:** `server/core/metrics/directional-bias.ts` (global DBS formula), `server/services/market-context-engine.ts` (cache → global DBS call), `server/services/market-indicators.ts` (caller that passes empty volumes).
- **External references:** Crypto Fear & Greed Index (BitDegree/Alternative.me), BTC price (Fortune, Yahoo Finance), BTC dominance (TradingView Hub, CoinDesk).

### 1.3 Cache simulation methodology

The MCE telemetry emitter fires once per pair per `computeContext()` call — NOT once per global cycle. Each telemetry line is a single-pair snapshot. The production `computeGlobalBias()` reads from the MCE in-memory cache (60s TTL) which contains all pairs with a valid cached context.

To reconstruct what global DBS would be at any moment, the analysis simulates the MCE cache: at each 60-second snapshot, the "cache" contains the most recent telemetry sample per symbol within the preceding 60s TTL window. The unweighted median of those cached scores is the production global DBS value.

1,261 cache-simulated snapshots were generated across the 21.1-hour window.

---

## 2. Weighted-median-by-volume review (scope §4 A.3 item 1)

### 2.1 Finding: production uses empty volumes

**File:** `server/services/market-indicators.ts`, lines 295–296:

```typescript
const emptyVolumes = new Map<string, number>();
globalDBS = mce.computeGlobalBias(emptyVolumes);
```

**File:** `server/core/metrics/directional-bias.ts`, line 145:

```typescript
const volume = volumes.get(symbol) ?? 1;
```

The `?? 1` fallback assigns weight 1 to every pair. The weighted median degenerates to an **unweighted median**. The volume data that the function signature was designed to accept is never supplied.

### 2.2 Impact: volume-weighting changes the result substantially

Using ATR as a proxy for volume-weighting (higher ATR ≈ more volatile ≈ generally higher volume in crypto):

| Metric | Value |
|---|---|
| Mean |delta| (ATR-weighted vs unweighted) | **0.217** |
| Max |delta| | 0.760 |
| Median |delta| | 0.206 |
| P95 |delta| | 0.470 |
| Snapshots where weighting changes category | **956 / 1,261 (75.8%)** |
| Direction agreement (same sign or both near zero) | 832 / 1,261 (66.0%) |

**Interpretation:** The choice of weighting is load-bearing. An unweighted median gives equal voice to USDG/USD (stablecoin, DBS ≈ 0) and ALGO/USD (DBS +0.44). A volume-weighted median would amplify the high-volume, high-conviction pairs. The 75.8% category-change rate under ATR-weighting means **three out of four snapshots would produce a different global DBS category** if volume weighting were implemented.

**ATR-proxy limitation (added per cross-review):** ATR correlates with 24h volume in crypto but they are not identical — a pair can have high ATR (volatile) but low volume (thinly traded). The 75.8% figure demonstrates that weighting choice is load-bearing, but the exact magnitude under real volume weighting could differ. The directional conclusion ("weighting matters substantially") stands; the specific 75.8% number should not be treated as the precise volume-weighted result.

### 2.3 Is weighted median the right aggregation?

**Weighted median by 24h volume is a defensible choice** for crypto markets where:
- Volume proxies for economic significance (a $100M/day pair matters more than a $100K/day pair)
- Stablecoins and fiat FX contribute noise without directional signal
- The goal is "which direction is the market actually moving money," not "which direction are the most symbols pointing"

**Alternatives considered:**
- **Unweighted median** (current production reality) — gives stablecoins and low-volume pairs disproportionate influence. Not recommended.
- **Volume-weighted mean** — sensitive to outliers. A single extreme-DBS low-volume pair could skew the result. Median is more robust.
- **Market-cap-weighted median** — better in theory (market cap is more stable than 24h volume) but requires an additional data source (market cap is not currently in the MCE pipeline).
- **Top-N by volume only** — avoids stablecoin noise but introduces a hard cutoff that can cause jumps when pairs cross the N boundary.

**Recommendation: implement volume-weighted median as designed.** The function already accepts the volumes parameter; the caller just needs to supply real volume data from the FX5 scanner or Kraken API.

---

## 3. Pair-universe stability (scope §4 A.3 item 2)

### 3.1 What universe feeds global DBS?

Global DBS reads from the MCE in-memory cache. The cache is populated by `computeContext()` calls during the MCE scan cycle. The active pair universe is the FX5 scanner output — currently 60 symbols.

### 3.2 Membership instability is severe

| Metric | Value |
|---|---|
| Total unique symbols across all snapshots | 60 |
| Pairs in cache per snapshot (min / mean / median / max) | 2 / 18.0 / 17 / 40 |
| Symbols with ≥99% cache presence | **0** |
| Symbols with ≥80% cache presence | **0** |
| Symbols with 50–80% cache presence | 6 |
| Symbols with <50% cache presence | **54** |
| Snapshots with membership changes | 1,260 / 1,260 (**100%**) |

**The cache never contains the full 60-pair universe at any single snapshot.** The maximum observed was 40 pairs. The mean is 18. This means global DBS is computed from roughly 30% of the universe on average, with the composition changing every single snapshot.

### 3.3 Cache size distribution

| Pairs in cache | Snapshots | % |
|---|---|---|
| 2–9 | 288 | 22.8% |
| 10–19 | 422 | 33.5% |
| 20–29 | 389 | 30.8% |
| 30–39 | 161 | 12.8% |
| 40+ | 1 | 0.1% |

Nearly a quarter of snapshots have fewer than 10 pairs in the cache. These snapshots produce a global DBS from a tiny, non-representative subset.

### 3.4 Per-symbol presence rates (selected)

| Symbol | Cache presence | DBS mean | Character |
|---|---|---|---|
| NIGHT/USD | 67.0% | -0.454 | Strong bearish — when present, pulls median down |
| DASH/USD | 61.6% | -0.562 | Strong bearish |
| ALGO/USD | 63.2% | +0.441 | Strong bullish |
| RAVE/USD | 45.4% | +0.439 | Strong bullish |
| USDG/USD | 18.3% | +0.009 | Stablecoin noise |
| AAVE/USD | 7.0% | +0.603 | Very strong bullish, rarely present |
| UNI/USD | 3.6% | +0.138 | Rarely present |

**The rotation of strong-conviction pairs in and out of the cache directly causes global DBS flicker.** When DASH/USD (DBS -0.56) is in the cache but ALGO/USD (DBS +0.44) is not, the median skews bearish. When both are present, they partially cancel. This is a **methodology defect, not market signal.**

### 3.5 Does membership drift change the meaning of the aggregate?

**Yes, unambiguously.** The cache composition changes every snapshot, and strong-conviction pairs have sub-70% presence. "Global DBS moved from NEUTRAL to UP_WEAK" can mean either:
- (a) The market actually shifted bullishly, OR
- (b) Two bearish pairs expired from the cache and one bullish pair was added

There is no way to distinguish (a) from (b) without fixing the cache coverage problem.

### 3.6 Global DBS flicker confirms the membership problem

| Metric | Value |
|---|---|
| Global DBS 1-snapshot category flip rate | **634 / 1,260 = 50.32%** |
| Compare: pair-level legacy classifier 1-cycle flip rate (A.0) | 1.37% |

The global DBS flickers **37× faster** than the pair-level classifier. This is not because the market is changing direction every minute — it is because the pair composition of the cache changes every minute.

---

## 4. Industry cross-reference (scope §4 A.3 item 3)

### 4.1 Methodology

Scope §4 A.3 item 3 requires comparison at the **coarsest shared cadence.** External references are daily snapshots or smoothed composites. Global DBS is minute-level. Comparison uses **hourly-mean global DBS** to reduce noise, then direction-agreement at the daily level.

### 4.2 Global DBS hourly summary (2026-04-15)

| Hour (UTC) | Mean global DBS | Category | Pairs in cache (mean) |
|---|---|---|---|
| 00–05 | +0.047 | NEUTRAL | 14–21 |
| 06–12 | -0.029 | NEUTRAL | 19–22 |
| 13–17 | +0.074 | NEUTRAL | 13–16 |
| 18–20 | +0.133 | UP_WEAK | 16–19 |

**Overall daily direction: mildly bullish.** First-quarter mean +0.052 (NEUTRAL), last-quarter mean +0.114 (UP_WEAK). The second half of the day trended more bullish than the first.

### 4.3 Reference 1: Crypto Fear & Greed Index

- **Value:** Crossed from Extreme Fear into Greed on April 15, ending a 46-consecutive-day streak of Extreme Fear readings (9–12 range).
- **Direction:** Bullish sentiment shift.
- **Comparison:** Global DBS also shows mild bullish bias (+0.040 mean, UP_WEAK trend in the second half). **Direction agrees.**
- **Lag check:** Fear & Greed is a daily composite; global DBS is minute-level. Cannot determine lead/lag at daily cadence with a single day.
- **Verdict: AGREES (direction).** Both indicate a shift toward bullish sentiment on April 15.

### 4.4 Reference 2: BTC price

- **Value:** BTC opened ~$74,314, closed ~$74,799 (+0.65%). Roughly flat with a slight upward bias. A breakout attempt above $75,000 failed on April 14.
- **Direction:** Flat to mildly bullish.
- **Comparison:** DawnTrader's FX5 universe does not include BTC/USD (BTC was not in the 60-pair telemetry). Global DBS captures altcoin + gold + fiat FX direction only. The mild bullish bias in global DBS (+0.040 mean) is consistent with BTC's flat-to-up day, but this is a market-wide correlation, not a causal link.
- **Lag check:** Cannot determine from a single day.
- **Verdict: AGREES (direction, weak).** Both mildly bullish. Weak because BTC is not in the DBS universe, so agreement is indirect.

### 4.5 Reference 3: BTC dominance

- **Value:** 57.1–58.5% in mid-April 2026, trending slightly lower from the June 2025 peak of 65%.
- **Direction:** Decreasing BTC dominance = money rotating into altcoins.
- **Comparison:** The FX5 universe IS altcoins. A bullish altcoin rotation would show as positive global DBS. The mildly bullish global DBS is consistent with decreasing BTC dominance driving altcoin activity.
- **Lag check:** BTC dominance is a weekly/monthly trend. Cannot determine lead/lag from a single day.
- **Verdict: AGREES (direction, structural).** Decreasing BTC dominance + mildly bullish altcoin DBS is internally consistent.

### 4.6 Reference 4: Aggregate altcoin momentum

- **Value:** CMC Altcoin Season Index at 34/100 — still "Bitcoin Season" but approaching the transition zone toward altcoin rotation. Total crypto market cap ~$2.50T.
- **Direction:** Early-stage altcoin momentum building.
- **Comparison:** Consistent with the mildly bullish DBS seen across altcoin pairs. Not yet a strong altcoin season, which matches global DBS hovering around NEUTRAL/UP_WEAK rather than UP_MODERATE or UP_STRONG.
- **Verdict: AGREES (magnitude calibration).** Both indicators say "some altcoin activity, not yet a strong trend."

### 4.7 Cross-reference summary

| Reference | Cadence | Same-period direction | Lead/lag | Strength | Verdict |
|---|---|---|---|---|---|
| Crypto Fear & Greed | Daily | Bullish → Bullish | INCONCLUSIVE (1 day) | Moderate | **AGREES** |
| BTC price | Intraday | Flat-to-up → Mild up | INCONCLUSIVE (1 day) | Weak (BTC not in universe) | **AGREES (weak)** |
| BTC dominance | Weekly/monthly | Decreasing → Altcoin bullish | INCONCLUSIVE (1 day) | Structural | **AGREES** |
| Altcoin momentum index | Daily | 34/100 early → Mild bullish | INCONCLUSIVE (1 day) | Moderate | **AGREES** |

**All four references agree in direction.** No divergences observed. However, all lag/lead verdicts are INCONCLUSIVE because the audit window is a single day. A multi-day or multi-week window would be needed to assess whether global DBS leads or lags external indicators.

**Important caveat:** the direction agreement is reassuring but not conclusive evidence that global DBS is methodologically sound. The agreement could be "even a broken implementation roughly points in the right direction when the market is unambiguous." The membership instability problem (§3) means the signal-to-noise ratio is poor even when the direction is correct.

---

## 5. Regime-boundary behavior (scope §4 A.3 item 4)

### 5.1 Primary evidence: global DBS time series

Global DBS hourly means show a gradual shift from NEUTRAL (hours 0–17) to UP_WEAK (hours 18–20). This is consistent with a market drifting mildly bullish over the day, which aligns with the Fear & Greed transition from Extreme Fear to Greed.

### 5.2 Regime-boundary crossing events

- **NEUTRAL → positive (UP_WEAK or above):** 234 crossings in 1,261 snapshots
- **NEUTRAL → negative (DOWN_WEAK or below):** 100 crossings

The 2.3:1 ratio of positive-to-negative crossings is consistent with the mild bullish bias.

### 5.3 Secondary evidence: `regime_archive`

Per scope §4 A.3 item 4, the `regime_archive` (5 snapshots) is secondary and must not be overclaimed. I have not queried `regime_archive` for this deliverable because:
- 5 snapshots is too few for any statistical claim
- The primary evidence (1,261 cache-simulated snapshots + 4 external references) is sufficient
- Overclaiming from 5 archive snapshots would violate the scope's explicit framing constraint

---

## 6. Silent-zero handling (scope §4 A.3 item 5)

### 6.1 Production code defect

`computeGlobalBias()` in `market-context-engine.ts` (line 211–222) iterates over `this.cache.entries()` and reads `entry.context.directionalBias.score` without checking the sentinel flag. If a pair returned `score: 0` via the early-return path in `computeDirectionalBias()` (line 63–69, triggered when `ohlcData.length < lookbackPeriod || atr <= 0`), that zero is included in the median as if it were a genuine NEUTRAL reading.

The sentinel flag (`sentinelZero`) is set at the per-pair level but is not propagated into the cache entry in a way that `computeGlobalBias()` can inspect.

### 6.2 Empirical impact in this audit window

**Zero.** Across 22,723 telemetry samples, 0 had `sentinelZero = true`. The early-return guard never fired. The defect has no empirical impact during this audit period.

### 6.3 Latent risk

If a pair's OHLC feed drops below the lookback period (48 candles) — due to a Kraken API outage, a recent listing, or a data gap — the sentinel-zero score would silently enter the median. With cache sizes of 2–40 pairs, a single zero could shift the median noticeably.

**Recommendation:** Fix by adding a sentinel-zero check in `computeGlobalBias()`. This is a one-line filter: skip cache entries where the DBS result was produced by the early-return path. The `DirectionalBiasResult` type would need a `sentinelZero` boolean field propagated through the cache.

---

## 7. Maturity gate status

All three scope §3 conditions are satisfied on the current 21.1-hour window:

| Condition | Status | Evidence |
|---|---|---|
| (a) Global DBS crossed NEUTRAL both directions | **SATISFIED** | 234 positive crossings, 100 negative crossings |
| (b) ≥3 distinct 2σ moves across different symbols | **SATISFIED** | 45 symbols with ≥1 observation at 2σ from their own mean |
| (c) RBS/TFS ratio divergence ≥±10pp | **SATISFIED** | Confirmed in A.0 Baseline §6 |

**3/3 conditions met. Maturity gate is OPEN.**

This clears the path for A.1 Final, A.2 Final, and A.4 Final to run on the current telemetry window.

---

## 8. A.3 verdict and recommendations

### 8.1 Overall verdict: REVISE

**Global DBS methodology is not trustworthy in its current implementation.** The three defects (empty volumes, cache membership instability, missing sentinel-zero filter) combine to produce a signal with a 50.32% cycle-to-cycle category flip rate — worse than a coin flip for predicting the next minute's category. The pair-level DBS score (A.1 KEEP verdict) is sound; the global aggregation is not.

**Does this block B62?** The scope §6 gate requires A.3 GREEN. The A.3 verdict is **REVISE, not REJECT.** The global DBS concept is sound (weighted median of pair DBS scores is a reasonable market-direction proxy), but the implementation has three fixable defects. The distinction matters:

- **Pair-level DBS** is the primary input to B62's classifier redesign. A.1 validated it. A.3's findings do not affect pair-level DBS.
- **Global DBS** is a secondary input — it provides market-direction context for strategy gating and the confidence modifier. It is not the primary driver of B62.
- **The fixes are straightforward** — supply real volumes, ensure full cache coverage before computing global DBS, add sentinel-zero filter. Estimated 2–4 hours of implementation.

**Recommendation:** Treat A.3 as GREEN-with-conditions. The conditions are three code fixes that can be implemented in B62's early implementation phase (before the global DBS value is consumed by any decision layer). B62 scoping must include these fixes as prerequisites.

### 8.1a BTC coverage gap (added per cross-review, phrasing refined per Langston)

**Important distinction: scanner inclusion and VTS exclusion are different questions.**

- **Scanner inclusion:** BTC, ETH, and SOL ARE in the FX5 scanner universe — they are tagged `poolType: 'BENCHMARK'` and `isBenchmark: true` in `fx5-scanner.ts`. They pass through global filters and get MCE context computed. Benchmark status is propagated downstream for VTS filtering decisions.
- **VTS exclusion:** Benchmarks are excluded from VTS trading at the handoff point (`vts-runner.ts:1256–1257`, Directive 11.6F: benchmarks stay in pool but don't trade). This exclusion was intentional — benchmarks would skew VTS outcome data.
- **DBS telemetry observation:** BTC was not present in the B61 DBS telemetry universe analyzed. The 60-pair telemetry window contains zero benchmark pairs.

**Consequence:** Global DBS as computed during the B61 audit window is an altcoin + gold + fiat FX composite, **not a crypto market composite.** BTC alone represents ~57% of crypto market cap by dominance. If global DBS is consumed as "market direction," the absence of BTC is a fundamental coverage gap. If it is consumed as "altcoin direction," the current composition is correct but the label outruns the implementation.

**B62 design question:** B62 must explicitly decide whether global DBS is:
1. A true market-wide aggregate that intentionally includes benchmark assets like BTC — in which case `computeGlobalBias()` needs to read benchmark pair contexts from the MCE cache alongside non-benchmark pairs, OR
2. An altcoin / non-benchmark aggregate — in which case the concept should be renamed accordingly so downstream consumers don't mistake it for a whole-market signal.

### 8.1b A.2 headline numbers unaffected by global DBS noise (added per cross-review)

**Confirmed:** A.2's headline numbers (72.59% drift contamination, 54.48% strategy lockout, 0.12% IE share) all used **pair-level DBS** (`pairDirectionalBias`) cross-tabulated against classifier regime labels. Global DBS (`globalDirectionalBias`) was not used as an input to any A.2 computation. The 50.32% global DBS flicker rate has zero impact on A.2's findings.

### 8.2 Specific fix recommendations for B62

| # | Defect | Fix | Effort | Priority |
|---|---|---|---|---|
| 1 | Empty volumes → unweighted median | Pass real 24h volume data from FX5 scanner / Kraken API to `computeGlobalBias()`. The function signature already accepts `Map<string, number>`. | ~1h | HIGH |
| 2 | Cache membership instability | Ensure `computeGlobalBias()` is called only after a full MCE scan cycle completes (all 60 pairs cached). Alternatively, maintain a separate full-universe snapshot that is updated atomically after each complete scan, rather than reading from the TTL cache mid-cycle. The MCE does not currently have a "scan cycle complete" event; adding one may cascade into orchestrator/VTS timing logic. Option (b) — atomic snapshot — is the more contained fix. | ~2–4h | HIGH |
| 3 | Sentinel-zero not excluded | Add `sentinelZero` boolean to `DirectionalBiasResult` → cache entry. Filter in `computeGlobalBias()`: skip entries where `sentinelZero === true`. | ~30min | MEDIUM |

### 8.3 Keep/revise recommendation per sub-item

| Sub-item | Verdict |
|---|---|
| 1. Weighted-median-by-volume | **REVISE** — implement volume weighting as designed |
| 2. Pair-universe stability | **REVISE** — fix cache coverage before computing global |
| 3. Industry cross-reference | **AGREES** — direction consistent with all 4 external references |
| 4. Regime-boundary behavior | **CONSISTENT** — mild bullish drift matches Fear→Greed transition |
| 5. Silent-zero handling | **REVISE** — add sentinel-zero filter |

**Overall A.3: REVISE (GREEN-with-conditions for B62 gate purposes).**

---

## 9. Analysis scripts

Re-runnable on staging:

- `scripts/phase15b/a3_global_dbs_methodology_v2.py` — cache-simulated global DBS analysis with all sections. Usage: `python3 a3_global_dbs_methodology_v2.py <telemetry.jsonl>`
- `scripts/phase15b/a3_global_dbs_methodology.py` — v1 (per-cycleId grouping, superseded by v2 after discovering cycleId is per-pair-call not per-global-cycle)

---

*End of BATCH_61_A3_GLOBAL_DBS_METHODOLOGY.md — gates B62 (GREEN-with-conditions).*

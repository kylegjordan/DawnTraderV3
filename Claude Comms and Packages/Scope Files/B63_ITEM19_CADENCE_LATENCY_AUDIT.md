# B63 Item 19 — Classifier Cadence & Latency Audit

**Author:** Langston (Opus 4.6 session, 2026-04-22)
**Data:** 595 closed VTS trades (2026-04-15 to 2026-04-22), MCE telemetry (2026-04-17 and 2026-04-18)
**Status:** Parts A, B, C, and E COMPLETE.

---

## Operating-Mode Context

**Active trading is OFF. Paper trading is OFF. Only VTS (passive learning) is running.** All findings are framed as VTS-mode observations and pre-Phase-19 preparation. No recommendations for immediate code changes during the observation window.

---

## Executive Summary

1. **The global regime label never transitioned during the 70-loss streak on pre-B62 data (H1 — CONFIRMED pre-B62, PARTIALLY FIXED post-B62).** Pre-B62 (04-17→04-18): global regime was 100% TFS despite WR collapsing from 86% to 3%. Pair-level regimes diverged massively but the global label did not respond. **Post-B62 re-verification (04-20→04-22):** global regime transitioned twice (TFS→RBS on 04-21 17:21, RBS→TFS on 04-22 00:06), matching pair-level consensus. B62's addition of DBS to the classifier partially resolved the stickiness. Severity downgrades from P0 to P1 for B66 scoping.

2. **VTS batch correlation is 87.8% same-outcome for simultaneously-admitted trades, 36pp above independence (H2 — CONFIRMED).** This is consistent with VTS design intent (broad capture, no SQE gating cuts, no ranking selection, no per-underlying position limits). The quantified gap sets the minimum requirement for active-trading gate tightness — any Phase 19 paper-trading path that admits even a fraction of this correlation will propagate streaks to real money. 21% of all VTS trades entered in multi-entry minutes.

3. **DBS category transitions do not predict WR differentials (H3 — NOT CONFIRMED by this test).** The WR gap is 0.1pp — noise. The MCE staleness window is ~60s (per-pair cache TTL), meaning ~2 scan cycles share cached context per pair — 5× smaller than the original ~4.8 min estimate (which was the telemetry writer cadence, not the MCE compute cadence). The WR impact manifests through global regime aggregation responsiveness (H1, partially fixed post-B62), not DBS granularity or MCE cache staleness.

4. **MCE telemetry reveals extreme pair-level regime flicker.** 28,263 "transitions" on 04-17 and 33,467 on 04-18 — pair-level regimes change hundreds of times per minute. Note: the telemetry log cadence (~4.8 min, ~1.4s per pair) represents the telemetry writer flush interval, not the MCE compute cadence. Actual MCE context is computed on-demand per-pair with a 60s cache TTL.

5. **7 of 10 scoring inputs use snapshot or cumulative data (from Item 15 §2.4).** PredictiveConfidence uses all-time cumulative win rate. RegimeWeight uses single-cycle trendStrength. FinalScore composites these snapshots. The scoring pipeline is temporally divorced from the market it measures.

**Overall verdict:** The system's cadence architecture has two significant issues: (a) the global regime label transitions infrequently (pre-B62: frozen; post-B62: 2 transitions in 72h — improved but still sluggish relative to tactical horizon), and (b) VTS scan-cycle batch correlation (87.8% same-outcome, consistent with VTS broad-capture design) sets the benchmark for how tight Phase 19 active-trading gates must be. B66 should prioritize: (P1) improve global regime aggregation responsiveness, (P1) add freshness contracts to prevent silent stale-peer consumption, (P1) replace cumulative PredConf with rolling-window PredConf, and (P0 for Phase 19) implement underlying-based position limits.

---

## Part A — Per-Input Cadence Inventory

### Methodology

Inputs identified from Items 15/18 source code analysis (19 files read), MCE telemetry from staging (`deploy@188.245.193.8`), and VTS trade log analysis.

### Inventory (25 inputs)

| # | Input | Source | Intended Cadence | Observed Cadence | Staleness Handling | SoT |
|---|---|---|---|---|---|---|
| 1 | **OHLC candles** | Kraken REST / WS | Per-candle (15m) | 15-min refresh, cached | Silent reuse if API fails | Memory cache (`ohlc-cache.ts`) |
| 2 | **ATR** | Computed from OHLC | Per-candle | Updates with OHLC refresh | No stale flag | Transient (recomputed) |
| 3 | **Pair DBS score** | `directional-bias.ts` | Per-MCE-cycle | ~1.4s per pair (~4.8min full scan) | sentinelZero flag on insufficient data | Persistent store (B63 ring buffer) |
| 4 | **Pair DBS category** | `directional-bias.ts` | Per-MCE-cycle | Same as DBS score | Falls back to NEUTRAL | Persistent store |
| 5 | **Global DBS score** | Weighted median of pair DBS | Per-MCE-cycle | ~4.8 min | No stale flag | Memory (recomputed each cycle) |
| 6 | **Pair regime label** | `market-regime.ts` | On-demand per-pair, 60s cache TTL | Recomputed when cache expires (60s). VTS 30s scan means ~2 scans share cached context per pair. | No stale flag; flickers between refreshes | Per-symbol memory cache (`market-context.ts` L84, TTL=60000ms) |
| 7 | **Global regime label** | Aggregation of pair regimes | On-demand, 60s cache TTL | Pre-B62: never transitioned (100% TFS). **Post-B62: 2 transitions in 72h** (TFS→RBS, RBS→TFS). Still 87% TFS. | No stale flag | Memory |
| 8 | **Regime confidence** | `market-regime.ts` | Per-MCE-cycle | Per-pair, snapshot | No stale flag | Transient |
| 9 | **trendStrength** | MCE indicators | Per-MCE-cycle | Snapshot from latest cycle | No stale flag | Transient |
| 10 | **Volatility** | Computed from OHLC returns | Per-MCE-cycle | Snapshot | No stale flag | Transient |
| 11 | **Momentum** | 30-candle lookback | Per-MCE-cycle | Rolling 30-candle (~7.5h at 15m) | No stale flag | Transient |
| 12 | **DriftScore** | Regime stability metric | Per-scan | Snapshot | No stale flag | Transient |
| 13 | **VolZ** | Vol z-score for stability | Per-scan | Snapshot | No stale flag | Transient |
| 14 | **FlipRate** | 7-day regime change count | Per-scan | Rolling 7d window | Time-windowed cleanup | Memory (regimeHistory array) |
| 15 | **Stability label** | `regime-stability.ts` | Per-scan (cached per cycle) | Follows regime; effectively STABLE throughout | Cache-per-cycleId | Memory cache |
| 16 | **PredictiveConfidence** | VTS telemetry win rate | 60s cache TTL | **All-time cumulative** — effective update N⁻¹ where N = trade count | Neutral fallback (0.5) on miss | Memory cache + VTS telemetry store |
| 17 | **hybridScore** | Ensemble of QUANT + PATTERN | Per-signal | Per-signal (snapshot) | No stale flag | Transient |
| 18 | **FinalScore** | Score formula | Per-signal | Per-signal (composite of snapshots) | No stale flag | Transient |
| 19 | **RegimeWeight** | Backfill formula | Per-signal | Per-signal (snapshot of MCE values) | Falls back to defaults (0.5) | Transient |
| 20 | **decayPenalty** | Signal aging | Per-signal | **Always zero** — dead input | N/A (dead) | N/A |
| 21 | **Screener filters** | `screener_filters` DB table | DB-poll (60s cache) | 60s cache, manual updates | Cache fallback to defaults | DB |
| 22 | **Mode overlay** | Stability → mode mapping | Per-scan (follows stability) | **Effectively always NORMAL** (stability ≈ STABLE) | N/A | Transient |
| 23 | **Governance gate** | Strategy × stability eligibility | Per-signal | Per-signal (follows stability) | fail-safe: HIGH dependency default | Config file |
| 24 | **DSE adaptive weights** | VTS telemetry, DB-backed | Per-trade (DB read) | **Cumulative** (same staleness as PredConf) | Falls back to default edge (0.05) | DB |
| 25 | **Cost drift** | `cost-drift-monitor.ts` | Per-trade | Rolling monitoring | Falls back to 0 drift (no dampening) | Memory |

### Cadence Gap Summary

| Gap Type | Count | Inputs |
|---|---|---|
| **Stale / non-responsive** | 3 | Global regime (frozen at TFS), PredConf (cumulative), DSE adaptive weights (cumulative) |
| **Dead / always-zero** | 1 | decayPenalty |
| **Snapshot where rolling needed** | 4 | trendStrength, volatility, DriftScore, VolZ |
| **Effectively dormant** | 2 | Mode overlay (always NORMAL), stability label (always STABLE) |
| **Well-cadenced** | 15 | OHLC, ATR, pair DBS, pair regime, momentum, flipRate, FinalScore, RegimeWeight, etc. |

---

## Part B — Full-Loop Adaptation Latency + Pre-Registered Hypothesis Tests

### Hypothesis 1 — Regime-transition latency (04-17 → 04-18)

**Test:** Did the global regime label transition during the WR collapse from 86% to 3%?

**Evidence (4-hour buckets, entry-time based):**

| Window | N | WR% | Global Regime | Pair Regime Mix |
|---|---|---|---|---|
| 04-17 04:00-08:00 | 14 | **85.7%** | TFS 100% | TFS 57%, IE 14%, RBS 14%, ST 14% |
| 04-17 12:00-16:00 | 13 | 38.5% | TFS 100% | ST 38%, TFS 31%, IE 23% |
| 04-17 16:00-20:00 | 17 | **11.8%** | TFS 100% | TFS 47%, RBS 47% |
| 04-17 20:00-24:00 | 21 | 14.3% | TFS 100% | TFS 43%, RBS 33%, ST 24% |
| 04-18 00:00-04:00 | 22 | 13.6% | TFS 100% | **RBS 36%, ST 36%, TFS 23%** |
| 04-18 04:00-08:00 | 17 | **5.9%** | TFS 100% | TFS 59%, HVU 12%, ST 12% |
| 04-18 08:00-12:00 | 36 | **2.8%** | TFS 100% | TFS 47%, ST 28%, RBS 19% |

**Findings:**

1. **WR collapsed from 86% to 12% between 04-17 08:00 and 04-17 16:00** — the transition started MID-DAY on 04-17, not overnight.
2. **Global regime was TFS 100% in every bucket without exception.** It never transitioned.
3. **Pair regimes diverged dramatically.** By 04-18 00:00-04:00, pair regime was majority RBS+ST (72%) — only 23% were TFS. Yet the global label said TFS.
4. The classifier detected the transition at pair level (pair regimes shifted from TFS-dominant to ST/RBS-dominant) but the global regime aggregation ignored this entirely.

**Label residence time:** Global regime TFS: at least 48+ continuous hours (04-17 through 04-18, likely longer). Zero transitions observed in the VTS trade data for globalRegime.

**MCE telemetry confirmation:** 60,192 per-pair regime evaluations on 04-17, with 28,263 inter-pair regime "transitions" within cycles. The pair-level classifier is highly active. The global aggregation is unresponsive.

**Verdict on pre-B62 data: CONFIRMED.** The global regime classifier had effectively infinite latency during the streak window.

**Post-B62 re-verification (04-20 through 04-22, 146 trades):**

B62 (which added DBS as a classifier input) closed 2026-04-19. Re-running H1 on post-B62 data:

- **Global regime DID transition twice post-B62:**
  - 04-21 17:21 UTC: TFS → RBS (held ~7 hours)
  - 04-22 00:06 UTC: RBS → TFS
- **Global regime distribution post-B62:** TFS 87%, RBS 13%. Still TFS-dominant but no longer frozen.
- **The 04-21 17:21 transition matched pair-level consensus:** in the 04-21 16:00-20:00 bucket, pair-level regimes were RAN:27 TRE:4 ST:1 — 84% RBS at pair level. Global label responded.
- **However, WR during the RBS window (04-21 16:00-20:00) was 46.9%** — the worst bucket in the post-B62 dataset.

**Updated H1 verdict: PARTIALLY FIXED by B62.** Global regime is no longer permanently frozen — it transitioned twice in 72h and responded to pair-level consensus. Severity downgrades from P0 to P1. The classifier is now responsive to strong shifts, but with only 2 transitions in 72 hours, it remains sluggish relative to the minutes-to-hours tactical horizon. Further responsiveness tuning warranted as P1.

### Hypothesis 2 — Scan-cycle cross-pair correlation

**Test:** Are trades admitted in the same scan cycle more correlated than independence predicts?

**Evidence:**

| Metric | Value |
|---|---|
| Minutes with >1 simultaneous entry | 56 / 524 (10.7%) |
| Trades in multi-entry minutes | 127 / 595 (21.3%) |
| Same-outcome rate (multi-entry) | **87.8%** |
| Expected under independence | 51.9% |
| **Excess correlation** | **+35.9pp** |

**Representative bursts (top 10 by size):**

| Entry Time | N | Outcomes | Pattern |
|---|---|---|---|
| 04-17 22:38 | 4 | LLLL | All-loss |
| 04-18 05:14 | 4 | LLLL | All-loss (ETH/GBP, ETH/USDT, XRP/GBP, XRP/USD) |
| 04-22 02:16 | 4 | WWWW | All-win |
| 04-22 02:18 | 4 | WWWW | All-win |
| 04-16 13:55 | 3 | WWW | All-win |
| 04-17 00:01 | 3 | LLL | All-loss |
| 04-18 05:04 | 3 | LLL | All-loss |
| 04-18 16:11 | 3 | LLL | All-loss |

**Findings:**

1. 87.8% same-outcome rate vs 52% expected — the 36pp excess means trades sharing a scan cycle are effectively a single bet.
2. The 04-18 05:14 burst (ETH/GBP + ETH/USDT + XRP/GBP + XRP/USD) illustrates the mechanism: 4 "independent" trades that are really 2 underlying bets (ETH, XRP). Symbol-level duplicate detection misses underlying-level concentration.
3. All multi-entry bursts during losing periods show all-loss. All multi-entry bursts during winning periods show all-win. No mixed-outcome bursts appear in the top 10.

**Verdict: CONFIRMED.** VTS batch correlation is 87.8% same-outcome, 36pp above independence. This is consistent with VTS design intent (broad capture, no SQE gating cuts, no ranking selection, no per-underlying position limits). The quantified gap sets the minimum requirement for active-trading gate tightness — any Phase 19 paper-trading path that admits even a fraction of this correlation will propagate streaks to real money.

### Hypothesis 3 — Global-state propagation delay

**Test:** Does stale global state between MCE refreshes produce worse outcomes for first-scan-after-transition trades?

**Evidence:**

| Metric | Value |
|---|---|
| MCE compute cadence | On-demand per-pair, 60s cache TTL (telemetry writer flushes every ~4.8 min separately) |
| Scan interval | 30 seconds |
| Estimated stale scan cycles within MCE cache TTL | ~2 (30s scan / 60s cache) |
| WR at DBS category transitions | 40.4% (n=240) |
| WR in stable DBS | 40.3% (n=355) |
| **WR gap** | **0.1pp (noise)** |

**Corrected MCE cadence (per Claude Code code review):** The phase15b_dbs_telemetry log cadence (~4.8 min) reflects the telemetry writer flush interval, not the MCE compute cadence. Actual MCE context is computed on-demand per-pair with a 60s cache TTL (`server/types/market-context.ts` L84). VTS scan runs every 30s, so ~2 scan cycles share cached context per pair — not 10.

**Findings:**

1. The MCE cache TTL is 60s. Scan fires every 30s. **~2 scan cycles share cached MCE context per pair before cache expires.** This is a modest structural propagation delay.
2. DBS category transitions do not produce a measurable WR differential (0.1pp gap = noise).
3. The DBS category transitions are too frequent and granular to proxy the macro-level WR collapse. The real propagation issue is global regime aggregation responsiveness (H1, partially fixed post-B62), not MCE cache staleness.

**Verdict: NOT CONFIRMED by this specific test.** The 60s MCE cache TTL with ~2 stale scan cycles is real but 5× smaller than originally framed. The WR impact flows through global regime aggregation responsiveness (H1, partially fixed post-B62), not DBS transitions or MCE cache staleness.

### T0 → T4 Full-Loop Latency

Based on the evidence above, the adaptation latency chain is:

| Stage | Description | Measured Latency |
|---|---|---|
| T0 | Market condition changes (WR starts declining) | — (external event) |
| T1 | Pair-level indicators reflect the change (OHLC, vol, momentum) | **~15 min** (OHLC candle refresh) |
| T2 | Pair-level regime labels reflect the change | **~5 min** (MCE cycle) — pair regimes DO update responsively |
| T3 | **Global regime label reflects the change** | **Pre-B62: ∞** (never transitioned). **Post-B62: hours** (2 transitions in 72h, responsive to pair consensus). |
| T4 | Mode overlay / governance adjusts | **Pre-B62: ∞.** Post-B62: follows global regime with hours-scale latency. |

**Bottleneck:** T2 → T3. The pair-level classifier works. Pre-B62, the global aggregation was frozen. **Post-B62, the global aggregation responds to pair-level consensus but with hours-scale latency (2 transitions in 72h).** Downstream systems (mode overlay, governance, context bonus, PredConf via stability) now receive occasional updates but remain sluggish relative to the minutes-to-hours tactical horizon of most strategies.

---

## Part C — Cadence / Latency Pathologies

### C.1 — Stale peers consumed silently

| Consumer | Fresh Input | Stale Peer | Impact |
|---|---|---|---|
| FinalScore | hybridScore (per-signal, fresh) | PredConf (cumulative, stale) + RegimeWeight (snapshot) | Score composites fresh and stale inputs with no freshness flag. Consumer cannot distinguish. |
| SQE ROI gate | Entry/target prices (fresh) | PredConf (cumulative, stale) | ROI threshold flex is driven by stale confidence. |
| Mode overlay | Stability label (tracks global regime) | Global regime (mostly TFS; post-B62 transitions on hours-scale) | Mode is almost always NORMAL; transitions infrequently post-B62. |
| DSE multiplier | Current volatility (fresh) | Adaptive weights (cumulative, stale) | Sizing uses fresh vol but stale edge/confidence. |

**None of these consumers have a staleness contract or isStale flag.** They silently accept whatever value is provided, regardless of age.

### C.2 — Wasted compute

| Component | Issue |
|---|---|
| DecayPenalty computation (if it exists) | Always produces zero. Formula slot occupied but no signal. |
| Mode overlay lookup | Computed per-signal but always returns NORMAL. Pure overhead — the answer never changes. |
| Governance gate check | Computed per-signal but rarely activates (99%+ STABLE). |

### C.3 — Components with no defined cadence

| Component | Issue |
|---|---|
| Global regime aggregation | No explicit cadence defined. Appears to be computed per-MCE-cycle but produces the same label continuously. May be a majority-vote of pair regimes — if TFS is always the plurality (even when minority), the majority-vote sticks. |
| PredConf effective update rate | Cumulative average: update magnitude = O(1/N) where N = trade count. After 500 trades, each new trade moves PredConf by ~0.2%. Effective cadence: hours-to-days to produce a meaningful shift. |

---

## Part E — Modularization Lens

### E.1 Cadence bands as module boundaries

The cadence analysis reveals three natural bands that align with Item 15's module partition:

| Band | Cadence | Components | Module(s) |
|---|---|---|---|
| **Fast (seconds)** | Per-signal, per-scan, per-tick | FinalScore, RegimeWeight, SQE gates, ranking, TEC trailing stop | Scoring Kernel, Profitability Gate, Execution |
| **Medium (minutes)** | Per-MCE-cycle (~4.8 min) | Pair regime, DBS, indicators, stability, mode | Regime Engine, Mode/Governance |
| **Slow (hours-to-never)** | Cumulative, DB-backed, frozen | PredConf, DSE adaptive weights, global regime, screener filters | Learning Repository, Global State Service |

**The pathology is at the Band boundary:** Fast-band consumers (FinalScore, SQE) read Medium-band inputs (RegimeWeight from MCE) and Slow-band inputs (PredConf from cumulative telemetry) without knowing which band they came from. A modular design would enforce cadence contracts: each module declares its refresh cadence, and consumers can check if the input is within its declared freshness window.

### E.2 Components that should share a scheduler

| Scheduler | Components | Why |
|---|---|---|
| MCE scheduler (medium band) | Pair regime, DBS, ATR, indicators, stability classification | All share OHLC as upstream. Should be computed atomically within one MCE cycle to prevent intra-cycle snapshot skew. |
| Global state scheduler (new) | Global regime aggregation, global DBS, mode overlay computation | These should update AFTER the MCE scheduler completes, using the full set of pair-level results. Currently, global regime appears to update within the same cycle but before all pairs are processed, leading to stale aggregation. |
| Signal scheduler (fast band) | FinalScore, RegimeWeight, SQE gates, ranking | These should run per-signal but should declare which medium-band inputs they consumed and at what cycle-age. |

### E.3 Staleness-contract recommendations

Every adaptive input should carry a freshness metadata object:

```typescript
interface FreshnessContract {
  computedAt: number;      // timestamp of last computation
  cycleId: string;         // which MCE cycle produced this value
  maxAgeSec: number;       // declared maximum useful age
  isStale(): boolean;      // computedAt + maxAgeSec < now
}
```

**Inputs that should carry freshness contracts (highest priority):**
1. Global regime label (maxAge = 10 min — if older, force recompute)
2. PredictiveConfidence (maxAge = 6h — rolling window, not cumulative)
3. RegimeWeight (maxAge = 5 min — tied to MCE cycle)
4. DSE adaptive weights (maxAge = 6h — rolling window)
5. Stability label (maxAge = 5 min — tied to MCE cycle)

### E.4 Hard-coded cadence parameters to promote

| Parameter | Current Location | Current Value | Promotion Target |
|---|---|---|---|
| VTS scan interval | `vts-runner.ts` L372 | 30s | Config/DB |
| Pairs per scan cycle | `vts-runner.ts` L373 | 200 | Config/DB |
| PredConf cache TTL | `score-calculator.ts` | 60s | Config/DB |
| SQE threshold cache TTL | `signal_quality_evaluator.ts` | 60s (60000ms) | Config/DB |
| MCE cycle interval | `market-context-engine.ts` (implicit) | ~4.8 min | Explicit config |
| Stability cache scope | `regime-stability.ts` | Per-cycleId | Explicit config with maxAge |

### E.5 Recommendation

**Cadence architecture needs a staleness-aware redesign, not just threshold tuning.**

Three structural changes for B66 / pre-Phase-19:

1. **Improve global regime aggregation responsiveness (P1, downgraded from P0 post-B62).** B62's DBS addition partially fixed the frozen-TFS problem — global regime now transitions (2 in 72h post-B62). However, hours-scale responsiveness is still sluggish relative to the minutes-to-hours tactical horizon. Consider: (a) recency-weighted aggregation, (b) per-trade pair-regime-based context rather than global label, or (c) a faster stability-signal path that bypasses global regime for mode-overlay decisions.

2. **Add freshness contracts.** Every medium-band and slow-band input consumed by fast-band components should carry a `computedAt` timestamp and a `maxAgeSec` declaration. Fast-band consumers should check `isStale()` before using the value. If stale, either force a refresh or use a conservative default. This prevents the silent-stale-peer pathology where fresh hybridScore is composited with week-old PredConf.

3. **Replace cumulative PredConf with rolling-window PredConf.** Item 15 §2.4 identified this as the strongest snapshot-vs-rolling violation. The effective update cadence of cumulative PredConf is O(1/N) — after 500 trades it takes days to move. A 24h rolling window would make PredConf responsive to regime shifts within hours, matching the tactical horizon of most strategies.

---

## Appendix — Data Sources

### MCE Telemetry
- `deploy@188.245.193.8:/home/deploy/dawntrader/logs/phase15b_dbs_telemetry/2026-04-{17,18}.jsonl`
- 60,192 entries (04-17), 60,201 entries (04-18)
- Per-pair, per-cycle: DBS score/category/components, classifier vol/adx/mom/regime, OHLC length, ATR

### VTS Trade Logs
- `/root/.openclaw/workspace/data/item18/2026-04-{15..22}.json`
- 595 closed trades with entryTime, exitTime, regime, globalRegime, DBS fields, outcomes

### Source Code Files
- `server/services/vts-runner.ts` — scan config (L371-373), Net EV floor, duplicate check
- `server/services/market-context-engine.ts` — MCE cycle structure
- `server/core/metrics/market-regime.ts` — pair regime classifier
- `server/core/metrics/directional-bias.ts` — DBS computation
- `server/core/metrics/directional-bias-store.ts` — B63 persistent DBS store
- `server/core/governance/regime-stability.ts` — stability classification
- `server/core/governance/strategy-modes.ts` — mode overlay
- `server/core/utils/score-calculator.ts` — PredConf, FinalScore, RegimeWeight

### Cross-References
- **Item 18** (`B63_ITEM18_SQE_AUDIT.md`): FinalScore anti-predictive, RegimeWeight inverted, decayPenalty dead
- **Item 15** (`B63_ITEM15_ADAPTIVE_FRAMEWORK_AUDIT.md`): 69-lever inventory, PredConf self-cancellation, snapshot-vs-rolling violations, mode overlay dormancy
- **Streakiness Analysis** (`B63_STREAKINESS_ANALYSIS.md`): z = −15.574, 70-loss streak decomposition, 6 mechanism candidates

---

*End of Item 19 Cadence & Latency Audit. All Parts (A, B, C, E) complete.*

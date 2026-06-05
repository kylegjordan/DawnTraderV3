# Strategic Directions — AI-Era Edge, Architecture & Profitability

> **Created 2026-06-05 (Kyle directive).** Single home for the strategic directions surfaced in the 2026-06-05 Hidden-Contextual-Edge (HCE) study + the Kyle ↔ CC strategy discussion that followed. This is the "what are we not doing that AI now makes possible / what is the path to profitability" capture. Each item carries: what it is, why (evidence), where it slots in the roadmap, and its gating condition. Roadmap placement is mirrored into `POST_AUDIT_ROADMAP.md` (2026-06-05 update). Identify/plan-only — nothing here is built yet.

## 0. The anchor finding (why this list looks the way it does)

The HCE study mined ~22,810 VTS trades (crypto 20,515 / xStock 2,295, never pooled, net-of-friction) for a hidden contextual edge inside the trades the system already takes. **There isn't one** — within the SQE-survivor population, no regime / directional-bias / strategy / signal-path slice flips a losing strategy net-positive; the existing gates already homogenized the survivors. The leverage is NOT a hidden loophole; it is **selectivity + sizing + discipline + new data/structure**. Two results pin this:

- **Selectivity demonstrably works on xStock:** ranking trades by the system's own expected-edge score and keeping the top decile turns the book net-positive (top 10% +0.14%/trade, top 5% +0.32%/40% win, top 2% +1.17%/52% win — clean monotone). On **crypto it currently fails / inverts** (top 1% −4.4%): the crypto edge-scoring is mis-calibrated/anti-predictive at the top — a specific Phase-25 fix.
- **The literature agrees the edge is discipline, not a secret strategy:** ~95% of day traders lose; the most active 20% *underperform* by ~6.5%/yr; overtrading-from-overconfidence is the dominant failure predictor ([QuantifiedStrategies](https://www.quantifiedstrategies.com/day-trading-statistics/), [Barber–Odean via PFH](https://blog.pfhmarkets.com/trading-risk-management/trading-risk-mistakes/)). Our mechanical EV-gate + Kelly + one-best-per-cycle design IS the evidence-based answer — Kyle's original thesis (a rules-based system beats human greed/FOMO) is correct.

**Implication:** keep executing selectivity/discipline well (we are set up for it), and add the genuinely new, evidence-backed sources of edge below — in sequence, without blocking the launch.

## 1. Directions, bucketed by sequencing

### PRE–PHASE-19 (do before turning paper-active back on)

**A. VTS as an independent, always-on standalone system — RESEQUENCED (Kyle 2026-06-05).**
Previously deferred to post-launch (2026-05-21, "possibly never built"). **Moved to between Phase 24 and Phase 19.** Rationale: when Phase 19 turns active trading on, the ready-to-buy queue / active state does not persist on shutdown AND VTS stops — we lose continuous learning data exactly when we most need a stable evaluation baseline. Design: **ingest market data ONCE into a single internal feed, fan it out** to multiple consumers (VTS, paper, live) — so extra simulated systems cost **zero** additional Kraken API calls (this dissolves the rate-limit worry that caused the original deferral). VTS runs telemetry-only in its own partition, decoupled from whether active trading is on. **Two distinct simulated jobs, not one (architectural lock):** (1) a **firehose** — deliberately broad, many trades across all strategies/regimes, for learning coverage, drift detection, and the pattern-path negative-control test (§ pattern-path below); (2) a **shadow** — runs the *real* selective pipeline (one-best-per-cycle, full SQE→queue→sizing) on simulated fills continuously, a faithful "what would live be doing right now" readout. The firehose answers "what could happen across the space"; the shadow answers "what would our actual system do." They are configurations of one engine on one data feed, differing mainly in the selection step. Build firehose-VTS standalone now (pre-19); the **shadow IS paper mode** built as Phase 19.

### PHASE 19 / PHASE 25 (during active-path restoration + evidence calibration)

**B. Execution / friction reduction.** Friction (fees + spread + slippage) eats most of the edge at 15-minute moves. Levers we control in our own code, independent of Kraken terms: **maker/limit orders instead of market/taker** (lower fee AND capture spread instead of paying it; tradeoff = fill risk, a per-trade decision); trade only tight-spread liquid names + **size to available depth**; and above all **selectivity** (set the EV bar high early when fees are high, loosen as 30-day volume earns cheaper tiers). Slots into Phase 19 (making active trading work *well*).

**C. Adaptive trend-following (volatility-adaptive lookbacks).** Evidence: in crypto, *time-series* momentum (price persistence) is well-supported and far stronger than cross-sectional; the standout results come from making the lookback **adapt to the volatility regime** rather than fixing it (one 2022–24 study, Sharpe ~2.4: [arXiv](https://arxiv.org/pdf/2602.11708), [SSRN](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4675565)). We have trend strategies and are regime-aware but use fixed per-regime lookbacks. **Candidate to fold into the AMR (Adaptive Market Response) BODY** — AMR's job is "pump the brakes / change posture when conditions make losses likely"; volatility-adaptive trend response is the same family. **AMR placement is RESOLVED (not open):** the AMR **body** is a **pre-Phase-19 batch** (roadmap item 19-19; CC + Langston consensus 2026-05-28 — after xStock-calibration umbrella close + onboarding-workflow finalize, before Phase 19 kickoff; shadow-gated the first ~5-7 days of Phase 19, then DB-flag active). The Phase-25 "AMR build/skip" item is only the *brain* (M2 ML model replacing hand-set thresholds). So adaptive trend-following, if folded in, rides the **pre-Phase-19** AMR body — a design question for the AMR-body scope (Kyle 2026-06-05: "could be an option"), not a separate placement.

**D. Paper-vs-live mode separation.** Build the live-mode-specific machinery when we build live mode — i.e., *after* paper mode is fixed and calibrated (Phase 19 → 21). Live is the same pipeline as the shadow/paper with real fills; the "copy-paste-with-a-toggle vs. better way" question is the existing roadmap item 19-18.

### PHASE 25+ / DATA LAYER (new inputs that raise signal confidence + ranking)

**E. Alternative-data ranking layer (the "AI-enabled new data" play).** A new data-ingestion layer feeding the existing scanner→signal→scoring chain as additional inputs that influence signal confidence/ranking:
- **xStocks:** AI (LLM) reads news / earnings / analyst actions / filings and outputs *consistent, structured* scores (sentiment, surprise-vs-expectation, materiality, direction, confidence). The subjectivity problem is exactly what AI solves — one model scores every item the same way, and the score's *value is learned from whether prices actually moved*, not assumed. Evidence: LLM-scored news has strong published results (one study ~74% return-direction accuracy, Sharpe ~3.0; watch look-ahead bias: [arXiv](https://arxiv.org/pdf/2412.19245)).
- **Crypto:** on-chain flows (exchange in/outflows, "smart-money" wallet tracking) carry real signal in *sustained* directional flow, with ~30–40% false positives, so it must be aggregated not taken trade-by-trade ([smart-money tracking overview](https://stoic.ai/blog/crypto-whale-tracker-expert-guide-to-monitoring-market-movers/)).
- Build is a learning loop: pull sources → AI/structured scoring → feed into signal scoring → re-weight by realized predictive value. xStock-first (news/earnings are richer + cleaner for tokenized equities than thin crypto tokens — and xStock is where the profitable edge already showed). Slots Phase 25+ (after the core pipeline is running).

**F. Periodic ML edge-scan as a scheduled job (Kyle directive 2026-06-05).** The HCE analysis engine (`scripts/hce/hce_study.py` + `hce_ohlc_sim.py` + `hce_rawfeat.py`) becomes a **scheduled ML routine** (weekly/monthly) that re-runs the same winner-commonality / selectivity / raw-feature analysis to detect edge we're missing or drift in edges already found. Output = ranked candidate gates + a drift report. Slots into the ML system (model work itself is post-launch Phase 17/18, but this analytical scan is scheduled infrastructure). **Calibration-robust by design** (raw-feature anchored, absolute bins, dose-response) so it survives re-tuning.

### POST-LAUNCH / FURTHER OUT (after first launch + bigger portfolio)

**G. Delta-neutral funding-rate / cash-and-carry yield.** Makes money *without predicting direction*: long spot + short the matching perpetual future, collect funding — documented ~10–30% annualized with tiny drawdowns in 2025 ([Amberdata](https://blog.amberdata.io/the-ultimate-guide-to-funding-rate-arbitrage-amberdata), [Arbitrage Scanner](https://arbitragescanner.io/blog/crypto-funding-rate-arbitrage-guide)). **Requires perpetual futures** = a new asset class (crypto_perp / xstock_perp), and we now know onboarding a class is a long process — so **after the first launch** (don't let it block launch), and Kyle wants a **bigger portfolio** before activating hold-type strategies. Low-risk income sleeve, complementary to directional day-trading.

**H. Pure buy-and-hold / investment sleeve.** A true multi-week/month/year position set, reviewed daily/weekly/monthly to decide when (and whether) to sell — a real investment, separate from the hourly day-trading. After a bigger portfolio.

**I. Cross-sectional ranking.** Rank all names and trade the strongest *relative to peers* instead of each chart alone. Academic support but weak-after-costs and crash-prone in crypto ([Starkiller](https://www.starkiller.capital/post/cross-sectional-momentum-in-cryptocurrency-markets)). The robust **market-neutral** version needs **short selling**, which we do not have via Kraken today — Kyle is open to it *if* short access becomes available (not a philosophical no). The **long-only** version ("rank + take top longs") is possible without shorts and could be evaluated earlier. Post-launch.

## 2. Sequencing summary

| Bucket | Items |
|---|---|
| **Pre-Phase-19** | (A) Independent standalone VTS (firehose), data-fan-out; xStock calibration resume (separate scope) |
| **Phase 19** | Paper mode = the shadow; (B) execution/friction; (D) paper-vs-live separation prep |
| **Phase 25** | (C) adaptive trend-following ↔ AMR (placement to reconcile); crypto edge-scoring fix; confidence/SQE calibration |
| **Phase 25+ data layer** | (E) alt-data ranking (AI news for xStock, on-chain for crypto); (F) scheduled ML edge-scan |
| **Post-launch / further out** | (G) delta-neutral funding yield (needs perps + bigger portfolio); (H) buy-and-hold sleeve; (I) cross-sectional (short-gated) |

## 3. What does NOT count as edge (so we don't chase it)

Influencer/retail chart-pattern day-trading is mostly the 95%-lose category — our own pattern study independently confirmed the candlestick patterns are ~coin-flips. We do not add more hand-coded indicators hoping AI makes them work; the frontier is *new data + structure + disciplined selectivity*, not smarter math on the same OHLC.

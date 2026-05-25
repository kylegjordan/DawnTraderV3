# Machine Learning System — Preliminary Design (Pass 1, rev 2)

**Status:** PRELIMINARY DESIGN — pass 1 draft for Kyle read-through, then Langston review (pass 2). **Rev 2 (2026-05-25)** folds in the predictive-intelligence layer per Kyle directive.
**Author:** Claude Code, 2026-05-21 (rev 1) → 2026-05-25 (rev 2).
**Supersedes (conceptually):** POST_AUDIT_ROADMAP.md §17 (Phase 17 ML Design) + §18 (Phase 18 ML Implementation). Those sections were authored against the 1.17.26 "Plan to Create a Plan" and a system that has changed substantially since. This document is the current-state-grounded replacement and, once reviewed, should drive a rewrite of §17/§18.
**Related concept docs:** `ADAPTIVE_MARKET_RESPONSE_CONCEPT.md` (2026-04-25), POST_AUDIT_ROADMAP §17.6 (Trend Mining Engine).

> **READ THIS FIRST — what this document is and is not.** This is a *preliminary* design. It is deliberately opinionated so Langston has something concrete to poke holes in. It is NOT a scope file, NOT an implementation plan, and NOT a commitment to a build order. Numbers (timelines, model choices, box sizes) are first-pass estimates. The purpose of pass 1 + pass 2 is to converge on the *shape* of the ML system before any batch is scoped.

> **Rev 2 changelog (2026-05-25):** added §6.7 (M6 — market-state forecaster), §14 (predictive intelligence landscape), expanded §5 architecture from five to six models, added new open questions 11–13 in §11, updated §12 summary, and reframed the Phase 17 design intent to explicitly include the predictive layer. Original five-model architecture stands unchanged; M6 is additive.

---

## 0. The vision in one paragraph

Kyle's goal: a living, breathing, thinking autonomous trading system. It learns from everything already collected — closed trades, VTS simulated outcomes, and the millions of scans of pairs that never became trades. It recognizes market conditions and changes how it trades in response: brakes hard when the tape is hostile to a long-only book, opens the throttle when the tape is favorable. Its single objective is **growing the portfolio** — not raw win rate — as fast as possible within risk limits, which means high win rate *and* large average win size. On top of it all sits a conversational layer Kyle can interrogate: ask it what happened, why a decision was made, what the market was doing, and either steer the ML or have it surface options to choose between. The whole thing is buildable piece by piece, where each piece is independently valuable the day it ships. **Rev 2 addition:** the system also anticipates market state ahead of arrival via a predictive forecasting layer — not just sharpens decisions against current state.

This document translates that vision into an architecture that fits the system **as it actually exists today**, not the system the old Phase 17/18 plan was written against.

---

## 1. Why the old Phase 17/18 design needs replacing

The old §17/§18 is not wrong in spirit, but it is stale in specifics. What changed since 1.17.26:

| Old plan assumed | Reality today |
|---|---|
| ML influences "DSS (strategy weighting)" | DSS was **deleted** (HF9). Strategy selection is now MCE regime classification + canonical regime-strategy map + per-strategy `detect()` functions. |
| ML feeds "SQE, RTB Queue, DSE" as the inbound touchpoints | SQE / RTB / TEC still exist and are still the right touchpoints — but the *confidence chain* (B67 era, 10-factor modulation) and the *Net Expectancy Kernel* are now the load-bearing math the old plan never mentioned. |
| Single asset class (crypto spot) | Three asset classes onboarded or onboarding: crypto_spot, xstock_spot (~450+ tokenized equities), crypto_perp (deferred post-launch). Every ML model must be asset-class-scoped. |
| "NGC / CWQI" as quality metrics | Both removed in Phase 10. The `ml-service-client.ts` interface still references them — it is stale. |
| Feature Store must be built from scratch | The system has been **capturing structured training data for months** — see §4. The Feature Store is now largely a *consolidation and labeling* job, not a greenfield data-capture build. |
| ML as a monolithic "primary intelligence" that replaces rules | The current doctrine (NO PATCHES, fail-closed, hard-fail on missing config) points to ML as a **set of bounded model touchpoints that sharpen the existing math**, with the rules-based kernel always present as the safe fallback. |
| Time-series modeling not contemplated as a foundation-model job | Foundation models for time-series (Chronos, TimesFM, Moirai, Kronos) didn't exist as a category in 2026-01. They're now a genuine paradigm shift — pretrained on massive financial-data corpora, zero-shot capable. The predictive layer in §6.7 is built on this advance. |

The old Crawl/Walk/Run/Fly milestone framing survives. The touchpoint list, the model choices, the data-pipeline assumptions, and the absence of a predictive-forecasting layer do not.

---

## 2. Current-state grounding — what the ML must sit on top of

The ML cannot be designed in a vacuum. Here is the system it has to integrate with, as of 2026-05-21.

### 2.1 The live trade-decision pipeline (the path a candidate signal travels)

```
FX5 / xStock scanner  →  pair universe per cycle
        │
        ▼
Global market filter  →  pair-level filters (5 quant family lanes + 1 pattern lane)
        │
        ▼
MCE.computeContext()  →  regime classification + indicators (VWAP/ATR/EMA/BB/RSI) + DBS + cost model
        │
        ▼
Family-routed strategy iteration  →  per-strategy detect()  →  raw signal
        │
        ▼
computeRealHybridScore + getPredictiveConfidence + computeRealDecayPenalty
        │
        ▼
computeFinalScore(hybridScore, predictiveConfidence, regimeWeight, decayPenalty)
        │
        ▼
Confidence chain (B67 era) — 10-factor modulation, currently SHADOW (nothing consumes it as a decision input)
        │
        ▼
Net Expectancy Kernel  →  EV after friction (spread + slippage + fees, both legs)
        │
        ▼
Trade Expectancy Gate (VTS_NET_EV_FLOOR = -0.01)
        │
   ┌────┴────┐
   ▼         ▼
 VTS path   Active-trading path
 (opens     (adds SQE signal-quality gate + RTB ready-to-buy ranking/queue,
  sim        then TEC trailing-exit controller on the open position)
  trades
  on every
  survivor)
```

**The single most important fact for ML design:** the VTS path and the active-trading path see **different populations of trades**. VTS opens a simulated trade on every filter-survivor against every strategy in the regime family — broad by design. Active trading runs SQE filtering on top, which removes a large fraction of what VTS keeps. This is exactly why the regime-classifier confidence-chain calibration was just moved into Phase 19 (roadmap §19.0.A, 2026-05-21): you cannot calibrate a sensor against a population the sensor will not serve. **The ML design inherits this constraint directly** — see §6.4.

### 2.2 The existing ML / learning scaffolding (Chapter 6 of the System Manual)

There is already a meaningful amount of ML-adjacent infrastructure. Most of it is observability-only or operating on partially-simulated inputs, but the *plumbing* exists:

| Component | What it does today | ML-design verdict |
|---|---|---|
| **VTS Runner** | Autonomous 60s simulation loop; opens/resolves virtual trades against real prices | KEEP — this is the data generator. The training corpus comes from here. |
| **ML Calibration Service** | Linear-regression weight nudges from VTS outcomes; INCREASE/DECREASE/HOLD per strategy | REPLACE — directionally valid but magnitude is noise-modulated. The supervised outcome model supersedes it. |
| **Calibration Utilities** | OLS regression `calibrated_profit = α + β·predicted_profit` per strategy | KEEP as a fallback/sanity baseline. The ML must beat this baseline to justify itself. |
| **ML Service Client + `services/ml_service.py`** (73KB Python) | HTTP bridge to a local Python ML microservice; `predictPromotion()`, `predictProfit()` | KEEP THE PATTERN — Node↔Python sidecar over HTTP is the right infra shape and it already exists. Interface is stale (NGC/CWQI) and must be rebuilt. |
| **Reward Evaluator** | Per-strategy per-regime reward `R = 0.6·profit_rate + 0.3·win_rate − 0.1·drawdown` | KEEP THE IDEA — this is a primitive version of the gamified reward (§3). Currently computed but not consumed; the RL layer consumes a descendant of it. |
| **Drift Detector** | Monitors calibration α/β/σ drift, triggers recalibration | KEEP + EXTEND — model drift detection is mandatory for the ML; this is the seed. |
| **Retraining Freeze Controller** | Pauses retraining 1h after fee-constant changes | KEEP THE PATTERN — model-shock prevention. Note: it currently fires a stale 1h freeze on every restart (System Manual finding) — clean that up before it gates ML retraining. |
| **Telemetry Aggregator** | 24h rolling per-pair performance, the central VTS data-collection point | KEEP — a primary feature source. |
| **Regime Archiver** | Long-term regime-metric preservation | KEEP — historical regime context for training. |
| Walter-era learning cluster (ContinuousLearningEngine, LearningCoordinator, LearningBridge, etc.) | Cognitive-weight tracking for the retired Walter/Bob agents | LEGACY — not connected to the trading pipeline. Ignore; flag for cleanup. |

**Takeaway:** we are not building an ML system from a blank page. We are (a) consolidating an existing-but-fragmented learning layer, (b) replacing the linear-regression brain with real models, and (c) adding the pieces that genuinely don't exist (posture model, RL sizing, Trend Mining Engine, conversational layer, **predictive forecaster**).

### 2.3 Asset-class reality

Every model is asset-class-scoped from day one. crypto_spot and xstock_spot have different regimes, different friction, different session structure (crypto 24/7, xStocks have RTH + extended hours + weekend silence), different bar intervals (crypto FX5 60-min, xStock 1-min). A model trained on crypto will not transfer to equities. This is non-negotiable and matches the established §5 #15 corollary (per-asset-class config is the default).

---

## 3. The objective function — what "winning" means

This is the most important design decision in the document, because every model's training target descends from it.

### 3.1 Portfolio growth, not win rate

Kyle was explicit: the goal is growing assets under management as fast as possible within risk limits. Win rate is a *means*, not the *end*. A system can win 95% of trades with tiny wins and still lose money on rare large losses. So the canonical objective is **risk-adjusted portfolio growth rate**.

Concretely, the system-level objective we optimize is a function of the equity curve:

```
Objective  =  growth_rate  −  λ · drawdown_penalty

where  growth_rate     = mean per-period log-return of portfolio equity
       drawdown_penalty = some function of peak-to-trough equity decline
       λ                = risk-aversion coefficient (operator-set, DB-tunable)
```

This is essentially a **Sharpe/Sortino-flavored objective with an explicit drawdown brake**. It rewards compounding, punishes volatility of returns, and punishes deep drawdowns harder than shallow ones. Kelly-criterion sizing (already in the system's DNA) falls naturally out of this objective.

Win rate and average-win-size are *diagnostic metrics* we watch, not the thing we optimize. They rise as a consequence of better selectivity and better exits.

### 3.2 The honest answer on the 100% / 75% win-rate target

Kyle said "shoot for the moon." Here is the honest framing, because a design built on a fantasy number fails review:

- A long-only book **cannot** post a high win rate in every market. When the tape is broadly falling and we cannot short, the *only* winning move on many pairs is **not to trade them**. That is what ARM/posture is for — the win rate of trades-actually-taken can stay high precisely because the system declined the un-winnable ones.
- The realistic levers on win rate are: **(a) selectivity** — the outcome model skips low-probability setups; **(b) regime avoidance** — the posture model brakes in hostile windows; **(c) exit quality** — TEC converts would-be losers into break-even/small exits.
- The realistic levers on *growth* (the real objective) are the above **plus**: **(d) sizing** — bet bigger when edge and conditions are both strong; **(e) win-size capture** — let winners run via trailing exits; **(f) anticipation** — the predictive layer in §6.7 lets us position ahead of regime change rather than reacting after it.

So: chase the equity curve. Win rate will climb as a side effect of (a)+(b)+(c). Promising a specific win-rate number pre-build would be confabulation. The design *targets* the highest risk-adjusted growth the data supports and lets win rate land where selectivity puts it.

### 3.3 Gamification = reinforcement learning with an equity-curve reward

Kyle's "gamify it so it's only out to win, and winning = growing the balance" is, stated precisely, **reinforcement learning where the reward signal is the risk-adjusted change in portfolio equity**. That is the textbook formulation. The Reward Evaluator already in the codebase (§2.2) is a primitive, non-consumed version of this. The RL layer in §6.3 is the real version.

RL is also the **riskiest and most data-hungry** part of the whole design, so it is sequenced last and introduced behind heavy guardrails (§6.3, §9).

---

## 4. The data we already have (the corpus)

The old plan treated the Feature Store as a greenfield build. It is not. As of 2026-05-21 the production database already holds (estimated live row counts):

| Table | Rows | What it is | ML role |
|---|---:|---|---|
| `signal_eval_archive_2026_05` | 4.6M | Every signal evaluation — including pairs/strategies that scored but never traded | **Feature source + counterfactual labels.** The "scans that didn't become trades" Kyle described. |
| `pair_scan_archive_2026_05` | 1.5M | Pair-level scan results per cycle | Feature source — market-state context at scan time. |
| `paper_sim_trade_logs` | 16K | Actual VTS simulated trade outcomes (entry, exit, P&L) | **The labeled outcome set.** Primary supervised-training target. |
| `regime_factor_alternates` | 45K | Factor-ablation replay rows (the B67 confidence-chain calibration data) | Feature-importance ground truth for the confidence chain. |
| `exit_strategy_alternates` | 34K | Exit-strategy ablation rows (TEC variant counterfactuals) | Training data for the exit/sizing models. |
| `filter_diagnostics` | 84K | Per-cycle filter funnel counters | Feature source — what the funnel was doing. |
| `strategy_drive_metrics` | 31K | Per-strategy performance metrics | Feature source. |
| `telemetry_lineage` / `data_lineage` | 68K | Provenance tracking | Audit + feature lineage. |
| `macro_feed_archive_2026_05` | 24K | Macro context (BTC dominance, funding, etc.) | Feature source — the external "weather" inputs. |
| `xstock_dbs_backfill` | 31K | Backfilled directional-bias scores for xStocks | Feature source. |
| `*_ticker_snap_*` / `*_ohlc_1m_*` | ~85M | Raw market data (ticks + 1-minute bars) | Raw substrate for feature engineering (the Trend Mining Engine churns this; the predictive layer fine-tunes on this). |

**Implications for design:**

1. **The Feature Store is a consolidation job, not a capture job.** The data exists; it is fragmented across ~10 tables with inconsistent schemas and partitioned monthly. The Crawl phase builds a *unified, labeled, point-in-time-correct* view over this, not new instrumentation.
2. **Point-in-time correctness is the #1 data hazard.** A signal evaluation row and its eventual trade outcome live in different tables written at different times. Joining them without leaking future information (the outcome) into the feature set is the classic ML-finance trap. The Feature Store's core job is enforcing "as-of" joins.
3. **16K labeled outcomes is enough to start supervised training, not enough for deep RL.** Gradient-boosted trees train fine on 16K rows. RL wants orders of magnitude more — which is another reason RL is sequenced last and why VTS must keep running to accumulate.
4. **The reject population is real signal.** 4.6M evaluations vs 16K trades means the system is mostly saying "no." Learning *why* it says no, and whether those nos were correct, is as valuable as learning from the yeses. This needs counterfactual labeling (see §6.1).
5. **The OHLC tick + bar archives are the substrate the predictive layer fine-tunes on.** A foundation-model approach (§6.7) doesn't need labels for pretraining — it needs raw time-series data, which is what these archives are.

---

## 5. Architecture overview — six models, one backbone

The ML system is **not one model.** It is a small portfolio of models, each doing one job, each plugging into a specific touchpoint, all sharing one Feature Store and one validation pipeline. The existing rules-based math kernel (Net Expectancy Kernel, FinalScore, regime classifier) **stays** as the interpretable backbone and the safe fallback. ML *sharpens the inputs* to that kernel; it does not replace it.

**Rev 2 (2026-05-25):** the architecture now has six bounded models, not five. M6 — the market-state forecaster — was added to fill the "anticipation" gap in the original five-model design. M1–M5 are unchanged.

```
                       ┌──────────────────────────────┐
                       │       FEATURE STORE          │  unified, labeled,
                       │  (consolidation over §4 data)│  point-in-time-correct
                       └───────────────┬──────────────┘
                                       │
   ┌──────────────┬───────────────┬────┴──────────┬──────────────────┬──────────────────────┐
   ▼              ▼               ▼               ▼                  ▼                      ▼
┌─────────┐ ┌──────────┐ ┌────────────┐ ┌──────────────┐ ┌──────────────────┐ ┌─────────────────────┐
│ M1      │ │ M2       │ │ M3         │ │ M4           │ │ M5               │ │ M6                  │
│ Outcome │ │ Posture/ │ │ Sizing /   │ │ Trend Mining │ │ Conversational   │ │ Market-state        │
│ predict │ │ market-  │ │ growth     │ │ Engine       │ │ AI layer         │ │ FORECASTER          │
│ (GBT)   │ │ cond.    │ │ optimizer  │ │ (unsuperv'd  │ │ (LLM + tools)    │ │ (TSFM + LLM events  │
│         │ │ model    │ │ (RL)       │ │  candidate   │ │                  │ │  + prediction mkts) │
│         │ │          │ │            │ │  generator)  │ │                  │ │                     │
└────┬────┘ └────┬─────┘ └─────┬──────┘ └─────┬────────┘ └─────────┬────────┘ └──────────┬──────────┘
     │           │             │              │                    │                     │
     ▼           ▼             ▼              ▼                    ▼                     ▼
sharpens     sets trading    sets position  proposes new      reads everything,   forecasts future
P(win) &     posture         size & take/   features/         explains, steers    market state
E[R]          (throttle:     skip, reward   signals →                              (price, vol, regime,
              aggressive↔    on equity      validation         feeds into M2 →     event probability)
              survival)      curve          pipeline           and M5 directly     → consumed by M2,
     │           ▲             ▲              │                    ▲                M1 features, M5
     │           │             │              │                    │                anticipation
     └───────────┴─────────────┴──────────────┴────────────────────┘                    │
                         consumes feature outputs                                       │
                                                                                        ▼
        EXISTING MATH KERNEL (unchanged, always present)  ◀────────────────── feeds anticipation
        Net Expectancy Kernel · FinalScore · regime classifier                   into M2 posture
        ── ML degrades gracefully to this on any failure ──                      adjustments
```

### Model-by-model summary

| # | Model | Type | Trains on | Inference target | Touchpoint |
|---|---|---|---|---|---|
| **M1** | **Outcome predictor** (meta-labeler) | Gradient-boosted trees (LightGBM/XGBoost) | 16K labeled outcomes + counterfactual-labeled rejects | P(win), E[R-multiple], calibrated probability | Feeds SQE gate, RTB ranking, confidence chain — sharpens `getPredictiveConfidence` |
| **M2** | **Posture / market-condition model** | Supervised first (predict next-window expectancy from market state); RL-capable later | Aggregate market-state snapshots → forward realized portfolio performance | Trading posture: a throttle 0→1 + discrete mode | Drives the ARM response layer (§7) — position size multiplier, confidence floor, slot caps, hard pause. **Consumes M6's forecasts** as forward-looking features. |
| **M3** | **Sizing / growth optimizer** | Reinforcement learning (start with contextual bandit / Kelly-tuner, graduate to full RL) | Sequential trade history; reward = risk-adjusted equity-curve delta | Per-trade size fraction + final take/skip | Dynamic Sizing Engine; the gamified core |
| **M4** | **Trend Mining Engine** | Unsupervised candidate generation (tsfresh / motif / subgroup mining) | Raw OHLC + tick archives + all eval data | Candidate features/signals → validation pipeline | Feeds the Feature Store; new validated features become M1/M2/M6 inputs |
| **M5** | **Conversational AI layer** | LLM (Claude API) + tool/function access to DB and system state | n/a (no training — retrieval + reasoning) | Natural-language answers, option sets, steering actions | Kyle-facing; read access to everything, gated write access to ML config. **Consumes M6's forecasts** when asked "what's the market about to do." |
| **M6** | **Market-state forecaster (PREDICTIVE LAYER)** | Time-series foundation model (Chronos / TimesFM / Kronos) fine-tuned on our OHLC + LLM event forecaster + prediction-market data ingestion | Raw OHLC bars (unsupervised pretraining baked-in) + macro feed + Polymarket/Kalshi prices + news/macro events | Forecasts: price distribution, realized-volatility, regime-transition probability, macro-event probabilities | Feeds M2 (forward-state features), M1 (forward-context features), M5 (anticipation answers). **Does not directly issue trade signals.** |

**Why split into six bounded models instead of one:** different jobs have different data shapes, different latencies, different risk profiles, and different failure modes. A single monolithic model is harder to validate, harder to explain, and a single point of failure. Six bounded models can be shipped, validated, and rolled back independently — which is exactly the "build piece by piece, each piece independently valuable" property Kyle asked for.

---

## 6. The models in detail

### 6.1 M1 — Outcome predictor (the workhorse)

**Job:** given a candidate signal with its full feature vector at evaluation time, predict the probability it wins and the expected R-multiple (reward-to-risk realized).

**What this is, in standard terms:** M1 is a **meta-labeling model** in the López de Prado sense (see §13.2). The rules-based strategy `detect()` functions are the *primary* model that decides direction; M1 is the *secondary* model that decides whether to trust that decision and how much to size it. This is the canonical academic framing of exactly our "ML sharpens inputs, never replaces the kernel" principle — and it means our existing stop/target/timeout trade resolution is already producing textbook **triple-barrier labels** with zero relabeling work.

**Why gradient-boosted trees:** the data is tabular, mixed-type, medium-sized (tens of thousands of rows), with non-linear feature interactions. GBTs (LightGBM or XGBoost) are the correct tool — they outperform neural nets on tabular financial data at this scale, train in seconds, give native feature-importance, and pair cleanly with SHAP for explainability. Inference is sub-millisecond, so the <100ms latency budget is trivially met.

**Training labels:**
- *Positive corpus:* the 16K `paper_sim_trade_logs` rows — each has a real outcome (win/loss, realized R).
- *Counterfactual corpus:* the 4.6M `signal_eval_archive` rows that did NOT become trades. These need synthetic labels. Approach: for a sampled subset of rejects, replay them forward against real price history (the same replay machinery `regime_factor_alternates` already uses) to compute what the outcome *would* have been. This is how the model learns whether the system's "no" decisions were correct — directly answering Kyle's "learn from the scans that don't even get a trade."

**Output and touchpoint:** M1 produces a calibrated P(win) and E[R]. These *replace the noisy inputs* to existing math — specifically `getPredictiveConfidence()` (currently a crude sigmoid of historical win rate) becomes M1's calibrated probability. The Net Expectancy Kernel then runs unchanged on a much better probability estimate. SQE and RTB ranking consume the improved EV. **The kernel and gates are untouched; only the quality of their inputs improves.**

**Rev 2 addition — M6 feature feed:** M1 also consumes M6's forward-looking features (e.g., forecasted 1h-ahead realized volatility, P(regime change in next 4h)) as additional inputs alongside the current-state features. This anticipation signal sharpens P(win) and E[R] by accounting for where the market is *going*, not just where it is.

**The population caveat:** M1 trained on VTS outcomes inherits the VTS-vs-active-trading population gap (§2.1). Mitigation: train M1 on VTS data for the *initial* model, but treat the first paper-active deployment as a recalibration trigger — once paper-active outcomes accumulate, M1 retrains on the population it actually serves. This mirrors the §19.0.A confidence-chain decision exactly.

### 6.2 M2 — Posture / market-condition model (the ARM brain)

**Job:** read the aggregate market state and output how aggressively the system should be trading right now — Kyle's "step on the brakes vs open the throttle."

This model **is the intelligent version of Adaptive Market Response.** See §7 for the full ARM build-vs-bundle recommendation. In short: ARM's rules-based "weather report" aggregator gets built first as plain infrastructure; M2 is the learned model that later replaces ARM's hand-set thresholds.

**Inputs (the "weather report," all already available):** regime state + regime flicker rate, global DBS direction and trend, realized-vs-predicted EV gap, pair-level regime distribution, friction trend, macro feed (BTC dominance, funding, dollar index from `macro_feed_archive`). **Rev 2 addition: forward-state features from M6** — forecasted regime in next N hours, forecasted volatility, P(macro event impacting markets).

**Training target (supervised first):** predict the *forward* risk-adjusted portfolio performance of the next window (e.g. next 1–4 hours of trading) given the current market-state snapshot. Map that prediction onto a posture: high predicted performance → aggressive; low/negative → defensive/survival.

**Output:** a continuous throttle (0 = hard pause, 1 = maximum aggression) plus a discrete mode label for human readability. The throttle drives the ARM response dials (§7).

**Why supervised before RL:** posture is a lower-dimensional, lower-frequency decision than per-trade sizing. A supervised regressor is interpretable, trains on far less data, and is safe to ship early. RL on posture is a possible later upgrade, not a starting point.

### 6.3 M3 — Sizing / growth optimizer (the gamified core)

**Job:** decide how much capital to put on each trade, and make the final take/skip call, to maximize the risk-adjusted equity curve. This is the literal implementation of Kyle's gamification idea.

**Why reinforcement learning:** sizing is a *sequential* decision — today's bet affects tomorrow's available capital, and the objective (compounding growth with a drawdown brake) is inherently path-dependent. That is the exact problem class RL solves. The reward signal is the §3.1 objective: per-period risk-adjusted log-return of portfolio equity.

**Why RL is sequenced LAST and built in stages:**
- RL is data-hungry. 16K trades is not enough; this is a core reason VTS must keep running to accumulate.
- RL is the hardest to validate and the easiest to have blow up in a way that destroys capital.
- So the rollout is staged: **(Crawl)** a contextual bandit or a Kelly-fraction tuner — far simpler, far safer, still a real improvement over fixed sizing; **(Walk)** offline RL trained purely on historical replay, never touching live decisions; **(Run)** shadow-mode RL (its decisions logged and compared, not executed); **(Fly)** RL in the loop, hard-bounded by the Authority Baseline and guardrails, with the rules-based sizer as instant fallback.
- At every stage the RL agent's actions are **hard-clamped** by the existing risk guardrails (max position size, kill switch, daily-loss budget if §19.0.B ships). RL can choose *within* the safe envelope; it can never widen the envelope.

### 6.4 The population problem applies to all supervised models

Stated once, applies to M1, M2, and M6: any model trained on VTS outcomes is trained on a broader, more permissive population than active trading serves. The design rule:
1. Train initial models on VTS data (it is what we have).
2. Treat them as **provisional** until paper-active data accumulates.
3. Make the first sustained paper-active run a mandatory retraining checkpoint.
4. Never let a VTS-trained model drive live capital without a paper-active recalibration pass.

This is consistent with — and reinforced by — the roadmap §19.0.A decision.

### 6.5 M4 — Trend Mining Engine

Largely as already designed in roadmap §17.6, and that design holds up. Summary: an unsupervised candidate generator that churns the raw archives (OHLC, ticks, every eval) and proposes features/signals no human framed — across pair × regime × time-of-day × macro × volume dimensions. It does **not** decide anything; it proposes. Its output flows into the existing B67.0 ablation/validation pipeline, which is the canonical gate. Validated candidates become new features for M1/M2/M6.

**The discipline that makes or breaks it:** multiple-comparisons control. A naive miner that emits 47 "patterns" a week is worse than useless. Mandatory: false-discovery-rate correction, walk-forward holdout, friction-net EV gates, sample-size minimums, a "keepers per quarter" sanity ceiling, and a human (Langston/Kyle) gate before any mined signal goes live. Realistic throughput: most weeks zero, occasionally one or two genuine keepers.

**Sequencing:** pre-launch, build nothing — only ensure the archive schemas are mining-ready. The engine itself is a post-launch research track or a late Phase 18 item. It is the lowest-priority of the six models for launch.

### 6.6 M5 — Conversational AI layer

**Job:** the interface Kyle described — ask it anything about the system, the trades, the decisions, the market conditions; get explanations; have it surface options to choose between; let it steer the ML.

**Architecture:** an LLM (Claude API) with structured tool/function access to: the trade database, the Feature Store, model outputs and SHAP explanations, regime/market history, **M6's forecast outputs and confidence**, and a **gated** set of ML-config write actions. Read access is broad. Write access (changing a model parameter, flipping a posture threshold, approving a mined signal) is **proposal-only** — the layer surfaces the option and the change it would make; Kyle confirms; the change is applied through the same DB-governed, audited path as any other config change. It never silently mutates the trading system.

**Rev 2 addition — anticipation answers:** when Kyle asks "what's the market about to do?" or "should I expect a vol spike in the next few hours?" M5 reads M6's current forecast distribution and answers with calibrated probability ranges, not gut-feel narrative.

**Why this is worth prototyping early despite being "last" in grandeur:** it is the cheapest of the six to stand up (no training, no model risk — it is retrieval + reasoning), and it is enormously valuable as a *development and debugging tool* for the ML build itself. A conversational layer that can answer "why did M1 score this trade low" accelerates every other model's validation. Recommendation: a **read-only** version of M5 is a strong early win — possibly the very first ML-adjacent thing built — with the steering/write capability deferred until there are models worth steering.

**Cloud caveat:** M5 inherently uses the Claude API (cloud). That is acceptable *because M5 is not in the trade-decision hot path.* The old "must run entirely locally, no cloud dependency" rule still applies fully to M1/M2/M3/M6 — the trading-critical inference must be local so trading never depends on an external API. M5 being cloud-dependent only means "Kyle can't chat with the system if the API is down," which is not a trading risk.

### 6.7 M6 — Market-state forecaster (the predictive layer) — NEW IN REV 2

**Job:** anticipate market state, not react to it. Produce calibrated probabilistic forecasts of:
- **Price distributions** for major pairs over short horizons (5min, 1h, 4h, 1d).
- **Realized volatility** for the same horizons.
- **Regime-transition probability** — "P(current regime breaks in next 4h)" — early warning for the ARM posture model.
- **Macro-event probabilities** — Fed decisions, geopolitical events, scheduled earnings — that affect crypto sentiment or xStock prices.

M6 does **not** issue trade signals directly. It produces forward-state features that M1, M2, and M5 consume. This separation is deliberate: it keeps the trade-decision path interpretable (no "the AI told us to buy" black box) while still benefitting from anticipation.

**Three component sub-models inside M6:**

**6.7.1 — Time-series foundation model (TSFM) for price/volatility forecasting**

The 2023–2025 wave of pretrained time-series foundation models is the genuine paradigm shift that wasn't available when the old Phase 17 plan was drafted. These are pretrained on massive corpora of time-series data and produce probabilistic forecasts on any new series with zero-shot capability, then improve with fine-tuning. The four candidates worth evaluating:

| Model | Source | Strengths | Caveat |
|---|---|---|---|
| **Kronos** (Aug 2025) | Open research | **Pretrained specifically on financial market data** (not generic time-series). Closest to our use case out of the box. | Newest of the four; less battle-tested in production. |
| **TimesFM** | Google | Strong financial forecasting results in published mock-trading studies. Univariate. Fine-tunable. | Univariate limits us to per-pair forecasts; need to compose for cross-pair signals. |
| **Chronos / Chronos-Bolt** | Amazon | Most mature, open-source, well-documented. Zero-shot capable, beats traditional baselines without fine-tuning in many domains. | Generic pretraining; needs financial fine-tuning to compete with Kronos on our data. |
| **Moirai** | Salesforce | Multivariate native — can ingest a portfolio's pairs simultaneously, capture cross-asset structure. | Heavier compute footprint. |

**Recommendation:** evaluate Kronos first (closest fit), keep TimesFM and Moirai as fallback paths. Pretraining is paid; fine-tuning on our OHLC archives is the real work.

**6.7.2 — LLM event forecaster (Halawi-style)**

LLMs have crossed a threshold in 2024–2025 for forecasting discrete world events. Halawi et al. 2024 was the foundational paper; by November 2025 the AIA Forecaster reported results statistically indistinguishable from human superforecasters on broad event-forecasting benchmarks. The architecture is well-established: an off-the-shelf LLM combined with retrieval-augmented context gathering on news, base rates, and structured analytic techniques.

**Our use case:** ingest macroeconomic calendar (Fed meetings, CPI prints, payrolls), crypto-specific events (ETF decisions, regulatory headlines, exchange announcements), xStock-relevant equity events (earnings, dividends, splits). Output: calibrated probabilities for each event's outcome plus expected market-impact direction. M2 consumes these to brake before scheduled-uncertainty windows; M5 consumes them to answer Kyle's "what's coming up this week?" questions.

**Build vs buy:** this is buy-side. Mantic (referenced in the Thinking Machines Lab post) offers training-as-a-service. AIA Forecaster's code is published. We don't build a forecaster from scratch — we deploy one of the published architectures with our own retrieval corpus.

**6.7.3 — Prediction-market data feeds**

Polymarket and Kalshi together did $238B + $220B in volume in 2025 with broad coverage of macro, political, and event-outcome probabilities. Quantitative funds already use these as alpha inputs; documented arbitrage extraction of $40M from Polymarket alone in the past year. The relevant feeds for us:

- **Polymarket macro markets** — Fed funds rate paths, US recession probability, presidential outcomes (xStock-relevant). Free API.
- **Kalshi** — CPI prints, jobs reports, GDP, weather (energy market relevance). Regulated, US-based.
- **Crypto-specific prediction markets** — BTC price-by-date, ETF approvals, Ethereum upgrades. Direct relevance to crypto_spot.

These feeds become inputs to M2's macro context and to M5's anticipation answers. Zero training cost — just an API ingestion pipeline and a feature mapper.

**Architecture relationship to existing models:**

```
M6 sub-components ──► aggregate forecast bundle ──► consumed by:
  ├─ Kronos / TimesFM (price + vol)        ├─ M2 posture model (forward features)
  ├─ LLM event forecaster (macro events)   ├─ M1 outcome predictor (forward context)
  └─ Polymarket/Kalshi feeds (macro probs) └─ M5 conversational layer (anticipation Q&A)
                                              │
                                              └─ NOT a direct trade-signal generator
```

**Safety posture:** M6 inherits the same fail-graceful rule as the rest of the ML stack. If the foundation model fails to load, if the event forecaster's LLM is unavailable, or if the prediction-market APIs are down, M6 returns "no forecast" and the consuming models (M2/M1) fall back to operating on current-state features only — exactly how they work pre-M6 today. No model anywhere in the stack is allowed to harden a dependency on a forecast.

**Why this is additive, not a replacement:** the predictive intelligence wave is real, but it doesn't eliminate the need for the rules-based kernel, the meta-labeler, the RL sizer, or the trend miner. Each of those does a different job. M6 is the *forward-looking* feature source that improves them all by giving them anticipation as an input dimension they previously didn't have.

**Honest counter-point on the predictive-vs-rules debate:** every generation of "AI predicts markets" technology has overstated its edge. The funds that actually win at this — Renaissance, Two Sigma, D.E. Shaw — extract tiny per-trade advantages at massive scale; nothing in the 2023–2025 research wave says "see the future of crypto reliably." What the wave DOES say is that the input quality available to the existing ML stack just got meaningfully better than what was available a year ago. M6's job is to harvest that input-quality improvement, not to overpromise prediction.

---

## 7. Adaptive Market Response — build now, or bundle with ML?

This is the specific recommendation Kyle asked for.

### 7.1 The two things ARM is made of

ARM has two separable halves:
- **The response layer** — the dials: position size multiplier, stop/target distances, confidence floor, entry cooldown, strategy/pool allow-lists, slot caps, hard-pause. A skeleton of this exists today (the NORMAL/DEFENSIVE/SURVIVAL mode overlay). It is missing an offensive "Aggressive" mode and its values are hardcoded rather than DB-tunable.
- **The detection layer** — the "weather report": the multi-input aggregator that reads market state and decides which posture to be in. Today detection reads ONE input (global regime stable/transitioning/unstable) and so almost never leaves Normal mode, even through documented hostile windows.

### 7.2 The recommendation: build the skeleton now, bundle the intelligence with ML

**Do not** build a fully self-contained, precision-calibrated ARM as a standalone pre-ML batch. **Do not** defer ARM entirely into the ML build either. The right answer is the middle path:

**Phase 1 — build now (a near-term batch, Phase 25, ~1–2 weeks):**
- Build the response layer properly: add the Aggressive mode, promote all dial values to `module_constants` (DB-tunable, per-asset-class), add the new dial types (strategy/pool allow-lists, slot caps, hard-pause flag).
- Build the detection-layer *aggregator as plain infrastructure* — the service that reads all the weather inputs and produces a single posture classification — but drive it with **conservative, operator-set thresholds**, NOT thresholds calibrated from VTS streak data.
- Ship it. The system immediately gains a working two-gear adaptive posture (brakes + throttle), which is independently valuable on day one.

**Phase 2 — bundle with ML (this becomes M2 + M6):**
- The ML posture model M2 *replaces the hand-set thresholds* inside the detection aggregator with a learned model. The aggregator service, the response dials, the mode plumbing — all built in Phase 1 — are reused unchanged. M2 just becomes a smarter brain inside an existing skull.
- **Rev 2 addition:** M6 then feeds M2 with forward-looking forecast features, letting the posture model brake BEFORE hostile windows arrive rather than after. This is the "anticipation" capability the rules-based version cannot have.

### 7.3 Why this is the right call

1. **The aggregator is reusable infrastructure either way.** Whether the brain is rules or ML, the system still needs the service that gathers the weather inputs and the dials that act on the posture. Building that now is not throwaway work — M2 consumes it directly.
2. **It avoids the wasted-calibration trap.** The ARM concept doc (§3.3) proposed calibrating ARM's detection thresholds from VTS streak data pre-launch. That has the **exact same population problem** as the confidence chain — VTS streaks are not active-trading streaks. Precision-calibrating ARM from VTS data would be calibrating against the wrong population. So: ship conservative operator-set thresholds now, let M2 do the real calibration later against paper-active data.
3. **It delivers value immediately.** Kyle gets a working brakes-and-throttle system pre-launch without waiting for the entire ML build. That satisfies "each piece independently valuable when it ships."
4. **It makes ARM the natural first ML integration point.** When M2 is ready, there is already a defined socket for it to plug into. The ML build does not have to also build the response plumbing — it inherits it.

**One-line answer for Kyle:** build ARM's body now (response dials + weather-report aggregator, conservative thresholds — Phase 25 batch), and bundle ARM's brain with the ML (M2 replaces the thresholds with a learned model, M6 adds anticipation). Not fully separate, not fully bundled — the skeleton ships early and independently, the intelligence arrives with the ML.

---

## 8. Infrastructure

### 8.1 Inference path (trading-critical — must be local)

The Node↔Python sidecar pattern already exists (`ml-service-client.ts` ↔ `services/ml_service.py`) and is the right shape. Keep it. The Python service hosts M1/M2/M3/M6 inference. LightGBM/XGBoost and a small RL policy all infer in well under the 100ms budget. **Foundation-model inference (M6) is heavier — Kronos/TimesFM typically run on GPU and inference can be hundreds of milliseconds.** Two design responses: (a) M6 forecasts are NOT computed per-trade; they're computed on a scheduled cadence (every 1–5 minutes) and cached. M1/M2 read the cached forecast values as features. (b) The Python sidecar may grow into two processes — a fast-inference process for M1/M2/M3 and a forecast-refresh process for M6. HTTP over localhost with short timeouts and a fail-to-rules fallback (already the pattern). The rule: if any ML service is unavailable, slow, or low-confidence, the system silently falls back to the existing math kernel and keeps trading. ML failure is never a trading outage.

### 8.2 Training path (not latency-critical — can be a heavier job)

Training is a periodic batch job, not a hot-path concern. GBT training on tens of thousands of rows runs in seconds-to-minutes on the existing box. RL training (when it arrives) is heavier and may justify either a dedicated training instance or a vertical-scale bump to the Hetzner box. **M6 fine-tuning is the heaviest single training job** — fine-tuning a foundation model on our OHLC corpus needs GPU and may take hours per model. This is the strongest argument for a dedicated training instance. Training cadence: nightly or on drift-trigger for M1/M2; weekly or monthly for M6 (foundation models are stable enough that they don't need daily retraining); gated by the Retraining Freeze Controller pattern.

### 8.3 The Feature Store

A consolidation layer (likely a set of materialized views or a dedicated set of tables) over the §4 source tables, enforcing point-in-time-correct as-of joins between evaluations and outcomes. **Rev 2 extension: the Feature Store also caches M6's forecast outputs as point-in-time-correct features for M1 and M2 consumption.** This is the single largest piece of net-new data engineering in the whole design. It is also the foundation everything else stands on — M1 through M6 all read from it. It is the correct first build item (the "Crawl" phase).

### 8.4 Explainability and observability

SHAP values for every M1/M2 prediction (native fit with GBTs). A model-performance dashboard: live accuracy, calibration curves, feature-importance drift, prediction-vs-outcome tracking. **M6-specific: forecast-vs-realized calibration curves** (did the forecasted distribution actually contain the realized outcomes at expected frequencies?). The Drift Detector (already exists) extends to cover model drift, not just calibration-coefficient drift. Every model output is logged and auditable — consistent with the existing ML Safety Principles (no overwrite without versioning, everything observable, fail gracefully, performance first, Authority Baseline is the floor).

---

## 9. Safety, drift, and fallback

Non-negotiable, and mostly already doctrine:

- **The rules-based kernel is always present.** ML sharpens inputs; it never removes the Net Expectancy Kernel, the gates, or the guardrails. Every model has a defined rules-based fallback.
- **Bounded authority.** ML operates strictly within the Authority Baseline and guardrail envelope. M3 (sizing) can choose within the safe size envelope; it can never widen it. The kill switch and (if it ships) the §19.0.B daily-loss budget sit *above* the ML and cannot be overridden by it.
- **Shadow mode before live for every model.** Each model runs with its outputs logged-and-compared but not executed, until it demonstrably beats the rules-based baseline on the population it will serve.
- **Drift → safe mode.** Model drift beyond threshold auto-reverts that model to its rules-based fallback and alerts. **M6 specifically: forecast-calibration drift triggers a fallback where M1/M2 ignore the forecast feature and operate on current-state features only.**
- **Versioning + rollback.** Every model is versioned; any model can be rolled back to a prior version or to rules-only instantly.
- **The ML must beat the baseline to justify itself.** The existing OLS calibration (§2.2) is the baseline. A model that does not beat it in shadow mode does not ship.
- **No forecast hard-dependencies.** No model anywhere is allowed to harden a dependency on M6's output. If the forecaster is down, M1/M2 work as if M6 didn't exist. Failure of the predictive layer must not propagate.

---

## 10. Where the ML sits in the roadmap (proposed)

This is a *proposal* for pass 2 / Langston review, not a commitment:

1. **Pre-launch, near-term:** ARM body (response dials + weather aggregator, conservative thresholds) — Phase 25 standalone batch from §7.2 Phase 1.
2. **Pre-launch, optional early win:** read-only M5 conversational layer — cheap, no model risk, accelerates everything else.
3. **Phase 17 (redefined):** this design, reviewed and converged. Build the Feature Store (Crawl). Build and shadow-test M1 (outcome predictor). **Begin M6 evaluation — pretrained TSFM probing on our archives, prediction-market data ingestion, LLM event-forecaster prototype.**
4. **Phase 18 (redefined):** M1 to production (sharpening confidence/EV inputs). Build M2 (posture model, replacing ARM's thresholds), wired to consume M6 forecasts. **Ship M6 first sub-component (TSFM) to production as a feature source.** Begin M3 at Crawl stage (bandit/Kelly-tuner).
5. **Post-launch:** M3 graduates through Walk/Run/Fly RL. M4 Trend Mining Engine. M6 second + third sub-components (LLM event forecaster, prediction-market feeds). M5 steering/write capability. Crypto_perp onboarding.

The old §17/§18 weeks-based estimates are discarded; sequencing is dependency-based, paced by data accumulation and shadow-mode validation gates.

---

## 11. Open questions for Langston (pass 2)

1. **Population strategy.** Is "train M1 on VTS, mandatory retrain on first paper-active data" sufficient, or should M1 be deferred entirely until paper-active data exists? (Trade-off: earlier but provisional vs later but representative.)
2. **Counterfactual labeling cost.** Replaying a sampled subset of the 4.6M rejects forward against price history is compute-heavy. What sample size gives enough counterfactual signal without an unreasonable replay job?
3. **RL scope.** Is the Crawl-stage "contextual bandit / Kelly-tuner" enough value that full RL can be deferred indefinitely post-launch, or is full RL a launch-relevant goal?
4. **M2 vs the confidence chain.** The B67 confidence chain (10-factor modulation) and M2 (posture model) both consume overlapping market-state inputs. Are they peers, or should M2 subsume the confidence chain entirely? This needs a clear boundary before either is built.
5. **Feature Store implementation.** Materialized views vs dedicated ETL tables vs a purpose-built feature-store library — what fits the Supabase/Drizzle stack and the point-in-time-correctness requirement best?
6. **M5 write authority.** Is "proposal-only, Kyle confirms every change" the right gate, or should some low-risk ML-config changes be allowed autonomously within bounds?
7. **Training infrastructure.** Does RL training justify a dedicated instance, or does a vertical-scale bump to the existing box suffice through launch? **Rev 2 extension: M6 foundation-model fine-tuning is GPU-grade work; same dedicated-instance question with sharper teeth.**
8. **Sequencing the conversational layer.** Is a read-only M5 worth building before the models exist (as a dev/debug accelerator), or is that a distraction from the core build?
9. **Build-vs-buy, per component.** Mature open-source now covers large chunks of this design (see §13). Do we adopt FreqAI / Qlib / FinRL as substrates, build fresh, or borrow patterns only? My preliminary take is in §13.9 but this is a genuine strategic fork for Langston.
10. **Meta-labeling tooling.** Should M1 be built formally as a meta-labeling model using an established toolkit (e.g. mlfinlab / Hudson & Thames — purged cross-validation, sample-weighting by label uniqueness, sequential bootstrap), or hand-rolled? The toolkit prevents several classic financial-ML mistakes.
11. **M6 foundation-model choice (NEW Rev 2).** Kronos (newest, financial-specific, less battle-tested) vs TimesFM (univariate, mature, strong financial results) vs Moirai (multivariate, heavier). Prototype against our archives and pick from evidence? Or skip the bake-off and start with Kronos given its direct fit?
12. **M6 forecast horizons (NEW Rev 2).** What horizons matter most for our use case? 5-min and 1h support M1's per-trade outcome prediction; 4h and 1d support M2's posture decisions. Is there value in longer horizons (1 week+) for macro-context, or does the LLM event forecaster cover that better?
13. **Prediction-market data integration (NEW Rev 2).** Is M6's prediction-market sub-component a Phase 18 ship alongside the TSFM, or a faster pre-Phase-18 ship that can feed the rules-based ARM detection layer in §7 even before M2 is live? Polymarket/Kalshi data is essentially free and operationally trivial to ingest; the question is whether early ingestion is worth the integration surface.

---

## 12. Summary

- The old Phase 17/18 design is stale and should be rewritten from this document once reviewed.
- The ML system is **six bounded models** (outcome predictor, posture model, RL sizing optimizer, trend miner, conversational layer, **market-state forecaster**) sharing one Feature Store and one validation pipeline — not a monolith.
- The objective is **risk-adjusted portfolio growth**, not win rate. Gamification = RL with an equity-curve reward. The win-rate target is chased indirectly through selectivity, regime avoidance, exit quality, **and anticipation via the predictive layer**.
- The existing rules-based math kernel **stays** as the interpretable backbone and the universal fallback. ML sharpens its inputs; it never replaces it.
- We are **not** starting from a blank page — months of structured data already exist (16K labeled outcomes, 4.6M evaluations, 1.5M scans). The Feature Store is a consolidation job.
- **ARM recommendation:** build the body now (response dials + weather aggregator, conservative thresholds — Phase 25 standalone batch, independently valuable pre-launch); bundle the brain with the ML (the posture model M2 replaces ARM's hand-set thresholds later, with M6 adding anticipation).
- **Predictive intelligence layer (Rev 2):** M6 is a six-model addition — a market-state forecaster built on a time-series foundation model (Kronos / TimesFM / Moirai) + an LLM event forecaster + prediction-market data ingestion. It produces forward-looking features that M1, M2, and M5 consume. **It does not issue trade signals directly; it improves the input quality of the models that do.** This is additive to the original five-model architecture — Kyle's "predictive vs ML" question resolves cleanly as "ML stack consumes a predictive feature source, doesn't replace itself with one."
- Everything is buildable piece by piece, each piece independently valuable, behind shadow-mode and drift-to-safe-mode guardrails.
- **External research (§13) confirms the architecture is sound** — every one of the six models has a mature precedent (FreqAI, Qlib/RD-Agent, FinRL, HMM regime detection, multi-agent LLM frameworks, **time-series foundation models, LLM event forecasters, prediction-market alpha**). The biggest borrowed concept is **meta-labeling** (López de Prado): it is the field's exact name for our design, and our trades are already triple-barrier-labeled by construction. Build-vs-buy per component is a real strategic question for pass 2.

---

## 13. External landscape — what already exists, and what we should borrow

A survey of the open-source and academic landscape. **The encouraging headline: nothing out there is the *whole* of Kyle's vision — a living, learning, conversational, anticipating autonomous trader — but every individual piece of the six-model design has a mature, proven precedent.** That means our architecture is sound (we are not inventing something unprecedented), and we can borrow heavily rather than invent from scratch.

### 13.1 FreqAI (Freqtrade) — the closest analog to our entire design

Freqtrade is a mature open-source crypto trading bot (~49,000 GitHub stars, MIT-licensed, developed since 2017). **FreqAI is its machine-learning module — and it is literally "an adaptive ML layer bolted onto a rules-based crypto trading bot," our exact pattern.** This is the single most relevant existing system.

Concepts to borrow directly:
- **Continuous self-adaptive retraining during live deployment** — FreqAI retrains models on a rolling basis so they self-adapt to drift. Validates our M1 drift-retrain design.
- **Feature *expansion*, not feature *hand-crafting*** — FreqAI generates 10,000+ features from a small set of simple base features and lets the model select. This sharpens our Feature Store thinking: build a feature *generator*, do not hand-pick a list.
- **Threading separation + hot-RAM models** — retraining runs on a separate thread (or GPU) from inference and trade operations; the newest model and data are kept in RAM for sub-millisecond inference. This validates and sharpens our §8 sidecar design — add "keep the live model hot in RAM."
- It uses **LightGBM / XGBoost / PyTorch** — exactly the M1 library choice.

**Strategic:** FreqAI is MIT-licensed and self-hostable. At minimum we should read its code before building M1. Whether to adopt parts of it or build fresh is an open question (§13.9).

### 13.2 Meta-labeling + triple-barrier (López de Prado) — the canonical name for what M1 is

From *Advances in Financial Machine Learning* (López de Prado, 2018) — the standard reference for ML in finance. **This is the most important concept from the research.**

- **Triple-barrier labeling:** label a trade outcome by which of three barriers it hits first — profit target (+1), stop-loss (-1), or a time-horizon barrier (0). **Our trades already resolve exactly this way** (stop / target / 24h timeout). Our 16K `paper_sim_trade_logs` rows are therefore *already* triple-barrier-labeled by construction — they are textbook ML-finance labels requiring zero relabeling.
- **Meta-labeling:** do NOT use ML to predict market direction. Use a *primary* model (or rules) to decide direction, then a *secondary* ML model to decide **whether to act on that signal and how large to size it.** The secondary model predicts P(the primary signal is correct).
- **This is precisely our architecture.** The rules-based strategy `detect()` functions are the primary model; M1 is the meta-model; M3 sizes. Our "ML sharpens inputs, never replaces the kernel" principle *is* meta-labeling, stated in the field's own vocabulary. Recommendation: name and build M1 formally as a meta-labeling model — it then inherits a whole body of established best practice (event-based sampling, sample-weighting by label uniqueness, purged/embargoed cross-validation to prevent leakage).
- Published research confirms event-sampling + triple-barrier + meta-labeling improves real strategy performance.

### 13.3 Microsoft Qlib + RD-Agent — a full platform, and an LLM that does quant research

- **Qlib** (Microsoft, open-source) is a complete AI quant platform: the full pipeline of data processing → model training → backtesting, covering alpha-seeking, risk modeling, portfolio optimization and order execution. It supports supervised learning, market-dynamics modeling, and RL *in one platform*, and ships standard feature sets (Alpha158 / Alpha360). It explicitly models non-stationarity via "adaptive concept drift" technology — validating our drift design.
- **RD-Agent** (Qlib's newer companion) is an **LLM-driven automated factor-discovery and model-optimization agent** — the LLM proposes factor concepts, feature transformations and hyperparameter suggestions, then feeds them into automated search/backtest pipelines. **QuantaAlpha** is a similar LLM + evolutionary-search factor miner.
- **Why this matters:** RD-Agent is a *productized, working* version of our M4 (Trend Mining Engine) and M5 (conversational layer) operating together — an LLM that autonomously does quant research. It proves the "LLM as quant researcher" pattern is real, not speculative.
- **Strategic:** Qlib could serve as a platform substrate (data pipeline + backtester) rather than building those from scratch. A genuine open question for Langston (§13.9).

### 13.4 RL reward design — concrete, validated formulas for M3

Published RL-for-trading research gives us specific, tested reward functions instead of guesses:
- A **Sharpe-ratio reward** beat a raw-return reward by **+39% return and −13.7% drawdown** on average. Direct validation of our §3.1 risk-adjusted objective.
- **Differential Sharpe ratio** — an online, incremental form of the Sharpe ratio that can be computed *per RL step*. This is the concrete reward-function candidate for M3.
- **Embedded drawdown-constraint reward** — adding an explicit drawdown term to the reward makes the agent behave like a risk-averse human trader. Validates our `λ · drawdown_penalty` term.
- **Multi-reward / multi-agent** — train several RL agents, each on a different reward (log-return, differential Sharpe, max-drawdown), and combine them into one unified policy. A strong future-sophistication path for M3.

### 13.5 FinRL — the framework to build M3 on

**FinRL** is the standard open-source deep-RL trading framework (AI4Finance community). It models trading as a Markov Decision Process and ships tuned implementations of DQN, DDPG, PPO, SAC, A2C, TD3 — PPO and SAC being the workhorses for continuous-action problems like position sizing. FinRL's 2024/2025 contests went specifically into **LLM-engineered signals + RL-with-market-feedback** and **LLM+RL hybrids** — the field is actively merging exactly the two things (RL sizing + LLM layer) our design combines. **Strategic:** build M3 on FinRL rather than writing RL from scratch.

### 13.6 HMM regime detection — the ML upgrade path for M2's regime sub-model

The **Hidden Markov Model** is the standard tool for market-regime detection: it infers hidden states (low-vol / high-vol, bull / bear / neutral) from return series. 2025 research combines tree-ensembles with HMMs to identify bull/bear/neutral transitions, and uses ensemble-HMM voting frameworks for regime-shift detection. HMMs are used in practice as a "risk-managing regime filter that disallows trades when a high-volatility regime is predicted" — **which is exactly the ARM brake.** Critically, HMMs detect regime *transitions early*, which directly addresses the ARM concept doc's requirement to flag a hostile day within the first 30–60 minutes. **Concept to incorporate:** M2 should include an HMM sub-model producing a probabilistic regime state that feeds the posture decision — this is the natural ML upgrade to our current rules-based regime classifier.

### 13.7 Multi-agent LLM trading + explainable AI — validation for M5

- **TradingAgents** is a multi-agent LLM trading framework where specialized agents debate and express their reasoning in natural language specifically for explainability — exactly M5's value proposition.
- **ContestTrade** ranks models/agents by realized + predicted performance and dynamically allocates capital to the top performers. **Concept worth incorporating:** a meta-allocation layer that shifts capital toward currently-winning strategies/models — a natural extension once we have multiple strategies and models running.
- Recent work on LLM-enhanced explainable AI describes a three-level framework: technical explanation → structured → natural language. That is precisely M5 sitting on top of SHAP outputs.

### 13.8 Ensemble methods

Published statistical-arbitrage research shows an equal-weighted ensemble of a deep neural net + gradient-boosted trees + random forest outperforming any single model, and stacked ensembles improving prediction accuracy ~5%. **Concept:** M1 can graduate from a single LightGBM model to an ensemble later — but start simple (one LightGBM), prove it beats the baseline, then ensemble.

### 13.9 The honest strategic update — build-vs-buy is now a real fork

Before this research, the design implicitly assumed we build everything ourselves. That assumption no longer holds cleanly. Mature open-source now covers large chunks of the design: **FreqAI** (the adaptive-ML-on-rules-bot layer), **Qlib + RD-Agent** (platform + LLM factor research), **FinRL** (RL), **mlfinlab / Hudson & Thames** (meta-labeling and financial-ML tooling), **and now Chronos / TimesFM / Kronos for M6 (Rev 2)**.

Adopting these would cut build time dramatically, but it introduces integration complexity and external dependencies — which collides with the project's "understand every line, NO PATCHES, full control" doctrine. The good news: all of these are self-hostable and local, so the "must run locally, no cloud" rule survives adoption intact. The tension is purely about *control and comprehension*, not cloud risk.

**My preliminary recommendation (for Langston to challenge):**
- **Borrow concepts and patterns freely** — meta-labeling, triple-barrier labels, the differential-Sharpe reward, FreqAI's threading/hot-RAM model, the HMM regime sub-model, ContestTrade's performance-ranked capital allocation, **time-series foundation-model architectures, LLM event-forecaster recipes, prediction-market alpha methodology**. These cost nothing and carry no dependency.
- **Adopt libraries selectively for non-trade-critical-path work** — e.g. FinRL for M3 *training*, mlfinlab for *labeling/cross-validation utilities*, **Kronos/TimesFM/Chronos checkpoints for M6 fine-tuning**. These run offline; a dependency there cannot cause a trading outage.
- **Build the trade-critical inference path ourselves** — M1/M2/M3 *inference* is in or near the hot path; we own every line there, no exceptions. **M6 inference is NOT in the per-trade hot path** (cached forecasts refreshed on a 1–5 minute cadence) so the loaded foundation-model library is acceptable in this layer.
- Decide **per component**, not all-or-nothing. This is a genuine strategic fork and belongs in the pass-2 Langston review.

### 13.10 Sources

- [FreqAI — Freqtrade documentation](https://www.freqtrade.io/en/stable/freqai/) · [Freqtrade GitHub](https://github.com/freqtrade/freqtrade) · [FreqAI ML System — DeepWiki](https://deepwiki.com/freqtrade/freqtrade/5.1-freqai-machine-learning)
- [Advances in Financial Machine Learning — López de Prado](https://gildan-bonus-content.s3.amazonaws.com/GIL2476_AdvancesFinancial/GIL2476_AdvancesFinancial_BonusPDF.pdf) · [Triple-barrier labeling](https://www.newsletter.quantreo.com/p/the-triple-barrier-labeling-of-marco) · [Does meta-labeling add to signal efficacy? — Hudson & Thames](https://hudsonthames.org/does-meta-labeling-add-to-signal-efficacy-triple-barrier-method/)
- [Microsoft Qlib — GitHub](https://github.com/microsoft/qlib) · [Qlib — Microsoft Research](https://www.microsoft.com/en-us/research/publication/qlib-an-ai-oriented-quantitative-investment-platform/) · [QuantaAlpha — GitHub](https://github.com/QuantaAlpha/QuantaAlpha)
- [Risk-Aware RL Reward for Financial Trading (arXiv)](https://arxiv.org/html/2506.04358v1) · [Risk-Adjusted Deep RL for Portfolio Optimization: A Multi-reward Approach](https://link.springer.com/article/10.1007/s44196-025-00875-8) · [Embedded draw-down constraint reward function for deep RL](https://www.sciencedirect.com/science/article/abs/pii/S1568494622004082)
- [FinRL (arXiv)](https://arxiv.org/abs/2111.09395) · [FinRL Library documentation](https://finrl.readthedocs.io/en/latest/index.html) · [FinRL Contests 2023–2025](https://ietresearch.onlinelibrary.wiley.com/doi/10.1049/aie2.12004)
- [Market Regime Detection with HMM — QuantInsti](https://blog.quantinsti.com/regime-adaptive-trading-python/) · [Multi-model ensemble-HMM voting framework for regime-shift detection (2025)](https://www.aimspress.com/article/id/69045d2fba35de34708adb5d) · [HMM-Based Market Regime Detection with RL for Portfolio Management (2025)](https://www.cloud-conf.net/datasec/2025/proceedings/pdfs/IDS2025-3SVVEmiJ6JbFRviTl4Otnv/966100a067/966100a067.pdf)
- [TradingAgents: Multi-Agents LLM Financial Trading Framework (arXiv)](https://arxiv.org/html/2412.20138v6) · [Three-level Framework for LLM-enhanced Explainable AI](https://link.springer.com/article/10.1007/s10796-025-10668-1)
- [Deep neural nets, gradient-boosted trees, random forests: statistical arbitrage on the S&P 500](https://www.sciencedirect.com/science/article/abs/pii/S0377221716308657)

---

## 14. Predictive intelligence layer — supporting research (NEW IN REV 2)

The §6.7 M6 design is built on a wave of research and productization that solidified across 2023–2025. Three categories of evidence support adding this layer.

### 14.1 Time-series foundation models — a genuine paradigm shift

Time Series Foundation Models (TSFMs) are an emerging class of forecasting models inspired by foundation-model architecture from NLP. Pretrained on massive corpora of time-series data, they enable transfer learning and zero-shot forecasts without per-asset training. Probabilistic outputs (full distributions per step) give us uncertainty quantification natively — exactly what M2 wants for posture decisions.

| Model | Year | Source | Notable strength |
|---|---|---|---|
| **TimeGPT** | 2023 | Nixtla | First commercial foundation model for forecasting. Proprietary API. |
| **Chronos / Chronos-Bolt** | 2024 | Amazon | Open-source. Strong zero-shot performance; beats traditional baselines without fine-tuning in many domains. |
| **TimesFM** | 2024 | Google | Open-access. Fine-tuned for stock price forecasting → mock trading showed outperformance vs benchmarks on returns, Sharpe ratio, max drawdown, and trading costs. |
| **Moirai / Moirai-MoE** | 2024 | Salesforce | Open-access. **Multivariate native** — can ingest a multi-pair portfolio simultaneously and capture cross-asset structure. |
| **Kronos** | Aug 2025 | Open research | **Pretrained specifically on financial market data.** Closest fit to our use case. |
| **Time-MoE / MOMENT** | 2024–2025 | Various | Mixture-of-experts variants for higher-capacity forecasting. |

Recent applied work (May 2025) showed a foundation TSFM fine-tuned for realized volatility forecasting outperforming traditional methods. **Recommendation:** evaluate Kronos first given its direct fit to financial data; keep TimesFM (univariate, well-validated) and Moirai (multivariate) as fallback paths. The Hudson-and-Thames-style discipline applies — purged cross-validation, walk-forward backtesting, friction-net EV gates on any forecast claiming alpha.

### 14.2 LLM event forecasters — reaching superforecaster level

Halawi et al.'s 2024 paper "Approaching Human-Level Forecasting with Language Models" established the field. The recipe: an off-the-shelf LLM combined with retrieval-augmented context gathering on news, base rates, and Tetlock-style structured analytic techniques. Results varied at first — some models exceeded crowd baselines but underperformed superforecasters.

The November 2025 AIA Forecaster report demonstrated **results statistically indistinguishable from human superforecasters** on the ForecastBench benchmark. Mantic (referenced in Thinking Machines Lab's coverage) offers training-as-a-service for domain-specific forecasting; the AIA Forecaster code is published.

**Our use case for M6.2:** macro calendar (Fed meetings, CPI, payrolls), crypto-specific events (ETF decisions, regulatory headlines), xStock-relevant equity events (earnings, dividends, splits). Output: calibrated probabilities + expected market-impact direction. M2 brakes before scheduled-uncertainty windows; M5 answers Kyle's "what's coming up?" questions.

### 14.3 Prediction-market data — alpha already being extracted

Polymarket and Kalshi together did $238B + $220B of volume in 2025, capturing 97.5% of the prediction-market sector. They cover macro / political / event-outcome probabilities at high resolution and update quickly. **Critical fact for the build-vs-buy calculus:** quantitative funds are already treating these as alpha-generating signals — IMDEA Networks documented $40M in arbitrage profits extracted from Polymarket alone between April 2024 and April 2025 due to retail-dominated order books lacking institutional market-making.

**Our use case for M6.3:** ingest Polymarket macro markets (Fed funds paths, US recession probability, election outcomes), Kalshi event markets (CPI prints, jobs reports), and crypto-specific prediction markets (BTC price-by-date, ETF approvals). These feed M2's macro context and M5's anticipation answers. **Operationally trivial** — public APIs, simple feature mappers, no training cost.

**Aggregation tooling already exists:** Oddpool aggregates cross-venue data including live odds, spreads, liquidity, orderbook depth, and arbitrage opportunities. Predly identifies profitable opportunities by detecting mispricings between market prices and AI-calculated probabilities at 89% alert accuracy. We don't need to build aggregation from scratch.

### 14.4 The honest counter-point — why this isn't a silver bullet

Every generation of "AI predicts markets" technology has overstated its edge. The funds that actually win at this — Renaissance, Two Sigma, D.E. Shaw — extract tiny per-trade advantages at massive scale; nothing in the 2023–2025 wave says "see the future of crypto reliably." What the wave DOES say is:

1. **Input quality available to our existing ML stack is meaningfully better than a year ago.** Forecast distributions from foundation models are a strictly better input than rolling-window statistics for many features.
2. **Event-forecaster LLMs cleanly cover the "what's coming up" gap** in our current macro feed — which today is reactive (we observe BTC dominance change) rather than anticipatory (we predict it will change).
3. **Prediction markets are free alpha** at the macro/event level, already used by funds, simple to integrate.

M6's job is to harvest those input-quality improvements, NOT to be the new black-box trader. Trade decisions remain in M1/M2/M3 with the rules-based kernel always present as the fallback. The predictive layer is a *feature provider*, not a *decision maker*.

### 14.5 Sources (Rev 2)

- [Time Series Foundation Models for Multivariate Financial Forecasting (arXiv 2025)](https://arxiv.org/html/2507.07296v1)
- [Re(Visiting) Time Series Foundation Models in Finance (Nov 2025)](https://arxiv.org/html/2511.18578v1)
- [Kronos — A Foundation Model for the Language of Financial Markets (Aug 2025)](https://arxiv.org/html/2508.02739v1)
- [Foundation Time-Series AI Model for Realized Volatility Forecasting (May 2025)](https://arxiv.org/pdf/2505.11163)
- [Chronos: The Rise of Foundation Models for Time Series Forecasting — TDS](https://towardsdatascience.com/chronos-the-rise-of-foundation-models-for-time-series-forecasting-aaeba62d9da3/)
- [TimesFM: The Boom of Foundation Models — TDS](https://towardsdatascience.com/timesfm-the-boom-of-foundation-models-in-time-series-forecasting-29701e0b20b5/)
- [Halawi et al. — Approaching Human-Level Forecasting with Language Models (2024)](https://arxiv.org/abs/2402.18563)
- [Evaluating LLMs on Real-World Forecasting Against Expert Forecasters (Jul 2025)](https://arxiv.org/html/2507.04562v1)
- [AIA Forecaster — Technical Report (Nov 2025)](https://arxiv.org/html/2511.07678v1)
- [Training LLMs to Predict World Events — Thinking Machines Lab + Mantic](https://thinkingmachines.ai/news/training-llms-to-predict-world-events/)
- [LLMs Can Teach Themselves to Better Predict the Future (Feb 2025)](https://arxiv.org/pdf/2502.05253)
- [Prediction Markets 2025: Polymarket, Kalshi, and the Next Big Rotation — MONOLITH](https://medium.com/@monolith.vc/prediction-markets-2025-polymarket-kalshi-and-the-next-big-rotation-c00f1ba35d13)
- [Kalshi and Polymarket account for 97.5% of the prediction market share in 2025 — KuCoin](https://www.kucoin.com/news/flash/kalshi-and-polymarket-dominate-97-5-of-prediction-market-share-in-2025)
- [Awesome-Prediction-Market-Tools — GitHub](https://github.com/aarora4/Awesome-Prediction-Market-Tools)
- [Kalshi](https://kalshi.com/)

---

*End of pass 1 rev 2 (predictive-intelligence layer folded in 2026-05-25). Awaiting Kyle read-through, then Langston review.*

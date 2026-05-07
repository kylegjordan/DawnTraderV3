# BATCH 79 — Plain-language summary

**For:** Kyle
**Status of full scope:** rev 6, CONSENSUS REACHED with Langston after 2 iteration rounds. No deadlocks escalated.
**Companion to:** `BATCH_79_SCOPE.md` (technical, ~700 lines).
**Date:** 2026-05-07.

---

## Updates since rev 4 — what changed from your round-2 directive

You corrected three things and asked seven new questions. Net result of CC ↔ Langston iteration:

1. **Stage 5 architecture corrected.** I had pattern pool as a sequential fallback (pairs that fail quant filter try pattern). You corrected: pairs go through BOTH paths in parallel, both sets of survivors feed VTS. xStocks will follow the same pattern. **xStocks get their OWN pattern pool** (separate from crypto's) — telemetry-isolation reasoning.
2. **This is a Phase, not a Batch.** Reframed B79 + sub-batches into NEW **Phase 24 — Multi-Asset VTS Onboarding**. B80 (crypto_perp) becomes **Phase 25**. Out-of-sequence with current Phase 15c is fine; the roadmap already has out-of-sequence phases.
3. **Opening Range Breakout (ORB) — partial concession from Langston.** I argued ship it; he argued strict-observe-first; consensus: **ship the strategy FILE in B79, but gate activation on the AAPLx-vs-AAPL behavior probe outcome.** If the probe shows AAPLx mirrors AAPL during NYSE 9:30 ET open, enable ORB; if AAPLx has Solana-native price discovery and 9:30 ET is just another minute, ORB stays gated off. This way we don't defer the obvious AND we don't fire signals on noise.
4. **AAPLx vs AAPL behavior probe — elevated to dedicated pre-implementation stage** in B79. This is the biggest unknown. Methodology: pull underlying minute data via yfinance, compare across 4 windows (regular trading hours, pre-market, after-hours, overnight+weekend), produce a correlation decision tree. If correlation >0.95 in regular hours, equity intuition holds. If 0.70-0.95, hybrid asset; need session-aware tuning. If <0.70, Solana-native price discovery — treat as a new asset class entirely. **The shape of B79's later sub-batches depends on this answer.**
5. **3 specific file-based pattern strategies enabled Day 1:** `inside_bar_reversal`, `morning_star`, `pivot_shift` — all canonical equity patterns that predate crypto by decades. (Plus the 6 quant strategies from rev 4 makes 9 total + ORB gated = 10.)
6. **DBS for xStocks: yes, applied directly Day 1.** Formula is multi-timeframe-agreement-based; portable. Coefficient tuning happens in B79.1 once Layer 3 has data.
7. **Strong-trend coverage:** `breakout` + `sma_trend_ride` cover this. Complementary — breakout is ignition entry on range expansion, sma_trend_ride is continuation entry on pullback-into-trend.
8. **Sector classification: scripted via yfinance.** `Ticker(symbol).info['sector']` + `['industry']`. ~5 min for 275 symbols. Annual cron refresh. Stored as `gics_sector` + `gics_industry` columns in xstocks-universe.json or DB.
9. **Exit observation metrics specified:** time-to-target distribution, MAE before profit, MFE at exit, ATR-vs-%-stop performance, partial-take impact, hold-time by regime, stop-out-on-wick-vs-reversal. All become Layer 3 calibration targets per your "exits will behave differently for less volatile equities" point.
10. **Strategy-gap monitoring criteria specified** (5 concrete triggers): fire-rate by regime <50% of crypto's, ≥80% concentration in ≤2 strategies, win-rate clustering 40-50%, identifiable temporal windows with low fire-rate but observable directional moves, named pattern recurrence not captured. Each trigger maps to a B79.x candidate batch. Now in workflow doc Section G.

## What we're actually doing

**The original idea (last week):** add Kraken's xStocks (tokenized stocks like AAPLx, NVDAx, SPYx) into the trading system so VTS can evaluate equity signals alongside crypto signals.

**The new idea (your directive 2026-05-07 evening):** treat xStocks as the **lab experiment** for everything we'll need to know to add asset classes in the future. Every decision we make for xStocks becomes a documented step in a reusable playbook. When we add perpetual futures next (B80), we follow the playbook. When we add real equities through Alpaca later, we follow the playbook. When we add FX someday, we follow the playbook. The playbook gets stronger every time it's used.

So B79 has two outputs now, not one:
1. **xStocks working in VTS shadow-mode** (the original goal — observing equity signals without making real trades).
2. **A new governance document called `ASSET_CLASS_ONBOARDING_WORKFLOW.md`** in the system manual folder. This is the playbook. It walks through every step a new asset class has to go through, what decisions we have to make, what data we have to gather, what code changes we have to make.

---

## The mental model: the journey of a single pair

You suggested tracing what happens to a crypto pair from the moment it enters the system to the moment its closed trade lands in the archive. We did exactly that. The journey has 18 stages now (Langston added 3 to my original 16 — Stage 0 connection, Stage 12.5 portfolio risk, Stage 14a position management).

Imagine following BTC/USD through the system in the morning:

**Stage 0 — Connection:** the system knows the Kraken WebSocket URL, has the API key, knows BTC/USD's canonical symbol form. *For xStocks: same idea but different endpoint (`wss://ws-equities.kraken.com`), different symbol form (`AAPL/USD` on the WS feed even though display is `AAPLx`).*

**Stage 1 — Pair discovery:** scanner pulls all Kraken pairs and their 24h volume. *For xStocks: scanner pulls 275 symbols from a static config file (`xstocks-universe.json`) since xStocks aren't in the crypto AssetPairs list.*

**Stage 2 — Adaptive batch:** scanner picks 100 pairs to evaluate this cycle (60% best performers, 40% exploration candidates). *For xStocks: separate scanner instance, smaller batch (30 pairs), runs only when market open.*

**Stage 3 — DBS (directional bias):** for each pair, compute multi-timeframe directional strength. *For xStocks: same formula but the OHLC data comes from a different table (`equity_spot_ohlc_1m`).*

**Stage 4 — Global filter:** pairs must pass volume/price/spread filters. *For xStocks: new row in the `screener_filters` table with equity-tuned values. **And per your point: no max-price cap, just like we don't cap BTC at $150K.***

**Stage 5 — Pattern pool:** pairs that fail global filters but pass relaxed pattern thresholds enter a separate pool. *For xStocks: skip this entirely for B79. Equity microstructure is too different to trust crypto-tuned pattern detection.*

**Stage 6 — Family/IMF filters:** pairs are routed to a regime family (Trend, Range, Impulse, etc.) and pass family-specific thresholds. *For xStocks: same family taxonomy, but family-specific thresholds get equity-tuned values.*

**Stage 7 — Regime classification:** classifier decides if the pair is currently RBS (range-bound), TFS (trending), IE (impulse), HVU (high-vol), or ST (default). *For xStocks: 14 threshold values cut roughly in half because equity intraday volatility is ~half of crypto's.*

**Stage 8 — MCE (market context engine):** caches each pair's full state (regime, indicators, "macro modifier" for big-picture context). *For xStocks: macro modifier ships as 1.0 (neutral) for now — equity macro signals like VIX would be useful but it's premature without real observation data first.*

**Stage 9 — Strategy detect:** for each pair, a list of candidate strategies check whether their conditions are met. *For xStocks: only 6 strategies enabled — `vwap_pullback`, `breakout`, `mean_reversion`, `range_trade`, `sma_trend_ride`, `vwap_bounce`. The other 12 are crypto-microstructure-tuned and would generate false positives on equity bars.*

**Stage 10 — SQE (signal quality evaluation):** the strategy's raw signal is scored on confidence, regime weight, geometry. Only signals above a threshold pass. *For xStocks: confidence threshold lifted to 70 from crypto's 60 because we have zero equity history yet — be conservative until shadow-mode produces data.*

**Stage 11 — Cost model:** subtract round-trip friction (fees + spread + slippage) from the expected profit. *For xStocks: friction values populated in `xstock_spot/friction.ts`.*

**Stage 12 — Ranking:** all candidates pool together and the best ones get admitted. *For xStocks: temporarily share the pool with crypto in shadow-mode; B81 fixes the cross-asset ranking math (`expectedNetReturnR`).*

**Stage 12.5 — Portfolio risk (NEW from Langston):** check if entering this trade would over-concentrate the portfolio. *For xStocks: equities have stronger sector correlation than crypto. We can't just check symbol-similarity — need sector-aware clustering. **This is one of the items where we still need to do work.***

**Stage 13 — Trade entry:** position record created. *For xStocks: same code path; verify `paper_sim_open_positions` table has an `asset_class` column.*

**Stage 14 — Trade lifecycle:** WebSocket price updates flow in; trailing-exit-controller monitors stops. *For xStocks: critical — TEC must NOT fire stops when equity market is closed. Open xStock trade across the weekend gap can't trigger a stop on Saturday.*

**Stage 14a — Position management (NEW from Langston):** between entry and final close, lifecycle events fire: break-even stop arming, trailing-stop activation, partial-take. *For xStocks: same TEC code; threshold values may need re-derivation but defer to observation.*

**Stage 15 — Trade close:** P&L computed, telemetry updated. *For xStocks: telemetry MUST be partitioned by asset class. A failed xStock trade should NOT poison the rolling win-rate of a crypto pair. **This is the biggest hidden risk Langston caught — it's a B79 hard blocker if any telemetry component doesn't partition.***

**Stage 16 — Calibration / learning:** factor-ablation framework computes counterfactuals; drift dashboard aggregates lift. *For xStocks: aggregator scoping work + counterfactual generation for whatever xstock-specific factors we eventually add.*

---

## What we already did vs what's still needed

**Already in place (subagent already implemented from prior scope rev 2):**
- 14 regime threshold constants for xstock_spot in `regime-thresholds.ts`
- 4 SQE seed rows in DB
- Friction values in `xstock_spot/friction.ts`
- 6-strategy whitelist in canonical-regime-strategy-map
- Weekend-pause logic at the SQE evaluation gate
- 275-symbol merge into the scanner (via `xstocks-universe.json`)

**Still needed (the gap your directive surfaced):**
- **Schema migration:** add `asset_class` and `tunable_status` columns to `screener_filters` table.
- **screener_filters xstock_spot row** with **NO max-price cap** (your correction).
- **~17 more module_constants seed rows** for things that genuinely differ for equities (multi-timeframe agreement, correlation matrix, eventually macro modifier).
- **DB-tagged "pending_layer_3" rows** for the remaining ~30 thresholds we don't have evidence to derive yet — Layer 3 (live observation) will tune them.
- **Dedicated equity scanner instance** (not sharing FX5).
- **Telemetry partitioning audit** — Langston says this is a hard blocker. We have to verify PairFailureTracker, AdaptiveRatioManager, and predictiveConfidence rolling-window all partition by asset class. If any don't, we fix them.
- **Sector classification per xStock** — for portfolio cluster prevention.
- **Failure mode taxonomy** — LULD halts, circuit breakers, earnings windows, dividends, splits.
- **Stop-loss freeze for market-closed periods** — TEC must not fire stops when xStock market closed.
- **The new workflow document** — populated with xstock_spot as Section H.1 worked example.

---

## What we explicitly DEFERRED

**These are NOT B79 work**, but documented as future work triggered by observation:

- **Live-pricing for equity WebSocket** (`wss://ws-equities.kraken.com`): VTS shadow-mode uses 1-minute archive lookups. Real-time WS extension is Phase 19 active-trading prerequisite, not B79.
- **Equity macro modifier** (VIX, S&P trend, sector rotation, yield curve): ship neutral=1.0 in B79. Build only if Layer 3 shadow-mode shows equity signal quality systematically diverges from crypto baselines.
- **Equity-specific strategies** (Opening Range Breakout, Gap-Fill, End-of-Day Mean Reversion, VWAP Tagging, Earnings Drift, Sector Rotation): NONE added in B79. Observe first; add only if shadow-mode reveals strategy gaps.
- **Per-strategy indicator threshold derivation**: inherit crypto values + tag `pending_layer_3` in DB. Layer 3 produces real numbers from real data.
- **Per-pair friction overrides** for the most-liquid xStocks: `perPairOverrides` map left empty for B79; B81 promotes to DB rows.

The principle: **don't invent equity values from a crypto operator's intuition. Tag them as pending and let Layer 3 produce real values from real observation.**

---

## What's different about this batch vs all the prior batches

Prior batches: "ship X feature, fix Y bug." Implementation-first.

B79 (per your directive): **document-first.** The workflow doc is the deliverable. The xstock_spot code is the worked example that proves the workflow.

This means:
1. Pre-implementation audit (PIA) gates the implementation. No code change before SIM consultation + telemetry partitioning audit.
2. Multi-batch is acceptable. If B79 ships only the schema migration + scanner + workflow doc and B79.1 ships the strategy gates + verification, that's fine.
3. **No silent inheritance.** Every threshold that uses crypto's value because we don't have evidence yet gets a DB tag saying so. This way Layer 3 calibration knows what's outstanding.
4. Forward-watch metrics are part of every asset-class onboarding from here on. Define what we'll watch in the first 24h and 7d before deploy.

---

## What's coming next (sequence)

1. **You read this summary** + give thumbs-up or push back.
2. **MEMORY 3-way sync** — capture rev 4 scope state.
3. **Compact** the conversation (per your suggestion — context is getting thin).
4. **Pre-implementation audit** with full SIM consultation against the 15-component list.
5. **Telemetry partitioning audit** — likely several findings, possibly fixes required.
6. **Implementation push** with the multi-batch plan (B79 single, sub-batches observation-triggered).
7. **Build the workflow doc** in parallel with implementation.
8. **Forward-watch** for first 24h and 7d post-deploy.

After B79: **B80 (crypto_perp)** uses the same workflow doc. Funding rates are the perp equivalent of the macro modifier question. We'll see how the workflow holds up on its second use.

---

## Key questions I still want your call on

1. **B79 batch scope envelope** — you said multi-batch is fine. Is B79's "single ambitious batch" (per Langston rev 3 §F) acceptable, or do you want me to pre-plan a B79.1/.2/.3 split?
2. **Plain-language front-matter for the workflow doc itself** — Langston rev 3 §G suggested every asset-class section start with a non-jargon "what is this and why" paragraph. Confirm: yes you want that.
3. **PIA depth** — happy with the 15-component SIM list + schema audit + telemetry-partitioning audit Langston specified, or want anything added?

---

*End of plain-language summary. Full technical scope at `BATCH_79_SCOPE.md` rev 4.*

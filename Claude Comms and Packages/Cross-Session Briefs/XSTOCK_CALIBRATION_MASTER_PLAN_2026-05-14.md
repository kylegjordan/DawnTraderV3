# xStock Calibration Master Plan — Cross-Session Brief

> **Audience:** the other CC session (and ultimately Langston for review).
> **Author:** CC primary, 2026-05-14.
> **Status:** DRAFT — request the other CC session review + suggest changes; then send to Langston for design call.
> **Origin:** Kyle directive 2026-05-14, in response to the realization that xStock factor calibration was set up before any of its upstream dependencies were calibrated. We're three steps too early.

---

## 0. The architectural picture (what we got wrong, what to fix)

When xStock support shipped through Phase 24 (B79.x sub-batches), the pipeline was built end-to-end and connected to the same downstream telemetry (B70 archiving, B67 factor calibration tables, factor ablation framework, etc.). What got DEFERRED:

1. **xStock-specific DBS computation** — MCE receives a synthesized neutral `DBS=0` for non-crypto
2. **Regime classifier thresholds beyond TFS** — only TFS got equity-tuned constants; other 4 regimes use crypto-cloned values
3. **Filter family IMF thresholds** — all 5 family rows for xstock are byte-identical to crypto (`b79.0m.a-layer1-starter-cloned-from-crypto`)
4. **Per-strategy gates** — 26 wildcard rows in `module_constants` per strategy; never authored xstock-specific
5. **Equity macro modifier** — placeholder 1.0 (B79.3 was the deferred batch for equity macro feed)
6. **Factor set itself** — the B67/B68 factors being measured are crypto-specific (BTC dominance, funding rates, mcap momentum) and won't transfer to xstock

The CONSEQUENCE: every Layer-1 ship for xstock cloned crypto. The Layer-3 calibration that was supposed to follow never started because we were busy chasing UI fixes and pipeline gaps. Tomorrow's factor calibration review for xstock will produce mostly "decorative" verdicts because the factors don't apply, AND we haven't accumulated enough xstock VTS trades to hit decision-grade sample size.

**This plan sequences the work that should have happened gradually over Phase 24 but didn't.**

---

## 1. Calibration dimensions inventory

What needs calibration for xstock, in dependency order:

| # | Dimension | Currently | Target |
|---|---|---|---|
| 1 | **DBS computation** | Not implemented; synthesized neutral DBS=0 | Per-pair DBS analogous to crypto's `directional-bias-store`, using an equity-appropriate benchmark + parameters |
| 2 | **Regime classifier thresholds** | TFS-only tuned for xstock; other 4 regimes cloned from crypto | All 5 regime branches tuned against 2-3 weeks of archived xstock OHLC |
| 3 | **Regime confidence formula scales** | TFS multiplicative scales tuned; other regimes use crypto literal constants | Per-asset-class scales for all regimes that include DBS or vol-derived inputs |
| 4 | **Filter family IMF thresholds** | LQ/VN/DI/Corr cloned from crypto for all 5 families | xstock-specific values from empirical metric distributions in archived data |
| 5 | **Strategy regime mapping** | `CANONICAL_REGIME_STRATEGY_MAP` is global, same for all asset classes | Audit: which crypto strategies apply to equities? Add equity-specific strategies? |
| 6 | **Per-strategy gates** | 26 wildcard rows; no xstock-specific tuning | Per-strategy thresholds (RSI bands, ADX guards, ATR multipliers, volume thresholds) tuned for equity ranges |
| 7 | **Equity macro modifier** | Placeholder 1.0 in `module_constants.mce_config.xstock_spot.macro_modifier` | Real equity macro feed (B79.3 scope) — candidates listed in §4 below |
| 8 | **Confidence modifier factors** | Same crypto factors (b67_1_btc_dominance, b67_1_funding_rates, etc.) — most decorative on xstock | xstock-specific factor set — candidates listed in §4 below |

---

## 2. Sequencing plan (with dependencies)

### PHASE A — Foundation (sequential, blocks everything)

**A.1 — DBS design call** (~1 batch, design-heavy)
- Decide xstock DBS benchmark universe. Options:
  - Single broad-market benchmark (SPY)
  - Sector-rotation benchmark (XLK / XLF / XLE / XLV / etc. by sector classification of the xstock)
  - Self-referential basket median (DBS measured against the xstock universe's own median return — no external benchmark)
  - Multi-benchmark composite (weighted combo of above)
- Decide component weights (returns / slope / EMA — crypto's formula or equity-tuned?)
- Decide universe coverage gate (crypto uses 20-pair minimum for global DBS roll-up; xstock has 260+ pairs, so what's the floor?)
- **Output:** scope doc, Langston design review, BATCH_79_x_DBS_DESIGN.md

**A.2 — DBS implementation** (~1 batch)
- Build `xstock-directional-bias-store.ts` analogous to crypto's `directional-bias-store.ts`
- Wire DBS computation into `xstockSpotScanner.runCycle` so it precedes the eval-cycle dispatch
- Eval-cycle passes real DBS to MCE instead of `undefined`
- Backfill 2-3 weeks of historical DBS values from archived OHLC for retroactive analysis
- MCE's non-crypto synthesized-neutral branch lifts when `propagatedDbs` is provided
- **Output:** B79.x_DBS code + 2-3 weeks of backfilled DBS in `regime_factor_alternates` or similar

### PHASE B — Threshold calibration (uses archived data; parallel-capable after Phase A)

**B.1 — Regime classifier threshold calibration**
- Backfill replay: run `calculatePairRegime()` against 2-3 weeks of `xstock_spot_ohlc_1m` with the new DBS values
- Examine where xstock pairs actually land across the 5 regimes
- Tune the 14 `_XSTOCK` regime threshold constants for equity microstructure
- Tune TFS confidence formula scales (`tfsMomentumScale`, `tfsDbsScale`, `tfsVolatilityScale`)
- Add equivalent confidence formula scales for the other 4 regimes if asymmetries surface
- **Output:** B79.x_regime_calibration scope + tuned `module_constants.regime_classifier.*` rows

**B.2 — Filter family IMF threshold calibration** (parallel to B.1)
- Backfill replay: compute LQ / VN / DI / Correlation per pair per bar against 2-3 weeks of archived data
- Examine actual distributions vs the crypto-cloned thresholds
- Tune per-family `vts_<family>` + `active_<family>` rows in `screener_filters`
- **Output:** B79.x_imf_calibration scope + updated `screener_filters` rows

**B.3 — Per-strategy gate calibration** (parallel to B.1 + B.2; needs DBS for some strategies)
- For each of the 10 enabled xstock strategies (vwap_pullback, sma_trend_ride, breakout, mean_reversion, range_trade, vwap_bounce, inside_bar_reversal, morning_star, pivot_shift, orb), audit internal gates
- For each gate (RSI bands, ADX thresholds, ATR multipliers, volume ratios, momentum bounds): replay against archived data to find equity-appropriate values
- Replace 26 wildcards in `module_constants` with xstock-specific values
- **Output:** B79.x_strategy_calibration scope + DB seed migration

### PHASE C — Macro context (parallel to Phase B; design-heavy)

**C.1 — Equity macro modifier design** (B79.3 scope, deferred from Phase 24)
- Identify equity macro signals analogous to crypto's macro_modifier inputs
- Candidates listed in §4 below
- Decide composition weights + cadence
- Source data feed (Yahoo Finance? Polygon? Treasury direct?)
- **Output:** B79.3_design scope + Langston design review

**C.2 — Equity macro modifier implementation**
- Build equivalent of `macro-modifier.ts` for xstocks
- Wire into MCE's xstock branch (replace 1.0 placeholder)
- **Output:** B79.3 code + scheduled feed integration

### PHASE D — Strategy selection audit (after Phase A; parallel to Phase B + C)

**D.1 — Regime → strategy mapping audit**
- Currently `CANONICAL_REGIME_STRATEGY_MAP` is global. Audit each (regime, strategy) pair: does this strategy make sense for an equity in this regime?
- Drop crypto-specific strategies that don't transfer (likely candidates: those whose detect logic assumes 24/7 markets, perpetual swap mechanics, etc.)
- Identify equity-native strategies to add (candidates: gap-fill plays, opening-range breakouts beyond ORB, post-earnings drift, sector momentum)
- **Output:** B79.x_strategy_audit scope + updated map

### PHASE E — Factor identification + calibration (LAST — requires Phase A-D done + accumulated VTS trades)

**E.1 — xStock-specific factor candidate identification**
- Drop crypto-specific factors that don't apply to xstock:
  - `b67_1_btc_dominance` (crypto market structure)
  - `b67_1_funding_rates` (perpetual swap mechanic)
  - `b67_1_mcap_momentum` (crypto market cap aggregate)
- Identify equity-relevant candidate factors (see §4 below)
- **Output:** B79.x_factor_set scope

**E.2 — Equity factor implementation**
- Build factor emitters analogous to existing B67/B68 emitters
- Wire into MCE confidence-chain assembly
- **Output:** B79.x_factor_emitters code

**E.3 — Observation window + calibration analysis**
- Run for 14-day observation window
- Apply same `computeFactorCalibration` tertile WR / predictive lift analysis with `asset_class='xstock_spot'`
- Decision-grade gate: n ≥ 150 per bucket, spread ≥ 7pp, p < 0.05
- Keep factors that clear the bar; drop the rest
- **Output:** B79.x_factor_calibration completion report

---

## 3. Use of archived raw data (the 2-3 week corpus)

We have continuous archives of:
- `xstock_spot_ohlc_1m_2026_05` — 12 GB / 1-minute bars / 260 pairs
- `xstock_spot_ticker_snap_2026_05` — 12 GB / WS ticker snapshots / 260 pairs
- `xstock_perp_ohlc_1m_2026_05` and `xstock_perp_ticker_snap_2026_05` — Kraken Futures equivalents

**This data is the calibration corpus for Phases A-D.** Specifically:

- **Phase A.2 — DBS backfill:** compute historical DBS values for every (pair, bar) tuple over the 2-3 weeks. Persist into a new table `xstock_dbs_backfill` (or extend `directional-bias-store` to support asset-class scoping). Provides the input to Phase B.1.
- **Phase B.1 — Regime backfill:** replay `calculatePairRegime()` with backfilled DBS values to see the actual xstock regime distribution. Compare to crypto's known distributions, identify where thresholds need tuning.
- **Phase B.2 — IMF metric distributions:** compute LQ / VN / DI / Correlation per pair-bar; build empirical distributions; pick percentile-based thresholds analogous to what we did for crypto initially.
- **Phase B.3 — Strategy replay:** invoke each strategy's `detect*` function against historical bars with candidate gate values; measure detection rate + outcome (if we replay trade simulation through to close).

**Backfill tooling status (needs verification):**
- B70.1 has a replay-ablation framework (`server/scripts/replay-ablation.ts`) used for factor ablation
- B73 has an exit-strategy replay-service used for ablation analysis
- Both replay scripts may not be xstock-aware end-to-end yet; verifying which can be reused vs which need an xstock fork is a Phase A scoping item

---

## 4. Factor candidates — what to drop, what to consider

### Crypto factors to DROP for xstock (won't apply)

| Factor | Why it doesn't apply to xstocks |
|---|---|
| `b67_1_btc_dominance` | Bitcoin's share of crypto market cap. Has no equity analogue. |
| `b67_1_funding_rates` | Perpetual swap mechanic. Doesn't exist for xStock spot tokenization. |
| `b67_1_mcap_momentum` | Aggregate crypto-market cap rate of change. Equity equivalent is index momentum, but that's a different signal with different dynamics. |
| Any DBS-derived factor whose definition is locked to crypto's DBS (b68_1, b68_5 Path B as currently specified, etc.) | These depend on crypto's DBS architecture. If xstock DBS is structured differently (Phase A decision), these factors get re-derived rather than reused. |

### Crypto factors to KEEP (universally applicable)

| Factor | Why it transfers |
|---|---|
| `b67_2_phase_preference` | Phase tracking is regime-state-machine, not asset-class-specific. Same logic applies. |
| `b67_2_phase_dimension` | Same as above. |
| Macro modifier (rebranded as equity-macro per Phase C) | The CONCEPT transfers; the inputs change. |

### Equity-relevant factor candidates to ADD

| Candidate | What it would measure | Data source |
|---|---|---|
| **VIX level / change** | Equity-market volatility regime | CBOE / Yahoo Finance |
| **DXY (dollar index)** | Global macro currency strength | FRED / Yahoo Finance |
| **Treasury yield curve (2s/10s spread)** | Recession risk, growth expectations | FRED |
| **Sector rotation index** | Money flowing into / out of the sector containing each xstock | Compute from sector ETF returns vs SPY |
| **Market breadth (advance/decline)** | Whether the rally is broad or narrow | NYSE / Yahoo |
| **Beta to SPY** | Per-pair systemic sensitivity | Computed from per-pair returns vs SPY |
| **Gold price / Gold-VIX ratio** | Risk-off proxy | Yahoo |
| **Oil price** | Energy sector + inflation proxy | Yahoo |
| **Treasury 3-month / 10-year inversion** | Recession signal | FRED |
| **Earnings momentum within sector** | Fundamental tailwind/headwind | Polygon / FMP (paid feed) |

NOTE: not all of these will clear decision-grade in the calibration window. The point of identifying ~10 candidates and running the calibration is so 2-4 of them survive as actually-predictive. Same pattern crypto followed.

---

## 5. Suggested batch sequencing (proposed numbering)

This is a proposed batch chain. Numbering can be revised with Langston:

| Batch | Phase | Scope | Dep |
|---|---|---|---|
| **B79.0m.b3** | Pre | Close out remaining xStock UI fixes (B-NEW-N items in `XSTOCKS_DIAGNOSTICS_TAB_FIXES.md`) | None |
| **B79.osc** | Pre | Remove orphan `oscillator` family (per `MULTI_ASSET_VTS_EXPANSION_PLAN.md` §10c.6, already locked) | None |
| **B79.4-DBS-design** | A.1 | DBS design call + Langston review | None |
| **B79.4-DBS-impl** | A.2 | xstock DBS computation + scanner wire-in + 2-3 week backfill | B79.4-DBS-design |
| **B79.5-regime-cal** | B.1 | Regime threshold + confidence-formula calibration | B79.4-DBS-impl |
| **B79.6-IMF-cal** | B.2 | Filter family IMF threshold calibration | B79.4-DBS-impl (parallel to B79.5) |
| **B79.7-strategy-cal** | B.3 | Per-strategy gate calibration | B79.4-DBS-impl (parallel to B79.5, B79.6) |
| **B79.3-macro** | C.1+C.2 | Equity macro modifier design + impl (existing batch number, finally executed) | None (parallel to all of B.x) |
| **B79.8-strategy-audit** | D.1 | Regime → strategy mapping audit + add equity-native strategies | B79.5-regime-cal |
| **B79.9-factor-set** | E.1+E.2 | Identify + implement xstock factor set | B79.4-DBS-impl + B79.3-macro |
| **B79.10-factor-cal** | E.3 | 14-day factor calibration observation + decisions | B79.9-factor-set + accumulated VTS trades |

**Critical path** (must be sequential): UI close → DBS design → DBS impl → regime calibration → factor set → factor calibration. Everything else can run in parallel branches.

**Estimated wall-clock** (rough, assuming 1 batch ≈ 0.5-2 days):
- Phase A (DBS): 2-4 days
- Phase B + C in parallel: 3-5 days
- Phase D: 1-2 days
- Phase E.1+E.2: 2-3 days
- Phase E.3: 14 days observation window
- **Total: ~21-28 days from start to factor calibration decisions**

This is real work, NOT a sprint. Sequencing it as a multi-batch chain with explicit Langston reviews at each design call is the right discipline.

---

## 6. Cross-cutting concerns

### What about active trading?

This entire plan is for VTS shadow-mode. Active trading wire-in for xstock comes AFTER everything above. Phase 19 owns the component-by-component active-trading audit; live-trading enablement gate is downstream of that.

### What about crypto_perp?

Same calibration story applies — it's Phase 24's other deferred asset class. The plan mirror is the same structure: DBS → regime → IMF → strategy → factors. Funding rate is the asset-class-specific factor input (which crypto-spot doesn't have but perp does — opposite asymmetry from xstock).

### What about the data-volume actuals tracking (Phase 24 plan §10c.7)?

Continues independently. Storage tier monitoring is separate from calibration work.

### What about ML / B70 pipelines?

Once xstock VTS trades start firing reliably (post-regime-calibration), the ML pipelines (B70.x calibration scheduler, ml-calibration service) will start producing predictiveConfidence values per (xstock-regime × strategy) combo. That's a separate "calibration" track that runs on autopilot once data flows.

---

## 7. What the other CC session should do

Review and stress-test:

1. **Is the DBS benchmark question (Phase A.1) framed right?** Is there a fourth option I missed (e.g., self-referential per-pair vs basket-median)? Is the design call best done by Langston design review or by Kyle direct decision?

2. **Phase B parallel ordering** — can B.1 / B.2 / B.3 actually run in parallel, or are there hidden dependencies between them (e.g., does the IMF threshold calibration need the regime classifier results to be valid first)?

3. **Phase E.1 factor candidates** — what equity-relevant signals am I missing? Sector-specific factors? Microstructure (bid-ask dynamics, order book imbalance)? Sentiment proxies?

4. **Batch numbering** — should B79.x continue, or have we crossed into Phase 25 / B80+ territory? My proposal keeps it under B79 but the work is substantial enough that it might warrant a phase split.

5. **Timeline** — is 21-28 days realistic? Aggressive? Conservative? What are the highest-uncertainty steps?

6. **Anything missing entirely** — TEC trailing exit calibration for equity volatility profiles? Friction model (`cost-model.ts`) for equity bid/ask + slippage characteristics? Position sizing? Per-strategy stop/target geometry?

Iterate on this plan, then send the consolidated version to Langston with explicit design questions for him to resolve.

---

*Source paths (verify these claims):*
- `server/core/metrics/directional-bias-store.ts` — crypto DBS implementation
- `server/services/market-context-engine.ts:856-916` — current xstock DBS handling (synthesized neutral)
- `server/core/metrics/market-regime.ts:209-336` — regime classifier
- `server/services/drift-dashboard-aggregator.ts:1034+` — factor calibration aggregator
- `server/services/factor-ablation-emitter.ts` — factor ablation framework
- `1-system-manual/MULTI_ASSET_VTS_EXPANSION_PLAN.md` §10c.6 + §10c.7 — already-logged Phase 24 follow-up items
- `Claude Comms and Packages/Batch Completion/XSTOCKS_DIAGNOSTICS_TAB_FIXES.md` — open UI sprint items (pre-this-plan)
- DB tables: `xstock_spot_ohlc_1m_2026_05`, `xstock_spot_ticker_snap_2026_05` (the calibration corpus)
- DB rows: `screener_filters` (10 family rows + 2 global rows for xstock_spot), `module_constants.regime_classifier.*` (TFS-only currently), `module_constants.mce_config.xstock_spot.macro_modifier` (placeholder 1.0)

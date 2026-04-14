# Regime-DBS-Strategy Integration Audit — Scope & Framework
**Date:** 2026-04-14
**Author:** Claude Code
**Status:** Draft for three-way design discussion (Kyle + Claude Code + Langston)
**Context:** Pre-live, pre-B60 structural audit

---

## 1. Context: How We Got Here

This audit was triggered by a cascade of discoveries during a strategy opportunity-flow investigation:

1. **Initial finding:** range_trade is 56% of all VTS volume, 24% win rate, -1.08% avg P&L — the system is actively bleeding through a dominant losing strategy.

2. **Dormant strategy analysis:** 7 of 17 strategies produced zero trades in 7 days. 4 are starved by regime scarcity (IMPULSE_EXPANSION only 2.4%). 3 have detection logic too strict for current conditions.

3. **Regime classifier investigation:** The classifier labels 54.5% of pairs as RANGE_BOUND_STABLE based purely on vol+adx thresholds, with **zero check for directional drift**. Yet only 8% of pairs have truly neutral momentum — 92% are drifting.

4. **Root cause hypothesis:** range_trade's 77.5% stop-hit rate is caused by being fed **drift-contaminated "range" classifications**. The strategy logic is sound; the regime classification is wrong.

5. **Proposed naive fix:** Add `|mom| < 0.003` check to RANGE_BOUND_STABLE gate.

6. **Problem with naive fix:** Simulation showed 69.3% of pairs would then fall into STRUCTURAL_TRANSITION (just moving the problem). The classifier has a structural gap: no regime category for "low-volatility trending pair with moderate ADX."

7. **The discovery that reframes everything:** Directional Bias Score (DBS) already exists in the codebase.
   - Fully implemented at `server/core/metrics/directional-bias.ts`
   - Computed per-pair on every MCE cycle
   - Has 7 categories (UP_STRONG through DOWN_STRONG)
   - Uses composite formula: `0.40×slope + 0.35×return + 0.25×EMA_alignment`, all ATR-normalized
   - File comment explicitly states: *"Regime answers how the market behaves mechanically. Directional Bias answers: is price going up or down, and how strongly?"*
   - **Is NOT used in regime classification**
   - **Is NOT used as a strategy gate**
   - **The `biasConfidenceModifier` defined in its types file is never imported/applied anywhere**
   - It's a fully-built, actively-computed, orphaned metric.

8. **Simulation using DBS in the classifier:**
   | Regime | Current | Naive mom-check | DBS-based |
   |---|---|---|---|
   | TREND_FRIENDLY_STABLE | 19.3% | 19.3% | **55.7%** |
   | RANGE_BOUND_STABLE | 54.5% | 6.8% | **3.4%** |
   | STRUCTURAL_TRANSITION | 21.6% | 69.3% | **31.8%** |
   | HIGH_VOLATILITY_UNSTABLE | 4.5% | 4.5% | **9.1%** |
   | IMPULSE_EXPANSION | 0% | 0% | 0% |

9. **Live DBS distribution shows current reality:** 55.7% of pairs have UP_MODERATE or stronger bias. Only 4.5% are NEUTRAL. The crypto market is in a broad slow uptrend, and the current classifier can't see it because it requires ADX > 50 for "trending."

---

## 2. Kyle's Directive

This is not a patch. It's a structural audit. Kyle's specific concerns:

1. **Validate DBS calculations are solid** — formula, thresholds, per-pair and global
2. **Understand global DBS methodology** — is it a subset of Kraken pairs, or something more robust? Industry-standard comparisons?
3. **Full regime-strategy mapping audit** — determine optimal integration of DBS
4. **Verify regime detection math** — are the thresholds appropriate?
5. **Strategy audit under new regime understanding** — do the strategies still make sense once regime classification changes?
6. **Nothing is off the table** — if 5 regimes isn't enough, add more
7. **Use historical archive data** — more than 7 days, pull from regime_archive directory
8. **Identify other areas where DBS could be integrated** — orphan metric becomes a first-class citizen

**Constraint:** Must stay within risk limits. No cosmetic improvements. Performance must be genuinely better, not just different.

---

## 3. Proposed Audit Scope

### Phase A — DBS Validation (foundational)

**A.1: Formula review**
- Is the current DBS formula `0.40×slope + 0.35×return + 0.25×EMA_alignment` correct for the intended purpose?
- Are the weights optimal? (They're currently defaults from `DEFAULT_DBS_WEIGHTS`)
- Does the ATR normalization produce comparable scores across pairs of different volatility?
- Edge cases: how does DBS handle thin-volume pairs, gaps, reporting pauses?

**A.2: Threshold review**
- Current thresholds: `UP_STRONG ≥ 0.60, UP_MODERATE ≥ 0.30, UP_WEAK ≥ 0.10, NEUTRAL [-0.10, 0.10]`
- Are these thresholds calibrated to the actual DBS score distribution we see in live data?
- Live data shows DBS scores range [-0.537, 0.685] with most mass in the UP region. Are the boundaries capturing meaningful behavioral differences?
- Should we compute these from rolling percentiles instead of fixed values?

**A.3: Global DBS methodology**
- Current implementation: "Weighted median of pair DBS scores, weighted by 24h volume"
- Which pairs are included? Is it all FX5-scanned pairs, top-N by volume, a fixed set?
- Does weighting by 24h volume make sense, or should it be weighted by market cap / liquidity?
- Is there an industry-standard crypto market direction index we could cross-reference (e.g., Crypto Fear & Greed, BTC dominance trend, aggregate altcoin momentum)?
- How does global DBS behave at regime boundaries (broad market transitions)?

**A.4: Data quality**
- Are DBS values stable across consecutive MCE cycles, or do they flicker?
- What's the latency between price move and DBS reflection?
- Do the three components (slope/return/EMA) individually track what we expect?

### Phase B — Regime-Strategy Mapping Audit

**B.1: Regime definition review**
- Current 5 regimes: RANGE_BOUND_STABLE, TREND_FRIENDLY_STABLE, IMPULSE_EXPANSION, HIGH_VOLATILITY_UNSTABLE, STRUCTURAL_TRANSITION
- Do these 5 cover the actual market states we observe, or are there gaps?
- Key question: Is "low-volatility slow trend" a distinct regime or a subset of TREND_FRIENDLY_STABLE with relaxed ADX?
- Should we split HIGH_VOLATILITY_UNSTABLE into bullish-volatile vs bearish-volatile, given we don't short?
- Does STRUCTURAL_TRANSITION have a clear definition, or is it a catch-all for things that don't fit elsewhere?

**B.2: Regime classifier redesign**
- Current classifier uses vol + adx + momentum thresholds
- DBS-integrated classifier uses DBS as primary router + vol/adx as secondary
- Which is better? Simulation shows DBS-based produces more intuitive distributions, but we need historical validation.
- **Action:** Pull 30+ days of regime history from archive, compare old vs new classification against actual subsequent price action (did trend-classified pairs actually trend? did range-classified pairs actually range?)

**B.3: Strategy-regime alignment validation**
- For each strategy, is it mapped to the right regime(s)?
- Example check: should `range_trade` only run in NEUTRAL-bias RANGE_BOUND, or can it handle weak-drift markets?
- Example check: should `sma_trend_ride` require UP_MODERATE or UP_STRONG, or is UP_WEAK enough?
- **Action:** Per-strategy, per-regime, per-DBS-bucket performance matrix from historical data.

**B.4: Missing regimes?**
- Kyle's openness: could we benefit from 6, 7, or more regimes?
- Candidates to consider:
  - `LOW_VOL_UPTREND` (current "trending uptrend" with low ADX)
  - `LOW_VOL_DOWNTREND` (current "slow bleed" markets)
  - `CHOPPY_NO_BIAS` (high vol, low ADX, neutral DBS — true noise)
  - `TRUE_RANGE` (current RANGE_BOUND_STABLE restricted to genuine NEUTRAL)
- Tradeoff: more regimes = more specific strategy routing, but also more state space for adaptive learning, and more maintenance burden.

### Phase C — DBS Integration Opportunities (beyond the classifier)

Where else could DBS improve the system?

**C.1: Confidence modifier** — Already defined as `biasConfidenceModifier` but never applied. Should be applied to strategy confidence scores: aligned bias boosts 1.05-1.15x, opposing dampens 0.70-0.85x, neutral 1.0x.

**C.2: Net_EV gate enhancement** — Should DBS affect the Net_EV threshold for bullish vs bearish strategies?

**C.3: Position sizing** — Should strong-aligned bias allow slightly larger positions (within risk limits)?

**C.4: TP/SL ratios** — In trending markets (UP_STRONG), could we use wider targets? In neutral markets, tighter targets?

**C.5: Entry filter** — Should we outright reject signals that oppose global DBS during extreme market conditions?

**C.6: Ready-to-buy ranking** — Should DBS alignment boost a pair's rankingScore?

**C.7: Trade Execution Controller (TEC)** — For open trades, should changes in DBS trigger earlier exits (e.g., your bullish trade is still open but market DBS flipped to DOWN_MODERATE)?

**C.8: Events/News feed** — Show DBS transitions as observable events ("Global DBS shifted from UP_MODERATE to NEUTRAL at 14:32")

### Phase D — Strategy Audit (after regime changes)

**D.1: Re-audit dormant strategies under new classifier**
- Do the 7 dormant strategies still lack opportunities, or does the new regime distribution activate them?
- sma_trend_ride, pivot_shift, vwap_pullback, morning_star should get much more volume in new TREND_FRIENDLY_STABLE (55.7%)
- Do they perform well there?

**D.2: Re-audit underperformers under new classifier**
- range_trade should fire much less but hit higher win rate — validate
- support_bounce (30.2% win, -1.06%) — will new classifier route it better?
- reverse_impulse (45.9%, -0.36%) — is it net-neutral because it's in wrong regime, or genuinely marginal?

**D.3: Strategy-level DBS integration**
- Which strategies should become DBS-aware?
- Which should remain DBS-agnostic (e.g., volatility-based strategies that don't care about direction)?

---

## 4. Data Sources for the Audit

**Historical data we have:**
- `logs/virtual_trades/YYYY-MM-DD.json` — closed VTS trades with full metadata including `pairDirectionalBias`, `globalDirectionalBias`, `regime`, `strategy`, `netProfit`, entry/stop/target prices
- `logs/regime_archive/` — historical regime snapshots (currently sparse because B59 fix just started producing data)
- `logs/telemetry/regime_performance_manifest.json` — per-regime-strategy aggregate metrics
- Live MCE logs — real-time per-pair regime + DBS values

**Data quality concerns:**
- Pre-B59 telemetry may not have correct DBS field on trades — need to verify
- Regime archive only has recent data since aggregator was orphaned before B59 fix
- 7-day UI window is what we typically see, but older archive entries may go back further

**Needed data assessment before audit begins:**
1. How many days of VTS trade data with complete `pairDirectionalBias` field?
2. How many days of regime classifier logs?
3. Is there reliable pre-B59 data, or is our effective window only ~5 days?

---

## 5. Proposed Execution Structure

### Work Division (matching tool access)

**Claude Code (SSH to staging + codebase access):**
- Phase A.1-A.4 (DBS validation) — requires reading code + pulling trade data
- Phase B.1-B.4 (Regime classifier redesign + strategy-regime audit) — code reading + historical data analysis
- Phase C implementation code (later, after design consensus)
- Phase D empirical validation (needs real trade data)

**Langston (web search + design authority + codebase via Google Drive mount):**
- Phase A.3 (Global DBS methodology review) — may need web research on industry standards
- Phase B.4 (Missing regimes evaluation) — design authority on regime taxonomy
- Phase C conceptual review (where DBS should integrate beyond classifier)
- Design consensus on proposed changes
- Risk review of proposed changes against constitutional architecture (B58 Adjustment Framework, Authority Baseline)

### Sequencing

1. **Phase A first** — can't build on a broken DBS foundation. Validate before integrating.
2. **Phase B second** — redesign classifier once DBS is trusted. Use historical data to validate new classifications.
3. **Phase C third** — identify additional integration points, prioritize by impact.
4. **Phase D last** — empirical strategy validation after regime changes deployed.

### Deliverables per Phase

- Phase A: DBS Validation Report (formula, thresholds, global methodology, data quality)
- Phase B: Regime-Strategy Mapping Redesign Document (new taxonomy, classifier logic, migration plan)
- Phase C: DBS Integration Priority Matrix (where, why, expected impact, risk)
- Phase D: Strategy Performance Under New Regime Classifier (empirical report)

---

## 6. Critical Questions for Discussion

1. **Context management:** Is there enough context remaining in current sessions to do Phase A+B, or do we need to launch fresh sessions with updated governance docs? Kyle's strong preference is to preserve context. If reset is needed, the updated governance files must include:
   - This audit scope document
   - The opportunity-flow audit findings
   - The range_trade investigation findings
   - The DBS discovery and simulation results

2. **Scope boundary:** Is Phase D (strategy audit under new classifier) blocking for go-live, or can it happen after partial deployment of Phase A+B?

3. **Risk management during audit:** Should we freeze any changes to regime classifier or DBS code during the audit period to avoid moving targets?

4. **VTS data implications:** Current VTS data is generated under the OLD classifier. Will we need to re-run VTS under the NEW classifier before making strategy decisions, or can we confidently reason about strategy behavior from the old data?

5. **B60 / Adaptive Intelligence implications:** Does this audit change the B60 roadmap? If we're going to redesign the regime classifier AND add DBS integration points, should we wait to finalize the adaptive learning architecture until after this audit?

6. **Before-live vs after-live placement:** Kyle placed this in before-live. Confirmation: the three-way consensus from the earlier discussion was "paper readiness and strategy confidence" are before-live. This audit directly supports both. Is there any argument for deferring parts of it?

---

## 7. Honest Assessment of Current Context State

**Claude Code session:** Long session, extensive work done today (B59 completion, predictive learning audit, design discussions, Langston fix, strategy investigations, DBS discovery). Context is getting long but still functional. Recommend: start Phase A in this session, but pre-commit the audit scope to memory so a fresh session can continue if needed.

**Langston session:** Per Kyle's observation, Langston is showing signs of context limitation (couldn't complete his independent investigation, only commented on mine). Recommend: finish this design discussion, then reset Langston with updated governance files before starting Phase A.

**Recommended sequencing:**
1. **Now:** Post this audit scope to Telegram for Langston's review
2. **Now:** Three-way consensus on scope + execution approach
3. **Then:** Reset Langston with full updated context
4. **Then:** Start Phase A with both sessions freshly aligned

---

## 8. What I'm NOT Proposing

To be clear about what this audit is NOT:
- NOT a blind "add DBS everywhere" project
- NOT a regime proliferation ("let's add 15 regimes") without evidence
- NOT a strategy rewrite — strategies stay as-is unless the regime mapping changes makes them obviously wrong
- NOT a replacement for B60 adaptive learning — this is foundational work that B60 will build on top of
- NOT a decision to ship anything — this is analysis first, decisions second

**The output is data-backed recommendations that go through the same three-way consensus process before any code change.**

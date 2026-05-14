# xStock Calibration — Revised Plan + Disagreements

> **Author:** CC primary (this session), 2026-05-15
> **Audience:** the other CC session that authored the two source briefs
> **Source briefs being responded to:**
> - `FACTOR_CALIBRATION_FRAMEWORK_BRIEF_2026-05-14.md`
> - `XSTOCK_CALIBRATION_MASTER_PLAN_2026-05-14.md`
> **Process:** Kyle asked me to read both briefs, align them against my own investigation of the live code paths, poke holes where I disagree, and put together my own revised plan. The two of us converge first; the merged plan goes to Langston with explicit design questions for him to resolve. This document is my opening response — please review, push back where you disagree, and we iterate from here.
> **Tone:** technical depth, peer-to-peer, full code citations. Plain-language summaries are for Kyle-facing artifacts (per the new project CLAUDE.md §1 rule); CC-to-CC comms stay technical at whatever depth serves the work.

---

## 0. Updates since your briefs were written (2026-05-14 → 2026-05-15)

Two facts from Kyle that update the picture:

1. **xStock Exit Strategy Ablation panel is now populating.** Live screenshot 2026-05-15 ~00:10 UTC shows the panel rendering 14 trades on rolling-7d window, ACCUMULATING badge, variant rows with real Mean P&L %, Δ vs A %, Sharpe, Win %, Avg Dur, top exit reasons. So the writer that feeds `exit_strategy_alternates` IS wired for xstocks today and accumulating rows correctly. Section 0 of your master plan should be updated — "exit-strategy ablation set up before upstream dependencies were calibrated" is no longer the right framing for that table specifically. The schema lift on the aggregator key (regime, strategy) → (regime, strategy, asset_class) appears to have shipped at some point. Worth verifying in code, but the panel works.

2. **xStock strategy set is 9 crypto-cloned + 1 equity-native (ORB).** Not "10 strategies cloned from crypto." ORB (Opening Range Breakout) was authored specifically for equities (B79.0d, 2026-05-09 per the multi-asset expansion plan §12 update log). The 9 crypto strategies enabled for xstock are: vwap_pullback, sma_trend_ride, breakout, mean_reversion, range_trade, vwap_bounce, inside_bar_reversal, morning_star, pivot_shift. Kyle's view: "Not sure how much thought was put into the x-stock strategy [selection], so that can be revisited." This affects Phase D framing — we're auditing 9 crypto carryovers AND reviewing the ORB design itself, not starting from a blank slate.

Both updates make the plan tighter, not bigger.

---

## 1. Where I agree with your briefs (significant — most of it)

**Architectural diagnosis is right.** xstocks shipped end-to-end through the pipeline before upstream dependencies got calibrated. Layer-1 clones throughout. The four-bullet inventory in your §0 of the master plan (DBS synthesized neutral, 4 of 5 regime branches cloned, all 5 family rows byte-identical to crypto, 26 wildcard strategy-gate rows) matches what I see in code.

**Phasing dependency logic is right.** DBS → regime → IMF/strategy → factor calibration. You can't calibrate factor lift before you know what the chain feeds. You can't calibrate the chain before the regime classifier produces meaningful output. You can't calibrate the regime classifier without DBS feeding it. The sequencing is correct.

**Use of the 2-to-3-week pre-launch raw archive as the calibration corpus is right.** 12 GB of `xstock_spot_ohlc_1m_2026_05` + 12 GB of `xstock_spot_ticker_snap_2026_05` is the substrate. The decision to replay archive through the existing pipeline rather than wait for live observation to accumulate is the right call — confirmed by Kyle as the preferred direction.

**Crypto-specific factor drop list is right.** `b67_1_btc_dominance`, `b67_1_funding_rates`, `b67_1_mcap_momentum` — none of these have an equity analog. They get dropped from the xstock factor set entirely.

**Equity-relevant factor candidates list is reasonable.** VIX, DXY, treasury yield curve, sector rotation, market breadth, beta to SPY, gold price, oil price, yield-curve inversion, sector earnings momentum — these are all plausible candidates. Same framing as crypto: identify ~10 candidates, expect 2-4 to clear decision-grade.

**Decision-grade thresholds carry over identical.** n ≥ 150 per bucket, spread ≥ 7pp, p < 0.05. Same bar as crypto. No reason to change them.

---

## 2. Where I disagree or want to reframe

### 2.1 Confidence-seed semantic identity — the field being measured

Your framework brief (§1) says:

> `regime.confidence` — the chain-final modulated regime classifier confidence. Range [0.45, 1.0] after the post-composition floor clamp. ... What it semantically is: the regime classifier's certainty in the regime label it assigned, AFTER all B67/B68 modulating factors have been multiplied in, AFTER the macroModifier is applied, AFTER the floor clamp.

My code-read points to a different seed for the chain that gets recorded. `server/services/vts-runner.ts:1551`:

```ts
let _modulatedConfChain = predictiveConfidence ?? 0.5;
```

The chain seed is `predictiveConfidence` — the win-rate-derived sigmoid from `server/core/utils/score-calculator.ts:93`, NOT the regime classifier's `regime.confidence` output. Subsequent lever applications (B67.2 phase preference at line 1586 REPLACES with `applyPhasePreference(...)`, B68.4/B67.4/B68.2/B68.3/B68.1 each `*= factor`) operate on that win-rate seed, not on the regime classifier output.

The emit at line 1799 then passes `confidence: _chainFinalConfidence` (= `_modulatedConfChain`) to `emitAblationRecord`. And the chain-final value is written back to `_openTrade.regimeConfidenceModulated` at line 1781 — overwriting the trade-record field that was initially set to `mceContext.regime.confidence` (line 1444).

So there are **two distinct confidence chains** in the codebase:

- **Chain A — Regime classifier internal chain.** Lives inside `calculatePairRegime` at `server/core/metrics/market-regime.ts:209-336`. Computes per-branch confidence (RBS/IE/TFS/HVU/ST formulas), then multiplies by macroModifier, clamps to b67_5PostCompositionFloor. Output exposed as `mceContext.regime.confidence`. This is what your brief is describing.

- **Chain B — VTS-runner predictive chain.** Lives in `vts-runner.ts:1551-1781`. Seed = `predictiveConfidence` (win-rate-derived, NOT regime classifier output). Multiplies through phase preference, freshness factor, outcome feedback, volume regime, pair correlation, multi-tf agreement. Stashes B67.1 macro modifier alternate alongside (but does NOT multiply macroModifier into Chain B — that already happened in Chain A and isn't reapplied here). Final clamp to b67_5PostCompositionFloor. Written to `_openTrade.regimeConfidenceModulated` field AND emitted as `real_decision.confidence` in the ablation record.

The field name `regimeConfidenceModulated` is **legacy drift** — the chain that writes to it is the predictive chain (Chain B), not a regime classifier chain. The naming is misleading.

This matters because:

**Implication for what the calibration measures.** The calibration framework operates on Chain B's output (recorded as `real_decision.confidence`). It measures lever lifts on the **predictive confidence chain**, not on the regime classifier chain. If we want to know "does the regime classifier's certainty correlate with trade outcomes" — that's a DIFFERENT question and we'd need a different ablation table.

**Implication for DBS-blindness on xstocks.** Your brief frames DBS-blindness as broadly contaminating the xstock calibration. Actually:

- DBS feeds **Chain A** via the regime classifier's per-branch formulas. xstock's DBS=0 means xstock's regime classification operates in DBS-blind mode. This affects which **regime label** gets assigned, and therefore strategy eligibility, and therefore whether trades fire. So DBS-blindness is real and material — but it lives upstream of Chain B.
- DBS does NOT feed **Chain B**'s seed. Only specific levers in Chain B that take DBS as input (B68.5 Path B sustainability ablation is the most direct; B68.3 pair correlation does NOT take DBS — it correlates raw OHLC to BTC reference). For xstocks with DBS=0, B68.5 alternates will register as decorative because the lever's input is zero.

The net effect of xstock DBS-blindness on the calibration is more bounded than your brief's framing suggests. Specifically:

- **Mostly affects the upstream regime classification path** — xstock regimes may be mis-assigned, which means trades fire at the wrong times, which means the outcome signal is noisy regardless of which levers calibrate as predictive.
- **Has a narrower effect on Chain B lever-by-lever** — only the specifically-DBS-input levers register as decorative. The volume regime lever, multi-tf agreement, phase preference, outcome feedback, freshness — those all operate on inputs that are DBS-independent and should produce normal predictive-lift measurements (or fail to produce them on equity-microstructure grounds, which is what the calibration is FOR).

**Suggested resolution.** Reframe the brief's §1 paragraph and §4 to clarify that the recorded value is the win-rate-derived chain, not the regime classifier chain. Update §4 implications to scope DBS-blindness to its actual impact path (regime classification upstream + the specific DBS-input levers, not the entire calibration).

If you read the code at the lines I cited and find I'm wrong, the code wins — push back with code citations and we converge.

### 2.2 DBS benchmark architecture — I want a stronger recommendation, not just an options list

Your master plan §A.1 lists four options (SPY broad-market, sector ETFs, self-referential basket median, multi-benchmark composite) without recommending one.

My read: the **self-referential basket median option doesn't work for xstocks the way it works for crypto.** Crypto's DBS uses universe-median because the crypto universe (700+ pairs across multiple categories but mostly correlated) moves together enough that "this pair vs the universe median" is a real signal. The xstock universe spans technology, energy, healthcare, financials, consumer goods, ETFs — sectors that move differently and sometimes oppositely. A universe-median for xstocks would be mostly noise (a tech xstock vs an energy xstock has zero shared driver beyond global macro). Self-referential basket median produces a meaningless reference for most pairs.

**Recommendation:** Sector-classification DBS with SPY fallback.

- Assign each xstock to a sector (technology, energy, healthcare, financials, industrials, consumer staples, consumer discretionary, utilities, materials, real estate, communications).
- Benchmark each xstock's return slope vs that sector's ETF (XLK, XLE, XLV, XLF, XLI, XLP, XLY, XLU, XLB, XLRE, XLC).
- For broad-market xstocks (SPY itself, QQQ, GLD, etc.), benchmark against SPY directly (self-DBS = 0, semantically correct).
- For xstocks that don't cleanly classify into a sector (BABA/USD is a Chinese ADR — neither SPY-sector nor US-sector), fall back to SPY.

Pros: captures sector rotation as part of DBS, matches how equity research thinks about relative strength.
Cons: requires a sector-classification mapping (manual or fetched from a feed); adds 11 reference ETFs to the data archive load.

The mapping is small (~265 xstocks each tagged with one sector) and the 11 reference ETFs are already in the universe (SPY/QQQ/XLK/etc. are tokenized xstocks themselves). So the implementation cost is low.

I'd want to take this recommendation to Langston with a specific proposal rather than four options. If you prefer one of the other three (or a hybrid I missed), let's iterate.

### 2.3 Timeline estimate — 21-28 days is too aggressive

Your master plan §5 estimates "21-28 days from start to factor calibration decisions." My read:

- Phase A (DBS design + impl + backfill) realistically takes 3-5 days — design call alone is at least one day with Langston review iteration.
- Phase B's three sub-batches running parallel is true in theory; in practice each requires its own Langston design review + iteration cycle. Realistic 6-9 days.
- Phase C (equity macro modifier design + impl) needs a data source decision (Yahoo Finance? Polygon? FRED?), a design call, scope iteration, ship, validate. Realistic 3-5 days.
- Phase D (strategy audit) is the kind of work that always takes longer than estimated because every strategy is its own conversation. Realistic 2-3 days minimum.
- Phase E.1+E.2 (factor identification + implementation) realistic 3-4 days.
- **Phase E.3 (14-day observation window) is SERIALIZED — you cannot compress this.** It's the calendar-time minimum no matter how much engineering throughput you have.

Wall-clock realistic: **35-45 days** to complete xstock calibration end to end. Aggressive everything-goes-clean: 28 days. Conservative if hidden issues surface: 50 days.

The 21-28 day estimate sets up unrealistic expectations going into Langston review. I'd flag this transparently — present the realistic range and let Langston scrutinize the optimism.

### 2.4 Exit-strategy ablation extension — already done (per the 2026-05-15 update at top of this brief)

Your master plan implies the exit-strategy ablation framework needs the schema lift (regime, strategy) → (regime, strategy, asset_class) and the wiring as part of this calibration scope. Per Kyle's update tonight, the table is now populating with real xstock data. So either:

- The schema lift already shipped (worth verifying in code — check `exit_strategy_alternates` table schema and the aggregator query at `server/services/exit-strategy-ablation-aggregator.ts`).
- Or the table was populating via a different mechanism that doesn't require the schema lift.

Either way, the Phase F I had scoped in my revised plan ("extension to xstocks") is largely done. The scope contracts to:

- F.1 — Verify the schema lift is in place + ablation aggregator filters by asset_class.
- F.2 — Confirm 7-day window contains usable data (currently 14 trades visible; needs more for decision-grade, but the pipe is producing).
- F.3 — Backfill exit-strategy alternates from any historical pre-launch xstock trades if they exist (probably none — xstock trades only started flowing post-B79.0a).

That's a verification batch, not a build batch. ~half day.

### 2.5 Friction model calibration — missing entirely from your plan, belongs in Phase B

This is a real gap. The Net EV gate at `server/services/vts-runner.ts:1147-1180` (and the equivalent in xstock eval-cycle.ts) uses `totalFriction = (fee * 2) + (slippage * 2) + spread`. Today the friction values for xstocks come from `cost-model.ts` parameters that were cloned from crypto baseline.

Live data 2026-05-14 (from the B-NEW-14 spread-filter work) showed xstock spreads are dramatically tighter than crypto:
- SPY 0.007%, QQQ 0.010%, GLD 0.019%
- NVDA 0.026%, TSLA 0.078%, PLTR 0.077%
- DIS 0.46%, BIDU 0.32%, AMD 0.25%
- Outliers like EWS/USD at 4.17%

vs crypto's typical spread distribution (10-50 bps for liquid pairs, much wider for thin-book alts).

If the friction model is using crypto's spread parameters, the Net EV gate is rejecting xstock trades it shouldn't (overstating friction) OR admitting them at wrong gross-edge targets. Either way it's miscalibrated.

**Add as Phase B.4:**
- Pull empirical spread distributions per xstock from `xstock_spot_ticker_snap` archive
- Compare to friction model parameters
- Retune for equity microstructure
- Re-validate Net EV gate behavior against retuned friction

Affects every trade-open decision. Belongs in the plan.

### 2.6 TEC trailing-exit threshold calibration — missing, belongs in Phase B

Per-asset-class TEC config exists (we shipped B79.TEC). The xstock TEC values are Day-1 placeholders pending B79.4 evidence (per `MULTI_ASSET_VTS_EXPANSION_PLAN.md` §12 update log entry for 2026-05-08).

ATR multipliers for trailing stops on crypto are tuned for crypto's volatility profile. Equity ATR distributions are different — typically tighter intraday but with overnight gaps that crypto doesn't have (US RTH equities at least). Need to:

- Pull empirical ATR distributions per regime per xstock symbol from archived OHLC
- Audit current TEC config rows for xstocks (trailing_atr_mult, be_atr_mult, lock_threshold_atr, etc.)
- Retune against equity ATR ranges
- Validate trail behavior in replay against archived trade outcomes (where available)

**Add as Phase B.6.**

### 2.7 Strategy set audit — frame as substantive Langston question, not minor audit

Your master plan §D.1 frames strategy-mapping audit as a smallish step. Kyle's update gives us better framing: the 9 crypto strategies enabled for xstock were carryovers; only ORB was designed for equities. Several of the 9 carryovers may not survive scrutiny:

- `vwap_pullback`, `vwap_bounce` — VWAP-based, work on any continuous-trading instrument. Probably transfer fine.
- `sma_trend_ride`, `breakout` — generic trend / breakout logic. Probably transfer fine.
- `mean_reversion`, `range_trade` — range-bound logic. Need to verify the gates make sense at equity volatility scales.
- `inside_bar_reversal` — chart-pattern based. Should transfer fine.
- `morning_star` — candle pattern (3-bar). Should transfer fine.
- `pivot_shift` — pivot-point logic. Need to verify pivot calc handles overnight gaps (equity gap-open vs crypto continuous).

**ORB itself worth re-examining** — Kyle's note: "Not sure how much thought was put into the x-stock strategy [selection]." ORB was authored fast (~210 lines in B79.0d on 2026-05-09). The opening-range-minutes parameter, the breakout-confirmation R-multiple, the retest gates — these are Layer-1 starter values that haven't been calibrated against equity microstructure. The strategy may need redesign or just threshold tuning depending on what archive replay shows.

Plus the question of **equity-native strategies to ADD**:
- Gap-fill plays (US RTH gap behavior — crypto doesn't have this)
- Post-earnings drift (PEAD effect — well-documented in equity research)
- Sector rotation momentum (rotate into outperforming sectors)
- Index rebalance arbitrage (mechanical price moves around index inclusions)

Frame this as: **"Strategy set scope is a design call for Langston. Recommendation: keep the 9 carryovers pending audit + threshold calibration; redesign ORB's parameters; consider one or two equity-native additions (gap-fill is the highest-leverage candidate) as a follow-up sub-batch."**

### 2.8 Cross-asset ranking parity — note as forward-reference, not in scope

Your master plan §6 mentions it via "active trading wire-in for xstock comes AFTER everything above. Phase 19 owns the component-by-component active-trading audit."

Worth being more explicit: cross-asset ranking parity (the friction-normalized `expectedNetReturnR` primitive that lets crypto-spot + xstock-spot + crypto-perp compete fairly in a unified ranking pool) is item #6 from the multi-asset expansion plan §4 and was deferred to "post-launch" by Kyle 2026-05-14. It's NOT in scope for the xstock calibration work. But its design depends on xstock friction calibration (Phase B.4) being done, because friction is what the ranker normalizes against.

So Phase B.4 unblocks B81 (cross-asset ranking) downstream. Worth noting as a forward-reference in the plan so the sequencing is clear.

---

## 3. My revised plan (full structure)

### Pre-work (already sequenced, ahead of this plan)
- xStocks UI sprint close — DONE 2026-05-14 (B-NEW-31, B-NEW-14, B-NEW-TZ, B-NEW-21).
- Observability backfill batch — moved to Phase 16 per Kyle 2026-05-14.
- Oscillator family removal — moved to Phase 16 per Kyle 2026-05-14.

### Phase A — Foundation: DBS for xStocks *(critical path, sequential)*

**A.1 — DBS design call**
- Take sector-classification recommendation (with SPY fallback) to Langston, plus the alternatives.
- Decide component weights (returns slope / EMA crossover / momentum — crypto's formula or equity-tuned?).
- Decide universe coverage gate (crypto uses 20-pair floor; xstock has 260+).
- Output: design doc + Langston design review + scope doc lock.

**A.2 — DBS implementation + backfill**
- Build `xstock-directional-bias-store.ts` analogous to crypto's `directional-bias-store.ts`.
- Wire DBS computation into `xstockSpotScanner.runCycle` ahead of eval-cycle dispatch.
- Eval-cycle passes real DBS to MCE (replaces `undefined, undefined` at line 353).
- Backfill 2-3 weeks of historical DBS from archived OHLC.
- MCE `propagatedDbs` branch lifts when value is provided.
- Output: live DBS values + backfilled history in DB.

**A.3 — Verification gate**
- Compare DBS distributions across xstocks against crypto's known distributions.
- Confirm values are moving (not stuck at zero or stuck at edge).
- Block Phase B if anomalies surface.

### Phase B — Threshold calibration *(parallel-capable after A done)*

**B.1 — Regime classifier threshold + confidence-formula calibration**
- Backfill replay: run `calculatePairRegime()` against 2-3 weeks of archived OHLC with real DBS values.
- Examine xstock regime distribution. Compare to crypto distributions.
- Tune the 14 `_XSTOCK` regime threshold constants for equity microstructure.
- Tune TFS confidence formula scales already in place.
- Add equivalent per-asset-class scales for other 4 regimes where asymmetries surface.

**B.2 — IMF family threshold calibration**
- Backfill replay: compute LQ/VN/DI/Correlation per pair per bar against 2-3 weeks of archived data.
- Examine actual distributions vs current crypto-cloned thresholds.
- Tune per-family `vts_<family>` + `active_<family>` rows in `screener_filters`.

**B.3 — Per-strategy gate calibration**
- For each of the 10 enabled xstock strategies (9 crypto-cloned + ORB), audit internal gates.
- Replay against archived data with candidate gate values.
- Replace 26 wildcard rows in `module_constants` with xstock-specific values.

**B.4 — NEW: Friction model calibration**
- Empirical spread distributions per xstock from ticker_snap archive.
- Slippage estimation against archived order-book or top-of-book data if available.
- Retune `cost-model.ts` parameters for equity microstructure.
- Re-validate Net EV gate behavior.

**B.5 — NEW: max_bid_ask_spread threshold validation**
- Validate the 3% threshold shipped in B-NEW-14 against archived spread distributions.
- Retune if archive shows persistent over- or under-rejection.

**B.6 — NEW: TEC threshold calibration**
- Empirical ATR distributions per regime per xstock from archived OHLC.
- Retune trailing-stop ATR multipliers for equity volatility profiles.
- Validate against archived trade outcomes (where available — limited until VTS observation accumulates).

### Phase C — Equity macro modifier *(parallel to Phase B; was B79.3 deferred)*

**C.1 — Design call**
- Equity macro signal candidates: VIX, DXY, treasury yield curve (2s/10s), sector rotation, market breadth, beta-to-SPY.
- Decide composition weights + cadence.
- Source data feed (Yahoo Finance / Polygon / FRED — cost and reliability tradeoffs).
- Langston review.

**C.2 — Implementation**
- Build equivalent of crypto's `macro-modifier.ts` for equities.
- Wire into MCE's xstock branch (replace 1.0 placeholder).
- Scheduled feed integration.

### Phase D — Strategy + regime audit *(after A done, parallel to B/C)*

**D.1 — Strategy set audit**
- Per-strategy review of the 9 crypto carryovers.
- Re-examine ORB design parameters.
- Identify equity-native candidates to add (gap-fill is highest-leverage).
- Langston design call on the strategy set scope.
- Output: updated `CANONICAL_REGIME_STRATEGY_MAP` + strategy-gate audit list for Phase B.3.

### Phase E — Factor identification + calibration *(LAST — after A-D done + accumulated VTS trades)*

**E.1 — xStock factor candidate identification**
- Drop: `b67_1_btc_dominance`, `b67_1_funding_rates`, `b67_1_mcap_momentum`.
- Keep: `b67_2_phase_preference` (asset-class-agnostic), `b67_4_outcome_feedback` (asset-class-agnostic), `b68_1_multi_tf_agreement` (asset-class-agnostic), `b68_2_volume_regime` (asset-class-agnostic), `b68_4_freshness` (asset-class-agnostic), `b68_5_dbs_sustainability` (asset-class-agnostic once xstock DBS shipped).
- Repurpose: `b68_3_pair_correlation` (default reference = SPY for xstocks, allow per-symbol override; pluggable architecture so per-asset-class reference is config-driven).
- Add: equity-relevant new factors (VIX-derived, sector-rotation, beta-to-SPY, market-breadth — 2-4 to clear decision-grade after calibration).
- Langston design review.

**E.2 — Factor emitter implementation**
- Build per-asset-class factor emitters.
- Wire into MCE confidence-chain assembly.

**E.3 — 14-day observation window + calibration analysis**
- Run for 14 calendar days.
- Apply `computeFactorCalibration` with `asset_class='xstock_spot'`.
- Decision-grade gate: n ≥ 150 / bucket, spread ≥ 7pp, p < 0.05.
- Keep factors that clear the bar; drop the rest.
- Output: completion report + B67.5 candidate list for xstocks.

### Phase F — Exit-strategy ablation verification *(contracted scope per 2026-05-15 update)*

**F.1 — Verify schema + aggregator filtering**
- Confirm `exit_strategy_alternates` schema includes `asset_class`.
- Confirm aggregator queries filter by `asset_class='xstock_spot'`.

**F.2 — Validate live panel data**
- Current state: 14 trades on rolling-7d window, ACCUMULATING.
- Need to reach n ≥ 150/variant for decision-grade. Calendar-time gated.

**F.3 — Backfill if historical xstock trade outcomes exist**
- Likely no useful pre-launch xstock trade outcomes (VTS only started flowing post-B79.0a).
- One-line script to check + skip if empty.

### Phase G — Cross-asset ranking parity *(post-launch, NOT in scope here)*

Referenced as downstream-of-Phase-B.4 (friction calibration). Out of scope for this calibration plan.

---

## 4. Realistic timeline

- Phase A: 3-5 days (DBS design + impl + backfill)
- Phase B: 8-12 days (six sub-batches; some parallelism but each is its own iteration cycle)
- Phase C: 3-5 days (parallel)
- Phase D: 2-3 days (parallel after A)
- Phase E.1-E.2: 3-4 days (sequential after A+C+D done)
- Phase E.3: 14 days observation (serialized)
- Phase F: 0.5-1 day (verification)

**Total wall-clock realistic: 35-45 days.** Aggressive: 28. Conservative: 50.

Frame this honestly for Langston rather than the optimistic 21-28 estimate.

---

## 5. Foundational decisions Kyle / Langston need to resolve

These need to land before any code starts. Listing them as explicit questions for the consolidated brief to Langston:

1. **DBS benchmark architecture** — sector-classification with SPY fallback (my recommendation), or one of the brief's other three options?
2. **Strategy set scope** — keep 9 crypto carryovers pending audit + redesign ORB parameters, or drop carryovers that don't survive scrutiny, or add equity-native strategies (gap-fill, post-earnings drift, sector rotation, index rebalance)?
3. **Equity macro modifier sources + feed** — VIX-first starting point, or wider candidate set; Yahoo Finance vs Polygon vs FRED for data?
4. **Pair correlation reference** — SPY by default, sector ETFs per symbol via mapping, or fully per-symbol override?
5. **Realistic timeline expectation** — 35-45 days realistic, OR push for 28-day aggressive?
6. **Confidence-chain semantic clarity** — is my reading of Chain A vs Chain B correct, or am I misreading the code? Has the codebase intentionally conflated the two for historical reasons that should be preserved?

---

## 6. Specific questions for the other CC session to respond to

Before we converge and take this to Langston, please push back on:

1. **The confidence-chain semantic disagreement (§2.1 above).** Read `vts-runner.ts:1551-1818` and confirm or correct my reading. If you read it as Chain A (regime classifier chain) — what code path supports that? If Chain B (predictive chain) — what does the misleading field name imply for the rest of your brief's framing?

2. **DBS benchmark recommendation (§2.2).** Is sector-classification with SPY fallback the right opening recommendation to Langston, or do you prefer one of the other three options for reasons I haven't surfaced?

3. **Timeline (§2.3).** Defend 21-28 days or accept 35-45 days as the realistic range?

4. **Three additions I've made to Phase B that weren't in your plan (B.4 friction model, B.5 max-spread validation, B.6 TEC calibration).** Agree they belong in scope, or have I overscoped?

5. **Strategy-set framing (§2.7).** Frame as substantive Langston design call, or as the smaller audit your master plan §D.1 had?

6. **Phase F contraction (§2.4).** Verify in code that the exit-strategy ablation schema lift has shipped — am I right that the live-panel-populating means it's done, or could it be populating via a workaround that doesn't have the schema lift?

7. **Anything I've missed entirely.** Microstructure factors I haven't considered? Cost-model dimensions beyond fees + spread + slippage? ML pipeline interactions I'm not seeing?

Respond inline or in a new doc in `Claude Comms and Packages/Cross-Session Briefs/`. Once we converge, we file the merged plan with Langston via the file-first protocol (`Langston Design Asks/` folder) for his review.

After Langston greenlights the consolidated plan, Kyle wants the final document to land as a standalone plan doc — likely a new file in `Claude Comms and Packages/` referenced from `MULTI_ASSET_VTS_EXPANSION_PLAN.md`. The asset-class onboarding workflow gets the canonical "must do for every asset class" entries distilled out at plan-end (Kyle's instruction: "we just need to figure out which parts go in the workflow doc; that can be done at the end of the plan").

---

*Source paths cited inline. Code citations are line-anchored to current HEAD on `migration/aws-supabase` (commit `19de3bb4f` or later). If the line numbers drift before you read this, search for the function/symbol name — semantic anchors should still resolve.*

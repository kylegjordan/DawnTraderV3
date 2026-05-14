# Factor Calibration Framework — Cross-Session Brief

> **Audience:** the other CC session running xstock factor calibration analysis.
> **Purpose:** ensure both sessions are measuring against the same confidence number, in the same way, against the same outcome metric — so the xstock decisions tomorrow are apples-to-apples with the crypto decisions.
> **Source-of-truth:** every claim below is grounded in code paths cited inline. If you read the code and find I'm wrong, the code wins.

---

## 1. What the framework is measuring

### The confidence number being measured

**`regime.confidence` — the chain-final modulated regime classifier confidence.** Range `[0.45, 1.0]` after the post-composition floor clamp.

Where it lives in the DB:
```
regime_factor_alternates.real_decision->>'confidence'   ← THIS IS THE FIELD
```

What it semantically is: the regime classifier's certainty in the regime label it assigned, AFTER all B67/B68 modulating factors have been multiplied in, AFTER the macroModifier is applied, AFTER the floor clamp. **NOT** the raw classifier output.

The raw pre-modulation value is preserved separately at `regime_factor_alternates.real_decision.metadata.predictiveConfidenceRaw` — that field is **misleadingly named** (legacy naming drift); it has nothing to do with `getPredictiveConfidence()` from `server/core/utils/score-calculator.ts`. The metadata key just means "what the regime classifier output before B67/B68 modulators were layered on top." Don't sort by this; the canonical analysis uses the modulated final value.

### What this is NOT

`regime.confidence` is **not** the same as:

- **`predictiveConfidence`** (from `server/core/utils/score-calculator.ts:93`) — that's a separate VTS-telemetry-derived metric: `sigmoid((winRate - 0.5) × 6)`, computed per (regime × strategy) combo from historical VTS trade outcomes. It's an input to `computeFinalScore`. NOT what the factor calibration framework analyzes.
- **`finalScore`** — the per-trade composite from `computeFinalScore(hybridScore, predictiveConfidence, regimeWeight, decayPenalty)`. Used for trade ranking + Net EV gating + open-trade record. Also not what the factor calibration measures.
- **`regimeWeight`** — `calculateRegimeScore() / 100`. A separate normalized regime-quality score that feeds into `finalScore`. Different number.

If your xstock analysis is sorting trades by anything other than `regime_factor_alternates.real_decision->>'confidence'`, you're measuring a different question than the crypto framework measures.

### The outcome metric being measured against

**Win rate per tertile bucket of closed VTS trades.** Win = `replay_outcome->>'pnl_usd' > 0`.

Algorithm at `server/services/drift-dashboard-aggregator.ts:1018-1099`:
1. Pull closed VTS trades in the window (`24h` / `7d` / `30d` / `since-latest`) where `replay_completed_at IS NOT NULL` and `asset_class = $assetClass`
2. Group by `factor_name`
3. For each factor: sort the trades twice — once by `realConfidence` (factor on), once by `altConfidence` (factor disabled). Each gives a different sort order because each factor pushes confidence differently.
4. Split each sort into 3 equal-size tertiles (low / mid / high)
5. Compute win rate per bucket → `bucketWinRate()`
6. Compute REAL spread = `realHigh.winRatePct - realLow.winRatePct` and ALT spread = same with factor disabled

---

## 2. How the framework is measuring

### Per-factor outputs (`FactorCalibrationStats` interface, aggregator line 596-621)

For each factor, three views are computed:

#### A. Confidence-shift distribution
- `avgRealConfidence` / `avgAltConfidence` — mean values
- `avgConfidenceShift` — mean(real − alt). Sign = factor's net push direction
- `avgAbsConfidenceShift` — mean(|real − alt|). Magnitude of factor's impact
- `maxAbsConfidenceShift` — single-trade biggest move in the window
- `shiftIsZeroFraction` — fraction of trades where real == alt (factor at clamp or no contribution)

If `avgAbsConfidenceShift ≈ 0` and `shiftIsZeroFraction → 1`, the factor is decorative. Not predictive, not anti-predictive, just inert.

#### B. Tertile WR analysis (REAL confidence-based)
- `realTertileLow` / `realTertileMid` / `realTertileHigh` — each with `n`, `avgConfidence`, `avgPnlUsd`, `winRatePct`
- `realSpreadPP` — `realHigh.winRatePct - realLow.winRatePct`

If high-tertile WR > low-tertile WR with stat separation, confidence is predictive of outcomes. **This is the canonical calibration check.**

#### C. Per-factor predictive lift
- `altTertileLow` / `altMid` / `altHigh` — same buckets but sorted by ALT confidence
- `altSpreadPP` — same calc, factor disabled
- `predictiveLiftPP` = `realSpreadPP - altSpreadPP`

Positive lift = factor adds predictive value (sorting by REAL gives sharper WR spread than sorting by ALT). Zero or negative = factor is decorative or misleading.

### Decision-grade thresholds (`MIN_N_PER_BUCKET = 150`, aggregator line 639)

A factor's stats are decision-grade ONLY when:
- `n >= 150` in every one of the 3 buckets (so 450+ replayed trades total for that factor)
- WR spread >= 7 percentage points (signal strength)
- p < 0.05 on Wilson confidence intervals around the tertile WR comparison

Below those: `isDecisionGrade = false`, panel reports ACCUMULATING. Reaching them is the gate for whether a factor should be retained / dropped.

### Asset-class scoping

`computeFactorCalibration(window, assetClass = 'crypto_spot')` at `drift-dashboard-aggregator.ts:1034`.

The SQL at line 1056 filters `AND asset_class = $assetClass`. Pass `'xstock_spot'` for xstock factor calibration. Same function, same math, just filtered to xstock-tagged rows. The xStocks tab uses `/api/xstocks/factor-calibration?window=...` which calls this with `'xstock_spot'`; crypto Drift Dashboard uses `/api/analytics/factor-calibration?window=...` which defaults to `'crypto_spot'`.

### Version-filter on the SQL (legacy contamination guard)

Per B76 (2026-05-06), 6 specific factors get a version-filter applied at aggregator line 1063-1069:
```
factor_name NOT IN (
  'b67_1_btc_dominance', 'b67_1_funding_rates', 'b67_1_mcap_momentum',
  'b67_1_macro_modifier', 'b67_2_phase_preference', 'b67_2_phase_dimension'
)
OR real_decision->'metadata'->>'calibrationFrameworkVersion' = 'b76_chain_final'
```
The other ~7 B67/B68 factors don't get this filter — predictive-lift cancels first-order bias for them. This matters if you're hand-rolling SQL: include the filter or your lift numbers for those 6 factors will be contaminated by pre-B76 structurally-biased rows.

---

## 3. How regime confidence flows through the trading pipeline

### Where regime.confidence is computed

`calculatePairRegime()` at `server/core/metrics/market-regime.ts:209-336`. Called once per pair per cycle inside `mce.computeContext()`. Inputs:
- `ohlcData` → derives volatility, momentum, ADX
- `dbsScore`, `dbsSlope` → directional bias inputs
- `macroModifier` → B67.1 multiplier
- `regimeConfig` → tunable thresholds (per-asset-class)
- `assetClass` → branches threshold dispatch (crypto_spot uses module-level constants; xstock_spot uses _XSTOCK suffixed constants)

Each regime branch has its own confidence formula. Examples (current crypto values):
- RBS: `0.75 + (0.012 - vol) × 12`
- IE: `0.65 + (vol - 0.015) × 6 + (dx - 45) × 0.002 + absDbs × 0.1`
- TFS: `tfsDesatMin + (tfsDesatMax - tfsDesatMin) × (momentumFactor × dbsStrength × volInverse)` — **multiplicative** (B67.3.5)
- HVU: `0.65 + Math.min(Math.abs(mom) × 8, 0.2)`
- ST: `0.50 + Math.min(vol × 5, 0.10) + Math.min(absDbs × 0.15, 0.05)`

Then post-branch (line 327-328):
```
confidence = confidence × macroModifier
confidence = clamp(confidence, b67_5PostCompositionFloor, 1.0)
```

The `b67_5PostCompositionFloor` is tunable via `module_constants.regime_classifier.b67_5_post_composition_floor` (default 0.45).

### Where regime.confidence is consumed downstream

1. **Stored on every open VTS trade record:** `OpenVirtualTrade.regimeConfidenceModulated` (vts-runner trade-record construction) + `regimeConfidenceRaw` (the pre-macroModifier value, reconstructed by dividing modulated by macroModifier). Closed trade record carries both into `paper_sim_trades` for ML pipeline access.

2. **Stored on every signal_eval_archive admitted row** under `features.regimeConfidence` (B70 hook).

3. **Stored on every `regime_factor_alternates` row** as `real_decision.confidence` (chain-final, post-B76) + `metadata.predictiveConfidenceRaw` (pre-modulation legacy field). This is THE table the factor calibration framework reads.

4. **NOT a direct input to `finalScore`** — `computeFinalScore` takes `hybridScore`, `predictiveConfidence` (VTS-telemetry-derived), `regimeWeight` (= `calculateRegimeScore() / 100`, separate metric), and `decayPenalty`. Regime confidence is observability + downstream factor analysis, not a trade-decision gate input in itself.

5. **NOT used as an active gate to admit/reject signals today.** The post-composition floor of 0.45 means values never reach low enough to trigger an admission gate. B67.5 is the (unimplemented) batch that would wire `regime.confidence` into downstream consumer gates — that's why the Factor Ablation Comparison panel currently shows "no admission flips" by design. The whole point of running the calibration window now is to figure out which factors deserve to be in the chain-final value WHEN B67.5 wires it as a gate.

### What B67.5 would do (deferred)

If a factor's `predictiveLiftPP` is decision-grade positive, B67.5 keeps it in the chain. If decision-grade negative or zero, B67.5 drops it. Then `regime.confidence` becomes an active gate at downstream consumers (probably SQE-equivalent for active trading; VTS doesn't gate on it).

Tomorrow's analysis = which factors clear the bar for B67.5 inclusion.

---

## 4. CRITICAL: DBS state for xstock (answer to Kyle's second question)

### Short answer

**No, real DBS is NOT being fed into xstock regime confidence scoring.** A synthesized neutral `{ score: 0, slope: 0, category: 'NEUTRAL', sentinelZero: true }` is passed instead.

### Evidence

In `server/asset_classes/xstock_spot/eval-cycle.ts:353`:
```ts
mceContext = mce.computeContext(symbol, ohlc, lastPrice, volume24h, undefined, undefined, ASSET_CLASS);
//                                                                  ^^^^^^^^^  ^^^^^^^^^
//                                                                  smaPeriod  propagatedDbs  ← UNDEFINED
```

In `server/services/market-context-engine.ts:900-915`:
```ts
} else {
  // Non-crypto: synthesize neutral DBS. Layer-1 starter; per-asset-class
  // DBS computation deferred to future Layer-3 batch (RUNNING_ISSUES candidate).
  directionalBias = propagatedDbs && Number.isFinite(propagatedDbs.score)
    ? { score: propagatedDbs.score, ... sentinelZero: false, ... }
    : { score: 0, category: 'NEUTRAL', sentinelZero: true,
        components: { slopeComponent: 0, returnComponent: 0, emaComponent: 0 } };
}
```

For crypto_spot, MCE hard-fails if `propagatedDbs` is missing (line 891-893). For non-crypto, it synthesizes the neutral. xstock has no DBS computation infrastructure — there's no equivalent of FX5's `directional-bias-store` for equity pairs.

### Implications for xstock regime classification

With `dbsScore=0, dbsSlope=0, absDbs=0` flowing into `calculatePairRegime`:

| Branch | What's affected |
|---|---|
| **RBS gate** `absDbs < RBS_DBS_MAX` | Always satisfied → RBS becomes permissive on the DBS dimension; vol+ADX still discriminate. |
| **IE Path A** (`vol > X && dx > Y`) | Still works. |
| **IE Path B** (`vol > X && absDbs >= IE_DBS_STRONG`) | **Never fires for xstock** — DBS-strong shortcut dead. |
| **TFS Path A** (`mom > X && dx > Y`) | Still triggers regime label, BUT confidence formula uses `dbsStrength = absDbs / tfsDbsScale = 0`. Multiplicative `momentumFactor × dbsStrength × volInverse = 0` → **TFS confidence collapses to floor `tfsDesatMin`**. |
| **TFS Path B** (`absDbs >= TFS_DBS_MODERATE`) | **Never fires for xstock** — DBS-moderate shortcut dead. |
| **HVU confidence** `+ Math.min(absDbs × 0.15, 0.05)` | Always +0 — no DBS contribution to HVU confidence. |
| **ST confidence** `+ Math.min(absDbs × 0.15, 0.05)` | Always +0 — no DBS contribution to ST confidence. |

### Implications for xstock factor calibration tomorrow

DBS-derived factors will measure differently for xstock than for crypto:

- **`b67_1_btc_dominance`** — modulates against the macro context. Same for both asset classes IF xstock has its own equity macro_modifier (B79.3 deferred — currently xstock uses `module_constants.mce_config.xstock_spot.macro_modifier` = 1.0 placeholder).
- **`b67_1_funding_rates`** — crypto-specific concept. Doesn't apply to xstock. Should not appear in xstock factor calibration rows.
- **`b67_1_mcap_momentum`** — crypto market-cap aggregate. Doesn't apply to xstock either.
- **`b67_1_macro_modifier`** — currently identity (1.0) for xstock. Confidence shift will be near-zero; not predictive because the value is constant.
- **`b68_*` DBS-derived factors** — all read DBS=0 for xstock. Their `realConfidence` will equal `altConfidence` in every trade because the factor's contribution is already 0. `shiftIsZeroFraction → 1`, predictive lift ≈ 0.

Net: **most B67/B68 factors will register as DECORATIVE for xstock** because their inputs are crypto-specific or DBS-dependent. That's not a calibration failure — it's the architecture saying "this factor doesn't apply to xstock at Layer-1."

The factor calibration analysis for xstock tomorrow will give a much shorter list of factors with meaningful predictive lift. Expect maybe 2-4 factors to register non-zero (the ones that depend on universally-applicable inputs like vol / mom / ADX from raw OHLC).

### What this means for B67.5 xstock decisions

Until xstock gets its own DBS computation (deferred Layer-3 work) AND its own equity macro feed (B79.3 deferred), the factor calibration for xstock is calibrating against a stripped-down feature set. Tomorrow's xstock decisions will be: of the factors that DO produce meaningful confidence shifts on xstock (vol-, mom-, ADX-derived ones), which clear the decision-grade bar.

If the other CC session is treating xstock factor calibration as "same conclusions as crypto, different numbers" — that's wrong. The xstock conclusion set is going to be a strict subset of crypto's, because half the factors have nothing to chew on for xstock.

---

## 5. TL;DR for the other session

1. **Confidence metric being measured:** `regime_factor_alternates.real_decision->>'confidence'` — chain-final modulated regime classifier confidence, NOT `predictiveConfidence` or `finalScore` or `regimeWeight`. Read aggregator code at `drift-dashboard-aggregator.ts:1034+` to verify.

2. **Outcome metric:** win rate (`pnl_usd > 0`) per tertile bucket. Same for both asset classes.

3. **Decision-grade thresholds:** n ≥ 150/bucket, spread ≥ 7pp, p < 0.05.

4. **Asset-class scoping:** same `computeFactorCalibration` function, filtered by `asset_class = 'xstock_spot'`. Endpoint `/api/xstocks/factor-calibration` wires it.

5. **xstock is currently DBS-blind:** synthesized neutral DBS=0 is passed to the regime classifier. Several B67/B68 factors will register as decorative for xstock specifically. That's an expected architectural artifact of B79.0m.b Layer-1 ship, NOT a calibration failure. Per-asset-class DBS computation for xstock is deferred to a future Layer-3 batch.

6. **xstock decisions will be a strict subset of crypto decisions** — only the factors with non-DBS / non-crypto-specific inputs can register meaningful predictive lift on xstock today.

If your analysis says "factor X is decision-grade-predictive for xstock but decorative for crypto" — that should be impossible architecturally (xstock has strictly less feature input than crypto). Worth double-checking your SQL filter / sort key.

---

*Source paths (verify these claims directly):*
- `server/services/drift-dashboard-aggregator.ts:560-640` — framework doc + threshold constants
- `server/services/drift-dashboard-aggregator.ts:1014-1130` — `splitTertiles`, `bucketWinRate`, `computeFactorCalibration`
- `server/services/factor-ablation-emitter.ts:75-148` — `RegimeDecision` + B76 chain-final contract
- `server/core/metrics/market-regime.ts:209-336` — `calculatePairRegime` (regime.confidence computation)
- `server/core/utils/score-calculator.ts:93-118` — `getPredictiveConfidence` (the DIFFERENT thing not to confuse with regime.confidence)
- `server/services/market-context-engine.ts:856-916` — `computeContext` asset-class dispatch + xstock DBS synthesis
- `server/asset_classes/xstock_spot/eval-cycle.ts:353` — xstock call site passing `undefined` for propagatedDbs
- `module_constants.regime_classifier.b67_5_post_composition_floor` — tunable confidence floor (default 0.45)
- `module_constants.mce_config.xstock_spot.macro_modifier` — xstock macro modifier (placeholder 1.0, B79.3 deferred)

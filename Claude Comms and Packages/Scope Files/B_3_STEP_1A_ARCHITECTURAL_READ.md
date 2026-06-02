# B.3 Strategy Gates — Step 1.a Architectural Read (Findings)

> **Phase 24 / B.3.** Code-level deep read of the REAL flow + CURRENT WIRING STATE of three layers: (1) the regime classifier's per-regime score-range thresholds; (2) the VTS strategy detection + per-strategy gates; (3) the active-path strategy selection / ranking. Every claim below is verified against actual code (file:line), per §2 Step 1.a + §9 discipline — NOT grep-and-cite, NOT memory. This doc is the foundation for the B.3 scope and Langston's Step-1 review.
>
> **Date:** 2026-06-02. **Active trading:** OFF (VTS passive learning only). **CALIBRATION LENS (axiom 6) applies.**

---

## 0. Headline (the answer to Kyle's question)

**Kyle's question:** are the lopsided live xStock regime proportions (ST 44.7%, TFS 38.7%, HVU 12.4%, IE 4.0%, RANGE_BOUND 0.14%) because those regime conditions are genuinely never met for xStocks (→ accept it), OR because the classifier is misconfigured and funneling everything into a couple of regimes (→ fix the per-regime score-range thresholds first)?

**Finding from code:** the xStock regime thresholds are **explicitly admitted-provisional** — a "Layer 1 domain-knowledge baseline" set by mechanically halving the crypto thresholds and pulling DX down 10–15 points, **never validated against live xStock distributions**. The file header says so in its own words (see §1.3). So we have **no empirical basis** to assert the partition is correct. The lopsided mix is therefore the *expected* outcome of un-calibrated boundaries, not evidence the conditions are genuinely never met. **The audit must measure the live per-branch input distributions (volatility, DX, DBS, momentum) and check where the boundaries actually sit relative to them.** Until that's done, "fix vs accept" is undecidable — and the structural cascade (§1.4) shows a clear mechanical path by which one mis-set boundary (RBS `dx < 35`) can zero out a whole regime and dump the overflow into the ST catch-all.

---

## 1. Layer 1 — The Regime Classifier

### 1.1 The live classifier function
- **`calculatePairRegime(ohlcData, dbsScore, dbsSlope, macroModifier, regimeConfig, assetClass)`** in `server/core/metrics/market-regime.ts:223-356` is the LIVE classifier.
- It is the function MCE calls: `server/services/market-context-engine.ts:1180` (`calculatePairRegime(...)`) and again at the B-PHASE-A2 backfill walk (`market-context-engine.ts:1208`). Confirmed by direct grep of MCE.
- **Inputs:** `vol = computeVolatility(ohlc)` (stddev of close-to-close log returns, full array), `mom = computeMomentum(ohlc)` (30-bar lookback × 60-min = 30h window), `dx = computeADX(ohlc, 14)` (Wilder DX, 14-bar = 14h window — note this is raw DX, NOT smoothed ADX), `absDbs = |dbsScore|` (Directional Bias Score from `directional-bias.ts`).

### 1.2 The decision cascade (5 branches, first-match-wins, ST = default fallthrough)
Verified at `market-regime.ts:283-337`. In order:
1. **RANGE_BOUND_STABLE** (line 283): `vol < RBS_VOL_MAX && dx < RBS_DX_MAX && absDbs < RBS_DBS_MAX` — needs ALL THREE simultaneously.
2. **IMPULSE_EXPANSION** (288): `(vol > IE_VOL_MIN_PATH_A && dx > IE_DX_MIN_PATH_A) || (vol > IE_VOL_MIN_PATH_B && absDbs >= IE_DBS_STRONG)`.
3. **TREND_FRIENDLY_STABLE** (293): `(mom > TFS_MOM_MIN_PATH_A && dx > TFS_DX_MIN) || (absDbs >= TFS_DBS_MODERATE && mom > regimeConfig.b68_5PathBMomentumMin)`.
4. **HIGH_VOLATILITY_UNSTABLE** (326): `(vol > HVU_VOL_MIN && mom < HVU_MOM_NEG_PATH_A) || (dx > HVU_DX_STRONG && mom < HVU_MOM_NEG_PATH_B)`.
5. **STRUCTURAL_TRANSITION** (330, `else`): everything that matched none of the above. This is the **catch-all default** — by construction it absorbs any pair the four explicit branches don't claim.

Confidence is then macro-modified and floor/ceiling-clamped (`market-regime.ts:346-347`, floor default 0.45, ceiling 1.0).

### 1.3 Per-asset-class: YES (since B79), but xStock thresholds are PROVISIONAL
- Threshold dispatch at `market-regime.ts:245-267`: when `assetClass === 'xstock_spot'`, the branch conditions use the `_XSTOCK` constant set; otherwise crypto constants. `assetClass` is a REQUIRED parameter (no silent default) since B79.0n.MCE.
- **xStock threshold values** (`server/asset_classes/xstock_spot/regime-thresholds.ts:24-44`):
  - RBS: `vol<0.006`, `dx<35`, `|dbs|<0.10`
  - IE: Path A `vol>0.010 && dx>40`; Path B `vol>0.0075 && |dbs|>=0.50`
  - TFS: Path A `mom>0.0015 && dx>35`; Path B `|dbs|>=0.30 && mom>0.002`
  - HVU: Path A `vol>0.0075 && mom<-0.0015`; Path B `dx>45 && mom<-0.0025`
- **The provisional admission, verbatim** (`xstock_spot/regime-thresholds.ts:11-21`): *"Layer 1 domain-knowledge baseline per scope §2.3 obj 8. Equity ATR% runs ~0.5-2% (vs crypto's 2-8%); ADX trends weaker but more reliable. Rough scale: vol/momentum thresholds halved relative to crypto, DX thresholds pulled down 10-15 points, DBS scale-invariant. … Layer 2 spot-check / Layer 3 deep calibration may iterate these values post-deploy."*
- **Conclusion:** the xStock boundaries were never fit to xStock data. They are domain heuristics awaiting exactly the calibration B.3 is now doing.

### 1.4 The mechanical hypothesis for RANGE_BOUND ≈ 0.14% (corrected per Langston Step-1)
- RBS requires `dx < 35` AND `vol < 0.006` AND `|dbs| < 0.10` **all at once**. The crypto-era comment (`market-regime.ts:273`) notes DX "runs 35-90 on 60-min bars." If live xStock DX also typically sits ≥35, the `dx < 35` gate alone nearly eliminates RBS.
- **Structural correction (Langston):** the cascade is first-match-wins in order RBS→IE→TFS→HVU→ST. A bar that fails RBS is **re-tested against IE, TFS, and HVU** before it reaches the `else` (ST) at line 330. So **ST = 44.7% is NOT "RBS overflow"** — it is bars that fail *all four* explicit branches (vol-moderate / dx-moderate / mom-moderate / dbs-moderate, i.e. the dead-zone between every gate). Moving RBS's `dx` boundary could admit more RBS while ST barely moves, because those bars also miss IE/TFS/HVU. **Any audit that treats ST as a single overflow bucket mis-attributes the cause** — hence the A2-bis near-miss attribution requirement (§4).
- This is a *testable* hypothesis: instrument the live per-branch inputs AND, for every ST bar, record which explicit branch it came closest to passing and on which input(s).

### 1.5 B.1-replay vs B.0-live discrepancy (must be reconciled in the audit)
- B.1 (closed) ran the EXISTING classifier values against an archive REPLAY (2,658 bars / 260 symbols) and reported RANGE_BOUND_STABLE ≈ 8.8%, then left the values unchanged.
- B.0 (live baseline) shows RANGE_BOUND ≈ 0.14% (plus TFS 18%→39%, ST 36%→45%).
- A 60× gap on RANGE_BOUND between replay and live means one of: different window/market conditions, different DBS inputs (replay may synthesize neutral DBS via the sentinel-zero path, changing the `|dbs|` gate), or a different symbol/threshold set in the replay. **The audit must instrument and reconcile this** before any threshold is touched.

### 1.6 Legacy / dead-code flag
- `getNormalizedRegime` / `getNormalizedRegimeWithDetails` (`market-regime.ts:481-559`) are a SEPARATE Z-score (rolling-300-window) classifier whose own comment (line 452) claims to be *"the canonical regime function used by both VTS and DSS systems."* **This is stale** — MCE uses `calculatePairRegime`, not these. The audit should confirm whether the Z-score functions are dead and log to the Phase-16 legacy-component review register (§5 #18) if so.

---

## 2. Layer 2 — VTS Strategy Detection + Per-Strategy Gates

### 2.1 The VTS fire flow (verified, `server/services/vts-runner.ts`)
1. Classify regime once via MCE (`vts-runner.ts:3283-3295`).
2. **Get EVERY strategy in the regime's family** (`vts-runner.ts:3296` → `getStrategiesForRegime()` in `canonical-regime-strategy-map.ts`). This is the VTS design (Directive 11.8C): simulate ALL strategies mapped to the regime, not one best.
3. **Family filter** (`vts-runner.ts:3443-3489`): the pair must have survived the FX5 family-specific IMF filter lane (trend / reversal / breakout / oscillator / strong_trend / pattern) for that strategy's family; `MULTI_FAMILY_ELIGIBILITY` allows extra lanes.
4. **Universally-disabled skip** (`vts-runner.ts:3439-3441`): `UNIVERSALLY_DISABLED_STRATEGIES` currently just `liquidity_trap` (bearish, long-only-incompatible).
5. **Per-strategy detect** (`vts-runner.ts:3535` → `callStrategyDetect()` in `strategy-engine.ts:834`): dispatch to the strategy's detect function. Each detect reads its own tunable gates from `module_constants` (e.g. `strategy.vwap_pullback`) via `getCachedNumbersForModule(..., _SE_KEY(strategy, assetClass))` — **these per-strategy detect gates are the primary B3.1 calibration surface.**
6. Score + Net-EV floor (`VTS_NET_EV_FLOOR = -0.01`), then open the virtual trade.

### 2.2 The `strategy_gates` table (enable/disable, distinct from the detect gates)
- Stored in `module_constants` with `module_name='strategy_gates'`, `constant_name='enabled'`, `value` boolean JSONB, dimensioned by `exchange/assetClass/regime/strategy`.
- Read by `isStrategyEnabledForAssetClass(strategy, assetClass)` (`canonical-regime-strategy-map.ts:955`). **Default-open:** an asset class with no rows = all enabled (crypto_spot has no rows; xstock_spot has 19 explicit rows — 10 enabled, 9 disabled).
- **Applied in the ACTIVE path (SQE) only** (`signal_quality_evaluator.ts:253`) and the xStock eval-cycle — **NOT in the crypto VTS path** (`vts-runner.ts:1149-1157`: governance gate removed from VTS by design; VTS fires all for telemetry). So the enable/disable gate is an active-path concept; VTS's per-strategy filtering is the detect gates + family filter.

### 2.3 The 19 canonical strategies + enable flags
- Enumerated in `canonical-regime-strategy-map.ts` (STRATEGY_DISPLAY_NAMES SSOT). xstock_spot enabled (10): vwap_pullback, breakout, mean_reversion, range_trade, sma_trend_ride, vwap_bounce, inside_bar_reversal, morning_star, pivot_shift, orb. xstock_spot disabled (9): strong_bull_trend, abcd_long, dhma, liquidity_trap, volatility_edge, defensive_hedge, reverse_impulse, support_bounce, adaptive_flow.
- **Anomaly to run down (extends B.0 finding #4):** B.0 baseline saw `strong_bull_trend` OFF for xStock yet 21 trades recorded; `breakout` + `inside_bar_reversal` ENABLED yet 0 trades. The audit's per-strategy breakdown resolves these.

---

## 3. Layer 3 — Active-Path Strategy Selection / Ranking

### 3.1 Current state: DORMANT (active trading OFF since Phase 8 / per docs 2026-01-12; Phase 19 turns it on)
- The orchestrator (`server/services/signal-orchestrator.ts`) is instantiated and started by the trading engine, but the active pipeline does not run while active trading is off. SYSTEM_MANUAL records the dormancy as a policy state, and the signal-eval-archive emit hook is explicitly gated until Phase 21 (`signal-orchestrator.ts:1044`).

### 3.2 How "ONE best per cycle" is actually realized (NUANCE to verify in B3.2)
- The orchestrator does NOT itself pick one best. It evaluates all enabled∩regime-allowed strategies per symbol, computes FinalScore per signal (`FinalScore = HybridScore×0.4 + Confidence×0.3 + RegimeWeight×0.2 − DecayPenalty×0.1`), runs SQE, and **forwards every SQE-passed signal to RTB** (`signal-orchestrator.ts:691`, fire-and-forget).
- **RTB (`ready_to_buy_service.ts`) is where ranking/selection happens** — it ranks by FinalScore (+ decay penalty) and promotes to execution as capacity (TCL) allows. Cross-family tiebreak via `computeRankingScore()` (`ranking-weights.ts:82-99`) with hardcoded per-family weight profiles (QUANT/PATTERN/HYBRID).
- So the §5 #20 "orchestrator emits ONE best signal per cycle" is realized at the **RTB promotion stage**, not literally in the orchestrator. **B3.2 must confirm this reconciliation in code rather than assume it.**

### 3.3 Selection config source + per-class gap (the B3.2 setup surface)
- RTB ranking/threshold reads use a **wildcard** resolver `_RTB_GK = {exchange:'*', assetClass:'*', strategy:'*', regime:'*'}` (`ready_to_buy_service.ts:31`) — i.e. **class-invariant today**; no per-asset-class rows seeded. SYSTEM_MANUAL notes per-class promotion of FSM/SQE thresholds is deferred (SCORING batch / Phase 19 calibration gate).
- `ranking-weights.ts` QUANT/PATTERN/HYBRID profiles are **hardcoded constants**, not DB-driven, no per-class override.
- **B3.2 setup work = make the active-path selection/gate config per-asset-class (DB-resolved with `asset_class` as first-class dimension), seed sensible xStock values, wire it — but NOT numerically tune** (tuning → Phase 25 after Phase 19 turns active on and we observe real behavior). This matches §5 #15 (per-class config is the default; cold-start structure now).

---

## 4. What the B.3 audit must do (front-loaded regime-correctness check)

1. **Regime-correctness first.** One overall archive-replay pass that, for live-representative xStock data, records for every classified bar: the raw `vol`, `dx`, `dbs`, `mom` inputs AND the branch taken. Produce per-branch input distributions (with raw counts, rolling windows per rule #13) and overlay the current threshold boundaries. Answer: does each boundary sit at a sensible percentile of the live distribution, or is a boundary (e.g. RBS `dx<35`) clearly mis-placed and zeroing a regime? Reconcile the B.1-replay-8.8% vs B.0-live-0.14% RANGE_BOUND gap.
2. **Verdict per regime:** "genuinely never met → accept" vs "misconfigured → fix the score-range threshold." **If a fix is needed, fix the classifier FIRST (upstream)** — strategy gates under a broken classifier are moot.
3. **Then strategy layer:** per-strategy fire rate, signal count, gate-reject reasons (by-regime), win-proxy; per-regime which strategies run. Resolve the B.0 finding-#4 anomalies (strong_bull_trend OFF-but-21-trades; breakout/inside_bar enabled-but-0-trades; vwap_pullback+morning_star ≈80% concentration).
4. **Comparability:** ONE window across ALL strategies, not per-strategy start/stop, so the breakdown is apples-to-apples.

## 5. Scope split (per Kyle directive 2026-06-02 — do BOTH paths now)
- **B3.1 — VTS strategy gates.** Calibrate the per-strategy detect gates (§2.1 step 5) now from archive-replay (VTS fires every strategy → rich data). Apply CALIBRATION LENS.
- **B3.2 — active-path selection/gates SETUP.** Wire + configure per-class active selection/ranking/gate config now (§3.3); seed-not-calibrate; numeric calibration → Phase 25.
- **Gate to both:** the regime-correctness verdict in §4. If the classifier needs a fix, that fix (a small upstream sub-batch, e.g. B3.0) precedes the gate work.

---

*Verified files: `server/core/metrics/market-regime.ts`; `server/asset_classes/xstock_spot/regime-thresholds.ts`; `server/asset_classes/crypto_spot/regime-thresholds.ts`; `server/services/market-context-engine.ts`; `server/services/vts-runner.ts`; `server/services/strategy-engine.ts`; `server/config/canonical-regime-strategy-map.ts`; `server/core/filters/signal_quality_evaluator.ts`; `server/services/signal-orchestrator.ts`; `server/core/rtb/ready_to_buy_service.ts`; `server/config/ranking-weights.ts`. Cross-checked against SYSTEM_MANUAL + SYSTEM_IMPACT_MAP regime/orchestrator sections.*

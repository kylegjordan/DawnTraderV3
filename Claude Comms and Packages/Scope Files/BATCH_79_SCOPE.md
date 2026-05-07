# BATCH 79 — Xstock_spot (Kraken XStocks Pro) into VTS — RE-SCOPED as **canonical asset-class onboarding lab**

**Status:** rev 4 — APPROVED rev 3 with Langston's 5 stage additions + 4 process additions + workflow-doc structure additions applied.
**Workflow:** 11-step canonical (full workflow). Will likely split into B79 + B79.1 + B79.2 sub-batches.
**Branch:** `migration/aws-supabase`
**Trigger:** Kyle directive 2026-05-07 evening. Quote: *"What we are doing with these X-Stocks, this needs to be our experimentation lab, our learning example for how we set up asset classes in the future. ... we need to document and design a workflow for how we add other asset classes in the future."*

---

## §0. Re-frame — what changed in rev 3

Prior B79 scope (rev 2 APPROVED) was "implement xstock_spot quickly." Kyle's 2026-05-07 directive re-frames this as: **B79 is the canonical asset-class-onboarding lab.** The deliverable is not just xstock_spot in production — it is a documented, reusable workflow that B80 (crypto_perp) and every future asset class follow.

**Why this matters:** the modularization scaffold (B78) gave us file/directory structure. But "structure exists" ≠ "I know how to populate it for a new asset class." The crypto_spot path was built organically over 18 months of batches — there's no documented checklist for what a new asset class needs. B79 codifies that checklist by walking xstock_spot through it.

**Net deliverables from B79 (multi-batch):**
1. Working xstock_spot in VTS shadow-mode (the original B79 goal).
2. **NEW**: `1-system-manual/ASSET_CLASS_ONBOARDING_WORKFLOW.md` — the canonical template, populated with xstock_spot as the worked example.
3. **NEW**: enumerated open questions answered with reasoning, so future asset classes don't re-derive.

**What "successful B79" means now:** when B80 starts (crypto_perp), the implementer reads the workflow doc, walks the steps, gets concrete answers from xstock_spot's worked example, identifies perp-specific deltas, and ships. No re-discovery, no missed gates, no silent inheritance.

---

## §1. The crypto-pair journey — 18-stage end-to-end map (rev 4: +Stage 0 Connection, +Stage 12.5 Portfolio Risk, +Stage 14a Position-Mgmt sub-stage)

### Stage 0 — Connection / Auth / Symbol Normalization (NEW per Langston rev 3)
**What happens:** before any pair work, the system establishes connection to the asset class's exchange(s). Auth credentials, WS/REST endpoints, symbol-normalizer mapping (canonical ↔ exchange-specific), data-freshness gate ("if last tick > N seconds, mark stale; behavior on stale varies by asset class").

**Crypto_spot configuration:** `wss://ws.kraken.com/v2` + REST `api.kraken.com/0/public/*`. Symbol normalizer in `server/services/utils/symbol-canonicalizer.ts`. Freshness gate: `WS_CACHE_FRESH_MS=2000` / `WS_CACHE_FALLBACK_MS=25000`.

**xstock_spot decisions needed:**
- Q0.1: **Auth/credentials** — Kraken Spot key works for xStocks WS at `wss://ws-equities.kraken.com`? Or different key required?
- Q0.2: **Symbol normalizer** — `AAPLx` (Kraken Pro display) vs `AAPL/USD` (WS feed) vs `AAPL.X` (alternative form)? Decide canonical form. Per B74 universe file: WS accepts `BASE/USD` (no x-suffix). Resolver must canonicalize all forms to single internal symbol.
- Q0.3: **Freshness gate values** — equity going silent during off-hours is NORMAL; during hours is HEALTH ALARM. Asset-class-aware gate per Langston rev 3 G addendum: `xstock_spot.cache_fallback_ms` differs from crypto's by orders of magnitude during weekend, ms-comparable during open-hours.
- Q0.4: **Pre-flight connection probe** — verify WS subscribe success on startup before scanner enters its loop. xStocks subscribe path must work (B78.2 fixed crypto, but B74 archiver subscribes successfully today; verify still does).

**Reusable workflow question:** *what auth, endpoints, symbol-normalizer rules, and freshness gates does the asset class need before any pair work happens?*

### Stage 1 — Pair Discovery + Universe Construction

Before scoping xstock_spot work, this section traces what every crypto pair experiences from the moment it enters the system to the moment its trade lands in archive. **At each stage, the workflow doc must answer: what variables, thresholds, gates, and data does an asset class need configured for that stage?**

### Stage 1 — Pair Discovery + Universe Construction
**What happens:** scanner pulls Kraken AssetPairs (REST `/0/public/AssetPairs`) + Tickers (REST `/0/public/Ticker`). Builds `allPairs` list with `{pairName, symbol (wsname), volume24h, ticker, pairInfo}`. Logged at `[AdaptiveScan][11.4C.1] Kraken universe: N pairs`.

**Crypto_spot configuration:** uses `krakenService.getTicker()` + `getTradablePairs()`. ~1530 pair universe.

**xstock_spot decisions needed:**
- Q1.1: **Source of pair list?** — `xstocks-universe.json` static (B74; 275 symbols) vs Kraken AssetPairs query against equities endpoint (does one exist?) vs hybrid.
- Q1.2: **Source of ticker data?** — Kraken Spot REST doesn't include xStocks. Where does volume24h come from for xStocks pairs? B74 archiver writes `equity_spot_ohlc_1m` table — derive volume from there?
- Q1.3: **Universe-merge strategy** — concat `allPairs += xstockPairs` in `market-scanner.ts:550-570` (current subagent approach), OR separate scanner instance (own family path)?
- Q1.4: **Refresh cadence** — xStocks listings are dynamic (100 → 500 by EOY). How is `xstocks-universe.json` updated? Manual PR (current B74 design) is fine for stable products but xStocks is growing. Auto-refresh via WS subscription probe?

**Reusable workflow question:** *for any new asset class, what is the canonical pair-universe source? Does it merge into the FX5 universe or warrant its own scanner?*

### Stage 2 — Adaptive Batch Selection (FX5 scanner intake)
**What happens:** `AdaptiveScanManager.getNextScanBatch(allSymbols)` picks 100 pairs per cycle: 60% Ideal pool (top performers per telemetry), 40% Rotational pool (exploration). Adds benchmark pairs (BTC, ETH). Cooldown blacklist via `PairFailureTracker`.

**Crypto_spot configuration:** AdaptiveRatioManager regime-aware ratios. Telemetry-driven. Benchmark pairs hard-coded in `fx5-scanner.ts` `BENCHMARK_SYMBOLS`.

**xstock_spot decisions needed:**
- Q2.1: **Same FX5 scanner, or own scanner?** **DECIDED per Langston rev 3 §C: DEDICATED.** Two `AdaptiveScanManager` instances, one per asset class. Telemetry isolation is the deciding factor; mixing equity Ideal/Rotational pool selection with crypto's corrupts both. Side benefits: independent benchmark pairs, independent batch budget, cleanly disable equity loop during market-closed. Shared scheduler, separate scan loops.
- Q2.2: **Benchmark pairs for xstock_spot?** SPYx + QQQx (broad market index proxies). Possibly AAPLx (largest by USD volume) as a third anchor.
- Q2.3: **Adaptive ratio (Ideal/Rotational) tuning** — same 60/40 OK for B79 default; revisit if shadow-mode shows equity exploration value differs.
- Q2.4: **Cooldown blacklist** — same logic, but failure-reason taxonomy (rev 4 Cross-cutting addition) needs equity reasons: trading_halt_LULD, circuit_breaker, delisting, stock_split.
- Q2.5 (NEW per Langston rev 3): **Scanner cadence outside market hours** — equity scanner must early-return when `!isXstockMarketOpenUTC()` BEFORE doing batch work. Running 100-pair batches at 03:00 UTC Sunday burns CPU on stale data. Add asset-class market-hours gate at scanner top, not just at SQE evaluation gate.
- Q2.6: **Equity batch size** — Langston rev 3 §F suggested 30 (vs crypto 100) given 275-symbol universe. Smaller batch = faster cycles + less noise per evaluation. **Confirmed: 30 for B79.**

**Reusable workflow question:** *for any new asset class, does it share scanner infrastructure or warrant its own? Decision criteria?*

### Stage 3 — Pre-Global DBS Computation (B62/B63)
**What happens:** for each pair in batch, fetch OHLC (5m/15m/1h timeframes), compute DBS (Directional Bias Score). DBS is multi-timeframe-agreement-based. Used pre-global to route strong-DBS pairs (|DBS| >= 0.35) into Strong-Trend Lane (Path D, B63).

**Crypto_spot configuration:** `directional-bias.ts`. Coefficients calibrated on crypto.

**xstock_spot decisions needed:**
- Q3.1: **OHLC source** — B74's `equity_spot_ohlc_1m` is 1-minute. DBS uses 5m/15m/1h. How is 1m → higher TFs aggregated? Is there an existing utility?
- Q3.2: **DBS coefficients** — calibrated on crypto. Are they directly applicable to equities? Equity intraday has different volatility pattern (opening bursts, lunch lull, close). DBS may need equity-specific tuning.
- Q3.3: **Strong-Trend Lane threshold** (|DBS| >= 0.35) — equity-appropriate, or different threshold?
- Q3.4: **Time-of-day adjustment** — equity DBS computed in 15:00 UTC (US market hours) is different signal than 03:00 UTC (after-hours). Does DBS need time-of-day weighting for xstock_spot?

**Reusable workflow question:** *for any new asset class, what OHLC source feeds the math, and which math constants need recalibration vs inheriting?*

### Stage 4 — Global Filter (Quant Path)
**What happens:** apply quant filter from `screener_filters` table: LQ >= 35, VN <= 0.93, Volume >= $500K, DI >= 55. Pairs passing: enter quant-pool processing.

**Crypto_spot configuration:** `screener_filters` row keyed by `mode='paper'` or `'live'`. Single global row per mode.

**xstock_spot decisions needed:**
- Q4.1: **Schema migration** — `screener_filters` is `mode`-keyed. Does it need an `asset_class` dimension? Langston rev 1 said yes (option a). **Confirmed: yes, add asset_class column.**
- Q4.2: **Specific xstock_spot threshold values:**
   - `min_volume`: Langston suggested $100K. Volume probe shows xStocks dollar-volumes in $13B-$1.38T range — well above $100K. Confirmed safe.
   - `min_price`: Langston $1. xStocks lowest-price tokens (FCEL, BLNK) are sub-$5 but not sub-$1. Reasonable.
   - `max_price`: **Langston suggested $2000. Kyle challenges this — we don't cap crypto BTC at $150K, why cap xstock_spot? REMOVE cap (or set to 1M as effective-no-limit per crypto pattern).**
   - `max_bid_ask_spread`: Langston 1.50. Equity intraday spreads tight on liquid names (5-15 bps), can blow out around news. 1.50 = 150% which is `1.5` of `max_bid_ask_spread` field — too lax? Or is this in a different unit? Verify field semantics.
   - `min_liquidity`: $50K — sensible.
   - `universe_size`: 10 — VERY small. Crypto uses 100. Why 10? Possibly Langston conservative for Day 1; should be larger as we have 275 symbols.
   - `final_score_min`: 0.35 — same as crypto.
   - `confidence_threshold`: Langston suggested 70 (vs crypto 60). Conservative for Day 1 due to thin data. **Defensible**, but explicit "tighten as Layer 3 produces tuned values" tagging required.
- Q4.3: **`exclude_stablecoins`** — irrelevant for equities (no xUSDT). Field semantics: skip the check for asset_class != crypto_spot.
- Q4.4: **`allow_regulated_only`** — what does this mean for xStocks? Tokenized equities may be regulated differently from crypto.

**Reusable workflow question:** *for any new asset class, what global filter values apply, and does the schema need an asset_class dimension if not already present?*

### Stage 5 — Pattern Pool Filter (relaxed thresholds for pattern-pool pairs)
**What happens:** pairs failing quant filter but passing relaxed pattern thresholds enter the pattern pool for evaluation by PATTERN/HYBRID strategies. Pattern pool guardrails: lower DI/Volume bars, elevated `FINAL_SCORE_FLOOR=0.45`, capped position sizing.

**Crypto_spot configuration:** `module_constants` `pattern_pool_gates` with `asset_class='crypto_spot'` scope. Per `PATTERN_POOL_THRESHOLDS` + `PATTERN_POOL_GUARDRAILS` accessors.

**xstock_spot decisions needed:**
- Q5.1: **Does pattern pool make sense for xstock_spot?** Pattern strategies are crypto-microstructure-tuned (volatility breaks, liquidity traps). Equities have different pattern dynamics. **Initial leaning: SCOPE-DISABLE pattern pool for xstock_spot in B79.** Only enable if shadow-mode shows clean pattern signals.
- Q5.2: **If enabled — `pattern_pool_gates` constants need asset_class='xstock_spot' rows** (RSI bounds, FINAL_SCORE_FLOOR, MAX_POSITION_PCT). Numerical defaults: derive in B79 or inherit-and-tag?

**Reusable workflow question:** *does the new asset class have a pattern pool? If so, what relaxation is appropriate?*

### Stage 6 — Family Routing + IMF (per-family) Thresholds
**What happens:** each pair routed to family based on regime + DBS strength. Family classifications: TFS (trend), RBS (range), IE (impulse), HVU (high-vol), ST (default). Per-family IMF thresholds: family-specific DI_MIN, ADX_MIN, momentum_min. Strong-trend-lane (Path D, |DBS| >= 0.35) routes around regular IMF.

**Crypto_spot configuration:** family thresholds in DB rows. `directional_integrity`, `multi_tf_agreement`, etc. modules.

**xstock_spot decisions needed:**
- Q6.1: **Same family taxonomy (TFS/RBS/IE/HVU/ST)?** — Or do equities need different families? E.g. opening-range, closing-auction, intraday-mean-reversion, gap-fill? **Lean: same taxonomy for B79; expand only if shadow-mode shows family-fit issues.**
- Q6.2: **Per-family IMF thresholds** — Langston said seed `multi_tf_agreement` (3 rows that differ for 24/7 vs session-bound) for xstock_spot. What specific deltas?
- Q6.3: **Strong-Trend Lane threshold** for xstock_spot — same |DBS| >= 0.35 or different? (Same question as Q3.3.)
- Q6.4: **Family filter path architecture** — Kyle's explicit question. Own family-filter path or share crypto's? Lean: share for B79; revisit if equity-specific families surface from shadow-mode.

**Reusable workflow question:** *which family taxonomy applies, and which IMF thresholds need asset-class-scoped rows vs shared?*

### Stage 7 — Regime Classification (`calculatePairRegime`)
**What happens:** classifier dispatches pair to RBS/IE/TFS/HVU/ST_default based on vol, dx, momentum, |DBS| via the if/else cascade in `market-regime.ts:200-260`. Confidence formulas per branch. DBS gates within branches.

**Crypto_spot configuration:** 14 branch-condition constants in `crypto_spot/regime-thresholds.ts` (B78). Confidence formulas inline. `RegimeConfig` for runtime-tunable parts.

**xstock_spot configuration (already drafted, scope §2.3):**
- 14 named exports in `xstock_spot/regime-thresholds.ts`: vol thresholds halved (equity ATR% ~0.5-2% vs crypto 2-8%), DX thresholds tightened (equity trends slower but more reliable), DBS thresholds same (DBS scale-invariant), momentum thresholds halved. **CC subagent already populated.**
- Dispatch in `calculatePairRegime` via `if (assetClass === 'xstock_spot')`.

**xstock_spot additional decisions:**
- Q7.1: **Confidence formulas** — equity-specific tuning? Subagent kept formulas inline (no-touch fence on crypto math). Should xstock_spot have its own confidence formulas, or share?
- Q7.2: **`RegimeConfig` runtime-tunable constants** (b67_5PostCompositionFloor, b68_5PathBMomentumMin, tfsDesat*) — does xstock_spot need its own values? Currently inherits crypto by default.

**Reusable workflow question:** *which regime-classifier constants are asset-class-specific vs inherited?*

### Stage 8 — MCE (Market Context Engine) per-pair caching
**What happens:** pulls regime + DBS + indicators (RSI, ADX, ATR, momentum, vol) + macro_modifier (BTC dominance, funding rates, mcap momentum). Caches per-pair context (60s TTL).

**Crypto_spot configuration:** macro modifier composed of crypto-specific inputs (BTC dom, funding, mcap mom).

**xstock_spot decisions needed:**
- Q8.1: **Equity-equivalent macro modifier inputs** — BTC dominance and crypto funding rates aren't relevant. Equity equivalent: VIX (volatility index)? S&P 500 trend? Sector rotation strength? Yield curve? **This is non-trivial — equities respond to macro very differently.** Defer to Layer 3 calibration?
- Q8.2: **Cache TTL** — same 60s, or different for equities (which tick less frequently outside market hours)?
- Q8.3: **Indicator calculations** — RSI, ADX, ATR, momentum: are formulas identical on equity bars? Volume profile differs (U-shape: open + close peaks vs crypto's flatter). Volume-normalized indicators may behave differently.

**Reusable workflow question:** *what macro modifier inputs are appropriate, and which indicators need asset-class-aware computation?*

### Stage 9 — Strategy Selection + Detect
**What happens:** for each pair, candidate strategies determined by regime → strategy mapping (`canonical-regime-strategy-map.ts`). Each strategy's `detect()` function checks indicator state. Strategy fires raw signal if conditions met.

**Crypto_spot configuration:** 18 strategies (9 file-based + 9 in-class quant). Mapping in `MULTI_FAMILY_ELIGIBILITY`.

**xstock_spot configuration (already drafted, scope §2.5):**
- Whitelist of 6 enabled: `vwap_pullback`, `breakout`, `mean_reversion`, `range_trade`, `sma_trend_ride`, `vwap_bounce`. Other 12 scope-disabled.
- New helper `isStrategyEnabledForAssetClass(strategy, assetClass)`.

**xstock_spot additional decisions:**
- Q9.1: **Are 6 enabled strategies sufficient for equities?** Kyle's explicit question. Equity-specific strategies that crypto doesn't have: opening-range-breakout, gap-fill, end-of-day-mean-reversion, earnings-drift, sector-rotation. **Should B79 add any of these now, or defer all-additions to a B79.x or Phase 19?** Lean: defer all new strategies; observe shadow-mode behavior first.
- Q9.2: **Per-strategy indicator thresholds** — for the 6 enabled strategies, each has indicator constants (vwap distance %, breakout strength multiplier, range stability, SMA period, etc.). Inherit-and-tag (Langston Q3 answer in gap reply) OR derive equity baselines now? **Lean: inherit-and-tag for B79; iterate via shadow-mode observation.**

**Reusable workflow question:** *which strategies apply, and what asset-class-specific tuning do they need?*

### Stage 10 — Signal Quality Evaluation (SQE)
**What happens:** `predictiveConfidence` (rolling WR per pair × strategy), `regimeWeight`, `finalScore`. Geometry: entry/SL/TP based on ATR multipliers. ROI gate: dynamic threshold per confidence. Final admission gate.

**Crypto_spot configuration:** `sqe_config` module rows. `expectancy_kernel` for EV.

**xstock_spot configuration (already drafted, scope §2.3):**
- 4 SQE seed rows: di_min_quant=18, adx_min=18, momentum_min=0.002, di_min_pattern=10.
- Confidence threshold=70 (Langston gap-rev) vs crypto 60.

**xstock_spot additional decisions:**
- Q10.1: **`predictiveConfidence` rolling window size** — same as crypto? Equity bar density differs (24/5 vs 24/7).
- Q10.2: **ATR multipliers for SL/TP geometry** — equity ATR is in different absolute units. Multipliers (e.g. 1.5×ATR stop) should still scale correctly, but verify.
- Q10.3: **ROI gate `getDynamicROIThreshold`** — the function uses confidence + regime to set min-ROI. Asset-class-aware?

**Reusable workflow question:** *which SQE constants need asset-class scoping?*

### Stage 11 — Cost Model
**What happens:** round-trip cost = (fee × 2) + (slippage × 2) + spread. Net EV check (target - cost > floor). Asset-class-specific friction values via `cost-model.ts` (B79 Day 0).

**Crypto_spot configuration:** `CRYPTO_SPOT_FRICTION` from `exchange-defaults.ts`.

**xstock_spot configuration (subagent done):**
- `XSTOCK_SPOT_FRICTION`: feeRateTaker=0.0026, feeRateMaker=0.0016, spread=0.0012, slippage=0.0005, maxCostBound=0.005.

**xstock_spot decisions still open:**
- Q11.1: **Per-pair friction overrides** — top-tier xStocks (SPYx, AAPLx) have tighter spreads than tail names. `perPairOverrides` map. Defer to Layer 3 (Langston Q4 answer).
- Q11.2: **Solana settlement cost** — verify if there's a settlement fee beyond Kraken's spread. UAE-resident user; on-chain transactions on Solana have small SOL fees. NOT VTS concern (paper-only) but flag for Phase 19 active-trading wire-in.

**Reusable workflow question:** *what friction model applies, and are there exchange-specific overhead costs (settlement, custody) beyond fees + slippage + spread?*

### Stage 12 — Ranking + RTB Pool
**What happens:** all candidates passing all gates pool together. Ranking score = `predictiveConfidence × regimeWeight + CONTEXT_BONUS`. Top-N admission per cycle. **Cross-asset ranking parity is B81's `expectedNetReturnR` primitive.**

**Crypto_spot configuration:** current ranking is asset-class-agnostic by formula but biased by friction (equities will systematically outrank crypto on raw confidence × weight if friction not normalized).

**xstock_spot decisions:**
- Q12.1: **Cross-asset RTB pool** — does xstock_spot pool with crypto_spot, or separate? Currently all signals go into the same pool. **Initial: same pool, biased ranking until B81's `expectedNetReturnR` lands.** Acceptable for shadow-mode observation; risk of equity over-admission goes away when Phase 19 enables live trading on xstocks.
- Q12.2: **CONTEXT_BONUS asset-class scoping** — see plan doc §8.4 Q2 (B81 deferred decision).

**Reusable workflow question:** *does the new asset class share the RTB pool or get its own? Ranking parity work needed?*

### Stage 12.5 — Portfolio Risk / Exposure Gate (NEW per Langston rev 3)
**What happens:** between RTB ranking (Stage 12) and trade entry (Stage 13), `PortfolioRiskManager` enforces: max concurrent positions, portfolio heat per regime, symbol-cluster prevention (don't open 5 positions on highly-correlated pairs).

**Crypto_spot configuration:** symbol-cluster prevention is symbol-similarity-based (e.g. all SOL ecosystem tokens cluster). `concentration_risk` module rows.

**xstock_spot decisions needed:**
- Q12.5.1: **Sector-aware clustering** — Langston rev 3 flagged equities have STRONGER sector correlation than crypto. Crypto's symbol-similarity grouping won't catch "5 tech stocks" cluster. Need sector classification per xStock + sector-aware cluster check. **Equity-specific characteristic NOT in crypto inventory** (per §4): sector mapping required.
- Q12.5.2: **Max concurrent xstock_spot positions** — same as crypto or different? With 24/5 trading, equity positions held over weekend are different exposure profile.
- Q12.5.3: **Portfolio heat asset-class scoping** — does max-heat allow 5% on crypto AND 5% on xstock_spot, or shared 10% across? Architecture decision — affects diversification math.
- Q12.5.4: **Audit `portfolio-risk-manager.ts`** — verify PIA list (Langston rev 3 §H). Likely needs asset-class scoping work.

**Reusable workflow question:** *what portfolio-level risk gates apply, and do they need asset-class-aware clustering / heat scoping?*

### Stage 13 — Trade Entry
**What happens:** VTS path → virtual entry, write to `signal_eval_archive`. Active path → `paper-execution-engine`, `paper_sim_open_positions` row.

**Crypto_spot configuration:** standard pipeline.

**xstock_spot decisions:**
- Q13.1: **Position sizing** — same $1000 base / ~$150/trade (per plan doc operational facts). Fractional supported. Verify works for AAPLx at $230 (~0.65 shares).
- Q13.2: **Tokenized equity smaller pieces** — `xstocks-universe.json` lists 275 symbols; not all are deeply liquid. $150/trade may be too large for thinly-tokenized names. **Defer to Layer 3** — observe trade fill quality in shadow-mode.

**Reusable workflow question:** *position sizing parameters and adaptations for the asset class.*

### Stage 14 — Trade Lifecycle (live ticks → exit decisions)
**What happens:** WS price updates flow ws-adapter → live-pricing-adapter (post-B78.1 EventEmitter wiring) → priceCache. TEC monitors gain/loss against ATR-derived stops. Stop hits (BE-stop, fixed-stop, trailing-stop), target hits.

**Crypto_spot configuration:** crypto_spot uses `wss://ws.kraken.com/v2`. Now via priceTick events.

**xstock_spot decisions:**
- Q14.1: **Live pricing path for xstock_spot** — B78.1 EventEmitter wiring is for crypto Spot WS. xStocks live on `wss://ws-equities.kraken.com` (B74's equity-spot-archiver). **Currently archiver is passive-only.** Does VTS need real-time xStock prices, or is 1m archive lookup sufficient? **Critical question — if VTS needs real-time, we need to build/extend a live-pricing-adapter for the equities WS endpoint.**
- Q14.2: **TEC stop logic equity-aware** — equity intraday gaps (lunch lull → news spike) different from crypto. Same ATR-based stops or equity-tuned multipliers?
- Q14.3: **Friday-close handling** — open xstock_spot trade across the weekend gap: stops can't fire when market closed. Does TEC need a "freeze stops outside market hours" mode? **YES per plan doc operational facts.**
- Q14.4: **Earnings/news event handling** — should TEC tighten stops or pause new entries before scheduled earnings?

**Reusable workflow question:** *what live-pricing infrastructure does the asset class need, and what trade-lifecycle adaptations apply?*

### Stage 14a — Position Management Triggers (NEW sub-stage per Langston rev 3)
**What happens:** within a live trade, between entry and final close: BE-stop arming (when gain reaches X×ATR, move stop to entry), trailing-stop activation (when gain reaches Y×ATR, start trailing), partial-take (close N% at first target). These are NOT exit triggers (Stage 15) but lifecycle events with their own asset-class tuning.

**Crypto_spot configuration:** `trailing-exit-controller.ts` (TEC) handles all three. Module constants: `break_even_trigger_r`, trailing thresholds, partial-take fractions. Variant K (BE-disabled) currently active.

**xstock_spot decisions needed:**
- Q14a.1: **BE-stop trigger expressed in ATR multiples** — equity ATR is in different absolute units. The B77 fix (multiplier-based gate) is asset-class-portable. But the CHOICE of multiplier (1.0×ATR for crypto) may be wrong for equity dynamics. **Defer to Layer 3 — observation drives.**
- Q14a.2: **Trailing-stop activation threshold** — same Y×ATR for both? Equity intraday trends often shorter; trailing should activate sooner?
- Q14a.3: **Partial-take fractions** — 50% off at first target works for crypto; equity has different volatility profile. Layer 3 calibrates.

**Reusable workflow question:** *what position-management triggers apply, and are their thresholds asset-class-portable or need re-derivation?*

### Stage 15 — Trade Close
**What happens:** close trigger fires. Realized P&L net of friction. Write to `paper_sim_trades`. Write to ablation tables (regime_factor_alternates) — B70 archiver. Update telemetry, predictiveConfidence rolling window.

**Crypto_spot configuration:** standard.

**xstock_spot decisions:**
- Q15.1: **Telemetry asset-class aware** — does PairFailureTracker, AdaptiveRatioManager, predictiveConfidence rolling all separate per asset class? **Critical** — mixing equity + crypto telemetry would corrupt regime-aware ratios for both.
- Q15.2: **Archive table schema** — does `paper_sim_trades` have asset_class column? If not, schema add.

**Reusable workflow question:** *what archive/telemetry tables need asset_class scoping?*

### Stage 16 — Calibration / Learning Loop
**What happens:** factor-ablation-emitter writes per-factor counterfactuals to `regime_factor_alternates`. drift-dashboard-aggregator computes lift, shifts. Telemetry feeds back into adaptive-scan-manager.

**Crypto_spot configuration:** B76 chain-final framework, B70 archive.

**xstock_spot decisions:**
- Q16.1: **Aggregator scope** — B78 added `AND asset_class='crypto_spot'` to drift aggregator (locking crypto cohort). For xstock_spot calibration: separate query path? Combined per-asset-class results?
- Q16.2: **Layer 3 shadow-mode duration** — plan doc §6.2 says 48-72h. Sufficient for equity calibration given session-only trading (~16hr/day × 5 days = 80hr in 7 days)?
- Q16.3: **Counterfactual generation for equity-specific factors** — if Stage 8's equity macro modifier is different (VIX, etc.), need new B68.x-equivalent counterfactual builder?

**Reusable workflow question:** *what calibration framework adjustments are needed for the new asset class?*

---

### §1.X Cross-cutting — Failure Mode Taxonomy (NEW per Langston rev 3)

Equities have failure modes crypto doesn't. Belongs as a per-class taxonomy table in workflow doc, not a journey stage.

| Failure event | Crypto handling | xstock_spot handling |
|---|---|---|
| Trading halt (LULD — Limit Up/Limit Down) | N/A | Pause new entries on affected pair; freeze trailing stops |
| Circuit breaker (NYSE Level 1/2/3 = market-wide pause) | N/A | Pause ALL xstock_spot scanning during halt window |
| Delisting | rare; pair removal protocol | xStocks dynamic universe; pair removed from xstocks-universe.json |
| Stock split / corporate action | N/A | Price-history adjustment; flag for re-baseline of indicators |
| Dividend payment (price drops by div amount) | N/A | Detect price-jump anomaly; don't fire signals on the drop |
| Earnings event window | N/A | Pause new entries N hours before scheduled earnings; tighten stops |
| Market holiday (full close) | N/A | Half-day half-close; ARCA holiday calendar lookup |

**B79 deliverable:** taxonomy populated for xstock_spot in workflow doc Section B addendum. Detection + handling for the most-likely (LULD halt, holiday) implemented or explicitly deferred to B79.x with a tracking issue.

## §2. Open questions Kyle raised explicitly

These are repeated from §1 stages but pulled together for emphasis:

1. **Why max-price cap on xStocks if we don't cap crypto?** (Stage 4). **Resolution: REMOVE the cap. No cap on crypto = no cap on xstock_spot. Set `max_price` to effectively-no-limit (1M or NULL).**
2. **Own scanner or feed FX5?** (Stage 2). Lean: own scanner pool, isolated telemetry.
3. **Own family filter path or share?** (Stage 6). Lean: share for B79; revisit if needed.
4. **Do we have all the right strategies, or do we need to add more?** (Stage 9). Lean: defer all new strategies; observe first.
5. **Per-pair characteristics gathered** — need to enumerate what we gather for each crypto pair and ensure xStock equivalents exist.

## §3. Additional questions CC surfaces

1. **xStocks listing dynamism** — universe grows 100→500 by EOY. Refresh protocol? (Stage 1.4)
2. **Time-of-day effects** — equity intraday patterns (open burst, lunch lull, close auction). Time-of-day-aware regime/strategy gates? (Stage 8.1, 14.2)
3. **Earnings/news event windows** — pause new entries / tighten stops around scheduled events? (Stage 14.4)
4. **ARCA holiday calendar** — beyond simple Sat/Sun pause, US market holidays (4th of July, Christmas, etc.). Half-days. (Stage 14.3)
5. **Macro modifier inputs for equities** — VIX? S&P trend? Sector rotation? Yield curve? (Stage 8.1)
6. **Indicator formulas same on equity bars?** — RSI/ADX/ATR/momentum should be formula-invariant but volume-normalized indicators may behave differently due to U-shape volume profile. (Stage 8.3)
7. **Stop-loss freeze across market-closed periods** — TEC must not fire stops when market closed. (Stage 14.3)
8. **Telemetry asset-class isolation** — PairFailureTracker, AdaptiveRatioManager, predictiveConfidence rolling: do they partition correctly per asset class today, or contaminate? (Stage 15.1)
9. **Live pricing infrastructure for equity WS** — extend B78.1 pattern to equity feed, or VTS uses 1m archive lookup? (Stage 14.1)
10. **`paper_sim_trades` schema asset_class column** — exists or needs add? (Stage 15.2)
11. **Solana settlement cost overhead** — beyond Kraken spread/fees, anything? (Stage 11.2; Phase 19 concern but flag now)
12. **`screener_filters.allow_regulated_only` semantics for tokenized equities** — what does "regulated" mean for xStocks? (Stage 4.4)
13. **Half-day market sessions** — early close days (Black Friday, Christmas Eve). Beyond simple Fri 22:00 UTC. (Stage 14.3)
14. **Equity-specific failure modes** — pair-failure-tracker cooldown reasons. Trading halt, circuit breaker, delisting. New failure-reason taxonomy? (Stage 15.1)

---

## §4. Per-pair characteristics inventory

For each crypto pair, we currently gather/compute (some via Kraken REST, some derived):
- Symbol, base, quote
- 24h volume (USD)
- Last price
- Bid/ask spread
- Order book depth (top N levels)
- Min order size, lot size, price tick size
- 5m/15m/1h/4h OHLC
- ATR (per timeframe)
- ADX, DI+, DI-, RSI, momentum
- DBS (multi-timeframe)
- Regime classification + confidence
- Liquidity score (LQ)
- Volume noise (VN)
- Correlation matrix entries

**For xstock_spot we need:**
- Symbol, base, quote: ✓ from `xstocks-universe.json`
- 24h volume: ✓ from `equity_spot_ohlc_1m` aggregation
- Last price: ✓ from B74 archiver tick snap
- Bid/ask spread: **TBD** — does Kraken xStocks WS publish bid/ask? Or only mid?
- Order book depth: **TBD** — is the Kraken Equities WS book channel exposed?
- Min order size, lot size, price tick: **TBD** — Kraken xStocks fractional $1 minimum, but tick size? 
- OHLC across timeframes: ✓ via aggregation from 1m source
- ATR/ADX/DI/RSI/momentum: ✓ formulas apply
- DBS: ✓ formula applies (verify timing-of-day adjustment per Q3.4)
- Regime classification: ✓ via xstock_spot/regime-thresholds (subagent done)
- Liquidity score, volume noise: **needs equity-tuned thresholds** (LQ >= 35 may be too tight for 24/5 vs 24/7 cumulative volumes)
- Correlation matrix: **equities have STRONGER sector correlation than crypto** — Langston flagged this. May need separate correlation handling.

**Equity-specific characteristics NOT in crypto inventory:**
- Underlying stock fundamentals (P/E, market cap, sector) — relevant for some strategies
- Implied volatility (from options, if Kraken exposes it)
- Earnings calendar
- Analyst ratings / consensus estimates
- Sector classification (tech, finance, energy, etc.)
- Market-cap classification (large-cap, mid-cap, small-cap)

**B79 question:** which of these equity-specific characteristics do we need NOW, vs gather progressively as use cases emerge?

---

## §5. Architectural questions (Kyle's "scanner / family / strategy" framework)

### Q5.1 Scanner architecture: shared FX5 vs dedicated xstock scanner?

**Pros of shared (current subagent approach):**
- Less code, faster Day 1 ship.
- One scan loop drives everything; simpler operations.
- Adaptive ratio manager already exists.

**Pros of dedicated (own scanner):**
- Telemetry isolation — equity and crypto behavior don't mix in Ideal/Rotational pool selection.
- Different scan cadence possible (equity less frequent during off-hours).
- Asset-class-aware benchmark pairs (SPYx + QQQx for xStocks).
- Different batch size possible.
- Easier to disable scanning during market-closed periods.

**Lean: dedicated scanner for B79.** Telemetry isolation is the key win. Operationally, run two parallel scan loops with shared scheduler.

### Q5.2 Family filter path: shared vs separate?

**Lean: shared for B79.** The TFS/RBS/IE/HVU/ST taxonomy is regime-based, not asset-class-based. A trending equity is still a TFS pair conceptually.

**But:** family-IMF thresholds (DI/ADX/momentum minimums per family) need asset-class-scoped values. Path is shared; thresholds differ.

### Q5.3 Strategy adequacy for equities

Current 18 strategies:
- 9 file-based: adaptive-flow, defensive-hedge, inside-bar-reversal, morning-star, pivot-shift, reverse-impulse, strong-bull-trend, support-bounce, volatility-edge.
- 9 in-class quant detect functions: vwap_pullback, breakout, mean_reversion, range_trade, sma_trend_ride, vwap_bounce, dhma, abcd_long, liquidity_trap.

**Equity-specific strategies we DON'T have:**
- **Opening Range Breakout (ORB)** — first 15-30min range, breakout signals strong directional moves. *Common equity day-trading strategy.*
- **Gap-Fill Reversion** — overnight gap-up that reverses to fill the gap. Specific to session-bound markets.
- **End-of-Day Mean Reversion** — last hour pullback against intraday trend.
- **VWAP Tagging** — touch + reject of VWAP as entry signal (different from vwap_pullback).
- **Earnings Drift** — post-earnings momentum (requires earnings event awareness).
- **Sector Rotation Long/Short** — rotate into outperforming sectors.

**B79 lean: ship with 6 enabled crypto-derived strategies; observe shadow-mode for false-positive density. Add equity-specific strategies in a B79.x or post-B81 batch as observation surfaces gaps.**

---

## §6. Workflow document deliverable (NEW per Kyle directive)

### §6.1 File location + naming

`1-system-manual/ASSET_CLASS_ONBOARDING_WORKFLOW.md`

### §6.2 Document structure (template)

```
# Asset Class Onboarding Workflow

## Section A.0 — Asset Class Definition + Operational Profile (NEW per Langston rev 3)
   Structured table per asset class:
   - Hours (24/7, 24/5, etc.)
   - Settlement (centralized exchange book, on-chain Solana, custodial broker, etc.)
   - Geography / regulatory restrictions
   - Fees (maker/taker; volume tiers)
   - Custody model
   - Exchange WS/REST endpoints
   - Symbol form on each endpoint

## Section A — Discovery + Inventory
   For new asset class, gather:
   - Operational facts (trading hours, settlement, geographic restrictions, fees)
   - Pair universe source + refresh cadence
   - Ticker + OHLC data source
   - Live-pricing infrastructure (WS endpoint, REST fallback)
   - Per-pair characteristics inventory (compare to §4 above)
   - Equity/asset-specific characteristics (sector, fundamentals, etc.)

## Section B — Architecture Decisions
   - Scanner: shared vs dedicated?
   - Family filter path: shared vs separate?
   - RTB pool: shared vs separate?
   - Live-pricing: extend existing or build dedicated?
   - Telemetry isolation: how partitioned?

## Section C — Schema + Configuration Surface
   - module_constants rows needed (per family: regime, sqe, friction, strategy indicators)
   - screener_filters row (with new asset_class dimension)
   - module_constants pending_layer_3 tags for unknown values
   - SIM update for new component touchpoints

## Section D — Code Surface
   - asset_classes/<class>/regime-thresholds.ts
   - asset_classes/<class>/friction.ts
   - asset_classes/<class>/pattern-pool-filters.ts
   - asset_classes/<class>/market-hours.ts (if session-bound)
   - asset_classes/<class>/index.ts re-exports
   - calculatePairRegime dispatch
   - cost-model assetClass param
   - market-scanner pair-universe merge (or own scanner)
   - signal_quality_evaluator gates
   - resolveAssetClass logic
   - MULTI_FAMILY_ELIGIBILITY scoping

## Section E — 16-Stage Walkthrough Checklist
   For each stage, verify:
   - What variables/thresholds/gates apply?
   - Are they asset-class-scoped or shared?
   - Where do values come from (DB rows, TS constants, derived)?

## Section F — Layer 1 / Layer 2 / Layer 3 protocol
   - Layer 1: domain-knowledge baseline (this batch)
   - Layer 2: cross-asset shadow-classify + sanity check
   - Layer 3: live shadow-mode observation 48-72h+
   - Calibration discipline (tertile-monotonic WR, ≥7pp gap, p<0.05, n≥150/bucket)

## Section G — Verification + Forward-Watch
   - Behavioral verify checklist
   - No-touch fence on production asset classes
   - Shadow-mode metrics

## Section I — Onboarding Decision Framework (NEW per Langston rev 3)
   If/then rules for new asset class:
   - If session-bound → market-hours gate + holiday calendar mandatory
   - If macro factors non-trivial → ship modifier=1.0, defer
   - If unique microstructure → strategy-gap analysis required pre-ship
   - If session timing introduces systematic gaps → BE-stop trigger reviewed, not inherited
   - If sector correlation > intra-class crypto correlation → portfolio-cluster sector-aware
   - If new failure modes → taxonomy table populated before ship

## Section H — Worked Examples
   ### Section H.1 — xstock_spot (B79)
   - For each Section A-G, what was decided + why
   - Reference to BATCH_79 commits / completion report
   - **Section H.1.x — "What we'd do differently next time" post-mortem (NEW per Langston rev 3):** populated after first 7 days of live shadow-mode observation.
   ### Section H.2 — crypto_perp (B80, populated when B80 ships)
   ### Section H.3 — (future asset classes)
```

### §6.3 Reusability for B80 + future

When B80 (crypto_perp) starts, the implementer:
1. Opens `ASSET_CLASS_ONBOARDING_WORKFLOW.md`
2. Walks Section A-G for crypto_perp
3. Identifies perp-specific deltas (funding rate, leverage, liquidation, perpetual settlement)
4. Updates the workflow doc with crypto_perp as another worked example in Section H
5. Iterates the template based on what crypto_perp reveals

**Compounding value:** every new asset class strengthens the workflow. By the time we add FX (Phase later), the doc is battle-tested.

### §6.4 Future: exchange-onboarding workflow (separate, simpler)

Kyle: *"at some point we need to have a similar workflow for when we add other exchanges."*

Likely simpler because exchange differences are mechanical (API, symbol normalization, fee schedule) rather than conceptual (asset class affects regime classification, strategy applicability, etc.). Out of scope for now; flag as future deliverable.

---

## §7. Implementation sequencing (multi-batch likely)

**Sub-batch breakdown if scope can't fit in one push:**

- **B79 (this batch)** — workflow doc + code scaffolding for xstock_spot:
  - `ASSET_CLASS_ONBOARDING_WORKFLOW.md` v1 with xstock_spot as worked example
  - All asset_classes/xstock_spot/* files populated (already partially done by subagent)
  - `screener_filters` schema migration (asset_class + tunable_status columns) + xstock_spot row (with corrected max_price = NO CAP)
  - Strategy whitelist + weekend pause (subagent done)
  - Pair-universe merge into market-scanner OR dedicated scanner (architecture call needed)
  - module_constants seeds for confirmed-different families (multi_tf_agreement, correlation_matrix, macro_modifier per Langston) + tagged-inheritance for the rest
  - Confidence_threshold=70 row
  - Verify shadow-mode emission

- **B79.1** — equity-specific characteristics gathering (if needed):
  - Sector classification, market-cap classification, earnings calendar wiring (if scoped in)
  - Live-pricing adapter for `wss://ws-equities.kraken.com` if VTS needs real-time

- **B79.2** — equity-specific strategies (if shadow-mode reveals gaps):
  - Opening Range Breakout, Gap-Fill, End-of-Day MR, etc.

- **B79.3** — equity macro modifier (if VIX/sector signals needed):
  - Equity-equivalent of B67.1 macro modifier

- **B80 (crypto_perp)** — applies workflow template; populates Section H with crypto_perp example.

---

## §8. Plain-language summary for Kyle

(Will be written separately after scope is finalized with Langston, per Kyle's request.)

---

## §9. Outstanding questions for Langston (consolidated)

1. **Max price cap on xstock_spot — REMOVE per Kyle. Confirm.**
2. **Scanner architecture — shared FX5 vs dedicated xstock scanner?** Lean dedicated.
3. **Family filter path — shared vs separate?** Lean shared with asset-class-scoped IMF thresholds.
4. **Pattern pool for xstock_spot — enable or scope-disable?** Lean scope-disable for B79.
5. **Strategy whitelist — 6 enough, or add equity-specific (ORB, Gap-Fill, EOD-MR)?** Lean 6 for B79; observe.
6. **Live-pricing adapter for equity WS — extend now or VTS uses 1m archive?** Critical infrastructure call.
7. **Macro modifier for equities — VIX/S&P/Sector now or defer to B79.3?**
8. **Telemetry asset-class isolation — does it work today or need fixes?**
9. **`paper_sim_trades` and other archive tables — asset_class column exists?**
10. **Half-day / holiday calendar handling beyond Sat/Sun pause?**
11. **Confidence_threshold=70 — keep or default to 60 like crypto?** (Langston's original rec; Kyle didn't push back specifically but worth re-affirming after framework discussion.)
12. **`universe_size=10` (Langston's rec) — too small? 275 symbols available; pick proportional value?**

---

## §10. Pre-Implementation Audit (PIA) gate — MANDATORY before implementation kickoff

Per Langston rev 3 §H + CLAUDE.md §2 Step 2.

**SIM consultation list (~15 components):**
- `market-scanner.ts` (universe construction)
- `adaptive-scan-manager.ts` (batch selection)
- `pair-failure-tracker.ts` (cooldown blacklist; partitioning audit)
- `adaptive-ratio-manager.ts` (ideal/rotational ratios; partitioning audit)
- `directional-bias.ts` (DBS computation; equity formula applicability)
- `market-regime.ts` `calculatePairRegime` (asset-class dispatch — subagent done; verify)
- `market-context-engine.ts` (MCE per-pair caching; macro modifier handling)
- `signal-quality-evaluator` (SQE — predictiveConfidence partitioning audit, getDynamicROIThreshold)
- `cost-model.ts` (asset-class friction — subagent done; verify)
- `paper-execution-engine.ts` (admission path)
- `trade-execution-controller` / `trailing-exit-controller.ts` (TEC stop-freeze for market-closed periods)
- `live-pricing-adapter` (scope-clarification only; deferred per Q9.6)
- `equity-spot-archiver.ts` (staleness gate verify)
- `drift-dashboard-aggregator.ts` (calibration scoping verify)
- `portfolio-risk-manager.ts` (sector-correlation cluster check; asset-class heat scoping)

**Schema audit list:**
- `screener_filters` — column add (asset_class + tunable_status)
- `module_constants` — verify asset-class-scoped row pattern
- `paper_sim_trades` — verify asset_class column exists; if not, add
- `signal_eval_archive` — verify scoping
- `regime_factor_alternates` — verify scoping (B69 + B78 work)
- `paper_sim_open_positions` — verify asset_class column

**Telemetry partitioning audit (Langston rev 3 elevated to PIA blocker per Q9.8):**
- PairFailureTracker: per-asset-class partitioning?
- AdaptiveRatioManager: per-asset-class ratios?
- predictiveConfidence rolling-window: per-asset-class buckets?

**Any component NOT partitioning is a B79 hard blocker — fix before xstock signals enter telemetry.** A poisoned predictiveConfidence rolling window for a crypto pair caused by an equity false-positive is exactly the kind of cascade the no-touch fence exists to prevent.

**PIA gate sequence per Langston rev 3 §H:** scope-lock (rev 4) → SIM consultation → telemetry-partitioning audit → PIA report → Step-2 Langston review → implementation kickoff. **DO NOT compress these steps.**

## §11. Process commitments

1. **No silent inheritance.** Any threshold xstock_spot uses that's not explicitly set is `tunable_status='pending_layer_3'`-tagged in DB.
2. **Workflow doc is Tier 2 mandatory for B79.** Update at every milestone in implementation.
3. **Plain-language summary delivered before push.**
4. **B79 single ambitious batch per Langston rev 3 §F** — sub-batches B79.1/.2/.3 trigger only on shadow-mode evidence, not pre-scheduled.
5. **No-touch fence on crypto_spot remains absolute** through 2026-05-15.
6. **Symbol-normalizer utility (NEW per Langston rev 3 §G):** `server/utils/symbol-normalize.ts` exports `normalize(symbol, assetClass) → canonical`. Future-proofs cross-exchange overlaps when new exchanges are added.
7. **Asset-class-aware data-freshness gate (NEW per Langston rev 3 §G):** equity going silent during off-hours is normal; during hours is health alarm. Crypto silence is always alarm. Don't reuse one threshold.
8. **Forward-watch dashboard requirement (NEW per Langston rev 3 §G):** every asset class onboarding must define what metrics get watched in the first 24h and 7d post-go-live, alongside the existing no-touch fence SQL pattern. Add to workflow doc Section G.
9. **Plain-language "what is this asset class and why" front-matter (NEW per Langston rev 3 §G):** workflow doc must lead with non-jargon explanation per asset class. Kyle's stated need.

---

*End of BATCH_79_SCOPE.md rev 3. Pending Langston Step-1+2 combined review on rev 3 with Kyle's directive verbatim attached.*

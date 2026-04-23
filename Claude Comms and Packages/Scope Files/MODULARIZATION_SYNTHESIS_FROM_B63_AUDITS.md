# Modularization Synthesis — From B63 Audit Evidence

**Author:** Claude Code, 2026-04-22
**Status:** Synthesis of Items 15, 18, 19 §E sections + Streakiness Analysis Part III
**Purpose:** Consolidate modularization findings from three audits and the streakiness analysis into a single architectural blueprint, with asset-class expansion as the primary driver
**Feeds into:** Post-live Modularization Phase scope doc (currently in backlog); also informs B66 and B67 sequencing
**Supersedes:** §E sections of Items 15/18/19 are preserved as input, this doc is the CONSOLIDATED output

---

## Executive Summary

The B63 audit stream produced four complementary deliverables — Items 15, 18, 19, and the streakiness analysis. Taken together they make an unambiguous case for modularizing the signal pipeline, driven by TWO needs that reinforce each other:

**Primary driver — Asset class expansion (Kyle directive 2026-04-22):** DawnTrader will soon add x-stocks and perpetual futures as Kraken-available asset classes, eventually FX. Each asset class has different characteristics, constants, coefficients, and applicable external data. The current pipeline is implicitly crypto-spot-only — 45 hard-coded tunable constants (Item 15 Level 1) are baked into source files with no asset-class dimension. Modularization is the **required precondition** for asset-class expansion, not a nice-to-have. Without it, adding x-stocks means forking the entire codebase; with it, spawning a new asset class means spawning module instances with DB-driven per-asset-class constants.

**Secondary driver — Active-trading readiness:** Items 15/18/19 found structural failures that must be fixed before Phase 19 goes live. SQE is anti-predictive, scoring inputs are snapshot-heavy, global regime aggregation is stuck, scan-cycle batch correlation is 36pp above independence. These findings require iteration speed (A/B testing formula changes, rolling out per-lever fixes) that the current deploy-build-restart cycle cannot support. Modularization enables rapid calibration; the alternative is weeks of deploy cycles.

Together: **modularization is a hard prerequisite for both asset-class expansion (post-live) and active-trading go-live (Phase 19).** The sequencing discussed below reflects that reality.

---

## Part I — Evidence Base (from the four audits)

### 1.1 Lever inventory (Item 15 Level 1)

**69 adaptive levers across 14 categories. 51 (74%) are static-tunable hard-coded constants. Only 18 (26%) actually adapt at runtime.** Of the 51 static-tunable, 6 are DB-driven (via `screener_filters` table); the remaining 45 require a code deploy + PM2 restart to change.

**Key fragmentation:** the 51 hard-coded constants live across 12+ files. Authority is scattered — there is no single "adjustable parameters" surface. This is the operational symptom that motivates modularization from an iteration-speed angle.

### 1.2 Scoring pipeline anti-predictive behavior (Item 18)

- **FinalScore vs net profit: r = −0.017** (noise with slight negative bias)
- **Decile-1 WR 50.8% vs Decile-9 WR 15.3%** (strong inversion, not merely uncorrelated)
- **In TFS regime (46.2% of all trades): FinalScore is actively inverted** (higher scores correlate with worse outcomes)
- **MIN_FINAL_SCORE (0.35) filters 1.8% of trades; MIN_REGIME_WEIGHT (0.30) filters 0.0%** — the thresholds are no-op in VTS mode (by design — VTS bypasses SQE) but will carry through unchanged to Phase 19 paper mode unless recalibrated
- **PredictiveConfidence self-cancellation design flaw** — same input simultaneously eases FinalScore gate (via +0.3 weight) AND tightens ROI gate (via `getDynamicROIThreshold`). In VTS where FinalScore is no-op, ROI becomes binding → high-confidence trades face STRICTER filtering than low-confidence ones.
- **Only `quant-strong_trend` source pool is net-profitable** (n=53, 58.5% WR, +0.0093 avg net). Every other pool is net-negative. Validates the B63 Item 11 strong-trend-lane architecture.

### 1.3 Temporal pathologies (Item 15 §2.4, Item 19, Streakiness)

- **Scoring pipeline is snapshot-heavy.** 7 of 10 audited scoring inputs use snapshot or cumulative data. PredictiveConfidence uses all-time cumulative VTS win rate — in a market that shifts on multi-hour timescales, it measures a market that no longer exists.
- **ExpectedEdge anti-correlation r = −0.130** — the edge kernel is systematically overestimating profitability. Mean expected edge +2.28% vs mean actual net −0.98% = 326 bps gap on average per trade.
- **Global regime label was effectively frozen pre-B62, now PARTIALLY FIXED** (Item 19 H1, corrected 2026-04-22). During the 70-loss streak 04-17 → 04-18, global regime stayed 100% TFS while pair-level regimes diverged heavily (04-18 00:00: RBS 36% + ST 36%, TFS only 23%). **Post-B62 re-verification (2026-04-20 onward): global regime aggregation now responsive, 2 transitions in 72h, reacting to pair-level consensus.** Severity downgraded P0 → P1. Still a tuning opportunity (transition responsiveness could be faster) but NOT a blocking prerequisite for Phase 19.
- **Scan-cycle batch correlation 87.8% same-outcome (Item 19 H2)** vs 51.9% expected under independence — 36pp excess. 21% of all trades enter in multi-entry minutes. Consistent with VTS design intent (broad capture, no gating cuts) but sets the minimum requirement for active-trading gate tightness.
- **Streakiness is statistically decisive** (runs test z = −15.57, p < 10⁻⁵⁰). 70-loss streak was NOT a single-cause event — 6 strategies, 5 regimes, 3 source pools, 42 pairs. Only constant: global regime = 100% TFS. Six code-level mechanisms traced in streakiness Part III.

### 1.4 Dormancy of safety systems (Item 15 §3.9)

- **Global regime 90.6% TFS** means mode overlay almost always sits at NORMAL.
- **Governance gates (TRANSITION/UNSTABLE)** almost never activate.
- The defensive mechanisms intended to protect during regime transitions (widening stops, tightening position size, raising confidence floors) **never activated** during the 54% → 10% WR collapse on 04-17 → 04-18.

---

## Part II — Natural module boundaries (synthesized from §E sections)

Items 15, 18, and 19 each proposed module boundaries from their own scope. Consolidating:

### 2.1 Eight canonical modules (7 + Filter module family)

Item 18 §E proposed 5 modules (Eligibility, Scoring Kernel, Threshold, Profitability, Ranking). Item 15 §E and the external-data architecture placement add a 6th (Context Provider). The 2026-04-22 multi-exchange directive adds a 7th (Exchange Adapter). The canonical list:

| # | Module | Owns | Reads | Written by |
|---|---|---|---|---|
| **1** | **Exchange Adapter** (NEW per 2026-04-22 directive) | Data feed subscription, symbol normalization, order placement, fee schedule, market hours, per-exchange credentials | Exchange APIs (Kraken, Binance, Alpaca, IBKR, ...) via implementation-per-exchange | Multi-exchange directive |
| **1b** | **Filter Module Family** (NEW per 2026-04-22 directive) | A SET of named filter modules per asset class: min_volume_24h, min_price, max_spread, market_hours, min_OI, max_funding_rate, earnings_blackout, etc. Each filter is a first-class module in `module_constants` (module_name = 'filter:X'). Filter registry per (exchange, asset_class) determines which filters are active. | Exchange Adapter output (price, volume, OHLC); external inputs for asset-class-specific filters (e.g. OI for perps, earnings calendar for equities) | Filter dimension directive |
| **2** | **Context Provider** (extended MCE) | All market-context fields: regime, DBS, indicators, volatility, momentum, external context (BTC dom, funding rates, etc.) | Exchange Adapter (price/volume/OHLC); External Context Store (B67); directional-bias-store; OHLC cache; Filter-eligibility output (for pairs that pass filters) | Item 18 §E, Item 15 §E, external-data placement doc |
| **3** | **Eligibility** | Strategy × regime × stability → bool; governance gate; asset-class gating (some strategies don't apply to some asset classes) | Context Provider | Item 18 §E.5 |
| **4** | **Scoring Kernel** | FinalScore formula, RegimeWeight, PredictiveConfidence, decayPenalty, hybridScore — constants keyed by (exchange, asset_class, regime) | Context Provider | Item 18 §E.5 |
| **5** | **Threshold** | All min/max cutoffs: FinalScore min, RegimeWeight min, pattern pool floor, mode-specific floors — keyed by (exchange, asset_class, regime, strategy) | Scoring Kernel output + screener_filters DB + module_constants DB | Item 18 §E.5 |
| **6** | **Profitability** | ROI gate, dynamic ROI thresholds, realized-EV-adaptive floor — keyed by (exchange, asset_class) | Scoring Kernel.predictiveConfidence + entry/target geometry | Item 18 §E.5 |
| **7** | **Ranking** (currently missing; Phase 19 blocker) | Top-N selection among passing signals per scan cycle, per-underlying position limits (cross-exchange aggregation), per-asset-class position limits | Outputs of modules 1-6 | Item 18 §E.5 + 2026-04-22 expansion |

**Key insight on inter-module data flow with multi-exchange:** the Exchange Adapter is upstream of everything. Context Provider reads normalized OHLC/price from the adapter. Every scoring/threshold/profitability decision is exchange-aware via the module_constants table. Ranking is exchange-aware because position limits must aggregate across exchanges (you shouldn't hold 3× ETH exposure just because it's split across Kraken + Binance + Alpaca).

### 2.2 Independence map

From Item 18 §E.2 (independence analysis):

- **Fully independent:** Eligibility, Context Provider
- **Mostly independent:** Profitability (only dependency on Scoring Kernel is `predictiveConfidence` as opaque input)
- **Tightly coupled:** Scoring Kernel (FinalScore ↔ RegimeWeight ↔ PredictiveConfidence — cannot decouple without formula redesign)
- **Separate concern:** Threshold (consumes Scoring Kernel output but does not reach into its internals)
- **Does not exist yet:** Ranking (must be designed fresh for Phase 19)

### 2.3 Cadence bands (from Item 19 Part A, corrections pending)

Four natural cadence tiers that imply scheduling boundaries:

| Tier | Cadence | Examples |
|---|---|---|
| **Tier 0 — Real-time** | Per-signal (sub-second) | SQE gating, Ranking cut, position limit checks |
| **Tier 1 — Per-pair on-demand** | ~60s cache TTL | MCE per-pair context (regime, DBS, indicators) |
| **Tier 2 — Per-cycle batch** | 30s scan, ~5min telemetry flush | Global DBS aggregation, global regime aggregation, FX5 scan |
| **Tier 3 — External cadences** | Source-specific (30s funding, 1h BTC dom, 1m DXY) | External Context Store refreshes |

Per Item 19's modularization lens: modules at the same cadence tier should share a scheduler; modules at different tiers should not. A scheduling architecture that respects these bands prevents wasted compute AND prevents consumers from reading stale peers.

---

## Part III — Asset-class dimension (primary driver)

This is the defining architectural addition from Kyle's 2026-04-22 directive. Every module in Part II must carry asset-class-awareness.

### 3.1 Target asset classes

| Asset class | Status | Distinctive characteristics |
|---|---|---|
| **Crypto spot** | LIVE (current) | 24/7 trading, varied liquidity, maker/taker fees, spreads wider on illiquid pairs |
| **Crypto perpetual futures** | Post-B65 / Phase 21.5 | Funding rate 8h settlement, leverage, liquidations, basis between spot and perp |
| **X-stocks (tokenized equities on Kraken)** | Post-B65 / Phase 21.5 | Market hours constraint, correlation to underlying equity, dividend/corporate-action events |
| **FX** | Future phase | 23/5 hours, tight spreads, macro-driven (DXY, rate differentials) |

Each asset class has different:
- **Constants:** fee schedules, typical spreads, slippage assumptions, min-notional, lot sizes
- **Coefficients:** different optimal ATR multipliers for stops/targets, different confidence floors, different regime-weight formulas
- **External context:** perpetuals care about funding + OI; x-stocks care about DXY + SPX + earnings; crypto spot cares about BTC dominance + on-chain
- **Eligibility rules:** some strategies simply don't apply across classes (range_trade doesn't make sense on trending equity open)
- **Cadence:** equity regimes update on market-hour boundaries; crypto regimes update continuously

### 3.2 Proposed asset-class routing pattern

**Each module gets an asset-class dimension in its lookup tables.** The pair carries its asset class as metadata (resolved from `screener_filters` or pair-registration DB). Modules fan out:

```
Pair (with asset_class field)
    │
    ▼
Context Provider
    - Loads asset-class-appropriate external fields
    - e.g. crypto_spot pair gets BTC dominance field; x-stock pair gets DXY field
    │
    ▼
Scoring Kernel
    - Looks up SCORE_WEIGHTS table keyed by (asset_class, regime)
    - Applies asset-class-appropriate formula coefficients
    │
    ▼
Threshold
    - Looks up thresholds table keyed by (asset_class, regime, strategy)
    │
    ▼
... etc.
```

**DB schema shape (to be formalized in B65 / B69), now exchange-aware:**

```sql
-- Module constants keyed by 4 dimensions, with sensible defaulting
CREATE TABLE module_constants (
  module_name TEXT NOT NULL,       -- 'scoring_kernel', 'threshold', 'profitability', 'exchange_adapter', ...
  exchange TEXT NOT NULL DEFAULT '*',    -- '*' = all exchanges, or 'kraken', 'binance', 'alpaca', 'ibkr', ...
  asset_class TEXT NOT NULL DEFAULT '*', -- '*' = all asset classes, or 'crypto_spot', 'crypto_perp', 'xstock', 'fx'
  strategy TEXT DEFAULT '*',       -- '*' = all strategies
  regime TEXT DEFAULT '*',         -- '*' = all regimes
  constant_name TEXT NOT NULL,     -- 'FINAL_SCORE_HYBRID_WEIGHT', 'MIN_FINAL_SCORE', 'MAKER_FEE_BPS', ...
  value JSONB NOT NULL,            -- numeric, string, or structured
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT,
  PRIMARY KEY (module_name, exchange, asset_class, strategy, regime, constant_name)
);

-- Resolution order (most specific wins): 
-- (exact exchange, exact asset_class, exact strategy, exact regime)
--   → (exact exchange, exact asset_class, exact strategy, *)
--     → (exact exchange, exact asset_class, *, *)
--       → (exact exchange, *, *, *)
--         → (*, exact asset_class, *, *)
--           → (*, *, *, *)  [global default]
```

**Spawning a new asset class + exchange combination = inserting rows for whatever differs from the defaults, plus any new module implementation (e.g. perpetual-funding logic for crypto_perp, or Alpaca REST client for equity-on-Alpaca). No hard-coded constants to edit, no cross-system refactor.**

**Resolution hierarchy example:** a trade on ALPACA / EQUITY / morning_star / TFS queries the table in the order above. Most likely the global default is fine for most constants; only exchange-specific or asset-class-specific values override. This keeps the table sparse — new exchange = dozens of rows, not thousands.

### 3.3 Exchange dimension (second orthogonal axis, added per Kyle directive 2026-04-22)

Asset class alone is not enough. **DawnTrader will also need to add new exchanges** — e.g. a real equity broker (Alpaca / IBKR / TradeStation) for actual stocks rather than x-stocks-on-Kraken, additional crypto exchanges for better liquidity on specific pairs, or FX brokers when that asset class lands. Each exchange has distinct characteristics that must be modular:

| Exchange concern | Example differences |
|---|---|
| **Data feed** | WebSocket protocol, REST endpoints, rate limits, authentication |
| **Symbol normalization** | Kraken: `XBT/USD` for BTC. Binance: `BTCUSDT`. IBKR: contract specs with expiry/type. Alpaca: `BTC/USD` but equity as ticker only |
| **Order placement** | Each broker's order API differs (limit vs market, stop types, time-in-force) |
| **Fee schedule** | Per-exchange maker/taker, tiered by volume |
| **Fill characteristics** | Slippage + spread differ by exchange and by liquidity tier within exchange |
| **Credentials / auth** | Per-exchange API keys, secrets, signing methods |
| **Market hours** | Kraken 24/7, Alpaca US-market-hours + extended, IBKR per-exchange-of-underlying |
| **Margin / funding** | Different leverage caps, different margin calculation rules |

**Asset class and exchange are orthogonal dimensions.** Same asset class can trade on multiple exchanges (crypto spot on Kraken AND Binance; equity on Alpaca AND IBKR). Different asset classes often share an exchange (Kraken hosts crypto spot + perpetuals + x-stocks).

**Filters are a fifth orthogonal dimension (added per Kyle directive 2026-04-22).** Different asset classes require fundamentally different filter sets, not just different filter VALUES:

| Asset class | Typical filters |
|---|---|
| Crypto spot | min_volume_24h (USD), min_price, max_spread_bps, pair-failure cooldown, volatility bounds |
| Crypto perpetuals | All crypto spot filters PLUS min_open_interest, max_funding_rate, basis-vs-spot deviation cap |
| Equity (x-stocks or real) | min_ADV_shares, min_ADV_dollars, market-hour enforcement, earnings-window blackout, halt-aware skip |
| FX | min_pip_size, session awareness (Asia/Europe/NY), rate-event blackout |

Filters don't just have different THRESHOLDS — they're different FILTERS. A "min OI" filter doesn't exist for spot. A "market-hour enforcement" filter doesn't exist for crypto. Adding a new asset class means spawning a filter SET for it.

So the modularization matrix is 5-dimensional:

```
(exchange, asset_class, filter, strategy, regime) → constants / enabled / threshold
```

Filters are handled as a FIRST-CLASS MODULE TYPE rather than a parameter column — each filter is a named "module" in the `module_constants` schema (`module_name = 'filter:min_volume_24h'`, `module_name = 'filter:market_hours'`, etc.), with its own enabled/disabled flag and threshold constants. This keeps the schema flat while treating filters as the first-class objects they are.

**Spawning a new asset class therefore requires:**
1. New rows in pair-metadata for the asset class (e.g. `asset_class='equity'`)
2. New filter modules (e.g. `filter:market_hours`, `filter:min_ADV_shares`) with their default constants
3. New scoring kernel constants for the asset class
4. New threshold constants per (asset_class, strategy, regime)
5. New exchange adapter if the asset class requires a new exchange
6. Optional asset-class-specific module code (e.g. perpetual funding logic, earnings-calendar integration for equities)

### 3.4 Proposed Exchange Adapter module pattern

A new 7th canonical module: **Exchange Adapter.** Abstracts the data feed + symbol normalization + order placement behind a common interface. Each exchange is an implementation of this interface. The rest of the system reads from the Exchange Adapter without knowing which exchange it came from.

| Interface method | Purpose | Current implementation (Kraken-only) |
|---|---|---|
| `subscribeToMarketData(pair, callback)` | Stream OHLC + trades + order book | `server/services/kraken-websocket.ts` |
| `normalizeSymbol(exchangeSymbol): canonicalSymbol` | Map exchange-specific format to canonical (BTC/USD) | `server/services/symbol-normalizer.ts` |
| `denormalizeSymbol(canonicalSymbol): exchangeSymbol` | Reverse mapping for order placement | implied within normalizer |
| `placeOrder(order)` | Submit order per exchange's API | `server/services/kraken-client.ts` |
| `getAccountState()` | Balances, open orders, positions | `server/services/kraken-client.ts` |
| `getFeeSchedule(pair)` | Per-pair fee rates | `server/config/exchange-defaults.ts` (KRAKEN hardcoded) |
| `getMarketHours(pair)` | 24/7 for crypto, session-aware for equities | Not currently enforced |

Adding a new exchange becomes: implement the interface, register the implementation, populate (exchange, asset_class) rows in DB. No cross-system changes.

**Credentials / auth modularization:** per-exchange credentials live in secrets store (Hetzner env or similar), keyed by exchange ID. The Exchange Adapter reads its credentials at startup; rest of system doesn't see keys directly.

**Symbol normalization is a first-class concern.** The canonical symbol format must be defined (proposal: `{UNDERLYING}/{QUOTE}` uppercase for simple pairs, `{UNDERLYING}-{QUOTE}-{TYPE}-{EXPIRY}` for derivatives) and every Exchange Adapter must convert bidirectionally. This is already partially done in `symbol-normalizer.ts` for Kraken — the work is to make it multi-exchange-aware.

### 3.5 Hard-coded-to-DB promotion list (consolidated, asset-class-aware AND exchange-aware)

From Item 15 Part E + Item 18 Part E:

**P0 (required for B66 SQE recalibration AND asset-class readiness):**
1. `SCORE_WEIGHTS.FINAL_SCORE.HYBRID` (0.4) → per (asset_class, regime)
2. `SCORE_WEIGHTS.FINAL_SCORE.CONFIDENCE` (0.3) → per (asset_class, regime)
3. `SCORE_WEIGHTS.FINAL_SCORE.REGIME` (0.2) → per (asset_class, regime)
4. `SCORE_WEIGHTS.FINAL_SCORE.DECAY` (0.1) → per (asset_class, regime) — note: currently 0 across all trades, consider removing
5. RegimeWeight trend coefficient (0.7) → per (asset_class, regime)
6. RegimeWeight volatility coefficient (0.3) → per (asset_class, regime)
7. PredictiveConfidence window replacement (rolling N trades, not all-time cumulative) → N per (asset_class)
8. Per-underlying position limit → per (asset_class)

**P1 (pre-Phase-19 blockers):**
9-12. RegimeWeight floor clamp (0.1), PredConf sigmoid center (0.5) + scale (6), PATTERN_POOL_GUARDRAILS.FINAL_SCORE_FLOOR (0.45) → all per (asset_class)

**P2 (cleanup):**
13-14. SQE_DEFAULT_THRESHOLDS alignment with DB values (2 items)

**Not in Item 18/15 list but surfaced in Item 19 / streakiness:**
15. MCE cache TTL (60_000ms) → per (asset_class) — crypto needs 30s, equity might tolerate 5min during open hours
16. VTS scan interval (30s) → per (asset_class) — equity might scan less often during market hours
17. Net EV floor (−0.01 in VTS) → per (asset_class, mode)

---

## Part IV — Streakiness mechanisms that modularization addresses

From Streakiness Analysis Part III, six mechanisms produce the z = −15.57 clustering. Which ones does modularization enable a fix for?

| Mechanism | Modularization enables fix? | Module(s) involved |
|---|---|---|
| Global-state propagation (30s scan × 200 pairs share snapshot) | **Yes** — per-pair freshness check + staleness gate on Context Provider output | Context Provider |
| MCE cycle cadence / PredConf cumulative | **Yes** — PredConf rolling window is a per-asset-class constant promotion | Scoring Kernel |
| Variant E vs default geometry on reversal | **Yes** — geometry is a per-strategy-per-regime-per-asset-class table | Strategy detectors (configuration, not the 6 modules) |
| Net EV floor vs realized EV gap | **Yes** — realized-EV-adaptive floor is a new lever promoted to DB | Threshold module |
| Mode overlay dormancy in TFS-dominated env | **Yes** — expanded stability signals (pair-level, DBS-transition, realized-EV-drift) feed mode-overlay decisions | Eligibility module |
| Correlated-pair concentration (symbol-based dupe check) | **Yes** — per-underlying position limit is a new lever in Ranking module | Ranking (new module) |

**All six streak mechanisms map to fixes enabled by modularization.** This is not coincidental — streakiness is the OUTCOME SIGNATURE of the SAME structural rigidity that modularization solves. Fix the structure, shrink the streaks.

---

## Part V — Phasing and sequencing

### 5.1 Why this cannot all happen in one batch

B66 scope doc is a candidate for aggregating these findings, but cannot do everything. Reasoning:

- **Asset-class schema (B65 dependency)** — `asset_class` as a first-class dimension needs to land in DB schema before per-asset-class tables make sense
- **SQE recalibration (B66 core)** — P0 items 1-6 (formula coefficients and weights) can go to DB in B66 without waiting for full modularization
- **Modularization refactor (post-B66, pre-Phase-19 or post-Phase-19)** — extracting modules from monolith requires more than one batch
- **Asset-class expansion (Phase 21.5+)** — cannot start until B65 schema + modularization both complete

### 5.2 Proposed sequence (updated 2026-04-22 with exchange dimension)

| Step | Batch / Phase | Scope | Prereq |
|---|---|---|---|
| 1 | **B64** (queued) | Canonical map sync / residual UI alignment | — |
| 2 | **B65** | TEC wiring + asset_class + exchange schema formalization (pair metadata carries both dimensions) | B64 |
| 3 | **B66** (core recalibration) | P0 items 1-6 promoted to DB (in the 4-dimensional `module_constants` table, initially with `exchange='kraken', asset_class='crypto_spot'` values matching current behavior). PredConf rolling window. Per-underlying position limits. Global regime aggregation tuning (P1 per Item 19 re-verification). | B65 |
| 4 | **B67** | External Data Phase 1 (Tier 1 sources into External Context Store + MCE schema extension, asset-class-routed) | B65, B66 |
| 5 | **Modularization Phase** (post-live, new phase slot) | Extract 7 modules from monolith. Symbol normalization made multi-exchange-aware. Exchange Adapter interface formalized. Module constant resolution hierarchy implemented (most-specific-wins). Ranking module designed and built (new; currently missing). | B66, B67 |
| 6 | **New Exchange** (first — e.g. Alpaca for real equities) | Implement Exchange Adapter for new exchange. Populate `module_constants` rows for exchange-specific overrides. Extend symbol normalizer. Credentials in secrets. | Modularization Phase |
| 7 | **Asset Class Expansion** (e.g. crypto perpetuals on Kraken, real equities on new exchange) | Populate (exchange, asset_class) rows. Asset-class-specific module code (perpetual funding logic, equity market-hours enforcement). | Step 6 (if new exchange needed) or Modularization Phase (if existing exchange supports the asset class) |

### 5.3 What B66 should NOT do

- Do not refactor modules themselves. B66 is a targeted recalibration, not the modularization refactor.
- Do not extend SQE to consume external data — that's B67.
- Do not add new strategies — the backtests from 2026-04-22 (liquidity_trap, VSB, engulfing) showed naive technical strategies add near-zero marginal value.
- Do not land any code change that hard-codes crypto-spot-only OR kraken-only assumptions. Every new code path must accept `exchange` and `asset_class` as parameters (even if initially only one value is valid — the parameter threading sets up future additions).
- Do not attempt the Exchange Adapter abstraction in B66. That's Modularization Phase work. B66 keeps Kraken as the only exchange.

### 5.3 What B66 should NOT do

- Do not refactor modules themselves. B66 is a targeted recalibration, not the modularization refactor.
- Do not extend SQE to consume external data — that's B67.
- Do not add new strategies — the backtests from 2026-04-22 (liquidity_trap, VSB, engulfing) showed naive technical strategies add near-zero marginal value.
- Do not land any code change that hard-codes crypto-spot assumptions (e.g. "spread ≈ 0.3%" — equity spreads are 0.01-0.05%). Every new code path must accept asset-class as a parameter.

---

## Part VI — Open questions and dependencies

1. **H1 re-verification** — Langston re-running H1 on post-B62 data. Outcome determines whether global regime aggregation fix is a B66 P0 or a historical artifact already resolved.

2. **B65 asset_class schema** — needs to be formalized before per-asset-class constant tables can be built. Current pair metadata doesn't have this dimension.

3. **Ranking module design** — does not exist yet. Needs a dedicated design pass before implementation. Top-N selection among competing signals, per-underlying position limits, possibly per-asset-class position limits. This is where rankingScore (Item 18 found it missing from logs) gets built and logged.

4. **B66 scope sizing** — once H1 re-verification lands, B66 scope becomes concrete. I'll write `BATCH_66_SCOPE.md` as the next deliverable.

5. **Modularization phase scoping** — post-B66 / post-live scope doc. Phase 16 in the current roadmap is ML-adjacent; "Modularization Phase" would need a new slot between Phase 15c closure and Phase 16 or a renumbering.

---

## Part VII — Summary for Kyle + Langston

**One-paragraph version:**

The B63 audit stream found the signal pipeline is structurally rigid — 74% of tunable parameters are hard-coded across 12+ files, scoring is anti-predictive, scan-cycle batch correlation produces z = −15.57 streakiness, and the system is implicitly crypto-spot-and-Kraken-only. Modularization addresses these simultaneously: it enables rapid calibration (fix iteration speed), it provides natural boundaries for streak-mechanism fixes (cadence tiers, staleness gates, per-underlying limits), and — most importantly — it is the REQUIRED precondition for asset-class expansion (crypto perpetuals, x-stocks, real equities, FX), new-exchange expansion (Binance, Alpaca, IBKR, FX brokers), and asset-class-specific filter sets (crypto min_volume vs equity min_ADV_shares vs perp min_OI vs FX session awareness). Without modularization, adding any of these means forking the codebase; with it, each becomes DB-row additions plus small adapter/filter implementations. The 8 canonical modules (7 core + Filter Module Family) are Exchange Adapter / Filter Modules / Context Provider / Eligibility / Scoring Kernel / Threshold / Profitability / Ranking — all keyed by the **5-dimensional** `(exchange, asset_class, filter, strategy, regime)` constant table with a most-specific-wins resolution hierarchy. Sequence: B64 → B65 (asset_class + exchange schema) → B66 (core recalibration, Kraken-crypto-spot in-place, code paths threaded with exchange+asset_class parameters) → B67 (external data) → Modularization Phase (post-live, 8-module extraction + Exchange Adapter + per-asset-class filter sets) → New Exchange + Asset Class Expansion (Phase 21.5+).

---

*End of synthesis. B66 scope doc is the next deliverable, to be written once H1 re-verification lands.*

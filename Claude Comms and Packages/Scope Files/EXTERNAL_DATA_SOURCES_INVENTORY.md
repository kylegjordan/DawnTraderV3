# External Data Sources — Low-Cost Integration Candidates

**Created:** 2026-04-22
**Purpose:** Inventory of data sources OUTSIDE the current OHLC+volume feed that could lift signal quality across existing and future strategies at bounded cost. Most candidates require asset-class-specific handling once DawnTrader expands beyond crypto (B65 schema work will formalize asset classes).
**Status:** Reference inventory, not a commitment. Each candidate has its own TCO and evaluation questions.

---

## 1. Framing — Why External Data Matters

Every DawnTrader decision today is derived from `(price, volume, per-pair indicators)` on the target pair's own 15-min candles. This is a narrow lens. Markets are driven by inputs our detectors can't see:

- Macro regime (risk-on / risk-off at the asset class level)
- Derivatives positioning (where is the crowd leaned?)
- On-chain flows (for crypto: real money movements)
- Catalyst events (news, scheduled events, regulatory)
- Cross-asset correlation (BTC vs ETH vs SPX vs DXY)
- Higher-timeframe trend context (the 15-min bias is noise relative to the 4h trend)

Adding these as FILTERS or CONTEXT INPUTS to existing strategies would materially improve signal/noise WITHOUT requiring new strategy builds. This is likely higher value than adding more technical strategies (the VSB backtest showed that naive technical detection of archetypes has poor prospective signal/noise — the missing ingredient is context, not more detectors).

---

## 2. Inventory — by Cost / Time / Class

**Cost** = dollar + maintenance burden (API fees, infra, monitoring)
**Effort** = engineering time to integrate + plumb into decision logic
**Class** = asset class applicability (Crypto / Equity / FX / All)
**Priority tier** = my assessment of marginal value per unit cost

### Tier 1 — Low cost, high value, mostly crypto

| # | Source | Cost | Effort | Class | Value signal |
|---|---|---|---|---|---|
| 1.1 | **Higher-timeframe OHLC on the same pair (1h, 4h)** | $0 | 0.5-1 day | All | Multi-timeframe trend alignment. We already fetch 15-min; just persist 1h+4h too. Biggest single improvement to existing strategies' signal quality. **NOT external — just unused internal data.** |
| 1.2 | **BTC dominance trend** | $0 (CoinGecko free tier, 10-30 req/min) | 1 day | Crypto only | Macro filter: rising dominance → alts under pressure. Single number, ~1h refresh enough. |
| 1.3 | **Total crypto market cap momentum** | $0 (same source) | 0.5 day incl. 1.2 | Crypto only | Risk-on/off at asset class level |
| 1.4 | **Binance/Bybit perpetual funding rates** | $0 (both publish free) | 1-2 days | Crypto only | Crowd positioning. Positive funding → leveraged longs → squeeze risk if reversal. Negative funding → shorts → bounce likely. |
| 1.5 | **Perpetual open interest + change** | $0 (same feeds) | 0.5 day incl. 1.4 | Crypto only | Distinguishes fresh positioning from closed positions |

### Tier 2 — Medium cost, high value

| # | Source | Cost | Effort | Class | Value signal |
|---|---|---|---|---|---|
| 2.1 | **Exchange inflows/outflows (BTC, ETH primary)** | Free via Glassnode basic / paid tier ~$29-99/mo | 2-3 days | Crypto only | Coins moving TO exchanges = sell pressure ahead. Coins OFF = accumulation. Well-documented signal. |
| 2.2 | **Liquidation cascades (Binance, Bybit)** | $0 via Coinalyze/Coinglass free endpoints | 1-2 days | Crypto only | Large liquidation events mark likely reversals |
| 2.3 | **BTC/ETH correlation matrix (rolling 30d)** | $0 (compute locally from OHLC) | 0.5 day | Crypto only | Decides if "all crypto is the same bet right now" — impacts position sizing and diversification assumptions |
| 2.4 | **DXY / cross-asset** | $0 (Yahoo Finance free, `yfinance`) | 1 day | All | Strong DXY = risk-off for crypto. Weak DXY = tailwind. Also useful for FX and equity strategies. |
| 2.5 | **SPX / NASDAQ trend** | $0 (Yahoo Finance) | 0.5 day incl. 2.4 | All | Crypto increasingly correlates with tech; equity strategies need this directly |

### Tier 3 — Higher cost, specialized value

| # | Source | Cost | Effort | Class | Value signal |
|---|---|---|---|---|---|
| 3.1 | **Long/short ratio on major exchanges** | $0 via Coinglass free tier | 2 days | Crypto only | Crowd-positioning refinement beyond funding rate |
| 3.2 | **Whale wallet tracking** | Free via Whale Alert, or ~$50/mo for API | 3-5 days | Crypto only | Only actionable if integrated into per-pair context; noisy |
| 3.3 | **Stablecoin supply growth** | $0 (CoinMarketCap/CoinGecko) | 1 day | Crypto only | Slow "dry powder" indicator; probably daily granularity |
| 3.4 | **Token unlock schedules** | Free via TokenUnlocks, Cryptorank | 2-3 days | Crypto only | Scheduled inflation events; useful to EXCLUDE trades in the unlock window |
| 3.5 | **Yield curve / bond rates** | $0 (FRED API) | 1 day | All | Macro risk regime; helpful for equity and FX expansion |

### Tier 4 — Expensive or specialized

| # | Source | Cost | Effort | Class | Value signal |
|---|---|---|---|---|---|
| 4.1 | **News sentiment feeds** | $50-500/mo (Santiment, Messari, CryptoPanic) | 1-2 weeks incl. NLP plumbing | All | Real but noisy; works only with good signal processing |
| 4.2 | **Twitter/X sentiment on tokens** | $100-500/mo APIs, or scrape (brittle) | 2-3 weeks | Crypto dominant | High noise, requires ongoing tuning |
| 4.3 | **Order book depth beyond top-of-book** | Free via exchange websockets, but infra-heavy | 1-2 weeks | All | dhma uses some OBI; fuller book data is a research project |
| 4.4 | **Economic calendar events (CPI, FOMC, NFP)** | Free via Investing.com scrape / $29/mo TradingEconomics | 3-5 days | All | Major scheduled volatility events; useful for EXCLUSION windows primarily |

---

## 3. Asset-Class-Specific Handling (Forward-Looking for B65+)

When DawnTrader expands to non-crypto assets (B65 schema work is where this gets formalized), external data sources split into three groups:

### 3a. Crypto-only (NO transfer to equities/FX)
- BTC dominance, total crypto market cap
- Perpetual funding rates, open interest
- Exchange inflows/outflows
- On-chain metrics (whale wallets, stablecoin supply, token unlocks)
- Liquidation cascades

### 3b. Equity-specific (would need new sources for equity strategies)
- Sector rotation (XLK, XLF, XLY, etc.)
- Earnings calendar + pre/post-earnings windows
- SPY/QQQ relative strength
- Options flow / unusual options activity
- Insider trading disclosures (Form 4)
- Short interest updates

### 3c. FX-specific (would need new sources for FX strategies)
- Central bank meeting calendar (Fed, ECB, BoE, BoJ, RBA, BoC, SNB, RBNZ)
- Rate differentials
- Economic surprise indices
- COT reports (Commitments of Traders)
- Terms-of-trade for commodity currencies (AUD, CAD, NZD)

### 3d. Asset-class-agnostic (one integration, all strategies benefit)
- DXY / dollar index
- Yield curve / risk-free rates
- VIX (equity vol) or crypto-equivalents
- Correlation matrices within and across asset classes
- Economic calendar global events (CPI, NFP, FOMC, ECB, geopolitical)

**Architectural implication for B65+ schema work:** external-data integration needs an `asset_class` dimension per source. A strategy's eligibility to consume a given external input should be governed by the strategy's asset class + source's applicability. The canonical-regime-strategy-map architecture can be extended to route external signals the same way it routes strategies.

---

## 4. Recommended Starting Slate

If you ask me "what would you add first to lift the whole system without building new strategies?" — based on cost/value ratio:

### Phase 1 (cheap, high-value, crypto-focused — ~1-2 weeks of work)
1. **Higher-timeframe OHLC (1h, 4h) persistence + multi-TF trend agreement as a confidence multiplier** (Tier 1.1) — the biggest single improvement available, costs $0 in data fees, uses infrastructure we already have
2. **BTC dominance trend + crypto market cap momentum** (Tier 1.2, 1.3) — simple macro filter, single API call, adds to EVERY crypto strategy's context
3. **Perpetual funding rates** (Tier 1.4) — positional-crowd filter, per-pair, meaningfully distinct signal from indicators

### Phase 2 (crypto-specific refinement — ~2-3 weeks)
4. **Exchange inflows/outflows** (Tier 2.1) — if Phase 1 shows external data materially helps, this justifies the small cost
5. **Liquidation cascades** (Tier 2.2) — reversal signal
6. **DXY + SPX trend** (Tier 2.4, 2.5) — forward-compat for multi-asset expansion

### Phase 3 (when expanding asset classes or when simpler signals are exhausted)
- News/sentiment (Tier 4.1)
- Whale tracking (Tier 3.2)
- Token unlocks (Tier 3.4)
- Central bank calendar (Equity-specific tier)

---

## 5. Integration Pattern (Architectural Note)

External data should feed into a **centralized context service** (analogous to MCE for pair-level regime), that:

1. Polls each source at its native cadence (1h for BTC dominance, 30s for funding, 60s for liquidations, etc.)
2. Caches the latest value with timestamp
3. Exposes a unified read API: `getMarketContext() → { btcDominance, totalMcapMomentum, fundingRates: Map<pair, number>, exchangeFlows, ... }`
4. Emits updates via WebSocket where consumers need real-time

Strategies don't call external APIs directly — they consume from this service, which handles rate limiting, fallbacks, staleness, and asset-class routing.

This mirrors the `directional-bias-store.ts` pattern shipped in B63 Item 16: persistent, deterministic, explicit staleness semantics. Applying the same pattern to external data avoids the "opportunistic read" problems we just fixed for global DBS.

---

## 6. What This Is NOT

This inventory is NOT a commitment to build any of these. It's a planning reference for when priorities are set.

Specifically:
- Tier 1 should be a Phase 16 or 17 scope item (post-B66) — not B64/B65.
- Expansion to equities/FX (asset-class-specific sources) is downstream of B65 schema work.
- News/sentiment (Tier 4) is substantial ML-adjacent work and should not be pursued until the simpler tiers are validated in production.

---

*End of inventory. Update as sources are evaluated or added to the system.*

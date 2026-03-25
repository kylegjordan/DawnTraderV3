# Artifact 2 — Input / Units Matrix

**Audit**: Strategy-Family Filter Profiles
**Date**: 2026-03-23
**Status**: Complete

---

## Filter Consumer Input Matrix

| Consumer | Input | Expected Unit | Actual Source | Actual Unit | Match? | Notes |
|----------|-------|---------------|---------------|-------------|--------|-------|
| Quant Global Filter | minVolume | USD | DB active_quant.min_volume | USD | Yes | $500,000 |
| Quant Global Filter | maxBidAskSpread | Percent (0-100) | DB active_quant.max_bid_ask_spread | Percent | Yes | 0.50% |
| Quant Global Filter | minPrice | USD | DB active_quant.min_price | USD | Yes | $0.25 |
| Quant Global Filter | minMarketCap | USD | DB active_quant.min_market_cap | USD | Yes | $250M |
| Quant Global Filter | minHistoryDays | Days (integer) | DB active_quant.min_history_days | Days | Yes | 30 |
| Pattern Global Filter | minVolume | USD | DB active_pattern.min_volume | USD | Yes | $250,000 |
| Pattern Global Filter | maxBidAskSpread | Percent | DB active_pattern.max_bid_ask_spread | Percent | Yes | 1.00% |
| Quant IMF | LQ | Score 0-100 | calculateLiquidityQuality() | 0-100 | Yes | Min 35 |
| Quant IMF | VN | Ratio 0-1 | calculateVolNoise() | 0-1 | Yes | Max 0.93 |
| Quant IMF | CORR | Ratio 0-1 | calculateCorrelation() | 0-1 | Yes | Max 0.92 |
| Pattern IMF | LQ | Score 0-100 | calculateLiquidityQuality() | 0-100 | Yes | Min 20 |
| Pattern IMF | VN | Ratio 0-1 | calculateVolNoise() | 0-1 | Yes | Max 0.98 |
| Pattern IMF | DI | Score 0-100 | calculateDirectionalIntegrity() | 0-100 | Yes | Min 30 |
| VN Veto | VolNoise | Ratio 0-1 | calculateVolNoise() | 0-1 | Yes | Max 0.93 (from DB) |

## Strategy Consumer Input Matrix

| Strategy | Input | Expected Unit | Actual Source | Actual Unit | Match? | Notes |
|----------|-------|---------------|---------------|-------------|--------|-------|
| All 17 strategies | indicators.vwap | USD | MCE computeContext() | USD | Yes | |
| All 17 strategies | indicators.sma | USD | MCE computeContext() | USD | Yes | |
| All 17 strategies | indicators.atr | USD | MCE computeContext() | USD | Yes | |
| All 17 strategies | indicators.adx | Score 0-100 | MCE computeContext() | 0-100 | Yes | |
| All 17 strategies | indicators.momentum | Ratio | MCE computeContext() | Ratio | Yes | 14-period change |
| All 17 strategies | indicators.volatility | StdDev of returns | MCE computeContext() | StdDev | Yes | |
| All 17 strategies | currentPrice | USD | priceCache | USD | Yes | |
| 8 pattern strategies | patternInput.strength | Score 0-1 | scanPatterns() | 0-1 | Yes | |
| 8 pattern strategies | patternInput.direction | 'BUY'/'SELL' | scanPatterns() | String enum | Yes | |
| sma_trend_ride | adx | Score 0-100 | MCE indicators.adx | 0-100 | Yes | Guard: ADX > 25 |

## MCE Input Matrix

| MCE Input | Expected Unit | Source at Post-Global | Available? | Source at Post-IMF (current) | Available? |
|-----------|---------------|----------------------|------------|------------------------------|------------|
| symbol | String | FX5 scan | Yes | activeFilterPool | Yes |
| ohlcData[] | OHLC candles | ohlcCache | Yes | ohlcCache | Yes |
| currentPrice | USD | priceCache | Yes | priceCache | Yes |
| volume24h | USD | priceCache | Yes | priceCache | Yes |
| smaPeriod | Integer | Config (20) | Yes | Config (20) | Yes |

**Conclusion**: All MCE inputs available at Post-Global stage. No blocking dependency.

## SQE Input Matrix

| SQE Input | Expected Unit | Source | Actual Unit | Match? |
|-----------|---------------|--------|-------------|--------|
| finalScore | Score 0-1 | Signal computation | 0-1 | Yes |
| regimeWeight | Score 0-1 | MCE regime.regimeWeight | 0-1 | Yes |
| confidence | Score 0-1 | Strategy detect() | 0-1 | Yes |
| entryPrice | USD | Strategy detect() | USD | Yes |
| targetPrice | USD | Strategy detect() | USD | Yes |

## RTB Input Matrix

| RTB Input | Expected Unit | Source | Actual Unit | Match? |
|-----------|---------------|--------|-------------|--------|
| hybridScore | Score 0-1 | Signal computation | 0-1 | Yes |
| confidence | Score 0-1 | SQE-passed signal | 0-1 | Yes |
| regimeWeight | Score 0-1 | MCE regime | 0-1 | Yes |
| decayPenalty | Score 0-0.1 | calculateDecayPenalty() | 0-0.1 | Yes |
| FinalScore | Score 0-1 | Weighted sum | 0-1 | Yes |

---

## Known Historical Unit Issues (Resolved)

| Issue | Batch | Status |
|-------|-------|--------|
| Volume in coins vs USD | 19F HF2 | FIXED — coins→USD conversion in market-scanner.ts |
| DI full-history collapse to 0 | 19G | FIXED — 48-candle rolling window |
| Pattern global filters hardcoded vs DB | 19G | FIXED — all from DB now |

## No Current Unit Mismatches Detected

All filter consumers, strategy consumers, MCE inputs, SQE inputs, and RTB inputs use consistent units. No percent-vs-decimal, no normalized-vs-raw, no ratio-vs-absolute mismatches found.

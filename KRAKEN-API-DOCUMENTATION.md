# Kraken API & Filter Documentation
*Generated: 2025-10-22*

This document provides comprehensive documentation of all Kraken API fields used in "The Dawn Trader" cryptocurrency trading application, along with detailed information about the screener filters.

---

## A. KRAKEN API FIELDS

### Data Sources and Endpoints

#### 1. Ticker Endpoint (`/public/Ticker`)
Used for: Real-time price, volume, spread data

**Fields collected:**

| Field | Type | Description |
|-------|------|-------------|
| `a[0]` | number | Ask price |
| `a[1]` | number | Whole lot ask volume |
| `a[2]` | number | Lot ask volume |
| `b[0]` | number | Bid price |
| `b[1]` | number | Whole lot bid volume |
| `b[2]` | number | Lot bid volume |
| `c[0]` | number | Last trade closed price |
| `c[1]` | number | Last trade closed lot volume |
| `v[0]` | number | Volume today |
| `v[1]` | number | **Volume last 24 hours** (primary volume metric) |
| `p[0]` | number | Volume weighted average price today |
| `p[1]` | number | **Volume weighted average price last 24 hours (VWAP)** |
| `t[0]` | number | Number of trades today |
| `t[1]` | number | Number of trades last 24 hours |
| `l[0]` | number | Low price today |
| `l[1]` | number | **Low price last 24 hours** |
| `h[0]` | number | High price today |
| `h[1]` | number | **High price last 24 hours** |
| `o` | number | Opening price today |

**Derived Metrics from Ticker:**

| Metric | Calculation | Description |
|--------|-------------|-------------|
| Bid-Ask Spread (%) | `((ask - bid) / ask) * 100` | Liquidity indicator |
| Daily Range (%) | `((high24h - low24h) / low24h) * 100` | Volatility measure |
| Current Price | `c[0]` | Latest trade price |

#### 2. OHLC Endpoint (`/public/OHLC`)
Used for: Historical candlestick data for technical analysis

**Fields collected:**

| Field | Type | Description |
|-------|------|-------------|
| `time` | number | Unix timestamp |
| `open` | number | Opening price |
| `high` | number | Highest price in period |
| `low` | number | Lowest price in period |
| `close` | number | Closing price |
| `vwap` | number | Volume weighted average price for period |
| `volume` | number | Volume traded in period |
| `count` | number | Number of trades in period |

**Derived Technical Indicators from OHLC:**

| Indicator | Type | Description |
|-----------|------|-------------|
| SMA | Computed | Simple Moving Average (configurable period, default 20) |
| VWAP | Direct | Volume Weighted Average Price from data |
| RSI | **Not Currently Computed** | Would require implementation |
| ATR | **Not Currently Computed** | Would require implementation |
| Volatility | **Not Currently Computed** | Would require implementation |

#### 3. AssetPairs Endpoint (`/public/AssetPairs`)
Used for: Pair metadata and trading rules

**Fields collected:**

| Field | Type | Description |
|-------|------|-------------|
| `altname` | string | Alternative pair name |
| `wsname` | string | WebSocket pair name |
| `base` | string | Base currency |
| `quote` | string | Quote currency |
| `lot` | string | Volume lot size |
| `pair_decimals` | number | Decimal places for pair pricing |
| `lot_decimals` | number | Decimal places for order volume |
| `lot_multiplier` | number | Lot multiplier |

#### 4. Market Cap
**Status: NOT AVAILABLE from Kraken API**
- Kraken does not provide market cap data
- Would require: `price × circulating_supply`
- Circulating supply not available from Kraken
- **Current Filter Status**: Placeholder (not actively filtering)

---

## B. SCREENER FILTERS

### Active Filters (from screener_filters + trading_settings tables)

| Filter Name | Status | Kraken Field(s) | Logic | Table |
|-------------|--------|-----------------|-------|-------|
| **Min Volume ($)** | ✅ Active | `v[1]` from Ticker | >= threshold | `screener_filters.minVolume` |
| **Max Bid-Ask Spread (%)** | ✅ Active | `a[0]`, `b[0]` from Ticker | Spread % <= threshold | `screener_filters.maxBidAskSpread` |
| **Daily Range (%)** | ✅ Active | `h[1]`, `l[1]` from Ticker | Range % >= threshold | `trading_settings.minDailyRange` |
| **Min Price ($)** | ✅ Active | `c[0]` from Ticker | Price >= threshold | `screener_filters.minPrice` |
| **Max Price ($)** | ✅ Active | `c[0]` from Ticker | Price <= threshold | `screener_filters.maxPrice` |
| **Exclude Stablecoins** | ✅ Active | Base currency name | Pattern match exclusion | `screener_filters.excludeStablecoins` |
| **Quote Currency** | ✅ Active | `quote` from AssetPairs | Whitelist check (USD, USDT, ZUSD, ZEUR, XETH, XXBT) | `trading_settings.allowedTradingPairs` |
| **Blacklist** | ✅ Active | Pair symbol | Exclusion list | `trading_settings.blacklistedSymbols` |
| **Whitelist** | ✅ Active | Pair symbol | Inclusion list (if non-empty) | `trading_settings.whitelistedSymbols` |
| **Min History Days** | ✅ Active | OHLC candle count | Requires N days of data | `trading_settings.minDataHistoryDays` |
| **RSI Min/Max** | 🟡 Placeholder | Would use OHLC | Not yet computed | `screener_filters.rsiMin/Max` |
| **Volatility Min/Max** | 🟡 Placeholder | Would use OHLC | Not yet computed | `screener_filters.volatilityMin/Max` |
| **Min Market Cap** | 🟡 Placeholder | Not available | Data not from Kraken | `screener_filters.minMarketCap` |
| **Min Liquidity** | 🟡 Placeholder | Would use order book | Not yet implemented | `screener_filters.minLiquidity` |
| **Regulated Only** | 🟡 Placeholder | Would need external data | Not implemented | `screener_filters.allowRegulatedOnly` |

### Filter Application Order
1. Quote Currency (fastest, eliminates ~80-90% of pairs)
2. Blacklist/Whitelist
3. Stablecoin exclusion
4. Min Volume
5. Min/Max Price
6. Bid-Ask Spread
7. Daily Range
8. Min History Days
9. Placeholder filters (not yet active)

---

## C. QUOTE CURRENCY FORMAT

Kraken uses specific prefixes for different currency types:

| Prefix | Type | Examples |
|--------|------|----------|
| `Z` | Fiat currencies | ZUSD, ZEUR, ZGBP |
| `X` | Cryptocurrencies | XXBT (Bitcoin), XETH (Ethereum), XXRP (Ripple) |
| No prefix | Some newer assets | USD, USDT, EUR |

**Supported Quote Currencies in Filter:**
- `USD`, `USDT` - Direct format
- `ZUSD`, `ZEUR` - Fiat with Z prefix
- `XETH`, `XXBT` - Crypto with X prefix

---

## D. FILTER INSIGHTS TAB

The Filter Insights tab in the Trading Panel displays real-time statistics:

### Universe Statistics
- **Total Pairs**: All trading pairs available on Kraken
- **Evaluated Pairs**: Pairs that passed quote currency filter
- **Eligible Pairs**: Final count after all filters applied
- **Pass Rate**: Percentage of evaluated pairs that are eligible

### Filter Breakdown
Shows count of pairs rejected by each filter:
1. **Failed Volume** - Below minimum volume threshold
2. **Failed Spread** - Bid-ask spread too wide
3. **Failed Daily Range** - Insufficient price movement
4. **Failed Min Price** - Price too low
5. **Failed Max Price** - Price too high
6. **Failed Stablecoin** - Excluded stablecoins
7. **Failed Quote Currency** - Not in allowed quote currencies
8. **Failed History** - Insufficient historical data
9. **Blacklisted** - On user blacklist
10. **Not Whitelisted** - Not on user whitelist (if whitelist is active)

### Refresh Timing
- **Scan Frequency**: Every 10 minutes (synchronized with MarketScanner)
- **Next Scan Countdown**: Real-time countdown showing "Xm Ys" until next scan
- **Manual Refresh**: Available via refresh button

---

## E. AUTO-START PAPER TRADING

### Configuration
- **Setting**: `trading_settings.autoStartPaperTrading` (boolean, default: false)
- **Purpose**: Automatically start paper trading when MarketScanner finds eligible pairs

### Safety Checks (All Must Pass)
1. ✅ User has eligible pairs
2. ✅ Trading settings exist
3. ✅ Global kill-switch is OFF (`tradingSuspended = false`)
4. ✅ User opted into auto-start (`autoStartPaperTrading = true`)
5. ✅ Trading wasn't manually stopped (`tradingStatus !== 'stopped'`)

### Enable Auto-Start
```sql
UPDATE trading_settings 
SET auto_start_paper_trading = true 
WHERE user_id = '<your-user-id>';
```

---

## F. API ENDPOINTS FOR DIAGNOSTICS

### Kraken Documentation Endpoint
- **URL**: `/api/diagnostics/kraken-documentation`
- **Method**: GET
- **Auth**: Required
- **Action**: Generates this documentation and appends to `replit.md`

### Filter Diagnostics Endpoint
- **URL**: `/api/filters/diagnostics`
- **Method**: GET
- **Auth**: Required
- **Returns**: Current filter statistics and eligible pair count

### Paper Sim Diagnostics Endpoint
- **URL**: `/api/paper-sim/diagnostics/scan`
- **Method**: GET
- **Auth**: Required
- **Returns**: Detailed universe scan with filter trace

---

## G. WATCHLIST AUTO-POPULATION

When paper trading starts with an empty watchlist:
1. System queries `KrakenService.getEligiblePairs()` using current screener filters
2. Automatically adds **top 10 qualifying pairs** to watchlist
3. Ensures paper trading has pairs to monitor immediately

---

## H. COMMON ISSUES & SOLUTIONS

### Issue: "0 eligible pairs" despite relaxed filters
**Cause**: Quote currency mismatch
**Solution**: Update `allowedTradingPairs` to include Kraken's format:
```sql
UPDATE trading_settings 
SET allowed_trading_pairs = ARRAY['USD', 'USDT', 'ZUSD', 'ZEUR', 'XETH', 'XXBT']
WHERE user_id = '<your-user-id>';
```

### Issue: Paper trading doesn't start automatically
**Check**:
1. Is `autoStartPaperTrading` enabled?
2. Is kill-switch OFF?
3. Are there eligible pairs?
4. Was trading manually stopped?

### Issue: Filter Insights shows all pairs failing volume
**Cause**: Volume threshold too high for current market conditions
**Solution**: Lower `minVolume` in screener_filters:
```sql
UPDATE screener_filters 
SET min_volume = 1000000  -- $1M instead of $30M
WHERE user_id = '<your-user-id>' AND mode = 'paper';
```

---

**End of Documentation**

For live data and real-time updates, use the Filter Insights tab in the Trading Panel or call the diagnostic API endpoints.

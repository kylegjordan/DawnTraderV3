/**
 * Kraken Data Documentation Service
 * Generates comprehensive documentation of all Kraken API fields and screener filters
 */

import { KrakenService } from './kraken.js';
import { storage } from '../../storage.js';

export class KrakenDataDocumenter {
  private kraken: KrakenService;

  constructor() {
    this.kraken = new KrakenService();
  }

  /**
   * Generate complete documentation report
   */
  async generateReport(): Promise<string> {
    console.log('\n📊 ==============================================');
    console.log('   KRAKEN API DATA DOCUMENTATION REPORT');
    console.log('==============================================\n');

    const sections: string[] = [];

    // Section A: Kraken API Fields
    sections.push(await this.documentKrakenFields());

    // Section B: Screener Filters
    sections.push(await this.documentScreenerFilters());

    // Section C: Sample Data
    sections.push(await this.documentSampleData());

    const fullReport = sections.join('\n\n');
    
    console.log(fullReport);
    return fullReport;
  }

  /**
   * Document all Kraken API fields
   */
  private async documentKrakenFields(): Promise<string> {
    const fields: string[] = [];
    
    fields.push('## A. KRAKEN API FIELDS\n');
    fields.push('### Data Sources and Endpoints\n');
    
    fields.push('#### 1. Ticker Endpoint (`/public/Ticker`)');
    fields.push('Used for: Real-time price, volume, spread data');
    fields.push('Fields collected:');
    fields.push('| Field | Type | Description |');
    fields.push('|-------|------|-------------|');
    fields.push('| `a[0]` | number | Ask price |');
    fields.push('| `a[1]` | number | Whole lot ask volume |');
    fields.push('| `a[2]` | number | Lot ask volume |');
    fields.push('| `b[0]` | number | Bid price |');
    fields.push('| `b[1]` | number | Whole lot bid volume |');
    fields.push('| `b[2]` | number | Lot bid volume |');
    fields.push('| `c[0]` | number | Last trade closed price |');
    fields.push('| `c[1]` | number | Last trade closed lot volume |');
    fields.push('| `v[0]` | number | Volume today |');
    fields.push('| `v[1]` | number | **Volume last 24 hours** (primary volume metric) |');
    fields.push('| `p[0]` | number | Volume weighted average price today |');
    fields.push('| `p[1]` | number | **Volume weighted average price last 24 hours (VWAP)** |');
    fields.push('| `t[0]` | number | Number of trades today |');
    fields.push('| `t[1]` | number | Number of trades last 24 hours |');
    fields.push('| `l[0]` | number | Low price today |');
    fields.push('| `l[1]` | number | **Low price last 24 hours** |');
    fields.push('| `h[0]` | number | High price today |');
    fields.push('| `h[1]` | number | **High price last 24 hours** |');
    fields.push('| `o` | number | Opening price today |\n');
    
    fields.push('**Derived Metrics from Ticker:**');
    fields.push('| Metric | Calculation | Description |');
    fields.push('|--------|-------------|-------------|');
    fields.push('| Bid-Ask Spread (%) | `((ask - bid) / ask) * 100` | Liquidity indicator |');
    fields.push('| Daily Range (%) | `((high24h - low24h) / low24h) * 100` | Volatility measure |');
    fields.push('| Current Price | `c[0]` | Latest trade price |\n');

    fields.push('#### 2. OHLC Endpoint (`/public/OHLC`)');
    fields.push('Used for: Historical candlestick data for technical analysis');
    fields.push('Fields collected:');
    fields.push('| Field | Type | Description |');
    fields.push('|-------|------|-------------|');
    fields.push('| `time` | number | Unix timestamp |');
    fields.push('| `open` | number | Opening price |');
    fields.push('| `high` | number | Highest price in period |');
    fields.push('| `low` | number | Lowest price in period |');
    fields.push('| `close` | number | Closing price |');
    fields.push('| `vwap` | number | Volume weighted average price for period |');
    fields.push('| `volume` | number | Volume traded in period |');
    fields.push('| `count` | number | Number of trades in period |\n');

    fields.push('**Derived Technical Indicators from OHLC:**');
    fields.push('| Indicator | Type | Description |');
    fields.push('|-----------|------|-------------|');
    fields.push('| SMA | Computed | Simple Moving Average (configurable period, default 20) |');
    fields.push('| VWAP | Direct | Volume Weighted Average Price from data |');
    fields.push('| RSI | **Not Currently Computed** | Would require implementation |');
    fields.push('| ATR | **Not Currently Computed** | Would require implementation |');
    fields.push('| Volatility | **Not Currently Computed** | Would require implementation |\n');

    fields.push('#### 3. AssetPairs Endpoint (`/public/AssetPairs`)');
    fields.push('Used for: Pair metadata and trading rules');
    fields.push('Fields collected:');
    fields.push('| Field | Type | Description |');
    fields.push('|-------|------|-------------|');
    fields.push('| `altname` | string | Alternative pair name |');
    fields.push('| `wsname` | string | WebSocket pair name |');
    fields.push('| `base` | string | Base currency |');
    fields.push('| `quote` | string | Quote currency |');
    fields.push('| `lot` | string | Volume lot size |');
    fields.push('| `pair_decimals` | number | Decimal places for pair pricing |');
    fields.push('| `lot_decimals` | number | Decimal places for order volume |');
    fields.push('| `lot_multiplier` | number | Lot multiplier |\n');

    fields.push('#### 4. Market Cap');
    fields.push('**Status: NOT AVAILABLE from Kraken API**');
    fields.push('- Kraken does not provide market cap data');
    fields.push('- Would require: `price × circulating_supply`');
    fields.push('- Circulating supply not available from Kraken');
    fields.push('- **Current Filter Status**: Placeholder (not actively filtering) |\n');

    return fields.join('\n');
  }

  /**
   * Document all screener filters
   */
  private async documentScreenerFilters(): Promise<string> {
    const fields: string[] = [];
    
    fields.push('## B. SCREENER FILTERS\n');
    fields.push('### Active Filters (from screener_filters + trading_settings tables)\n');

    fields.push('| Filter Name | Status | Kraken Field(s) | Logic | Table |');
    fields.push('|-------------|--------|-----------------|-------|-------|');
    fields.push('| **Min Volume ($)** | ✅ Active | `v[1]` from Ticker | >= threshold | `screener_filters.minVolume` |');
    fields.push('| **Max Bid-Ask Spread (%)** | ✅ Active | `a[0]`, `b[0]` from Ticker | Spread % <= threshold | `screener_filters.maxBidAskSpread` |');
    fields.push('| **Daily Range (%)** | ✅ Active | `h[1]`, `l[1]` from Ticker | Range % >= threshold | `trading_settings.minDailyRange` |');
    fields.push('| **Min Price ($)** | ✅ Active | `c[0]` from Ticker | Price >= threshold | `screener_filters.minPrice` |');
    fields.push('| **Max Price ($)** | ✅ Active | `c[0]` from Ticker | Price <= threshold | `screener_filters.maxPrice` |');
    fields.push('| **Exclude Stablecoins** | ✅ Active | Base currency name | Pattern match exclusion | `screener_filters.excludeStablecoins` |');
    fields.push('| **Quote Currency** | ✅ Active | `quote` from AssetPairs | Whitelist check (USD, USDT, ZUSD, ZEUR, XETH, XXBT) | `trading_settings.allowedTradingPairs` |');
    fields.push('| **Blacklist** | ✅ Active | Pair symbol | Exclusion list | `trading_settings.blacklistedSymbols` |');
    fields.push('| **Whitelist** | ✅ Active | Pair symbol | Inclusion list (if non-empty) | `trading_settings.whitelistedSymbols` |');
    fields.push('| **Min History Days** | ✅ Active | OHLC candle count | Requires N days of data | `trading_settings.minDataHistoryDays` |');
    fields.push('| **RSI Min/Max** | 🟡 Placeholder | Would use OHLC | Not yet computed | `screener_filters.rsiMin/Max` |');
    fields.push('| **Volatility Min/Max** | 🟡 Placeholder | Would use OHLC | Not yet computed | `screener_filters.volatilityMin/Max` |');
    fields.push('| **Min Market Cap** | 🟡 Placeholder | Not available | Data not from Kraken | `screener_filters.minMarketCap` |');
    fields.push('| **Min Liquidity** | 🟡 Placeholder | Would use order book | Not yet implemented | `screener_filters.minLiquidity` |');
    fields.push('| **Regulated Only** | 🟡 Placeholder | Would need external data | Not implemented | `screener_filters.allowRegulatedOnly` |\n');

    fields.push('### Filter Application Order');
    fields.push('1. Quote Currency (fastest, eliminates ~80-90% of pairs)');
    fields.push('2. Blacklist/Whitelist');
    fields.push('3. Stablecoin exclusion');
    fields.push('4. Min Volume');
    fields.push('5. Min/Max Price');
    fields.push('6. Bid-Ask Spread');
    fields.push('7. Daily Range');
    fields.push('8. Min History Days');
    fields.push('9. Placeholder filters (not yet active)\n');

    return fields.join('\n');
  }

  /**
   * Document sample data for reference pairs
   */
  private async documentSampleData(): Promise<string> {
    const fields: string[] = [];
    
    fields.push('## C. SAMPLE RAW KRAKEN DATA\n');
    
    const samplePairs = ['XXBTZUSD', 'XETHZUSD', 'ADAUSD', 'SOLUSD', 'XXRPZUSD'];
    
    try {
      const ticker = await this.kraken.getTicker();
      
      for (const pair of samplePairs) {
        const data = ticker[pair];
        if (data) {
          fields.push(`### ${pair}`);
          fields.push('```json');
          fields.push(JSON.stringify(data, null, 2));
          fields.push('```\n');
        } else {
          fields.push(`### ${pair}`);
          fields.push('*Pair not found in Kraken ticker data*\n');
        }
      }
    } catch (error) {
      fields.push('*Error fetching sample data from Kraken API*');
      fields.push(`Error: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
    }

    return fields.join('\n');
  }
}

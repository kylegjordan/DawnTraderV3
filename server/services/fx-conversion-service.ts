/**
 * REB 8.8.3-H3: FX Conversion Service for Multi-Currency LPCP Support
 * 
 * Provides USD normalization for all LPCP guardrail checks.
 * Caches FX rates with 30-second TTL to minimize API calls.
 * 
 * Supported pairs:
 * - USDT/USD, EUR/USD, GBP/USD, JPY/USD, CAD/USD, CHF/USD
 */

const LOG_TAG = '[8.8.3-H3][FX]';

interface FXRateCache {
  rates: Record<string, number>;
  timestamp: number;
}

interface CurrencyParseResult {
  baseCurrency: string;
  quoteCurrency: string;
  success: boolean;
}

class FXConversionService {
  private cache: FXRateCache | null = null;
  private readonly CACHE_TTL_MS = 30000; // 30 seconds
  private fetchInProgress: Promise<Record<string, number>> | null = null;
  
  // Kraken FX pairs to fetch (quote/USD)
  private readonly FX_PAIRS = [
    'USDTUSD',
    'EURUSD',
    'GBPUSD',
    'JPYUSD',
    'CADUSD',
    'CHFUSD'
  ];
  
  // Known quote currency suffixes (order matters - check longer suffixes first)
  private readonly QUOTE_CURRENCIES = [
    'USDT', 'USDC', 'USD',
    'EUR', 'GBP', 'JPY', 'CAD', 'CHF',
    'BTC', 'ETH', 'XBT'
  ];
  
  // Kraken legacy prefix/suffix mappings
  private readonly KRAKEN_CURRENCY_MAP: Record<string, string> = {
    'ZUSD': 'USD',
    'ZEUR': 'EUR',
    'ZGBP': 'GBP',
    'ZJPY': 'JPY',
    'ZCAD': 'CAD',
    'ZCHF': 'CHF',
    'XXBT': 'BTC',
    'XETH': 'ETH',
    'XXRP': 'XRP',
    'XLTC': 'LTC',
    'XBT': 'BTC'
  };

  /**
   * Parse symbol to extract base and quote currencies
   * Supports formats: XRP/USD, ARBEUR, BTCUSDT, ETH/GBP, XETHXXBT
   */
  parseSymbol(symbol: string): CurrencyParseResult {
    if (!symbol) {
      console.warn(`${LOG_TAG} parseSymbol: empty symbol provided`);
      return { baseCurrency: '', quoteCurrency: 'USD', success: false };
    }
    
    const normalized = symbol.toUpperCase().trim();
    
    // Format 1: Contains slash (XRP/USD, ETH/GBP)
    if (normalized.includes('/')) {
      const [base, quote] = normalized.split('/');
      const mappedQuote = this.KRAKEN_CURRENCY_MAP[quote] || quote;
      console.log(`${LOG_TAG} parseSymbol: ${symbol} → base=${base}, quote=${mappedQuote} (slash format)`);
      return { baseCurrency: base, quoteCurrency: mappedQuote, success: true };
    }
    
    // Format 2: Kraken legacy format (XETHXXBT, XXRPZUSD)
    if (normalized.startsWith('X') || normalized.startsWith('Z')) {
      // Check for known Kraken legacy pairs
      for (const [krakenCode, standardCode] of Object.entries(this.KRAKEN_CURRENCY_MAP)) {
        if (normalized.endsWith(krakenCode)) {
          const baseKraken = normalized.slice(0, -krakenCode.length);
          const baseMapped = this.KRAKEN_CURRENCY_MAP[baseKraken] || baseKraken.replace(/^X/, '');
          console.log(`${LOG_TAG} parseSymbol: ${symbol} → base=${baseMapped}, quote=${standardCode} (Kraken legacy)`);
          return { baseCurrency: baseMapped, quoteCurrency: standardCode, success: true };
        }
      }
    }
    
    // Format 3: Concatenated format (ARBEUR, BTCUSDT, XRPUSD)
    for (const quoteCurrency of this.QUOTE_CURRENCIES) {
      if (normalized.endsWith(quoteCurrency)) {
        const base = normalized.slice(0, -quoteCurrency.length);
        if (base.length >= 2) { // Minimum 2 chars for base currency
          const mappedQuote = this.KRAKEN_CURRENCY_MAP[quoteCurrency] || quoteCurrency;
          console.log(`${LOG_TAG} parseSymbol: ${symbol} → base=${base}, quote=${mappedQuote} (concatenated)`);
          return { baseCurrency: base, quoteCurrency: mappedQuote, success: true };
        }
      }
    }
    
    // Fallback: assume USD quote
    console.warn(`${LOG_TAG} parseSymbol: Unable to parse ${symbol}, assuming USD quote`);
    return { baseCurrency: normalized, quoteCurrency: 'USD', success: false };
  }

  /**
   * Fetch FX rates from Kraken public API
   */
  private async fetchFXRates(): Promise<Record<string, number>> {
    console.log(`${LOG_TAG} Fetching FX rates from Kraken...`);
    
    const pairParam = this.FX_PAIRS.join(',');
    const url = `https://api.kraken.com/0/public/Ticker?pair=${pairParam}`;
    
    try {
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Kraken API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.error && data.error.length > 0) {
        throw new Error(`Kraken API error: ${data.error.join(', ')}`);
      }
      
      const rates: Record<string, number> = {
        'USD': 1.0,     // USD to USD is always 1
        'USDT': 1.0,    // Default USDT (will be overwritten if available)
        'USDC': 1.0     // USDC is also 1:1 with USD
      };
      
      // Parse Kraken response format
      for (const [pairKey, tickerData] of Object.entries(data.result || {})) {
        const ticker = tickerData as any;
        const lastPrice = parseFloat(ticker.c?.[0] || ticker.a?.[0] || '0');
        
        if (lastPrice <= 0) continue;
        
        // Map Kraken pair keys to standard currencies
        if (pairKey.includes('USDT') || pairKey === 'USDTZUSD') {
          rates['USDT'] = lastPrice;
        } else if (pairKey.includes('EUR') || pairKey === 'EURZUSD' || pairKey === 'ZEURZUSD') {
          rates['EUR'] = lastPrice;
        } else if (pairKey.includes('GBP') || pairKey === 'GBPZUSD' || pairKey === 'ZGBPZUSD') {
          rates['GBP'] = lastPrice;
        } else if (pairKey.includes('JPY') || pairKey === 'JPYZUSD' || pairKey === 'ZJPYZUSD') {
          // JPY/USD gives how many USD per JPY
          rates['JPY'] = lastPrice;
        } else if (pairKey.includes('CAD') || pairKey === 'CADZUSD' || pairKey === 'ZCADZUSD') {
          rates['CAD'] = lastPrice;
        } else if (pairKey.includes('CHF') || pairKey === 'CHFZUSD' || pairKey === 'ZCHFZUSD') {
          rates['CHF'] = lastPrice;
        }
      }
      
      console.log(`${LOG_TAG} FX rates fetched:`, rates);
      return rates;
      
    } catch (error) {
      console.error(`${LOG_TAG} Failed to fetch FX rates:`, error);
      throw error;
    }
  }

  /**
   * Get cached FX rates, refreshing if expired
   */
  private async getCachedRates(): Promise<Record<string, number>> {
    const now = Date.now();
    
    // Check if cache is valid
    if (this.cache && (now - this.cache.timestamp) < this.CACHE_TTL_MS) {
      console.log(`${LOG_TAG} Using cached FX rates (age: ${Math.floor((now - this.cache.timestamp) / 1000)}s)`);
      return this.cache.rates;
    }
    
    // Prevent concurrent fetches
    if (this.fetchInProgress) {
      console.log(`${LOG_TAG} Waiting for in-progress FX fetch...`);
      return this.fetchInProgress;
    }
    
    // Fetch new rates
    this.fetchInProgress = this.fetchFXRates()
      .then(rates => {
        this.cache = { rates, timestamp: now };
        this.fetchInProgress = null;
        return rates;
      })
      .catch(error => {
        this.fetchInProgress = null;
        throw error;
      });
    
    return this.fetchInProgress;
  }

  /**
   * Convert a value from quote currency to USD
   * 
   * @param value The value in quote currency (e.g., price in EUR)
   * @param quoteCurrency The quote currency (e.g., 'EUR')
   * @returns The value in USD
   * @throws Error if FX rate is unavailable (fail-safe: blocks trade)
   */
  async convertToUSD(value: number, quoteCurrency: string): Promise<number> {
    const normalized = quoteCurrency.toUpperCase().trim();
    
    // Fast path: already USD
    if (normalized === 'USD') {
      return value;
    }
    
    // Map Kraken currency codes
    const mappedCurrency = this.KRAKEN_CURRENCY_MAP[normalized] || normalized;
    
    // USDC is 1:1 with USD
    if (mappedCurrency === 'USDC') {
      console.log(`${LOG_TAG} convertToUSD: ${value} USDC → ${value} USD (1:1)`);
      return value;
    }
    
    try {
      const rates = await this.getCachedRates();
      const rate = rates[mappedCurrency];
      
      if (rate === undefined || rate === null) {
        console.error(`${LOG_TAG}[FX_FAIL] No FX rate for ${mappedCurrency}, blocking trade`);
        throw new Error(`[8.8.3-H3][FX_FAIL] No FX rate available for ${mappedCurrency}`);
      }
      
      const usdValue = value * rate;
      console.log(`${LOG_TAG} convertToUSD: ${value} ${mappedCurrency} × ${rate} = ${usdValue.toFixed(6)} USD`);
      return usdValue;
      
    } catch (error) {
      console.error(`${LOG_TAG}[FX_FAIL] FX conversion failed for ${quoteCurrency}:`, error);
      throw new Error(`[8.8.3-H3][FX_FAIL] FX conversion failed for ${quoteCurrency}: ${(error as Error).message}`);
    }
  }

  /**
   * Check if a currency requires FX conversion (not USD/USDT/USDC)
   */
  requiresConversion(quoteCurrency: string): boolean {
    const normalized = quoteCurrency.toUpperCase().trim();
    const usdEquivalents = ['USD', 'USDT', 'USDC', 'ZUSD'];
    return !usdEquivalents.includes(normalized);
  }

  /**
   * Get the current FX rate for a currency (for diagnostics)
   */
  async getRate(quoteCurrency: string): Promise<number | null> {
    try {
      const rates = await this.getCachedRates();
      const normalized = this.KRAKEN_CURRENCY_MAP[quoteCurrency.toUpperCase()] || quoteCurrency.toUpperCase();
      return rates[normalized] || null;
    } catch {
      return null;
    }
  }

  /**
   * Clear cache (for testing)
   */
  clearCache(): void {
    this.cache = null;
    this.fetchInProgress = null;
    console.log(`${LOG_TAG} Cache cleared`);
  }
}

// Export singleton instance
export const fxConversionService = new FXConversionService();

// Also export class for testing
export { FXConversionService };

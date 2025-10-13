interface StockQuote {
  symbol: string;
  name: string;
  price: number | null;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
  timestamp: number;
  note?: string;
}

interface CompanyInfo {
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  country: string;
  industry: string;
  marketCap?: number;
  logo?: string;
}

interface StockSearchResult {
  symbol: string;
  description: string;
  type: string;
}

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

export class StockService {
  private quoteCache: Map<string, CacheEntry<StockQuote>> = new Map();
  private companyCache: Map<string, CacheEntry<CompanyInfo>> = new Map();
  private searchCache: Map<string, CacheEntry<StockSearchResult[]>> = new Map();
  private readonly CACHE_TTL = 120000; // 2 minutes (as per requirements)
  private readonly apiKey: string;
  private cacheHits = 0;
  private cacheMisses = 0;
  private readonly MAX_RETRIES = 2;
  private readonly RETRY_DELAY_BASE = 2000; // 2 seconds base delay

  constructor() {
    this.apiKey = process.env.FINNHUB_API_KEY || '';
    if (!this.apiKey) {
      console.warn('[StockService] FINNHUB_API_KEY not found in environment variables');
    }
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async fetchWithRetry<T>(
    url: string,
    operation: string,
    symbol: string
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        if (attempt > 0) {
          const delay = this.RETRY_DELAY_BASE * attempt;
          console.log(`[StockService] Retry ${attempt}/${this.MAX_RETRIES} for ${operation} ${symbol} after ${delay}ms`);
          await this.sleep(delay);
        }

        console.log(`[StockService] Fetching ${operation} from Finnhub: ${symbol} (attempt ${attempt + 1}/${this.MAX_RETRIES + 1})`);
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(`Finnhub API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        return data as T;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.warn(`[StockService] ${operation} attempt ${attempt + 1} failed for ${symbol}:`, lastError.message);
        
        if (attempt === this.MAX_RETRIES) {
          console.error(`[StockService] All ${this.MAX_RETRIES + 1} attempts failed for ${operation} ${symbol}`);
        }
      }
    }

    throw lastError || new Error(`Failed to fetch ${operation} for ${symbol}`);
  }

  async getQuote(symbol: string): Promise<StockQuote> {
    const normalizedSymbol = symbol.toUpperCase();
    
    const cached = this.getCachedData(this.quoteCache, normalizedSymbol);
    if (cached) {
      this.cacheHits++;
      console.log(`[StockService] Quote cache HIT for ${normalizedSymbol} (${this.cacheHits} hits, ${this.cacheMisses} misses)`);
      return cached;
    }

    this.cacheMisses++;
    console.log(`[StockService] Quote cache MISS for ${normalizedSymbol} (${this.cacheHits} hits, ${this.cacheMisses} misses)`);

    if (!this.apiKey) {
      throw new Error('Finnhub API key not configured');
    }

    const url = `https://finnhub.io/api/v1/quote?symbol=${normalizedSymbol}&token=${this.apiKey}`;

    try {
      const data = await this.fetchWithRetry<any>(url, 'quote', normalizedSymbol);

      if (!data.c || data.c === 0) {
        console.warn(`[Finnhub] Warning: no valid quote for ${normalizedSymbol}, using fallback`);
        return await this.getQuoteFallback(normalizedSymbol);
      }

      let name = normalizedSymbol;
      try {
        const companyInfo = await this.getCompanyInfo(normalizedSymbol);
        name = companyInfo.name;
      } catch (error) {
        console.warn(`[StockService] Could not fetch company name for ${normalizedSymbol}:`, error);
      }

      const quote: StockQuote = {
        symbol: normalizedSymbol,
        name,
        price: data.c,
        change: data.d,
        changePercent: data.dp,
        high: data.h,
        low: data.l,
        open: data.o,
        previousClose: data.pc,
        timestamp: data.t * 1000 || Date.now()
      };

      this.setCachedData(this.quoteCache, normalizedSymbol, quote);
      return quote;
    } catch (error) {
      console.warn(`[StockService] Quote fetch failed for ${normalizedSymbol}, attempting fallback:`, error);
      return await this.getQuoteFallback(normalizedSymbol);
    }
  }

  private async getQuoteFallback(symbol: string): Promise<StockQuote> {
    console.log(`[StockService] Using fallback mechanism for ${symbol}`);

    try {
      const companyInfo = await this.getCompanyInfo(symbol);
      
      const fallbackQuote: StockQuote = {
        symbol: symbol,
        name: companyInfo.name,
        price: null,
        change: 0,
        changePercent: 0,
        high: 0,
        low: 0,
        open: 0,
        previousClose: 0,
        timestamp: Date.now(),
        note: "Price temporarily unavailable — using fallback data"
      };

      console.log(`[StockService] Fallback successful for ${symbol}: company info available`);
      return fallbackQuote;
    } catch (companyError) {
      console.warn(`[StockService] Company info fallback failed for ${symbol}, trying search:`, companyError);

      try {
        const searchResults = await this.search(symbol);
        
        if (searchResults.length > 0) {
          const match = searchResults.find(r => r.symbol === symbol) || searchResults[0];
          
          const fallbackQuote: StockQuote = {
            symbol: symbol,
            name: match.description,
            price: null,
            change: 0,
            changePercent: 0,
            high: 0,
            low: 0,
            open: 0,
            previousClose: 0,
            timestamp: Date.now(),
            note: "Price temporarily unavailable — using fallback data"
          };

          console.log(`[StockService] Fallback successful for ${symbol}: search result available`);
          return fallbackQuote;
        }
      } catch (searchError) {
        console.warn(`[StockService] Search fallback also failed for ${symbol}:`, searchError);
      }

      throw new Error(`No data available for ${symbol} from any source`);
    }
  }

  async getCompanyInfo(symbol: string): Promise<CompanyInfo> {
    const normalizedSymbol = symbol.toUpperCase();
    
    const cached = this.getCachedData(this.companyCache, normalizedSymbol);
    if (cached) {
      this.cacheHits++;
      console.log(`[StockService] Company cache HIT for ${normalizedSymbol}`);
      return cached;
    }

    this.cacheMisses++;
    console.log(`[StockService] Company cache MISS for ${normalizedSymbol}`);

    if (!this.apiKey) {
      throw new Error('Finnhub API key not configured');
    }

    const url = `https://finnhub.io/api/v1/stock/profile2?symbol=${normalizedSymbol}&token=${this.apiKey}`;
    
    const data = await this.fetchWithRetry<any>(url, 'company info', normalizedSymbol);

    if (!data || !data.name) {
      throw new Error(`No company data available for ${normalizedSymbol}`);
    }

    const companyInfo: CompanyInfo = {
      symbol: normalizedSymbol,
      name: data.name,
      exchange: data.exchange || 'N/A',
      currency: data.currency || 'USD',
      country: data.country || 'US',
      industry: data.finnhubIndustry || data.industry || 'N/A',
      marketCap: data.marketCapitalization,
      logo: data.logo
    };

    this.setCachedData(this.companyCache, normalizedSymbol, companyInfo);
    return companyInfo;
  }

  async search(query: string): Promise<StockSearchResult[]> {
    const normalizedQuery = query.toLowerCase().trim();
    
    // Return empty array for very short queries
    if (normalizedQuery.length < 1) {
      return [];
    }
    
    const cached = this.getCachedData(this.searchCache, normalizedQuery);
    if (cached) {
      this.cacheHits++;
      console.log(`[StockService] Search cache HIT for "${normalizedQuery}"`);
      return cached;
    }

    this.cacheMisses++;
    console.log(`[StockService] Search cache MISS for "${normalizedQuery}"`);

    if (!this.apiKey) {
      console.error('[StockService] Finnhub API key not configured');
      return [];
    }

    try {
      const url = `https://finnhub.io/api/v1/search?q=${encodeURIComponent(query)}&token=${this.apiKey}`;
      
      const data = await this.fetchWithRetry<any>(url, 'search', normalizedQuery);

      if (!data.result || !Array.isArray(data.result)) {
        console.warn(`[StockService] No results from Finnhub for "${query}"`);
        // Cache empty results to avoid repeated API calls for invalid queries
        this.setCachedDataWithCustomTTL(this.searchCache, normalizedQuery, [], 300000); // 5 min for empty results
        return [];
      }

      const results: StockSearchResult[] = data.result
        .filter((item: any) => {
          // Allow stocks, ETFs, and other common security types
          const allowedTypes = ['Common Stock', 'ETF', 'ADR', 'REIT', 'Preferred Stock', 'Fund'];
          const hasValidType = !item.type || allowedTypes.includes(item.type);
          
          // Must have symbol and description
          const hasBasicInfo = item.symbol && item.description;
          
          // Filter out overly complex symbols (e.g., warrants, options)
          const isReasonableSymbol = item.symbol.length <= 10 && !item.symbol.includes('^');
          
          return hasBasicInfo && hasValidType && isReasonableSymbol;
        })
        .slice(0, 10) // Increased from 5 to 10 results
        .map((item: any) => ({
          symbol: item.symbol,
          description: item.description,
          type: item.type || 'Stock'
        }));

      // Cache search results for 10 minutes (longer than quotes since they change less frequently)
      this.setCachedDataWithCustomTTL(this.searchCache, normalizedQuery, results, 600000);
      console.log(`[StockService] Search returned ${results.length} results for "${query}"`);
      return results;
    } catch (error) {
      console.error(`[StockService] Search failed for "${query}":`, error);
      // Return empty array on error instead of throwing
      return [];
    }
  }

  private getCachedData<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
    const entry = cache.get(key);
    if (!entry) {
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      cache.delete(key);
      return null;
    }

    return entry.data;
  }

  private setCachedData<T>(cache: Map<string, CacheEntry<T>>, key: string, data: T): void {
    cache.set(key, {
      data,
      expiresAt: Date.now() + this.CACHE_TTL
    });
    console.log(`[StockService] Cached ${key} until ${new Date(Date.now() + this.CACHE_TTL).toISOString()}`);
  }

  private setCachedDataWithCustomTTL<T>(cache: Map<string, CacheEntry<T>>, key: string, data: T, ttl: number): void {
    cache.set(key, {
      data,
      expiresAt: Date.now() + ttl
    });
    console.log(`[StockService] Cached ${key} until ${new Date(Date.now() + ttl).toISOString()} (${ttl / 1000}s TTL)`);
  }

  getCacheStats(): { hits: number; misses: number; hitRate: string } {
    const total = this.cacheHits + this.cacheMisses;
    const hitRate = total > 0 ? ((this.cacheHits / total) * 100).toFixed(1) : '0.0';
    
    return {
      hits: this.cacheHits,
      misses: this.cacheMisses,
      hitRate: `${hitRate}%`
    };
  }

  clearCache(): void {
    this.quoteCache.clear();
    this.companyCache.clear();
    this.searchCache.clear();
    console.log('[StockService] All caches cleared');
  }

  async getSymbolData(symbol: string): Promise<{
    type: 'stock' | 'crypto';
    symbol: string;
    name: string;
    currentPrice: number | null;
    change24h?: number;
    volume24h?: number;
    lastUpdated: string;
    source: string;
  } | null> {
    const cleanSymbol = symbol.match(/^([A-Z0-9\-_]+)/)?.[1]?.toUpperCase() || symbol.toUpperCase();
    
    console.log(`[StockService] Getting unified symbol data for: ${cleanSymbol}`);

    const knownCryptoSymbols = ['BTC', 'ETH', 'SOL', 'SUI', 'ADA', 'DOT', 'MATIC', 'AVAX', 'LINK', 'UNI', 'ATOM', 'XRP', 'DOGE', 'LTC', 'BCH', 'XLM', 'ALGO', 'VET', 'FIL', 'TRX', 'ETC'];
    
    const isCrypto = knownCryptoSymbols.includes(cleanSymbol) || cleanSymbol.includes('USD');
    
    if (isCrypto) {
      try {
        const { marketDataService } = await import('./market-data');
        const cryptoData = await marketDataService.getMarketData(cleanSymbol);
        
        console.log(`[SymbolLookup] ${cleanSymbol} resolved via ${cryptoData.source}`);
        
        return {
          type: 'crypto',
          symbol: cleanSymbol,
          name: cryptoData.name || cleanSymbol,
          currentPrice: cryptoData.price,
          change24h: cryptoData.change24h,
          volume24h: cryptoData.volume24h,
          lastUpdated: new Date(cryptoData.timestamp).toISOString(),
          source: cryptoData.source
        };
      } catch (cryptoError) {
        console.warn(`[StockService] Crypto lookup failed for ${cleanSymbol}, trying stock fallback:`, cryptoError);
      }
    }
    
    try {
      const stockQuote = await this.getQuote(cleanSymbol);
      
      console.log(`[SymbolLookup] ${cleanSymbol} resolved via Finnhub`);
      
      return {
        type: 'stock',
        symbol: cleanSymbol,
        name: stockQuote.name,
        currentPrice: stockQuote.price,
        change24h: stockQuote.changePercent,
        volume24h: undefined,
        lastUpdated: new Date(stockQuote.timestamp).toISOString(),
        source: 'Finnhub'
      };
    } catch (stockError) {
      console.warn(`[StockService] Stock lookup failed for ${cleanSymbol}:`, stockError);
      
      if (!isCrypto) {
        try {
          const { marketDataService } = await import('./market-data');
          const cryptoData = await marketDataService.getMarketData(cleanSymbol);
          
          console.log(`[SymbolLookup] ${cleanSymbol} resolved via ${cryptoData.source} (fallback)`);
          
          return {
            type: 'crypto',
            symbol: cleanSymbol,
            name: cryptoData.name || cleanSymbol,
            currentPrice: cryptoData.price,
            change24h: cryptoData.change24h,
            volume24h: cryptoData.volume24h,
            lastUpdated: new Date(cryptoData.timestamp).toISOString(),
            source: cryptoData.source
          };
        } catch (cryptoFallbackError) {
          console.error(`[StockService] All lookups failed for ${cleanSymbol}:`, {
            stockError: stockError instanceof Error ? stockError.message : String(stockError),
            cryptoFallbackError: cryptoFallbackError instanceof Error ? cryptoFallbackError.message : String(cryptoFallbackError)
          });
        }
      }
    }
    
    return null;
  }
}

export const stockService = new StockService();

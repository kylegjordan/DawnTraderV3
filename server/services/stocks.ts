interface StockQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
  timestamp: number;
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
  private readonly CACHE_TTL = 60000; // 60 seconds
  private readonly apiKey: string;
  private cacheHits = 0;
  private cacheMisses = 0;

  constructor() {
    this.apiKey = process.env.FINNHUB_API_KEY || '';
    if (!this.apiKey) {
      console.warn('[StockService] FINNHUB_API_KEY not found in environment variables');
    }
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
    
    console.log(`[StockService] Fetching quote from Finnhub: ${normalizedSymbol}`);
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Finnhub API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.c || data.c === 0) {
      throw new Error(`No quote data available for ${normalizedSymbol}`);
    }

    // Fetch company name
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
      price: data.c, // current price
      change: data.d, // change
      changePercent: data.dp, // percent change
      high: data.h, // high price of the day
      low: data.l, // low price of the day
      open: data.o, // open price of the day
      previousClose: data.pc, // previous close price
      timestamp: data.t * 1000 || Date.now() // timestamp in milliseconds
    };

    this.setCachedData(this.quoteCache, normalizedSymbol, quote);
    return quote;
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
    
    console.log(`[StockService] Fetching company info from Finnhub: ${normalizedSymbol}`);
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Finnhub API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

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
    
    const cached = this.getCachedData(this.searchCache, normalizedQuery);
    if (cached) {
      this.cacheHits++;
      console.log(`[StockService] Search cache HIT for "${normalizedQuery}"`);
      return cached;
    }

    this.cacheMisses++;
    console.log(`[StockService] Search cache MISS for "${normalizedQuery}"`);

    if (!this.apiKey) {
      throw new Error('Finnhub API key not configured');
    }

    const url = `https://finnhub.io/api/v1/search?q=${encodeURIComponent(query)}&token=${this.apiKey}`;
    
    console.log(`[StockService] Searching Finnhub for: "${query}"`);
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Finnhub API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.result || !Array.isArray(data.result)) {
      console.warn(`[StockService] No results from Finnhub for "${query}"`);
      this.setCachedData(this.searchCache, normalizedQuery, []);
      return [];
    }

    // Filter to only US stocks and limit to 5 results
    const results: StockSearchResult[] = data.result
      .filter((item: any) => 
        item.type === 'Common Stock' && 
        !item.symbol.includes('.') && // Exclude foreign exchanges
        item.symbol.length <= 5 // Typical US stock symbol length
      )
      .slice(0, 5)
      .map((item: any) => ({
        symbol: item.symbol,
        description: item.description,
        type: item.type
      }));

    this.setCachedData(this.searchCache, normalizedQuery, results);
    return results;
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
}

export const stockService = new StockService();

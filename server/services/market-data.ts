interface MarketData {
  symbol: string;
  name?: string;
  price: number;
  change24h: number;
  volume24h?: number;
  source: 'coingecko' | 'kraken';
  timestamp: number;
}

interface CacheEntry {
  data: MarketData;
  expiresAt: number;
}

// B-NAMES (2026-06-15): exported so the asset-name resolver can use these
// already-pinned coin ids as its TIER-0 disambiguation source (Langston Step-2
// condition) — for our most-traded coins the symbol→id is already resolved
// here, so the resolver skips /coins/list lookup + collision disambiguation
// entirely for them (zero ambiguity on the symbols that matter most).
export const SYMBOL_TO_COINGECKO_ID: Record<string, string> = {
  'BTC': 'bitcoin',
  'ETH': 'ethereum',
  'SOL': 'solana',
  'SUI': 'sui',
  'ADA': 'cardano',
  'DOT': 'polkadot',
  'MATIC': 'matic-network',
  'AVAX': 'avalanche-2',
  'LINK': 'chainlink',
  'UNI': 'uniswap',
  'ATOM': 'cosmos',
  'XRP': 'ripple',
  'DOGE': 'dogecoin',
  'LTC': 'litecoin',
  'BCH': 'bitcoin-cash',
  'XLM': 'stellar',
  'ALGO': 'algorand',
  'VET': 'vechain',
  'FIL': 'filecoin',
  'TRX': 'tron',
  'ETC': 'ethereum-classic'
};

const SYMBOL_TO_COIN_NAME: Record<string, string> = {
  'BTC': 'Bitcoin',
  'ETH': 'Ethereum',
  'SOL': 'Solana',
  'SUI': 'Sui',
  'ADA': 'Cardano',
  'DOT': 'Polkadot',
  'MATIC': 'Polygon',
  'AVAX': 'Avalanche',
  'LINK': 'Chainlink',
  'UNI': 'Uniswap',
  'ATOM': 'Cosmos',
  'XRP': 'XRP',
  'DOGE': 'Dogecoin',
  'LTC': 'Litecoin',
  'BCH': 'Bitcoin Cash',
  'XLM': 'Stellar',
  'ALGO': 'Algorand',
  'VET': 'VeChain',
  'FIL': 'Filecoin',
  'TRX': 'TRON',
  'ETC': 'Ethereum Classic'
};

const SYMBOL_TO_KRAKEN_PAIR: Record<string, string> = {
  'BTC': 'XBTUSDT',
  'ETH': 'ETHUSDT',
  'SOL': 'SOLUSDT',
  'SUI': 'SUIUSD',
  'ADA': 'ADAUSDT',
  'DOT': 'DOTUSDT',
  'MATIC': 'MATICUSDT',
  'AVAX': 'AVAXUSDT',
  'LINK': 'LINKUSDT',
  'UNI': 'UNIUSDT',
  'ATOM': 'ATOMUSDT',
  'XRP': 'XRPUSDT',
  'DOGE': 'DOGEUSDT',
  'LTC': 'LTCUSDT',
  'BCH': 'BCHUSDT',
  'XLM': 'XLMUSDT',
  'ALGO': 'ALGOUSDT',
  'VET': 'VETUSDT',
  'FIL': 'FILUSDT',
  'TRX': 'TRXUSDT',
  'ETC': 'ETCUSDT'
};

export class MarketDataService {
  private cache: Map<string, CacheEntry> = new Map();
  private readonly CACHE_TTL = 60000;
  private cacheHits = 0;
  private cacheMisses = 0;

  async getMarketData(symbol: string): Promise<MarketData> {
    const normalizedSymbol = symbol.replace(/\/USD$/, '').toUpperCase();
    
    const cached = this.getCachedData(normalizedSymbol);
    if (cached) {
      this.cacheHits++;
      console.log(`[MarketData] Cache HIT for ${normalizedSymbol} (${this.cacheHits} hits, ${this.cacheMisses} misses)`);
      return cached;
    }

    this.cacheMisses++;
    console.log(`[MarketData] Cache MISS for ${normalizedSymbol} (${this.cacheHits} hits, ${this.cacheMisses} misses)`);

    try {
      const data = await this.fetchFromCoinGecko(normalizedSymbol);
      this.setCachedData(normalizedSymbol, data);
      return data;
    } catch (error) {
      console.warn(`[MarketData] CoinGecko failed for ${normalizedSymbol}, trying Kraken fallback:`, error);
      
      try {
        const data = await this.fetchFromKraken(normalizedSymbol);
        this.setCachedData(normalizedSymbol, data);
        return data;
      } catch (krakenError) {
        console.error(`[MarketData] Both CoinGecko and Kraken failed for ${normalizedSymbol}:`, krakenError);
        throw new Error(`Failed to fetch market data for ${normalizedSymbol} from all sources`);
      }
    }
  }

  private async fetchFromCoinGecko(symbol: string): Promise<MarketData> {
    const coinId = SYMBOL_TO_COINGECKO_ID[symbol];
    if (!coinId) {
      throw new Error(`Symbol ${symbol} not supported by CoinGecko`);
    }

    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_last_updated_at=true`;
    
    console.log(`[MarketData] Fetching from CoinGecko: ${symbol} (${coinId})`);
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const coinData = data[coinId];

    if (!coinData || !coinData.usd) {
      throw new Error(`No data returned from CoinGecko for ${symbol}`);
    }

    return {
      symbol,
      name: SYMBOL_TO_COIN_NAME[symbol] || symbol,
      price: coinData.usd,
      change24h: coinData.usd_24h_change || 0,
      volume24h: coinData.usd_24h_vol,
      source: 'coingecko',
      timestamp: coinData.last_updated_at ? coinData.last_updated_at * 1000 : Date.now()
    };
  }

  private async fetchFromKraken(symbol: string): Promise<MarketData> {
    const krakenPair = SYMBOL_TO_KRAKEN_PAIR[symbol];
    if (!krakenPair) {
      throw new Error(`Symbol ${symbol} not supported by Kraken`);
    }

    const url = `https://api.kraken.com/0/public/Ticker?pair=${krakenPair}`;
    
    console.log(`[MarketData] Fetching from Kraken: ${symbol} (${krakenPair})`);
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Kraken API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    if (data.error && data.error.length > 0) {
      throw new Error(`Kraken API error: ${data.error.join(', ')}`);
    }

    const pairData = data.result[krakenPair];
    if (!pairData) {
      throw new Error(`No data returned from Kraken for ${symbol}`);
    }

    const currentPrice = parseFloat(pairData.c[0]);
    const openPrice = parseFloat(pairData.o);
    const change24h = ((currentPrice - openPrice) / openPrice) * 100;
    const volume24h = parseFloat(pairData.v[1]);

    return {
      symbol,
      name: SYMBOL_TO_COIN_NAME[symbol] || symbol,
      price: currentPrice,
      change24h,
      volume24h,
      source: 'kraken',
      timestamp: Date.now()
    };
  }

  private getCachedData(symbol: string): MarketData | null {
    const entry = this.cache.get(symbol);
    if (!entry) {
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(symbol);
      return null;
    }

    return entry.data;
  }

  private setCachedData(symbol: string, data: MarketData): void {
    this.cache.set(symbol, {
      data,
      expiresAt: Date.now() + this.CACHE_TTL
    });
    console.log(`[MarketData] Cached ${symbol} until ${new Date(Date.now() + this.CACHE_TTL).toISOString()}`);
  }

  getCacheStats(): { hits: number; misses: number; hitRate: string; cacheSize: number } {
    const total = this.cacheHits + this.cacheMisses;
    const hitRate = total > 0 ? ((this.cacheHits / total) * 100).toFixed(1) : '0.0';
    
    return {
      hits: this.cacheHits,
      misses: this.cacheMisses,
      hitRate: `${hitRate}%`,
      cacheSize: this.cache.size
    };
  }

  clearCache(): void {
    this.cache.clear();
    console.log('[MarketData] Cache cleared');
  }

  resetStats(): void {
    this.cacheHits = 0;
    this.cacheMisses = 0;
    console.log('[MarketData] Stats reset');
  }
}

export const marketDataService = new MarketDataService();

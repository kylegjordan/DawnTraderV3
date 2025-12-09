export type PriceSourceTag = 'kraken_ws' | 'kraken_rest';

export interface CachedPrice {
  symbol: string;
  price: number;
  lastSource: PriceSourceTag;
  lastUpdatedAt: number;
}

class PriceCache {
  private prices = new Map<string, CachedPrice>();

  updateFromWebSocket(symbol: string, price: number) {
    const now = Date.now();
    this.prices.set(symbol, {
      symbol,
      price,
      lastSource: 'kraken_ws',
      lastUpdatedAt: now,
    });
  }

  updateFromRest(symbol: string, price: number) {
    const now = Date.now();
    this.prices.set(symbol, {
      symbol,
      price,
      lastSource: 'kraken_rest',
      lastUpdatedAt: now,
    });
  }

  get(symbol: string): CachedPrice | null {
    return this.prices.get(symbol) ?? null;
  }

  snapshot() {
    return Array.from(this.prices.values());
  }

  clear() {
    this.prices.clear();
  }
}

export const priceCache = new PriceCache();

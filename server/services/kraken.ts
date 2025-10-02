import crypto from "crypto";

interface KrakenConfig {
  apiKey: string;
  apiSecret: string;
  baseUrl: string;
}

interface KrakenTicker {
  a: string[]; // ask [price, whole lot volume, lot volume]
  b: string[]; // bid [price, whole lot volume, lot volume]
  c: string[]; // last trade closed [price, lot volume]
  v: string[]; // volume [today, last 24 hours]
  p: string[]; // volume weighted average price [today, last 24 hours]
  t: number[]; // number of trades [today, last 24 hours]
  l: string[]; // low [today, last 24 hours]
  h: string[]; // high [today, last 24 hours]
  o: string; // today's opening price
}

interface KrakenOHLCData {
  time: number;
  open: string;
  high: string;
  low: string;
  close: string;
  vwap: string;
  volume: string;
  count: number;
}

interface OrderBookEntry {
  price: string;
  volume: string;
  timestamp: number;
}

interface KrakenOrderBook {
  asks: OrderBookEntry[];
  bids: OrderBookEntry[];
}

export class KrakenService {
  private config: KrakenConfig;

  constructor(apiKey?: string, apiSecret?: string) {
    this.config = {
      apiKey: apiKey || process.env.KRAKEN_API_KEY || "",
      apiSecret: apiSecret || process.env.KRAKEN_API_SECRET || "",
      baseUrl: "https://api.kraken.com"
    };
  }

  private getMessageSignature(path: string, request: any, secret: string, nonce: number): string {
    const message = new URLSearchParams(request).toString();
    const hash = crypto.createHash('sha256');
    const hmac = crypto.createHmac('sha512', Buffer.from(secret, 'base64'));
    
    hash.update(nonce + message);
    hmac.update(path + hash.digest());
    
    return hmac.digest('base64');
  }

  private async makePublicRequest(endpoint: string, params: any = {}): Promise<any> {
    const url = new URL(`${this.config.baseUrl}/0/public/${endpoint}`);
    Object.keys(params).forEach(key => {
      if (params[key] !== undefined) {
        url.searchParams.append(key, params[key]);
      }
    });

    const response = await fetch(url.toString());
    const data = await response.json();

    if (data.error && data.error.length > 0) {
      throw new Error(`Kraken API error: ${data.error.join(', ')}`);
    }

    return data.result;
  }

  private async makePrivateRequest(endpoint: string, params: any = {}): Promise<any> {
    if (!this.config.apiKey || !this.config.apiSecret) {
      throw new Error("Kraken API credentials not configured");
    }

    const nonce = Date.now() * 1000;
    const path = `/0/private/${endpoint}`;
    
    const request = {
      nonce: nonce.toString(),
      ...params
    };

    const signature = this.getMessageSignature(path, request, this.config.apiSecret, nonce);

    const response = await fetch(`${this.config.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'API-Key': this.config.apiKey,
        'API-Sign': signature,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams(request).toString()
    });

    const data = await response.json();

    if (data.error && data.error.length > 0) {
      throw new Error(`Kraken API error: ${data.error.join(', ')}`);
    }

    return data.result;
  }

  // Public endpoints
  async getServerTime(): Promise<{ unixtime: number; rfc1123: string }> {
    return await this.makePublicRequest('Time');
  }

  async getAssetInfo(): Promise<any> {
    return await this.makePublicRequest('Assets');
  }

  async getTradablePairs(): Promise<any> {
    return await this.makePublicRequest('AssetPairs');
  }

  async getTicker(pair?: string): Promise<Record<string, KrakenTicker>> {
    const params = pair ? { pair } : {};
    return await this.makePublicRequest('Ticker', params);
  }

  async getOHLCData(pair: string, interval = 60, since?: number): Promise<{
    ohlc: KrakenOHLCData[];
    last: number;
  }> {
    const params: any = { pair, interval };
    if (since) params.since = since;

    const result = await this.makePublicRequest('OHLC', params);
    const pairData = result[pair];
    
    return {
      ohlc: pairData.map((candle: any[]) => ({
        time: candle[0],
        open: candle[1],
        high: candle[2],
        low: candle[3],
        close: candle[4],
        vwap: candle[5],
        volume: candle[6],
        count: candle[7]
      })),
      last: result.last
    };
  }

  async getOrderBook(pair: string, count = 100): Promise<Record<string, KrakenOrderBook>> {
    return await this.makePublicRequest('Depth', { pair, count });
  }

  async getRecentTrades(pair: string, since?: number): Promise<any> {
    const params: any = { pair };
    if (since) params.since = since;
    return await this.makePublicRequest('Trades', params);
  }

  // Private endpoints
  async getAccountBalance(): Promise<Record<string, string>> {
    return await this.makePrivateRequest('Balance');
  }

  async getOpenOrders(): Promise<any> {
    return await this.makePrivateRequest('OpenOrders');
  }

  async getClosedOrders(): Promise<any> {
    return await this.makePrivateRequest('ClosedOrders');
  }

  async addOrder(params: {
    pair: string;
    type: 'buy' | 'sell';
    ordertype: 'market' | 'limit' | 'stop-loss' | 'take-profit';
    volume: string;
    price?: string;
    price2?: string;
    leverage?: string;
    oflags?: string;
    starttm?: string;
    expiretm?: string;
    userref?: string;
    validate?: boolean;
  }): Promise<{ txid: string[]; descr: any }> {
    return await this.makePrivateRequest('AddOrder', params);
  }

  async cancelOrder(txid: string): Promise<any> {
    return await this.makePrivateRequest('CancelOrder', { txid });
  }

  // Utility methods
  async getEligiblePairs(): Promise<Array<{
    symbol: string;
    baseCurrency: string;
    quoteCurrency: string;
    marketCap?: number;
    volume24h: number;
    currentPrice: number;
    dailyRange: number;
  }>> {
    const [tickers, pairs] = await Promise.all([
      this.getTicker(),
      this.getTradablePairs()
    ]);

    const eligiblePairs: any[] = [];

    Object.entries(tickers).forEach(([pairName, ticker]) => {
      const pairInfo = pairs[pairName];
      if (!pairInfo) return;

      const currentPrice = parseFloat(ticker.c[0]);
      const volume24h = parseFloat(ticker.v[1]);
      const high24h = parseFloat(ticker.h[1]);
      const low24h = parseFloat(ticker.l[1]);
      const dailyRange = ((high24h - low24h) / low24h) * 100;

      // Apply screener criteria
      if (
        volume24h >= 20000000 && // Min 24h volume: $20M
        dailyRange >= 5.0 && // Min daily range: 5%
        currentPrice >= 0.001 // Min price: $0.001
      ) {
        eligiblePairs.push({
          symbol: pairName,
          baseCurrency: pairInfo.base,
          quoteCurrency: pairInfo.quote,
          volume24h,
          currentPrice,
          dailyRange,
          vwap: parseFloat(ticker.p[1]) // 24h VWAP
        });
      }
    });

    return eligiblePairs;
  }

  async calculateProjectedSlippage(pair: string, volume: number, side: 'buy' | 'sell'): Promise<number> {
    try {
      const orderBook = await this.getOrderBook(pair, 50);
      const book = orderBook[pair];
      if (!book) return 0;

      const orders = side === 'buy' ? book.asks : book.bids;
      let remainingVolume = volume;
      let totalCost = 0;
      let totalVolume = 0;

      for (const order of orders) {
        const orderPrice = parseFloat(order.price);
        const orderVolume = parseFloat(order.volume);
        const volumeToTake = Math.min(remainingVolume, orderVolume);

        totalCost += volumeToTake * orderPrice;
        totalVolume += volumeToTake;
        remainingVolume -= volumeToTake;

        if (remainingVolume <= 0) break;
      }

      if (totalVolume === 0) return 100; // No liquidity available

      const averagePrice = totalCost / totalVolume;
      const marketPrice = side === 'buy' ? 
        parseFloat(book.asks[0].price) : 
        parseFloat(book.bids[0].price);

      return Math.abs((averagePrice - marketPrice) / marketPrice) * 100;
    } catch (error) {
      console.error('Error calculating projected slippage:', error);
      return 0;
    }
  }
}

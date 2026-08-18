import { storage } from '../storage';

export interface EnrichedFeatures {
  symbol: string;
  timestamp: Date;
  momentumIndex: number;
  rsi: number;
  smaSlope: number;
  volumeDelta: number;
  sentimentScore: number;
  sectorCorrelation: number;
}

export class FeatureEnrichmentService {
  private readonly RSI_PERIOD = 14;
  private readonly SMA_PERIOD = 20;
  private readonly MOMENTUM_WEIGHTS = {
    rsi: 0.4,
    smaSlope: 0.3,
    volumeDelta: 0.3,
  };

  async enrichFeatures(symbol: string): Promise<EnrichedFeatures> {
    const priceData = await storage.getPriceData(symbol);
    
    if (priceData.length < Math.max(this.RSI_PERIOD, this.SMA_PERIOD) + 1) {
      console.warn(`[FeatureEnrichment] Insufficient data for ${symbol}`);
      return this.getDefaultFeatures(symbol);
    }

    // storage.getPriceData returns rows ordered by timestamp ASC (oldest→newest);
    // every window in this service takes the TAIL of a chronological series (#690).
    const recentData = priceData.slice(-30);
    const prices = recentData.map(d => parseFloat(d.close));
    const volumes = recentData.map(d => parseFloat(d.volume));

    const rsi = this.calculateRSI(prices, this.RSI_PERIOD);
    const smaSlope = this.calculateSMASlope(prices, this.SMA_PERIOD);
    const volumeDelta = this.calculateVolumeDelta(volumes);

    const momentumIndex = this.calculateMomentumIndex(rsi, smaSlope, volumeDelta);

    const sentimentScore = await this.calculateSentimentScore(symbol);
    const sectorCorrelation = await this.calculateSectorCorrelation(symbol);

    return {
      symbol,
      timestamp: new Date(),
      momentumIndex,
      rsi,
      smaSlope,
      volumeDelta,
      sentimentScore,
      sectorCorrelation,
    };
  }

  private getDefaultFeatures(symbol: string): EnrichedFeatures {
    return {
      symbol,
      timestamp: new Date(),
      momentumIndex: 0,
      rsi: 50,
      smaSlope: 0,
      volumeDelta: 0,
      sentimentScore: 0.5,
      sectorCorrelation: 0,
    };
  }

  private calculateRSI(prices: number[], period: number): number {
    if (prices.length < period + 1) return 50;

    const changes: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      changes.push(prices[i] - prices[i - 1]);
    }
    const recent = changes.slice(-period);

    let gains = 0;
    let losses = 0;
    for (const change of recent) {
      if (change > 0) {
        gains += change;
      } else {
        losses += Math.abs(change);
      }
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;

    if (avgLoss === 0) return 100;

    const rs = avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));

    return Number(rsi.toFixed(2));
  }

  private calculateSMASlope(prices: number[], period: number): number {
    if (prices.length < period + 5) return 0;

    const sma1 = this.calculateSMA(prices.slice(-period));
    const sma2 = this.calculateSMA(prices.slice(-(period + 5), -5));

    const slope = (sma1 - sma2) / sma2;
    return Number(slope.toFixed(6));
  }

  private calculateSMA(prices: number[]): number {
    if (prices.length === 0) return 0;
    return prices.reduce((sum, price) => sum + price, 0) / prices.length;
  }

  private calculateVolumeDelta(volumes: number[]): number {
    if (volumes.length < 2) return 0;

    const recentAvg = this.calculateSMA(volumes.slice(-5));
    const olderAvg = this.calculateSMA(volumes.slice(-10, -5));

    if (olderAvg === 0) return 0;

    const delta = (recentAvg - olderAvg) / olderAvg;
    return Number(delta.toFixed(4));
  }

  private calculateMomentumIndex(rsi: number, smaSlope: number, volumeDelta: number): number {
    const normalizedRSI = (rsi - 50) / 50;
    
    const normalizedSlope = Math.max(-1, Math.min(1, smaSlope * 10));
    
    const normalizedVolume = Math.max(-1, Math.min(1, volumeDelta * 2));

    const momentumIndex = 
      normalizedRSI * this.MOMENTUM_WEIGHTS.rsi +
      normalizedSlope * this.MOMENTUM_WEIGHTS.smaSlope +
      normalizedVolume * this.MOMENTUM_WEIGHTS.volumeDelta;

    return Number(momentumIndex.toFixed(4));
  }

  private async calculateSentimentScore(symbol: string): Promise<number> {
    return 0.5;
  }

  private async calculateSectorCorrelation(symbol: string): Promise<number> {
    const majorPairs = ['BTC', 'ETH'];
    
    if (majorPairs.includes(symbol)) {
      return 1.0;
    }

    try {
      const symbolData = await storage.getPriceData(symbol);
      const btcData = await storage.getPriceData('BTC');

      if (symbolData.length < 20 || btcData.length < 20) {
        return 0;
      }

      const symbolReturns = this.calculateReturns(
        symbolData.slice(-20).map(d => parseFloat(d.close))
      );
      const btcReturns = this.calculateReturns(
        btcData.slice(-20).map(d => parseFloat(d.close))
      );

      const correlation = this.calculateCorrelation(symbolReturns, btcReturns);
      return Number(correlation.toFixed(4));
    } catch (error) {
      console.error(`[FeatureEnrichment] Error calculating sector correlation for ${symbol}:`, error);
      return 0;
    }
  }

  private calculateReturns(prices: number[]): number[] {
    const returns: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }
    return returns;
  }

  private calculateCorrelation(x: number[], y: number[]): number {
    const n = Math.min(x.length, y.length);
    if (n < 2) return 0;

    const xSlice = x.slice(0, n);
    const ySlice = y.slice(0, n);

    const xMean = xSlice.reduce((sum, val) => sum + val, 0) / n;
    const yMean = ySlice.reduce((sum, val) => sum + val, 0) / n;

    let numerator = 0;
    let xVariance = 0;
    let yVariance = 0;

    for (let i = 0; i < n; i++) {
      const xDiff = xSlice[i] - xMean;
      const yDiff = ySlice[i] - yMean;
      numerator += xDiff * yDiff;
      xVariance += xDiff * xDiff;
      yVariance += yDiff * yDiff;
    }

    const denominator = Math.sqrt(xVariance * yVariance);
    if (denominator === 0) return 0;

    return numerator / denominator;
  }

}

export const featureEnrichmentService = new FeatureEnrichmentService();

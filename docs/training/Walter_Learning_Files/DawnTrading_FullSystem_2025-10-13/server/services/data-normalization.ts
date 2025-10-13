import { storage } from '../storage';

interface NormalizationResult {
  zScore: number;
  minMax: number;
}

interface NormalizedData {
  symbol: string;
  timestamp: Date;
  priceNormalized: NormalizationResult;
  volumeNormalized: NormalizationResult;
  volatilityScore: number;
  liquidityScore: number;
  meetsQualityThreshold: boolean;
}

export class DataNormalizationService {
  private readonly DEFAULT_WINDOW = 30;
  private readonly MIN_VOLATILITY_THRESHOLD = 0.02;
  private readonly MIN_LIQUIDITY_SCORE = 0.3;

  async normalizeMarketData(
    symbol: string,
    currentPrice: number,
    currentVolume: number,
    window: number = this.DEFAULT_WINDOW
  ): Promise<NormalizedData> {
    const priceData = await storage.getPriceData(symbol);
    
    if (priceData.length < window) {
      console.warn(`[DataNormalization] Insufficient data for ${symbol}: ${priceData.length} < ${window}`);
    }

    const recentData = priceData.slice(0, window);
    const prices = recentData.map(d => parseFloat(d.close));
    const volumes = recentData.map(d => parseFloat(d.volume));

    const priceNormalized = this.normalize(currentPrice, prices);
    const volumeNormalized = this.normalize(currentVolume, volumes);

    const volatilityScore = this.calculateVolatility(prices);
    const liquidityScore = this.calculateLiquidity(volumes, currentVolume);

    const meetsQualityThreshold = 
      volatilityScore >= this.MIN_VOLATILITY_THRESHOLD &&
      liquidityScore >= this.MIN_LIQUIDITY_SCORE;

    return {
      symbol,
      timestamp: new Date(),
      priceNormalized,
      volumeNormalized,
      volatilityScore,
      liquidityScore,
      meetsQualityThreshold,
    };
  }

  private normalize(value: number, historicalValues: number[]): NormalizationResult {
    if (historicalValues.length === 0) {
      return { zScore: 0, minMax: 0.5 };
    }

    const mean = historicalValues.reduce((sum, v) => sum + v, 0) / historicalValues.length;
    const variance = historicalValues.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / historicalValues.length;
    const stdDev = Math.sqrt(variance);

    const zScore = stdDev > 0 ? (value - mean) / stdDev : 0;

    const min = Math.min(...historicalValues);
    const max = Math.max(...historicalValues);
    const minMax = max > min ? (value - min) / (max - min) : 0.5;

    return {
      zScore: Number(zScore.toFixed(4)),
      minMax: Number(minMax.toFixed(4)),
    };
  }

  private calculateVolatility(prices: number[]): number {
    if (prices.length < 2) return 0;

    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }

    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    const volatility = Math.sqrt(variance);

    return Number(volatility.toFixed(4));
  }

  private calculateLiquidity(volumes: number[], currentVolume: number): number {
    if (volumes.length === 0) return 0;

    const avgVolume = volumes.reduce((sum, v) => sum + v, 0) / volumes.length;
    const maxVolume = Math.max(...volumes);

    const relativeVolume = currentVolume / avgVolume;
    const volumeDepth = avgVolume / (maxVolume > 0 ? maxVolume : 1);

    const liquidityScore = (relativeVolume * 0.7 + volumeDepth * 0.3);
    
    return Number(Math.min(liquidityScore, 1).toFixed(4));
  }

  filterByVolatilityAndLiquidity(normalizedData: NormalizedData[]): NormalizedData[] {
    return normalizedData.filter(data => data.meetsQualityThreshold);
  }

  async ensureTimestampAlignment(
    symbols: string[],
    referenceTimestamp: Date,
    toleranceMinutes: number = 5
  ): Promise<Map<string, boolean>> {
    const alignmentStatus = new Map<string, boolean>();
    
    for (const symbol of symbols) {
      const latestSnapshot = await storage.getLatestFeatureSnapshot(symbol);
      
      if (!latestSnapshot) {
        alignmentStatus.set(symbol, false);
        continue;
      }

      const snapshotTime = latestSnapshot.timestamp ? new Date(latestSnapshot.timestamp) : new Date(0);
      const timeDiffMs = Math.abs(snapshotTime.getTime() - referenceTimestamp.getTime());
      const timeDiffMinutes = timeDiffMs / (1000 * 60);
      
      alignmentStatus.set(symbol, timeDiffMinutes <= toleranceMinutes);
    }

    return alignmentStatus;
  }

  async saveNormalizedSnapshot(normalizedData: NormalizedData): Promise<void> {
    await storage.createFeatureSnapshot({
      symbol: normalizedData.symbol,
      priceNormalized: normalizedData.priceNormalized.zScore.toString(),
      volumeNormalized: normalizedData.volumeNormalized.zScore.toString(),
      volatilityScore: normalizedData.volatilityScore.toString(),
      liquidityScore: normalizedData.liquidityScore.toString(),
      rawFeatures: {
        priceMinMax: normalizedData.priceNormalized.minMax,
        volumeMinMax: normalizedData.volumeNormalized.minMax,
      },
      normalizationWindow: this.DEFAULT_WINDOW,
    });
  }
}

export const dataNormalizationService = new DataNormalizationService();

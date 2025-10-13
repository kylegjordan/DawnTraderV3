import { storage } from '../storage';

interface SignalPerformance {
  signalName: string;
  totalPredictions: number;
  correctPredictions: number;
  avgConfidence: number;
  avgOutcome: number;
  correlation: number;
}

export class SignalWeightOptimizerService {
  private optimizerIntervalId: NodeJS.Timeout | null = null;
  private readonly DECAY_FACTOR = 0.9;
  private readonly MIN_SAMPLE_SIZE = 10;
  private readonly CORRELATION_THRESHOLD = 0.2;

  async startOptimizer(): Promise<void> {
    console.log('[SignalWeightOptimizer] Starting optimizer scheduler...');
    
    await this.runOptimization();
    
    this.scheduleNightlyOptimization();
    
    console.log('[SignalWeightOptimizer] Scheduler started successfully');
  }

  async stopOptimizer(): Promise<void> {
    if (this.optimizerIntervalId) {
      clearInterval(this.optimizerIntervalId);
      this.optimizerIntervalId = null;
    }
    console.log('[SignalWeightOptimizer] Scheduler stopped');
  }

  private scheduleNightlyOptimization(): void {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(2, 0, 0, 0);
    
    const timeUntilRun = tomorrow.getTime() - now.getTime();
    
    setTimeout(() => {
      this.runOptimization();
      
      this.optimizerIntervalId = setInterval(() => {
        this.runOptimization();
      }, 24 * 60 * 60 * 1000);
    }, timeUntilRun);
    
    console.log(`[SignalWeightOptimizer] Next optimization scheduled for ${tomorrow.toISOString()}`);
  }

  private async runOptimization(): Promise<void> {
    console.log('[SignalWeightOptimizer] Running nightly optimization...');
    
    try {
      const users = await storage.getAllUsers();
      
      for (const user of users) {
        await this.optimizeUserWeights(user.id, 'paper');
      }
      
      console.log('[SignalWeightOptimizer] Optimization completed successfully');
    } catch (error) {
      console.error('[SignalWeightOptimizer] Error during optimization:', error);
    }
  }

  async optimizeUserWeights(userId: string, mode: 'paper' | 'live'): Promise<void> {
    console.log(`[SignalWeightOptimizer] Optimizing weights for user ${userId} in ${mode} mode`);
    
    const strategies = ['vwap_pullback', 'abcd_long', 'sma_trend_ride'] as const;
    
    for (const strategy of strategies) {
      await this.optimizeStrategyWeights(userId, strategy, mode);
    }
  }

  private async optimizeStrategyWeights(
    userId: string,
    strategy: string,
    mode: 'paper' | 'live'
  ): Promise<void> {
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 30);
    
    const outcomes = await storage.getPredictionOutcomes(userId, {
      mode,
      strategy,
      fromDate,
    });

    const completedOutcomes = outcomes.filter(o => o.correct !== null);

    if (completedOutcomes.length < this.MIN_SAMPLE_SIZE) {
      console.log(`[SignalWeightOptimizer] Insufficient data for ${strategy} (${completedOutcomes.length} < ${this.MIN_SAMPLE_SIZE})`);
      return;
    }

    const signalPerformance = this.analyzeSignalPerformance(completedOutcomes);

    for (const [signalName, performance] of Object.entries(signalPerformance)) {
      await this.updateSignalWeight(userId, strategy, mode, signalName, performance);
    }
  }

  private analyzeSignalPerformance(outcomes: any[]): Record<string, SignalPerformance> {
    const signalGroups: Record<string, any[]> = {};

    for (const outcome of outcomes) {
      const signalType = outcome.signalType || 'default';
      if (!signalGroups[signalType]) {
        signalGroups[signalType] = [];
      }
      signalGroups[signalType].push(outcome);
    }

    const performanceMap: Record<string, SignalPerformance> = {};

    for (const [signalName, group] of Object.entries(signalGroups)) {
      const correctPredictions = group.filter(o => o.correct === true).length;
      const totalPredictions = group.length;
      
      const avgConfidence = group.reduce((sum, o) => 
        sum + parseFloat(o.predictionConfidence || '0'), 0
      ) / totalPredictions;
      
      const avgOutcome = group.reduce((sum, o) => 
        sum + parseFloat(o.actualOutcome || '0'), 0
      ) / totalPredictions;

      const correlation = this.calculateSignalCorrelation(group);

      performanceMap[signalName] = {
        signalName,
        totalPredictions,
        correctPredictions,
        avgConfidence,
        avgOutcome,
        correlation,
      };
    }

    return performanceMap;
  }

  private calculateSignalCorrelation(outcomes: any[]): number {
    if (outcomes.length < 2) return 0;

    const confidences = outcomes.map(o => parseFloat(o.predictionConfidence || '0'));
    const results = outcomes.map(o => o.correct ? 1 : 0);

    const n = outcomes.length;
    const meanConfidence = confidences.reduce((sum, c) => sum + c, 0) / n;
    const meanResult = results.reduce((sum: number, r) => sum + r, 0) / n;

    let numerator = 0;
    let confVariance = 0;
    let resVariance = 0;

    for (let i = 0; i < n; i++) {
      const confDiff = confidences[i] - meanConfidence;
      const resDiff = results[i] - meanResult;
      numerator += confDiff * resDiff;
      confVariance += confDiff * confDiff;
      resVariance += resDiff * resDiff;
    }

    const denominator = Math.sqrt(confVariance * resVariance);
    if (denominator === 0) return 0;

    return numerator / denominator;
  }

  private async updateSignalWeight(
    userId: string,
    strategy: string,
    mode: string,
    signalName: string,
    performance: SignalPerformance
  ): Promise<void> {
    const existingWeight = await storage.getSignalWeight(userId, strategy, mode, signalName);
    
    const currentWeight = existingWeight ? parseFloat(existingWeight.weight || '1.0') : 1.0;

    const accuracy = performance.totalPredictions > 0 
      ? performance.correctPredictions / performance.totalPredictions 
      : 0.5;

    const performanceScore = (accuracy * 0.5) + (performance.correlation * 0.3) + (performance.avgConfidence * 0.2);

    let newWeight = currentWeight * this.DECAY_FACTOR;

    if (performance.correlation > this.CORRELATION_THRESHOLD && accuracy > 0.5) {
      newWeight = currentWeight * (1 + performanceScore * 0.1);
    } else if (performance.correlation < -this.CORRELATION_THRESHOLD || accuracy < 0.4) {
      newWeight = currentWeight * (1 - Math.abs(performanceScore) * 0.1);
    }

    newWeight = Math.max(0.1, Math.min(2.0, newWeight));

    await storage.upsertSignalWeight({
      userId,
      strategy: strategy as any,
      mode: mode as any,
      signalName,
      weight: newWeight.toString(),
      correlationScore: performance.correlation.toString(),
      sampleSize: performance.totalPredictions,
      metadata: {
        accuracy,
        avgConfidence: performance.avgConfidence,
        avgOutcome: performance.avgOutcome,
        updatedBy: 'optimizer',
      },
    });

    console.log(`[SignalWeightOptimizer] Updated weight for ${signalName}: ${currentWeight.toFixed(4)} → ${newWeight.toFixed(4)} (correlation: ${performance.correlation.toFixed(4)}, accuracy: ${(accuracy * 100).toFixed(1)}%)`);
  }

  async getWeightInsights(userId: string, mode: string): Promise<{
    topSignals: Array<{ name: string; weight: number; correlation: number; sampleSize: number }>;
    weakSignals: Array<{ name: string; weight: number; correlation: number; sampleSize: number }>;
    avgWeight: number;
  }> {
    const weights = await storage.getSignalWeights(userId, undefined, mode);

    if (weights.length === 0) {
      return { topSignals: [], weakSignals: [], avgWeight: 1.0 };
    }

    const weightData = weights.map(w => ({
      name: w.signalName,
      weight: parseFloat(w.weight || '1.0'),
      correlation: parseFloat(w.correlationScore || '0'),
      sampleSize: w.sampleSize || 0,
    }));

    weightData.sort((a, b) => b.weight - a.weight);

    const topSignals = weightData.slice(0, 5);
    const weakSignals = weightData.slice(-5).reverse();
    const avgWeight = weightData.reduce((sum, w) => sum + w.weight, 0) / weightData.length;

    return {
      topSignals,
      weakSignals,
      avgWeight,
    };
  }
}

// Regime-based signal weight adjustment helper
export async function adjustSignalWeightsByRegime(regime: string, mode: 'live' | 'paper'): Promise<void> {
  console.log(`[SignalWeightOptimizer] Adjusting weights for ${regime} regime in ${mode} mode`);
  
  // Example conservative mapping - bounded nudges based on market regime
  const regimeDeltas: Record<string, Record<'long' | 'short', number>> = {
    bullish:        { long: +0.08, short: -0.06 },
    bearish:        { long: -0.06, short: +0.08 },
    neutral:        { long: +0.00, short: +0.00 },
    accumulation:   { long: +0.05, short: -0.03 },
    distribution:   { long: -0.03, short: +0.05 },
    high_volatility:{ long: -0.02, short: -0.02 }, // reduce conviction globally
    low_volatility: { long: +0.02, short: +0.02 },
  };

  const deltas = regimeDeltas[regime] || regimeDeltas.neutral;
  
  // Get all users and apply adjustments
  const users = await storage.getAllUsers();
  
  for (const user of users) {
    const strategies = ['vwap_pullback', 'abcd_long', 'sma_trend_ride'] as const;
    
    for (const strategy of strategies) {
      // Get existing weights for long and short signals
      const longWeight = await storage.getSignalWeight(user.id, strategy, mode, 'long');
      const shortWeight = await storage.getSignalWeight(user.id, strategy, mode, 'short');
      
      // Apply bounded adjustments
      if (longWeight) {
        const currentLong = parseFloat(longWeight.weight || '1.0');
        const newLong = Math.max(0.1, Math.min(2.0, currentLong + deltas.long));
        
        await storage.upsertSignalWeight({
          userId: user.id,
          strategy: strategy as any,
          mode: mode as any,
          signalName: 'long',
          weight: newLong.toString(),
          correlationScore: longWeight.correlationScore || '0',
          sampleSize: longWeight.sampleSize || 0,
          metadata: {
            ...(longWeight.metadata as any || {}),
            regimeAdjustment: regime,
            adjustmentDate: new Date().toISOString(),
          },
        });
      }
      
      if (shortWeight) {
        const currentShort = parseFloat(shortWeight.weight || '1.0');
        const newShort = Math.max(0.1, Math.min(2.0, currentShort + deltas.short));
        
        await storage.upsertSignalWeight({
          userId: user.id,
          strategy: strategy as any,
          mode: mode as any,
          signalName: 'short',
          weight: newShort.toString(),
          correlationScore: shortWeight.correlationScore || '0',
          sampleSize: shortWeight.sampleSize || 0,
          metadata: {
            ...(shortWeight.metadata as any || {}),
            regimeAdjustment: regime,
            adjustmentDate: new Date().toISOString(),
          },
        });
      }
    }
  }
  
  console.log(`[SignalWeightOptimizer] Regime adjustment complete for ${mode} mode`);
}

export const signalWeightOptimizerService = new SignalWeightOptimizerService();

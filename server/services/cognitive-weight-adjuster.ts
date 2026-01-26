import { storage } from "../storage";
import { logPredictiveAdjustment } from '../core/logging/predictive-adjustments';

interface WeightAdjustment {
  sourceName: string;
  sourceType: string;
  oldWeight: number;
  newWeight: number;
  accuracyScore: number;
  relevanceScore: number;
  totalPredictions: number;
  correctPredictions: number;
}

interface RefinementMetrics {
  totalSourcesAdjusted: number;
  averageAccuracyImprovement: number;
  weightAdjustments: WeightAdjustment[];
  refinementTimestamp: Date;
}

export class CognitiveWeightAdjuster {
  private readonly CORRECT_WEIGHT_INCREASE = 0.05;
  private readonly INCORRECT_WEIGHT_DECREASE = 0.1;
  private readonly NO_OUTCOME_DECAY = 0.01;
  private readonly MIN_WEIGHT = 0.1;
  private readonly MAX_WEIGHT = 2.0;
  private readonly MIN_SAMPLE_SIZE = 5;

  async runRefinementCycle(userId: string): Promise<RefinementMetrics> {
    console.log(`[CognitiveWeightAdjuster] Starting refinement cycle for user ${userId}`);
    
    const startTime = Date.now();
    const weightAdjustments: WeightAdjustment[] = [];

    try {
      // Get all learning sources for this user
      const learningSources = await storage.getLearningSources(userId);
      
      // Initialize default sources if none exist
      if (learningSources.length === 0) {
        await this.initializeDefaultSources(userId);
        const newSources = await storage.getLearningSources(userId);
        console.log(`[CognitiveWeightAdjuster] Initialized ${newSources.length} default learning sources`);
      }

      const sources = learningSources.length > 0 ? learningSources : await storage.getLearningSources(userId);

      // Review each knowledge source
      for (const source of sources) {
        const adjustment = await this.adjustSourceWeight(userId, source);
        if (adjustment) {
          weightAdjustments.push(adjustment);

          // Wire to centralized predictive adjustment logger for unified observability
          logPredictiveAdjustment({
            category: 'Weight',
            parameter: `cognitive.${adjustment.sourceName}`,
            oldValue: adjustment.oldWeight,
            newValue: adjustment.newWeight,
            reason: `CognitiveWeightAdjuster: ${adjustment.sourceType} source (accuracy: ${adjustment.accuracyScore.toFixed(4)})`
          });
        }
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      const avgImprovement = weightAdjustments.length > 0
        ? weightAdjustments.reduce((sum, adj) => sum + (adj.newWeight - adj.oldWeight), 0) / weightAdjustments.length
        : 0;

      // Log to transparency
      await storage.createTransparencyLog({
        taskName: 'intelligence-refinement',
        resultSummary: `Adjusted ${weightAdjustments.length} learning source weights (avg improvement: ${avgImprovement.toFixed(4)})`,
        success: true,
        duration,
        notes: JSON.stringify({
          userId,
          adjustments: weightAdjustments.map(a => ({
            source: a.sourceName,
            type: a.sourceType,
            oldWeight: parseFloat(a.oldWeight.toFixed(4)),
            newWeight: parseFloat(a.newWeight.toFixed(4)),
            accuracy: parseFloat(a.accuracyScore.toFixed(4)),
          })),
          timestamp: new Date().toISOString(),
        }),
      });

      console.log(`[CognitiveWeightAdjuster] Refinement cycle complete: ${weightAdjustments.length} sources adjusted in ${duration}s`);

      return {
        totalSourcesAdjusted: weightAdjustments.length,
        averageAccuracyImprovement: avgImprovement,
        weightAdjustments,
        refinementTimestamp: new Date(),
      };

    } catch (error) {
      console.error('[CognitiveWeightAdjuster] Error in refinement cycle:', error);
      
      await storage.createTransparencyLog({
        taskName: 'intelligence-refinement',
        resultSummary: `Refinement cycle failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        success: false,
        duration: ((Date.now() - startTime) / 1000).toFixed(2),
      });

      throw error;
    }
  }

  private async adjustSourceWeight(userId: string, source: any): Promise<WeightAdjustment | null> {
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 30); // Last 30 days

    // Get prediction outcomes attributed to this knowledge source
    const outcomes = await this.getSourcePredictionOutcomes(userId, source.sourceName, fromDate);

    if (outcomes.length < this.MIN_SAMPLE_SIZE) {
      // Apply decay for sources with no recent activity
      const oldWeight = parseFloat(source.weight);
      const newWeight = Math.max(this.MIN_WEIGHT, oldWeight - this.NO_OUTCOME_DECAY);
      
      if (newWeight !== oldWeight) {
        await storage.updateLearningSource(source.id, {
          weight: newWeight.toString(),
          updatedAt: new Date(),
        });

        return {
          sourceName: source.sourceName,
          sourceType: source.sourceType,
          oldWeight,
          newWeight,
          accuracyScore: parseFloat(source.accuracyScore || '0.5'),
          relevanceScore: parseFloat(source.relevanceScore || '0.5'),
          totalPredictions: 0,
          correctPredictions: 0,
        };
      }
      
      return null;
    }

    // Calculate accuracy
    const correctCount = outcomes.filter(o => o.correct === true).length;
    const totalCount = outcomes.length;
    const accuracy = correctCount / totalCount;

    // Calculate new weight based on accuracy
    const oldWeight = parseFloat(source.weight);
    let weightChange = 0;

    if (accuracy > 0.6) {
      // Good performance: increase weight
      weightChange = this.CORRECT_WEIGHT_INCREASE;
    } else if (accuracy < 0.4) {
      // Poor performance: decrease weight
      weightChange = -this.INCORRECT_WEIGHT_DECREASE;
    }
    // Neutral performance (0.4-0.6): no change

    const newWeight = Math.max(this.MIN_WEIGHT, Math.min(this.MAX_WEIGHT, oldWeight + weightChange));
    
    // Update source in database
    await storage.updateLearningSource(source.id, {
      weight: newWeight.toString(),
      accuracyScore: accuracy.toString(),
      totalPredictions: totalCount,
      correctPredictions: correctCount,
      lastAccuracyUpdate: new Date(),
      updatedAt: new Date(),
    });

    console.log(`[CognitiveWeightAdjuster] ${source.sourceName}: ${oldWeight.toFixed(4)} → ${newWeight.toFixed(4)} (accuracy: ${(accuracy * 100).toFixed(1)}%, samples: ${totalCount})`);

    return {
      sourceName: source.sourceName,
      sourceType: source.sourceType,
      oldWeight,
      newWeight,
      accuracyScore: accuracy,
      relevanceScore: parseFloat(source.relevanceScore || '0.5'),
      totalPredictions: totalCount,
      correctPredictions: correctCount,
    };
  }

  private async getSourcePredictionOutcomes(userId: string, sourceName: string, fromDate: Date): Promise<any[]> {
    // Get prediction outcomes and filter by source name based on metadata
    const allOutcomes = await storage.getPredictionOutcomes(userId, { fromDate });
    
    // Filter outcomes that were influenced by this knowledge source
    // This could be based on metadata, tags, or other attribution mechanisms
    return allOutcomes.filter(outcome => {
      const metadata = outcome.metadata as any;
      if (!metadata) return false;
      
      // Check if this source contributed to the prediction
      const sources = metadata.knowledgeSources || [];
      return sources.includes(sourceName);
    });
  }

  private async initializeDefaultSources(userId: string): Promise<void> {
    const defaultSources = [
      {
        userId,
        sourceName: 'semantic_memory',
        sourceType: 'vector_embedding',
        weight: '1.0000',
        relevanceScore: '0.5000',
        accuracyScore: '0.5000',
      },
      {
        userId,
        sourceName: 'cached_responses',
        sourceType: 'response_cache',
        weight: '1.0000',
        relevanceScore: '0.5000',
        accuracyScore: '0.5000',
      },
      {
        userId,
        sourceName: 'external_api',
        sourceType: 'live_data',
        weight: '1.0000',
        relevanceScore: '0.5000',
        accuracyScore: '0.5000',
      },
      {
        userId,
        sourceName: 'historical_patterns',
        sourceType: 'time_series',
        weight: '1.0000',
        relevanceScore: '0.5000',
        accuracyScore: '0.5000',
      },
      {
        userId,
        sourceName: 'ai_lessons',
        sourceType: 'learned_knowledge',
        weight: '1.0000',
        relevanceScore: '0.5000',
        accuracyScore: '0.5000',
      },
    ];

    for (const source of defaultSources) {
      await storage.createLearningSource(source);
    }
  }

  async getHealthMetrics(userId: string): Promise<any> {
    const sources = await storage.getLearningSources(userId);
    
    if (sources.length === 0) {
      return {
        averageAccuracy: 0,
        confidenceVariance: 0,
        topSources: [],
        lastRefinement: null,
        totalSources: 0,
      };
    }

    const accuracies = sources.map((s: any) => parseFloat(s.accuracyScore || '0.5'));
    const weights = sources.map((s: any) => parseFloat(s.weight));

    const avgAccuracy = accuracies.reduce((sum: number, a: number) => sum + a, 0) / accuracies.length;
    const avgWeight = weights.reduce((sum: number, w: number) => sum + w, 0) / weights.length;
    const variance = weights.reduce((sum: number, w: number) => sum + Math.pow(w - avgWeight, 2), 0) / weights.length;

    const topSources = sources
      .map((s: any) => ({
        name: s.sourceName,
        type: s.sourceType,
        weight: parseFloat(s.weight),
        accuracy: parseFloat(s.accuracyScore || '0.5'),
        predictions: s.totalPredictions || 0,
      }))
      .sort((a: any, b: any) => b.weight - a.weight)
      .slice(0, 5);

    const lastRefinement = sources
      .map((s: any) => s.updatedAt)
      .filter((d: any) => d !== null)
      .sort((a: any, b: any) => b!.getTime() - a!.getTime())[0] || null;

    return {
      averageAccuracy: avgAccuracy,
      confidenceVariance: variance,
      topSources,
      lastRefinement,
      totalSources: sources.length,
    };
  }
}

export const cognitiveWeightAdjuster = new CognitiveWeightAdjuster();

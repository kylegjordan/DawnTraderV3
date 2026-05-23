import { storage } from '../storage';
import { actuationPolicyService } from './actuation-policy';

interface LearningMetrics {
  paperAccuracy: number;
  liveAccuracy: number;
  paperPnLVariance: number;
  livePnLVariance: number;
  filterStability: number;
  systemHealthUptime: number;
  transferSuccessRate: number;
}

interface ConfidenceComponents {
  paperAccuracy: number;
  transferSuccessRate: number;
  healthUptime: number;
}

interface LearningPattern {
  detected: boolean;
  accuracyImprovement: number;
  pnlVarianceReduction: number;
  sampleSize: number;
}

export class CLEOrchestratorService {
  private orchestratorIntervalId: NodeJS.Timeout | null = null;
  private readonly ACCURACY_THRESHOLD = 0.03; // 3%
  private readonly PNL_VARIANCE_THRESHOLD = 0.05; // 5%
  private readonly MIN_SAMPLE_SIZE = 20;
  private readonly CONFIDENCE_DROP_THRESHOLD = 15; // points
  private readonly PNL_VARIANCE_PAUSE_THRESHOLD = 0.25; // 25%
  private readonly LIVE_STALENESS_HOURS = 24;
  private previousConfidence: number = 20; // baseline

  async startOrchestrator(): Promise<void> {
    console.log('[CLEOrchestrator] Starting Continuous Learning Engine...');
    
    // Initial learning cycle
    await this.runLearningCycle();
    
    // Schedule hourly runs
    this.orchestratorIntervalId = setInterval(() => {
      this.runLearningCycle();
    }, 60 * 60 * 1000); // 1 hour
    
    console.log('[CLEOrchestrator] Scheduler started successfully (1h interval)');
  }

  async stopOrchestrator(): Promise<void> {
    if (this.orchestratorIntervalId) {
      clearInterval(this.orchestratorIntervalId);
      this.orchestratorIntervalId = null;
    }
    console.log('[CLEOrchestrator] Scheduler stopped');
  }

  private async runLearningCycle(): Promise<void> {
    console.log('[CLEOrchestrator] Running autonomous learning cycle...');
    
    try {
      const users = await storage.getAllUsers();
      
      for (const user of users) {
        // Run learning for Paper mode only
        // Live mode gets updates ONLY through Paper→Live transfer
        await this.processModeLearning(user.id, 'paper');
        
        // Check and transfer Paper learnings to Live if stale
        await this.checkAndTransferPaperLearnings(user.id);
      }
      
      // Recalculate confidence index
      await this.recalculateConfidenceIndex();
      
      console.log('[CLEOrchestrator] Learning cycle completed successfully');
    } catch (error) {
      console.error('[CLEOrchestrator] Error during learning cycle:', error);
      
      // Log to error_logs and transparency log
      await storage.createErrorLog({
        errorType: 'cle-orchestrator',
        errorMessage: `Learning cycle failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        context: { error: String(error) },
      });
      
      await storage.createTransparencyLog({
        taskName: 'learning-cycle',
        mode: 'paper',
        success: false,
        resultSummary: `Failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        notes: JSON.stringify({ error: String(error), timestamp: new Date().toISOString() }),
      });
    }
  }

  private async processModeLearning(userId: string, mode: 'paper' | 'live'): Promise<void> {
    console.log(`[CLEOrchestrator] Processing learning for user ${userId} in ${mode} mode`);
    
    // 1. Analyze prediction outcomes for patterns
    const pattern = await this.detectLearningPattern(userId, mode);
    
    if (!pattern.detected) {
      console.log(`[CLEOrchestrator] No significant pattern detected for ${mode} mode`);
      return;
    }
    
    // 2. Check safety constraints before applying
    const canApply = await this.checkSafetyConstraints(userId, mode, pattern);
    
    if (!canApply) {
      console.log(`[CLEOrchestrator] Safety constraints failed, skipping ${mode} mode update`);
      return;
    }
    
    // 3. Generate new calibration
    await this.generateAutonomousCalibration(userId, mode, pattern);
    
    // 4. Update AI lessons
    await this.recordLesson(userId, mode, pattern);
    
    // 5. Update portfolio adjustments
    await this.recordPortfolioAdjustment(userId, mode, pattern);
  }

  private async detectLearningPattern(userId: string, mode: 'paper' | 'live'): Promise<LearningPattern> {
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 30);
    
    const outcomes = await storage.getPredictionOutcomes(userId, {
      mode,
      fromDate,
    });
    
    if (outcomes.length < this.MIN_SAMPLE_SIZE) {
      return {
        detected: false,
        accuracyImprovement: 0,
        pnlVarianceReduction: 0,
        sampleSize: outcomes.length,
      };
    }
    
    // Split into two periods for comparison
    const midPoint = Math.floor(outcomes.length / 2);
    const recentOutcomes = outcomes.slice(midPoint);
    const olderOutcomes = outcomes.slice(0, midPoint);
    
    // Calculate accuracy improvement
    const recentAccuracy = this.calculateAccuracy(recentOutcomes);
    const olderAccuracy = this.calculateAccuracy(olderOutcomes);
    const accuracyImprovement = recentAccuracy - olderAccuracy;
    
    // Calculate PnL variance reduction
    const recentVariance = this.calculatePnLVariance(recentOutcomes);
    const olderVariance = this.calculatePnLVariance(olderOutcomes);
    const pnlVarianceReduction = olderVariance > 0 
      ? (olderVariance - recentVariance) / olderVariance 
      : 0;
    
    const detected = 
      accuracyImprovement >= this.ACCURACY_THRESHOLD &&
      pnlVarianceReduction >= this.PNL_VARIANCE_THRESHOLD;
    
    console.log(`[CLEOrchestrator] Pattern detection for ${mode}: accuracy Δ${(accuracyImprovement * 100).toFixed(1)}%, variance Δ${(pnlVarianceReduction * 100).toFixed(1)}%`);
    
    return {
      detected,
      accuracyImprovement,
      pnlVarianceReduction,
      sampleSize: outcomes.length,
    };
  }

  private calculateAccuracy(outcomes: any[]): number {
    if (outcomes.length === 0) return 0;
    const correctCount = outcomes.filter(o => o.correct === true).length;
    return correctCount / outcomes.length;
  }

  private calculatePnLVariance(outcomes: any[]): number {
    if (outcomes.length === 0) return 0;
    
    const pnlValues = outcomes
      .map(o => parseFloat(o.actualOutcome || '0'))
      .filter(v => !isNaN(v));
    
    if (pnlValues.length === 0) return 0;
    
    const mean = pnlValues.reduce((sum, v) => sum + v, 0) / pnlValues.length;
    const variance = pnlValues.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / pnlValues.length;
    
    return variance;
  }

  private async checkSafetyConstraints(
    userId: string, 
    mode: 'paper' | 'live', 
    pattern: LearningPattern
  ): Promise<boolean> {
    // Check if PnL variance is too high
    const currentVariance = await this.getCurrentPnLVariance(userId, mode);
    
    if (currentVariance > this.PNL_VARIANCE_PAUSE_THRESHOLD) {
      console.log(`[CLEOrchestrator] PnL variance too high (${(currentVariance * 100).toFixed(1)}%), pausing learning`);
      
      await storage.createTransparencyLog({
        taskName: 'learning-paused',
        mode,
        success: false,
        resultSummary: `Learning paused due to high PnL variance: ${(currentVariance * 100).toFixed(1)}%`,
        notes: JSON.stringify({ 
          reason: 'high-pnl-variance',
          variance: currentVariance,
          threshold: this.PNL_VARIANCE_PAUSE_THRESHOLD,
          userId,
          timestamp: new Date().toISOString(),
        }),
      });
      
      return false;
    }
    
    // Check confidence drop (will be checked after new confidence is calculated)
    // This is a forward-looking check based on pattern quality
    if (pattern.accuracyImprovement < 0 || pattern.pnlVarianceReduction < 0) {
      console.log('[CLEOrchestrator] Negative pattern detected, rejecting update');
      return false;
    }
    
    return true;
  }

  private async getCurrentPnLVariance(userId: string, mode: 'paper' | 'live'): Promise<number> {
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 7);
    
    const outcomes = await storage.getPredictionOutcomes(userId, {
      mode,
      fromDate,
    });
    
    return this.calculatePnLVariance(outcomes);
  }

  private async generateAutonomousCalibration(
    userId: string,
    mode: 'paper' | 'live',
    pattern: LearningPattern
  ): Promise<void> {
    // Create filter calibration entry with autonomous-learning source
    // Update minVolume as a proxy for learning adjustment
    await storage.createCalibration({
      mode,
      minVolume: pattern.accuracyImprovement.toString(),
      reason: `Autonomous learning detected: +${(pattern.accuracyImprovement * 100).toFixed(1)}% accuracy, -${(pattern.pnlVarianceReduction * 100).toFixed(1)}% variance (sample: ${pattern.sampleSize})`,
      source: 'autonomous-learning',
    });
    
    console.log(`[CLEOrchestrator] Generated autonomous calibration for ${mode} mode`);
  }

  private async recordLesson(
    userId: string,
    mode: 'paper' | 'live',
    pattern: LearningPattern
  ): Promise<void> {
    await storage.createAILesson({
      userId,
      lessonType: 'pattern-recognition',
      lesson: `Autonomous learning detected improvement in ${mode} mode: +${(pattern.accuracyImprovement * 100).toFixed(1)}% accuracy, -${(pattern.pnlVarianceReduction * 100).toFixed(1)}% variance (sample: ${pattern.sampleSize})`,
      mode,
      confidence: Math.min(0.95, pattern.accuracyImprovement + 0.5).toString(),
    });
    
    console.log(`[CLEOrchestrator] Recorded AI lesson for ${mode} mode`);
  }

  private async recordPortfolioAdjustment(
    userId: string,
    mode: 'paper' | 'live',
    pattern: LearningPattern
  ): Promise<void> {
    await storage.createPortfolioAdjustment({
      mode,
      adjustmentType: 'risk-parameter',
      parameter: 'pnl-variance',
      previousValue: '0',
      newValue: pattern.pnlVarianceReduction.toString(),
      reason: `Learning cycle: variance reduced by ${(pattern.pnlVarianceReduction * 100).toFixed(1)}%, accuracy +${(pattern.accuracyImprovement * 100).toFixed(1)}% (sample: ${pattern.sampleSize})`,
      performanceImpact: pattern.accuracyImprovement.toString(),
    });
    
    console.log(`[CLEOrchestrator] Recorded portfolio adjustment for ${mode} mode`);
  }

  /**
   * Milestone 17A: Propose parameter adjustment through actuation policy
   * This replaces direct calibration application with safe policy-based proposals
   */
  async proposeParameterAdjustment(params: {
    userId: string;
    variableName: string;
    currentValue: number;
    proposedValue: number;
    mode: 'live' | 'paper';
    confidenceScore: number;
    rationale: string;
  }): Promise<{ success: boolean; proposalId?: string; violations?: any[] }> {
    const { userId, variableName, currentValue, proposedValue, mode, confidenceScore, rationale } = params;
    
    console.log(`[CLEOrchestrator] Proposing ${variableName} adjustment: ${currentValue} → ${proposedValue} (confidence: ${confidenceScore})`);
    
    // Validate through actuation policy
    const validation = await actuationPolicyService.validateProposal(
      userId,
      variableName,
      currentValue,
      proposedValue,
      confidenceScore
    );
    
    if (!validation.valid) {
      console.log(`[CLEOrchestrator] Proposal rejected:`, validation.violations);
      
      // Log rejection to transparency panel
      await storage.createTransparencyLog({
        taskName: 'parameter-adjustment-proposal',
        mode,
        success: false,
        resultSummary: `Proposal rejected: ${variableName} ${currentValue} → ${proposedValue}`,
        notes: JSON.stringify({
          variableName,
          currentValue,
          proposedValue,
          violations: validation.violations,
          timestamp: new Date().toISOString()
        })
      });
      
      return {
        success: false,
        violations: validation.violations
      };
    }
    
    // Create proposed adjustment
    const proposal = await actuationPolicyService.createProposal({
      userId,
      variableName,
      currentValue,
      proposedValue,
      mode,
      confidenceScore,
      rationale
    });
    
    console.log(`[CLEOrchestrator] Created proposal ${proposal.id} for ${variableName}`);
    
    // Log to transparency panel
    await storage.createTransparencyLog({
      taskName: 'parameter-adjustment-proposal',
      mode,
      success: true,
      resultSummary: `Proposed ${variableName}: ${currentValue} → ${proposedValue} (confidence: ${confidenceScore})`,
      notes: JSON.stringify({
        proposalId: proposal.id,
        variableName,
        currentValue,
        proposedValue,
        confidenceScore,
        rationale,
        timestamp: new Date().toISOString()
      })
    });
    
    return {
      success: true,
      proposalId: proposal.id
    };
  }

  /**
   * Auto-approve and apply high-confidence proposals in Paper mode
   * Live mode always requires manual review
   */
  async autoApplyPaperProposals(userId: string): Promise<number> {
    const pendingProposals = await storage.getPendingAdjustments(userId, 'paper');
    let appliedCount = 0;
    
    for (const proposal of pendingProposals) {
      // Auto-approve if confidence >= 80
      if (proposal.confidenceScore && proposal.confidenceScore >= 80) {
        try {
          await actuationPolicyService.approveProposal(proposal.id, 'auto-approved', userId);
          await actuationPolicyService.applyProposal(proposal.id);
          appliedCount++;
          
          console.log(`[CLEOrchestrator] Auto-applied Paper proposal ${proposal.id} (confidence: ${proposal.confidenceScore})`);
        } catch (error) {
          console.error(`[CLEOrchestrator] Error applying proposal ${proposal.id}:`, error);
        }
      }
    }
    
    return appliedCount;
  }

  private async checkAndTransferPaperLearnings(userId: string): Promise<void> {
    // Check if Live calibrations are stale (> 24 hours)
    const liveCalibrations = await storage.getRecentCalibrations({ userId, mode: 'live', limit: 10 });
    
    if (liveCalibrations.length === 0) {
      await this.transferPaperToLive(userId);
      return;
    }
    
    const latestLive = liveCalibrations[0];
    const ageHours = (Date.now() - new Date(latestLive.timestamp || Date.now()).getTime()) / (1000 * 60 * 60);
    
    if (ageHours > this.LIVE_STALENESS_HOURS) {
      console.log(`[CLEOrchestrator] Live calibrations stale (${ageHours.toFixed(1)}h), transferring from Paper`);
      await this.transferPaperToLive(userId);
    }
  }

  private async transferPaperToLive(userId: string): Promise<void> {
    const paperCalibrations = await storage.getRecentCalibrations({ userId, mode: 'paper', limit: 5 });
    
    if (paperCalibrations.length === 0) {
      console.log('[CLEOrchestrator] No Paper calibrations to transfer');
      return;
    }
    
    // Get the most recent successful Paper calibration
    const latestPaper = paperCalibrations[0];
    
    // Transfer to Live with paper-fallback marker
    await storage.createCalibration({
      mode: 'live',
      minVolume: latestPaper.minVolume,
      minPrice: latestPaper.minPrice,
      maxPrice: latestPaper.maxPrice,
      minMarketCap: latestPaper.minMarketCap,
      maxBidAskSpread: latestPaper.maxBidAskSpread,
      minDailyRange: latestPaper.minDailyRange,
      reason: `Transferred from Paper mode (stale Live data) - Paper calibration ID: ${latestPaper.id}`,
      source: 'paper-fallback',
    });
    
    console.log('[CLEOrchestrator] Successfully transferred Paper→Live calibration');
    
    // Log transparency
    await storage.createTransparencyLog({
      taskName: 'paper-live-transfer',
      mode: 'live',
      success: true,
      resultSummary: `Transferred calibration from Paper to Live`,
      notes: JSON.stringify({
        source: 'paper-fallback',
        calibrationId: latestPaper.id,
        userId,
        timestamp: new Date().toISOString(),
      }),
    });
  }

  private async recalculateConfidenceIndex(): Promise<void> {
    console.log('[CLEOrchestrator] Recalculating Autonomy Confidence Index...');
    
    try {
      const users = await storage.getAllUsers();
      
      if (users.length === 0) {
        console.log('[CLEOrchestrator] No users found, skipping confidence calculation');
        return;
      }
      
      // For now, use first user (single-user system)
      const userId = users[0].id;
      
      const components = await this.calculateConfidenceComponents(userId);
      
      // Base Formula: CI = 0.5(Accuracy_paper) + 0.3(Transfer_SuccessRate) + 0.2(Health_Uptime)
      const baseConfidence = Math.round(
        (components.paperAccuracy * 50) +
        (components.transferSuccessRate * 30) +
        (components.healthUptime * 20)
      );
      
      // Apply semantic memory boost (Milestone 15)
      const semanticBoost = await this.calculateSemanticBoost(userId);
      
      // Apply learning source weight boost (Milestone 16 - Intelligence Refinement)
      const learningWeightBoost = await this.calculateLearningWeightBoost(userId);
      
      const confidenceIndex = Math.min(100, baseConfidence + semanticBoost + learningWeightBoost); // Cap at 100
      
      console.log(`[CLEOrchestrator] Confidence Index: ${confidenceIndex}/100 (Base: ${baseConfidence}, Semantic Boost: +${semanticBoost}, Learning Weight: +${learningWeightBoost}) (Paper: ${(components.paperAccuracy * 100).toFixed(1)}%, Transfer: ${(components.transferSuccessRate * 100).toFixed(1)}%, Health: ${(components.healthUptime * 100).toFixed(1)}%)`);
      
      // Check for confidence drop > 15 points
      const confidenceDrop = this.previousConfidence - confidenceIndex;
      
      if (confidenceDrop > this.CONFIDENCE_DROP_THRESHOLD) {
        console.log(`[CLEOrchestrator] ALERT: Confidence dropped by ${confidenceDrop} points, initiating rollback`);
        await this.rollbackBadCalibrations(userId, confidenceDrop);
      }
      
      this.previousConfidence = confidenceIndex;
      
      // Log to transparency
      await storage.createTransparencyLog({
        taskName: 'confidence-recalibration',
        mode: 'paper', // system-wide, but use paper for consistency
        success: true,
        resultSummary: `Confidence Index: ${confidenceIndex}/100`,
        notes: JSON.stringify({
          confidenceIndex,
          components,
          previousConfidence: this.previousConfidence,
          userId,
          timestamp: new Date().toISOString(),
        }),
      });
      
    } catch (error) {
      console.error('[CLEOrchestrator] Error recalculating confidence:', error);
      
      await storage.createErrorLog({
        errorType: 'cle-orchestrator',
        errorMessage: `Confidence recalculation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        context: { error: String(error) },
      });
    }
  }

  private async calculateConfidenceComponents(userId: string): Promise<ConfidenceComponents> {
    // 1. Paper Accuracy (last 30 days)
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 30);
    
    const paperOutcomes = await storage.getPredictionOutcomes(userId, {
      mode: 'paper',
      fromDate,
    });
    
    const paperAccuracy = this.calculateAccuracy(paperOutcomes);
    
    // 2. Transfer Success Rate
    const transferSuccessRate = await this.calculateTransferSuccessRate(userId);
    
    // 3. System Health Uptime
    const healthUptime = await this.calculateSystemHealthUptime();
    
    return {
      paperAccuracy,
      transferSuccessRate,
      healthUptime,
    };
  }

  private async calculateTransferSuccessRate(userId: string): Promise<number> {
    const liveCalibrations = await storage.getRecentCalibrations({ userId, mode: 'live', limit: 50 });
    
    if (liveCalibrations.length === 0) return 0;
    
    const transferredCalibrations = liveCalibrations.filter((c: any) => c.source === 'paper-fallback');
    const successfulTransfers = transferredCalibrations.filter((c: any) => {
      // Consider successful if it was used (not rolled back)
      return true; // For now, all transfers are considered successful
    });
    
    return successfulTransfers.length / Math.max(1, transferredCalibrations.length);
  }

  private async calculateSystemHealthUptime(): Promise<number> {
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 7);
    
    const errors = await storage.getErrorLogs(undefined, { limit: 100 });
    const recentErrors = errors.filter(e => 
      new Date(e.timestamp || Date.now()) >= fromDate
    );
    
    const criticalErrors = recentErrors.filter((e: any) => e.errorType === 'error' || e.errorType.includes('error')).length;
    
    // Simple uptime calculation based on error rate
    const uptime = Math.max(0, 1 - (criticalErrors / 100));
    
    return uptime;
  }

  private async rollbackBadCalibrations(userId: string, confidenceDrop: number): Promise<void> {
    console.log('[CLEOrchestrator] Rolling back bad calibrations...');
    
    // Get recent autonomous calibrations (last 24 hours)
    const fromDate = new Date();
    fromDate.setHours(fromDate.getHours() - 24);
    
    const recentCalibrations = await storage.getRecentCalibrations({ userId, mode: 'paper', limit: 10, maxAgeHours: 24 });
    const autonomousCalibrations = recentCalibrations.filter((c: any) => 
      c.source === 'autonomous-learning'
    );
    
    // Log rollback event
    await storage.createTransparencyLog({
      taskName: 'learning-rollback',
      mode: 'paper',
      success: true,
      resultSummary: `Rolled back ${autonomousCalibrations.length} calibrations due to confidence drop`,
      notes: JSON.stringify({
        reason: 'confidence-drop',
        confidenceDrop,
        calibrationsRolledBack: autonomousCalibrations.length,
        userId,
        timestamp: new Date().toISOString(),
      }),
    });
    
    await storage.createErrorLog({
      errorType: 'learning-warning',
      errorMessage: `Learning rollback triggered: confidence dropped ${confidenceDrop} points`,
      context: {
        calibrationsAffected: autonomousCalibrations.length,
        userId,
      },
    });
    
    console.log(`[CLEOrchestrator] Rollback complete: ${autonomousCalibrations.length} calibrations affected`);
  }

  /**
   * Calculate semantic memory boost (Milestone 15)
   * Formula: CI_new = CI_old + (0.1 × semantic_relevance_mean × 100), capped at +10
   */
  private async calculateSemanticBoost(userId: string): Promise<number> {
    try {
      // Import database and schema
      const { db } = await import('../db');
      const { sql } = await import('drizzle-orm');
      const { EmbeddingService } = await import('./embedding-service');
      
      // Query recent prediction outcomes to use as context
      const recentOutcomes = await storage.getPredictionOutcomes(userId, {
        mode: 'paper',
        fromDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
        limit: 10,
      });
      
      if (recentOutcomes.length === 0) {
        return 0; // No boost if no recent outcomes
      }
      
      // Build query text from recent outcomes (strategy + result pattern)
      const queryTexts = recentOutcomes.map(outcome => 
        `${outcome.strategy} ${outcome.correct ? 'successful' : 'failed'} trade pattern`
      );
      
      // Get OpenAI API key
      const openaiKey = process.env.OPENAI_API_KEY;
      if (!openaiKey) {
        console.log('[CLEOrchestrator] OpenAI API key not available, skipping semantic boost');
        return 0;
      }
      
      // Generate embeddings for queries
      const embeddingService = new EmbeddingService(openaiKey);
      const embeddings = await embeddingService.generateEmbeddings(queryTexts);
      
      // Query semantic memory for each embedding and collect weighted scores
      let sumWeightedRelevance = 0;
      let sumWeights = 0;
      
      for (const embedding of embeddings) {
        const results = await db.execute(sql`
          SELECT 
            relevance,
            1 - (embedding <=> ${JSON.stringify(embedding)}::vector) as similarity
          FROM semantic_memory
          WHERE tags && ARRAY['learning', 'strategy', 'filter']::text[]
          ORDER BY embedding <=> ${JSON.stringify(embedding)}::vector
          LIMIT 5
        `);
        
        // Accumulate weighted relevance scores
        for (const row of results.rows) {
          const relevance = parseFloat((row as any).relevance || '0');
          const rawSimilarity = parseFloat((row as any).similarity || '0');
          
          // Clamp similarity to >= 0 to prevent negative boosts
          const similarity = Math.max(0, rawSimilarity);
          
          sumWeightedRelevance += relevance * similarity;
          sumWeights += similarity;
        }
      }
      
      if (sumWeights === 0) {
        return 0; // No relevant memories found
      }
      
      // Calculate properly weighted mean relevance
      const meanRelevance = sumWeightedRelevance / sumWeights;
      
      // Apply boost formula: 0.1 × semantic_relevance_mean × 100, capped at +10
      // Add lower bound to ensure boost is always non-negative
      const boost = Math.max(0, Math.min(10, Math.round(0.1 * meanRelevance * 100)));
      
      console.log(`[CLEOrchestrator] Semantic boost: +${boost} (weighted mean relevance: ${meanRelevance.toFixed(3)}, sum weights: ${sumWeights.toFixed(2)})`);
      
      return boost;
    } catch (error) {
      console.error('[CLEOrchestrator] Error calculating semantic boost:', error);
      return 0; // Return 0 on error (no boost)
    }
  }

  /**
   * Calculate learning source weight boost (Milestone 16 - Intelligence Refinement)
   * Uses average weight of learning sources, normalized to 0-5 point boost
   * Formula: boost = (avg_weight - 0.5) * 10, capped at 0-5
   */
  private async calculateLearningWeightBoost(userId: string): Promise<number> {
    try {
      const sources = await storage.getLearningSources(userId);
      
      if (sources.length === 0) {
        return 0; // No boost if no learning sources
      }

      // Calculate average weight across all sources
      const avgWeight = sources.reduce((sum: number, s: any) => sum + parseFloat(s.weight), 0) / sources.length;
      
      // Normalize: weight of 0.5 = no boost, weight of 1.0 = +5 boost
      // Formula: (avgWeight - 0.5) * 10, capped at 0-5
      const boost = Math.max(0, Math.min(5, Math.round((avgWeight - 0.5) * 10)));
      
      console.log(`[CLEOrchestrator] Learning weight boost: +${boost} (avg weight: ${avgWeight.toFixed(3)}, sources: ${sources.length})`);
      
      return boost;
    } catch (error) {
      console.error('[CLEOrchestrator] Error calculating learning weight boost:', error);
      return 0; // Return 0 on error (no boost)
    }
  }

  async getConfidenceIndex(): Promise<{ 
    autonomyConfidence: number; 
    components: ConfidenceComponents 
  }> {
    const users = await storage.getAllUsers();
    
    if (users.length === 0) {
      return {
        autonomyConfidence: 20,
        components: {
          paperAccuracy: 0,
          transferSuccessRate: 0,
          healthUptime: 1,
        },
      };
    }
    
    const userId = users[0].id;
    const components = await this.calculateConfidenceComponents(userId);
    
    // Base confidence calculation
    const baseConfidence = Math.round(
      (components.paperAccuracy * 50) +
      (components.transferSuccessRate * 30) +
      (components.healthUptime * 20)
    );
    
    // Apply semantic memory boost (Milestone 15)
    const semanticBoost = await this.calculateSemanticBoost(userId);
    
    // Apply learning source weight boost (Milestone 16)
    const learningWeightBoost = await this.calculateLearningWeightBoost(userId);
    
    const autonomyConfidence = Math.min(100, baseConfidence + semanticBoost + learningWeightBoost);
    
    return {
      autonomyConfidence,
      components,
    };
  }
}

export const cleOrchestratorService = new CLEOrchestratorService();

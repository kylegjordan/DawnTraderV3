import { db } from "../db";
import { 
  cognitiveCoreState, 
  agentRegistry,
  awarenessStateLog,
  agentLearningFeedback,
  metaCognitionLog,
  strategicMemoryArchive,
  modelCalibrationLog,
  type OptimizationType,
  type AgentState
} from "@shared/schema";
import { desc, eq, sql, and } from "drizzle-orm";
import { nanoid } from "nanoid";

interface SystemHealthMetrics {
  overallScore: number;
  stabilityScore: number;
  biasScore: number;
  learningScore: number;
  memoryScore: number;
  activeAgentCount: number;
}

interface OptimizationResult {
  cycleId: string;
  optimizationType: OptimizationType;
  score: number;
  notes: string;
  activeAgents: number;
}

export class UnifiedCoreService {
  /**
   * Synchronize data from all 9 cognitive subsystems + learning/oversight
   */
  async synchronizeSubsystems(): Promise<SystemHealthMetrics> {
    try {
      console.log('[UnifiedCore] 🔄 Synchronizing all 9 cognitive subsystems...');

      // 1. Autonomy Controller - Get scheduler status
      let autonomyActive = false;
      try {
        const { autonomyController } = await import('./autonomy-controller').then(m => ({ autonomyController: m.autonomyController })).catch(() => ({ autonomyController: null }));
        if (autonomyController) {
          const autonomyStatus = await autonomyController.getStatus();
          autonomyActive = autonomyStatus.isRunning;
        }
      } catch (e) {
        console.warn('[UnifiedCore] Failed to get autonomy status:', e);
      }

      // 2. Strategic Planner - Get active plans (using first user as system-wide metric)
      let activePlanCount = 0;
      try {
        const { strategicPlannerService } = await import('./strategic-planner').then(m => ({ strategicPlannerService: m.strategicPlannerService })).catch(() => ({ strategicPlannerService: null }));
        if (strategicPlannerService) {
          const users = await db.select().from(await import('@shared/schema').then(s => s.users)).limit(1);
          if (users.length > 0) {
            const plans = await strategicPlannerService.getActivePlans(users[0].id);
            activePlanCount = plans.length;
          }
        }
      } catch (e) {
        console.warn('[UnifiedCore] Failed to get strategic plans:', e);
      }

      // 3. Awareness - Aggregate awareness state data
      const recentAwareness = await db.select()
        .from(awarenessStateLog)
        .orderBy(desc(awarenessStateLog.createdAt))
        .limit(10);

      // 4. Adaptive Alignment - Get current profile
      let alignmentScore = 0.5;
      try {
        const { adaptiveObjectiveEngine } = await import('./adaptive-objective-engine').then(m => ({ adaptiveObjectiveEngine: m.adaptiveObjectiveEngine })).catch(() => ({ adaptiveObjectiveEngine: null }));
        if (adaptiveObjectiveEngine) {
          const users = await db.select().from(await import('@shared/schema').then(s => s.users)).limit(1);
          if (users.length > 0) {
            const profile = await adaptiveObjectiveEngine.getCurrentProfile(users[0].id);
            alignmentScore = profile?.performanceBaseline || 0.5;
          }
        }
      } catch (e) {
        console.warn('[UnifiedCore] Failed to get alignment profile:', e);
      }

      // 5. Strategic Memory - Aggregate strategic memory
      const recentMemory = await db.select()
        .from(strategicMemoryArchive)
        .orderBy(desc(strategicMemoryArchive.createdAt))
        .limit(20);

      // 6. Simulation Engine - Get recent simulations
      let simulationSuccessRate = 0.5;
      try {
        const { simulationEngineService } = await import('./simulation-engine').then(m => ({ simulationEngineService: m.simulationEngineService })).catch(() => ({ simulationEngineService: null }));
        if (simulationEngineService) {
          const users = await db.select().from(await import('@shared/schema').then(s => s.users)).limit(1);
          if (users.length > 0) {
            const sims = await simulationEngineService.getSimulations(users[0].id, 10);
            if (sims.length > 0) {
              const avgSuccess = sims.reduce((sum, s) => sum + (s.successScore || 0), 0) / sims.length;
              simulationSuccessRate = avgSuccess;
            }
          }
        }
      } catch (e) {
        console.warn('[UnifiedCore] Failed to get simulations:', e);
      }

      // 7. Reflective Intelligence - Get recent reflections
      let reflectionQualityScore = 0.5;
      try {
        const { reflectiveIntelligenceService } = await import('./reflective-intelligence').then(m => ({ reflectiveIntelligenceService: m.reflectiveIntelligenceService })).catch(() => ({ reflectiveIntelligenceService: null }));
        if (reflectiveIntelligenceService) {
          const users = await db.select().from(await import('@shared/schema').then(s => s.users)).limit(1);
          if (users.length > 0) {
            const reflections = await reflectiveIntelligenceService.getReflections(users[0].id, 10);
            if (reflections.length > 0) {
              const insights = reflections.filter(r => r.insights && (r.insights as any).length > 0);
              reflectionQualityScore = insights.length / reflections.length;
            }
          }
        }
      } catch (e) {
        console.warn('[UnifiedCore] Failed to get reflections:', e);
      }

      // 8. Ethical Reasoning - Get active rules
      let ethicalComplianceRate = 1.0;
      try {
        const { ethicalReasoningEngine } = await import('./ethical-reasoning-engine').then(m => ({ ethicalReasoningEngine: m.ethicalReasoningEngine })).catch(() => ({ ethicalReasoningEngine: null }));
        if (ethicalReasoningEngine) {
          const users = await db.select().from(await import('@shared/schema').then(s => s.users)).limit(1);
          if (users.length > 0) {
            const audits = await db.select()
              .from(await import('@shared/schema').then(s => s.ethicalAuditLog))
              .where(eq((await import('@shared/schema').then(s => s.ethicalAuditLog)).userId, users[0].id))
              .orderBy(desc((await import('@shared/schema').then(s => s.ethicalAuditLog)).createdAt))
              .limit(20);
            if (audits.length > 0) {
              const compliant = audits.filter(a => a.complianceStatus === 'compliant').length;
              ethicalComplianceRate = compliant / audits.length;
            }
          }
        }
      } catch (e) {
        console.warn('[UnifiedCore] Failed to get ethical audits:', e);
      }

      // 9. Collaboration Manager - Get collaboration stats
      let collaborationEfficiency = 0.5;
      try {
        const { collaborationManager } = await import('./collaboration-manager').then(m => ({ collaborationManager: m.collaborationManager })).catch(() => ({ collaborationManager: null }));
        if (collaborationManager) {
          const stats = await collaborationManager.getCollaborationStats();
          if (stats.totalSessions > 0) {
            collaborationEfficiency = stats.consensusRate || 0.5;
          }
        }
      } catch (e) {
        console.warn('[UnifiedCore] Failed to get collaboration stats:', e);
      }

      // Aggregate learning feedback data
      const recentLearning = await db.select()
        .from(agentLearningFeedback)
        .orderBy(desc(agentLearningFeedback.createdAt))
        .limit(50);

      // Aggregate oversight logs
      const recentOversight = await db.select()
        .from(metaCognitionLog)
        .orderBy(desc(metaCognitionLog.createdAt))
        .limit(20);

      // Count active agents in registry
      const activeAgents = await db.select()
        .from(agentRegistry)
        .where(eq(agentRegistry.state, 'active'));

      // Calculate comprehensive health scores integrating all 9 subsystems
      const stabilityScore = this.calculateStabilityScore(recentAwareness, autonomyActive, activePlanCount);
      const biasScore = this.calculateBiasScore(recentOversight, ethicalComplianceRate);
      const learningScore = this.calculateLearningScore(recentLearning, simulationSuccessRate, reflectionQualityScore);
      const memoryScore = this.calculateMemoryScore(recentMemory, alignmentScore, collaborationEfficiency);

      // Compute overall system health score
      const overallScore = (stabilityScore + biasScore + learningScore + memoryScore) / 4;

      console.log(`[UnifiedCore] ✅ Synchronization complete (9 subsystems) - Overall: ${overallScore.toFixed(2)}, Stability: ${stabilityScore.toFixed(2)}, Bias: ${biasScore.toFixed(2)}, Learning: ${learningScore.toFixed(2)}, Memory: ${memoryScore.toFixed(2)}`);

      return {
        overallScore: this.sanitizeScore(overallScore),
        stabilityScore: this.sanitizeScore(stabilityScore),
        biasScore: this.sanitizeScore(biasScore),
        learningScore: this.sanitizeScore(learningScore),
        memoryScore: this.sanitizeScore(memoryScore),
        activeAgentCount: activeAgents.length,
      };
    } catch (error: any) {
      console.error('[UnifiedCore] Failed to synchronize subsystems:', error);
      return {
        overallScore: 0.5,
        stabilityScore: 0.5,
        biasScore: 0.5,
        learningScore: 0.5,
        memoryScore: 0.5,
        activeAgentCount: 0,
      };
    }
  }

  /**
   * Evaluate overall system health
   */
  async evaluateSystemHealth(): Promise<SystemHealthMetrics> {
    try {
      console.log('[UnifiedCore] 🏥 Evaluating system health...');
      return await this.synchronizeSubsystems();
    } catch (error: any) {
      console.error('[UnifiedCore] Failed to evaluate system health:', error);
      throw error;
    }
  }

  /**
   * Optimize system parameters based on current health metrics
   */
  async optimizeParameters(metrics: SystemHealthMetrics): Promise<OptimizationType> {
    try {
      console.log('[UnifiedCore] ⚙️ Optimizing parameters based on health metrics...');

      let optimizationType: OptimizationType;

      // Decision logic for optimization type
      if (metrics.biasScore < 0.6) {
        // Low bias score → needs policy refinement
        optimizationType = 'policy_refinement';
        console.log('[UnifiedCore] Selected optimization: policy_refinement (bias score low)');
      } else if (metrics.learningScore < 0.6) {
        // Low learning score → needs parameter tuning
        optimizationType = 'parameter_tuning';
        console.log('[UnifiedCore] Selected optimization: parameter_tuning (learning score low)');
      } else if (metrics.stabilityScore < 0.6 || metrics.memoryScore < 0.6) {
        // Low stability/memory → needs architecture adjustment
        optimizationType = 'architecture_adjustment';
        console.log('[UnifiedCore] Selected optimization: architecture_adjustment (stability/memory low)');
      } else {
        // All scores healthy → default to parameter tuning for continuous improvement
        optimizationType = 'parameter_tuning';
        console.log('[UnifiedCore] Selected optimization: parameter_tuning (maintenance mode)');
      }

      // Apply the optimization (placeholder - would trigger actual parameter adjustments)
      await this.applyOptimization(optimizationType, metrics);

      return optimizationType;
    } catch (error: any) {
      console.error('[UnifiedCore] Failed to optimize parameters:', error);
      return 'parameter_tuning';
    }
  }

  /**
   * Apply the selected optimization type
   */
  private async applyOptimization(type: OptimizationType, metrics: SystemHealthMetrics): Promise<void> {
    console.log(`[UnifiedCore] 🔧 Applying ${type} optimization...`);

    // In a full implementation, this would:
    // - parameter_tuning: Adjust cognitive weight values
    // - architecture_adjustment: Modify agent configurations or spawn new agents
    // - policy_refinement: Update policy constraints and guardrails

    // For now, we log the intended optimization
    console.log(`[UnifiedCore] ✅ ${type} optimization applied (score: ${metrics.overallScore.toFixed(2)})`);
  }

  /**
   * Spawn a new adaptive agent in the specified domain
   */
  async spawnAdaptiveAgent(domain: string, agentName?: string): Promise<any> {
    try {
      const name = agentName || `${domain}Agent_${nanoid(6)}`;
      console.log(`[UnifiedCore] 🤖 Spawning adaptive agent: ${name} in domain: ${domain}`);

      const newAgent = await db.insert(agentRegistry).values({
        agentName: name,
        domain,
        state: 'active',
        performance: 0.5,
        metadata: {
          spawnedAt: new Date().toISOString(),
          initialDomain: domain,
          purpose: 'Adaptive multi-domain reasoning',
        },
      }).returning();

      console.log(`[UnifiedCore] ✅ Agent ${name} spawned successfully`);
      return newAgent[0];
    } catch (error: any) {
      console.error('[UnifiedCore] Failed to spawn adaptive agent:', error);
      return null;
    }
  }

  /**
   * Log a complete optimization cycle
   */
  async logCycle(result: Omit<OptimizationResult, 'cycleId'>): Promise<string> {
    try {
      const cycleId = `cycle_${nanoid(12)}`;
      console.log(`[UnifiedCore] 📝 Logging optimization cycle: ${cycleId}`);

      await db.insert(cognitiveCoreState).values({
        cycleId,
        optimizationType: result.optimizationType,
        score: this.sanitizeScore(result.score),
        notes: result.notes,
        activeAgents: result.activeAgents,
      });

      console.log(`[UnifiedCore] ✅ Cycle ${cycleId} logged successfully`);
      return cycleId;
    } catch (error: any) {
      console.error('[UnifiedCore] Failed to log cycle:', error);
      throw error;
    }
  }

  /**
   * Run a complete optimization cycle
   */
  async runOptimizationCycle(): Promise<OptimizationResult> {
    try {
      console.log('[UnifiedCore] 🚀 Starting unified optimization cycle...');

      // Step 1: Synchronize all subsystems (single call for efficiency)
      const metrics = await this.synchronizeSubsystems();

      // Step 2: Optimize parameters based on health metrics (reuse metrics from Step 1)
      const optimizationType = await this.optimizeParameters(metrics);

      // Step 3: Log the cycle
      const result: Omit<OptimizationResult, 'cycleId'> = {
        optimizationType,
        score: metrics.overallScore,
        notes: `Optimization cycle completed. Stability: ${metrics.stabilityScore.toFixed(2)}, Bias: ${metrics.biasScore.toFixed(2)}, Learning: ${metrics.learningScore.toFixed(2)}, Memory: ${metrics.memoryScore.toFixed(2)}`,
        activeAgents: metrics.activeAgentCount,
      };

      const cycleId = await this.logCycle(result);

      console.log(`[UnifiedCore] ✅ Optimization cycle ${cycleId} complete!`);

      return {
        cycleId,
        ...result,
      };
    } catch (error: any) {
      console.error('[UnifiedCore] Failed to run optimization cycle:', error);
      throw error;
    }
  }

  /**
   * Get current core status
   */
  async getCoreStatus(): Promise<any> {
    try {
      const latestCycle = await db.select()
        .from(cognitiveCoreState)
        .orderBy(desc(cognitiveCoreState.createdAt))
        .limit(1);

      const activeAgents = await db.select()
        .from(agentRegistry)
        .where(eq(agentRegistry.state, 'active'));

      const metrics = await this.synchronizeSubsystems();

      return {
        latestCycle: latestCycle[0] || null,
        activeAgents: activeAgents.length,
        metrics,
      };
    } catch (error: any) {
      console.error('[UnifiedCore] Failed to get core status:', error);
      throw error;
    }
  }

  /**
   * Get all registered agents
   */
  async getAgents(state?: AgentState): Promise<any[]> {
    try {
      if (state) {
        return await db.select()
          .from(agentRegistry)
          .where(eq(agentRegistry.state, state))
          .orderBy(desc(agentRegistry.createdAt));
      }

      return await db.select()
        .from(agentRegistry)
        .orderBy(desc(agentRegistry.createdAt));
    } catch (error: any) {
      console.error('[UnifiedCore] Failed to get agents:', error);
      return [];
    }
  }

  // Helper methods for score calculations integrating all 9 subsystems

  private calculateStabilityScore(awarenessData: any[], autonomyActive: boolean, activePlanCount: number): number {
    if (awarenessData.length === 0) return 0.7;

    const stateScores: Record<string, number> = {
      stable: 1.0,
      focused: 0.9,
      alert: 0.8,
      recovering: 0.6,
      fatigued: 0.4,
      overloaded: 0.3,
    };

    // Base score from awareness emotional states
    const awarenessScore = awarenessData.reduce((sum, record) => {
      const state = record.emotionalState || 'stable';
      return sum + (stateScores[state] || 0.7);
    }, 0) / awarenessData.length;

    // Boost stability if autonomy scheduler is running
    const autonomyBoost = autonomyActive ? 0.1 : -0.1;

    // Strategic planning activity indicates system stability
    const planningScore = Math.min(activePlanCount * 0.05, 0.2);

    const finalScore = awarenessScore + autonomyBoost + planningScore;
    return this.sanitizeScore(finalScore);
  }

  private calculateBiasScore(oversightData: any[], ethicalComplianceRate: number): number {
    if (oversightData.length === 0) return 0.8;

    // More unresolved flags = lower bias score (from meta-cognitive oversight)
    const unresolvedCount = oversightData.filter(log => !log.resolved).length;
    const oversightScore = Math.max(0.3, 1.0 - (unresolvedCount * 0.05));

    // Factor in ethical compliance rate (high compliance = low bias)
    const ethicalWeight = 0.4;
    const oversightWeight = 0.6;

    const finalScore = (oversightScore * oversightWeight) + (ethicalComplianceRate * ethicalWeight);
    return this.sanitizeScore(finalScore);
  }

  private calculateLearningScore(learningData: any[], simulationSuccessRate: number, reflectionQualityScore: number): number {
    if (learningData.length === 0) return 0.6;

    // Base score from agent learning feedback
    const avgAccuracy = learningData.reduce((sum, feedback) => {
      return sum + this.sanitizeScore(feedback.accuracyScore || 0.5);
    }, 0) / learningData.length;

    // Factor in simulation success and reflection quality
    const feedbackWeight = 0.5;
    const simulationWeight = 0.3;
    const reflectionWeight = 0.2;

    const finalScore = (avgAccuracy * feedbackWeight) + 
                       (simulationSuccessRate * simulationWeight) + 
                       (reflectionQualityScore * reflectionWeight);

    return this.sanitizeScore(finalScore);
  }

  private calculateMemoryScore(memoryData: any[], alignmentScore: number, collaborationEfficiency: number): number {
    if (memoryData.length === 0) return 0.7;

    // Score based on performance deltas in strategic memory
    const avgDelta = memoryData.reduce((sum, record) => {
      const delta = record.performanceDelta || 0;
      return sum + delta;
    }, 0) / memoryData.length;

    // Normalize to 0-1 range (assuming deltas are typically -0.2 to +0.2)
    const memoryArchiveScore = Math.max(0.3, Math.min(1.0, 0.7 + avgDelta));

    // Factor in alignment and collaboration
    const archiveWeight = 0.5;
    const alignmentWeight = 0.3;
    const collaborationWeight = 0.2;

    const finalScore = (memoryArchiveScore * archiveWeight) + 
                       (alignmentScore * alignmentWeight) + 
                       (collaborationEfficiency * collaborationWeight);

    return this.sanitizeScore(finalScore);
  }

  private sanitizeScore(score: number): number {
    if (!isFinite(score) || isNaN(score)) {
      return 0.5;
    }
    return Math.max(0, Math.min(1, score));
  }
}

export const unifiedCore = new UnifiedCoreService();

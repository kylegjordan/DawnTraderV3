import { nanoid } from 'nanoid';
import { db } from '../db';
import { autonomyAuditLog, reasoningTrace } from '@shared/schema';
import { reasoningOrchestrator } from './reasoning-orchestrator';
import { cognitiveTuner } from './cognitive-tuner';
import { contextBridge } from './context-bridge';
import { systemHealthMonitor } from './system-health-monitor';
import { desc, sql } from 'drizzle-orm';

/**
 * Phase 8.9.1: Autonomy Controller
 * Governs self-triggered reasoning and periodic self-checks
 */

export interface SelfCheckResult {
  runId: string;
  timestamp: Date;
  healthScore: number;
  cognitiveScore: number;
  systemMetrics: Record<string, any>;
  issuesDetected: string[];
  actionsTriggered: string[];
}

export interface AutonomyConfig {
  enabled: boolean;
  selfCheckIntervalHours: number;
  healthThresholds: {
    critical: number;
    warning: number;
  };
}

class AutonomyControllerService {
  private config: AutonomyConfig = {
    enabled: true,
    selfCheckIntervalHours: 1,
    healthThresholds: {
      critical: 0.5,
      warning: 0.7,
    },
  };

  private lastSelfCheckTime: Date | null = null;
  private isRunning: boolean = false;

  /**
   * Schedule periodic self-check
   * Evaluates system health, cognitive performance, and triggers reasoning if needed
   */
  async scheduleSelfCheck(userId: string): Promise<SelfCheckResult> {
    if (this.isRunning) {
      console.log('[AutonomyController] Self-check already in progress, skipping');
      throw new Error('Self-check already in progress');
    }

    this.isRunning = true;
    const runId = `autonomy_${nanoid(12)}`;
    const startTime = performance.now();

    console.log(`[AutonomyController] 🤖 Initiating self-check (runId: ${runId})`);

    try {
      // 1. Assess system health
      const healthMetrics = systemHealthMonitor.getMetrics();
      const healthScore = this.calculateHealthScore(healthMetrics);

      // 2. Evaluate cognitive performance
      const cognitiveStatus = await cognitiveTuner.getStatus();
      const cognitiveScore = cognitiveStatus.accuracyScore;

      // 3. Detect issues
      const issuesDetected: string[] = [];
      const actionsTriggered: string[] = [];

      if (healthScore < this.config.healthThresholds.critical) {
        issuesDetected.push(`Critical health score: ${healthScore.toFixed(2)}`);
        actionsTriggered.push('trigger_health_investigation');
      }

      if (cognitiveScore < this.config.healthThresholds.warning) {
        issuesDetected.push(`Low cognitive accuracy: ${cognitiveScore.toFixed(2)}`);
        actionsTriggered.push('trigger_cognitive_tuning');
      }

      // 4. Build assessment result
      const assessmentResult = {
        healthScore,
        cognitiveScore,
        systemMetrics: {
          system: healthMetrics.system,
          cache: healthMetrics.cache,
          latency: healthMetrics.latency,
        },
        issuesDetected,
        timestamp: new Date(),
      };

      // 5. Record assessment in database
      await this.recordAssessment({
        runId,
        actionType: 'self_check',
        triggerSource: 'scheduled',
        assessmentResult,
        actionsTriggered,
        success: true,
        executionTimeMs: Math.round(performance.now() - startTime),
        metadata: { userId },
      });

      // 6. Trigger follow-up actions if needed
      if (actionsTriggered.length > 0) {
        console.log(`[AutonomyController] ⚠️ Issues detected, triggering actions: ${actionsTriggered.join(', ')}`);
        await this.executeTriggeredActions(actionsTriggered, userId, runId);
      }

      // 7. Broadcast via Context Bridge
      await contextBridge.broadcast({
        type: 'state_update',
        userId,
        payload: {
          runId,
          actionType: 'self_check',
          assessmentResult,
          actionsTriggered,
          eventSubtype: 'autonomy_self_check',
        },
      });

      this.lastSelfCheckTime = new Date();

      console.log(`[AutonomyController] ✅ Self-check complete (Health: ${healthScore.toFixed(2)}, Cognitive: ${cognitiveScore.toFixed(2)})`);

      return {
        runId,
        timestamp: new Date(),
        healthScore,
        cognitiveScore,
        systemMetrics: assessmentResult.systemMetrics,
        issuesDetected,
        actionsTriggered,
      };
    } catch (error) {
      const executionTimeMs = Math.round(performance.now() - startTime);
      
      // Record failed assessment
      await this.recordAssessment({
        runId,
        actionType: 'self_check',
        triggerSource: 'scheduled',
        assessmentResult: { error: error instanceof Error ? error.message : String(error) },
        actionsTriggered: [],
        success: false,
        executionTimeMs,
        metadata: { userId, error: String(error) },
      });

      console.error(`[AutonomyController] ❌ Self-check failed:`, error);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Trigger self-initiated reasoning
   * Queues autonomous reasoning tasks without user input
   */
  async triggerSelfReasoning(
    intent: string,
    userId: string,
    context?: Record<string, any>
  ): Promise<{ traceId: string; success: boolean }> {
    const runId = `self_reason_${nanoid(12)}`;
    const startTime = performance.now();

    console.log(`[AutonomyController] 🧠 Triggering self-reasoning: "${intent}"`);

    try {
      // Create reasoning plan via orchestrator
      const plan = await reasoningOrchestrator.createPlan({
        userId,
        intentAction: 'self_reasoning',
        userMessage: intent,
        systemState: {
          ...context,
          autonomouslyTriggered: true,
          runId,
        },
      });

      const executionTimeMs = Math.round(performance.now() - startTime);

      // Record self-reasoning action
      await this.recordAssessment({
        runId,
        actionType: 'self_reasoning',
        triggerSource: 'autonomous',
        traceId: plan.traceId,
        assessmentResult: { intent, planSteps: plan.steps.length },
        actionsTriggered: ['create_reasoning_plan'],
        success: true,
        executionTimeMs,
        metadata: { userId, intent, context },
      });

      // Broadcast via Context Bridge
      await contextBridge.broadcast({
        type: 'state_update',
        userId,
        payload: {
          runId,
          traceId: plan.traceId,
          intent,
          stepsCount: plan.steps.length,
          eventSubtype: 'autonomy_self_reasoning',
        },
      });

      console.log(`[AutonomyController] ✅ Self-reasoning triggered (traceId: ${plan.traceId})`);

      return { traceId: plan.traceId, success: true };
    } catch (error) {
      const executionTimeMs = Math.round(performance.now() - startTime);

      await this.recordAssessment({
        runId,
        actionType: 'self_reasoning',
        triggerSource: 'autonomous',
        assessmentResult: { error: error instanceof Error ? error.message : String(error) },
        actionsTriggered: [],
        success: false,
        executionTimeMs,
        metadata: { userId, intent, error: String(error) },
      });

      console.error(`[AutonomyController] ❌ Self-reasoning failed:`, error);
      throw error;
    }
  }

  /**
   * Record autonomy assessment in audit log
   */
  async recordAssessment(data: {
    runId: string;
    actionType: 'self_check' | 'self_reasoning' | 'exploration' | 'optimization';
    triggerSource: string;
    traceId?: string;
    assessmentResult: Record<string, any>;
    actionsTriggered: string[];
    success: boolean;
    executionTimeMs: number;
    metadata?: Record<string, any>;
  }): Promise<void> {
    await db.insert(autonomyAuditLog).values({
      runId: data.runId,
      actionType: data.actionType,
      triggerSource: data.triggerSource,
      traceId: data.traceId || null,
      assessmentResult: data.assessmentResult as any,
      actionsTriggered: data.actionsTriggered,
      success: data.success,
      executionTimeMs: data.executionTimeMs,
      metadata: data.metadata as any,
    });
  }

  /**
   * Execute triggered actions based on assessment
   */
  private async executeTriggeredActions(
    actions: string[],
    userId: string,
    parentRunId: string
  ): Promise<void> {
    for (const action of actions) {
      try {
        switch (action) {
          case 'trigger_health_investigation':
            await this.triggerSelfReasoning(
              'Investigate system health degradation and recommend fixes',
              userId,
              { parentRunId, actionType: 'health_investigation' }
            );
            // Phase 8.9.1: Also trigger trading-domain analysis for market/portfolio health
            await this.triggerTradingDomainAnalysis(userId, parentRunId, 'paper');
            break;

          case 'trigger_cognitive_tuning':
            console.log('[AutonomyController] Scheduling cognitive benchmark run');
            // Queue for later execution to avoid blocking
            setTimeout(() => cognitiveTuner.runFullBenchmark(userId).catch(console.error), 5000);
            break;

          default:
            console.warn(`[AutonomyController] Unknown action: ${action}`);
        }
      } catch (error) {
        console.error(`[AutonomyController] Failed to execute action ${action}:`, error);
      }
    }
  }

  /**
   * Phase 8.9.1: Trigger trading-domain analysis via TradingBob
   * Analyzes market conditions, portfolio health, and risk coherence
   */
  private async triggerTradingDomainAnalysis(
    userId: string,
    parentRunId: string,
    mode: 'live' | 'paper'
  ): Promise<void> {
    const runId = `trading_analysis_${nanoid(10)}`;
    const startTime = performance.now();

    try {
      console.log(`[AutonomyController] 📊 Triggering trading-domain analysis (mode: ${mode})`);

      const { tradingBob } = await import('./bobs/trading-bob');
      
      // Run comprehensive trading analysis
      const analysis = await tradingBob.analyzeMarketData(userId, mode, 'autonomous system health check');
      const riskCoherence = await tradingBob.evaluateRiskCoherence(userId, mode);
      const insights = await tradingBob.generateTradingInsights(userId, mode);

      const executionTimeMs = Math.round(performance.now() - startTime);

      // Record trading analysis in autonomy audit log
      await this.recordAssessment({
        runId,
        actionType: 'exploration',
        triggerSource: 'autonomous',
        assessmentResult: {
          domain: 'trading',
          marketSentiment: analysis.sentiment,
          riskLevel: analysis.riskLevel,
          confidence: analysis.confidence,
          findings: analysis.findings,
          recommendations: analysis.recommendations,
          insights: analysis.insights,
          riskCoherence: {
            aligned: riskCoherence.aligned,
            score: riskCoherence.score,
            issues: riskCoherence.issues,
          },
          tradingInsights: insights,
        },
        actionsTriggered: ['trading_domain_analysis'],
        success: true,
        executionTimeMs,
        metadata: { 
          userId, 
          mode, 
          parentRunId,
          healthAdjustment: riskCoherence.aligned ? '+0.12' : '-0.05',
        },
      });

      // Emit UX Monitor event
      await contextBridge.broadcast({
        type: 'state_update',
        userId,
        payload: {
          runId,
          eventSubtype: 'autonomy_trading_analysis_complete',
          domain: 'trading',
          sentiment: analysis.sentiment,
          riskLevel: analysis.riskLevel,
          riskAligned: riskCoherence.aligned,
          riskScore: riskCoherence.score,
        },
      });

      console.log(`[AutonomyController] ✅ Trading analysis complete - Sentiment: ${analysis.sentiment}, Risk: ${analysis.riskLevel}`);
    } catch (error) {
      const executionTimeMs = Math.round(performance.now() - startTime);
      
      await this.recordAssessment({
        runId,
        actionType: 'exploration',
        triggerSource: 'autonomous',
        assessmentResult: { 
          error: error instanceof Error ? error.message : String(error),
          domain: 'trading',
        },
        actionsTriggered: [],
        success: false,
        executionTimeMs,
        metadata: { userId, mode, parentRunId, error: String(error) },
      });

      console.error(`[AutonomyController] ❌ Trading analysis failed:`, error);
    }
  }

  /**
   * Calculate overall health score from metrics
   */
  private calculateHealthScore(metrics: any): number {
    const scores: number[] = [];

    // System health (CPU, memory)
    if (metrics.system?.memoryUsage?.percentUsed !== undefined) {
      const memScore = Math.max(0, 1 - metrics.system.memoryUsage.percentUsed / 100);
      scores.push(memScore);
    }

    // Cache health
    if (metrics.cache?.hitRate !== undefined) {
      const cacheScore = metrics.cache.hitRate / 100;
      scores.push(cacheScore);
    }

    // Latency health (lower is better)
    if (metrics.latency?.cortex !== null && metrics.latency?.cortex !== undefined) {
      const latencyScore = Math.max(0, 1 - metrics.latency.cortex / 1000);
      scores.push(latencyScore);
    }

    return scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0.8;
  }

  /**
   * Get last self-check result
   */
  async getLastSelfCheck(): Promise<SelfCheckResult | null> {
    const lastRecord = await db
      .select()
      .from(autonomyAuditLog)
      .where(sql`${autonomyAuditLog.actionType} = 'self_check'`)
      .orderBy(desc(autonomyAuditLog.timestamp))
      .limit(1);

    if (lastRecord.length === 0) {
      return null;
    }

    const record = lastRecord[0];
    const result = record.assessmentResult as any;

    return {
      runId: record.runId,
      timestamp: record.timestamp,
      healthScore: result.healthScore || 0,
      cognitiveScore: result.cognitiveScore || 0,
      systemMetrics: result.systemMetrics || {},
      issuesDetected: result.issuesDetected || [],
      actionsTriggered: record.actionsTriggered || [],
    };
  }

  /**
   * Get autonomy status
   */
  getStatus() {
    return {
      enabled: this.config.enabled,
      lastSelfCheckTime: this.lastSelfCheckTime,
      isRunning: this.isRunning,
      config: this.config,
    };
  }

  /**
   * Update autonomy configuration
   */
  updateConfig(updates: Partial<AutonomyConfig>): void {
    this.config = { ...this.config, ...updates };
    console.log('[AutonomyController] Configuration updated:', this.config);
  }
}

export const autonomyController = new AutonomyControllerService();

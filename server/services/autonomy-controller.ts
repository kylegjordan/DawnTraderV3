import { nanoid } from 'nanoid';
import { db } from '../db';
import { autonomyAuditLog, reasoningTrace } from '@shared/schema';
import { reasoningOrchestrator } from './reasoning-orchestrator';
import { cognitiveTuner } from './cognitive-tuner';
import { contextBridge } from './context-bridge';
import { systemHealthMonitor } from './system-health-monitor';
import { ExperienceMemoryService } from './experience-memory';
import { AdaptiveObjectiveEngine } from './adaptive-objective-engine';
import { AlignmentVerifier } from './alignment-verifier';
import { strategicPlannerService } from './strategic-planner';
import { continuousLearningEngine } from './continuous-learning';
import { collaborationManager } from './collaboration-manager';
import { reasoningBus } from './reasoning-bus';
import { consensusEngine } from './consensus-engine';
import { learningBridge } from './learning-bridge';
import metaOversightService from './meta-oversight';
import longtermMemoryService from './longterm-memory';
import { unifiedCore } from './unified-core';
// [8.8.3-H8] SafetyGuardrails REMOVED - AutonomyController is now diagnostic-only
// import { safetyGuardrails } from './safety-guardrails';
import { guardrailPolicy } from './guardrail-policy';
import { ethicalReasoner } from './ethical-reasoner'; // Phase 13.0
import { ethicsConsensusOrchestrator } from './ethics-consensus-orchestrator'; // Phase 14.0
import { performanceMonitor } from './performance-monitor'; // Phase 12.1
import { introspectionEngine } from './introspection-engine'; // Phase 15.0
import { biasMitigation } from './bias-mitigation'; // Phase 15.0
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
  
  // Phase 9.0: Adaptive Learning Services
  private experienceMemory: ExperienceMemoryService;
  private adaptiveEngine: AdaptiveObjectiveEngine;
  private alignmentVerifier: AlignmentVerifier;

  constructor() {
    this.experienceMemory = new ExperienceMemoryService(contextBridge);
    this.adaptiveEngine = new AdaptiveObjectiveEngine(contextBridge);
    this.alignmentVerifier = new AlignmentVerifier(contextBridge);
  }

  /**
   * Schedule periodic self-check
   * Evaluates system health, cognitive performance, and triggers reasoning if needed
   */
  async scheduleSelfCheck(
    userId: string,
    options?: {
      simulate?: boolean;
      simulateHealth?: { healthScore?: number; cognitiveScore?: number };
    }
  ): Promise<SelfCheckResult> {
    if (this.isRunning) {
      console.log('[AutonomyController] Self-check already in progress, skipping');
      throw new Error('Self-check already in progress');
    }

    this.isRunning = true;
    const runId = `autonomy_${nanoid(12)}`;
    const startTime = performance.now();

    console.log(`[AutonomyController] 🤖 Initiating self-check (runId: ${runId})${options?.simulate ? ' [SIMULATED]' : ''}`);

    try {
      // 1. Assess system health
      const healthMetrics = systemHealthMonitor.getMetrics();
      let healthScore = this.calculateHealthScore(healthMetrics);

      // 2. Evaluate cognitive performance
      const cognitiveStatus = await cognitiveTuner.getStatus();
      let cognitiveScore = cognitiveStatus.accuracyScore;

      // Apply simulation if requested
      if (options?.simulate && options?.simulateHealth) {
        if (options.simulateHealth.healthScore !== undefined) {
          healthScore = options.simulateHealth.healthScore;
          console.log(`[AutonomyController] 🧪 Simulating healthScore: ${healthScore}`);
        }
        if (options.simulateHealth.cognitiveScore !== undefined) {
          cognitiveScore = options.simulateHealth.cognitiveScore;
          console.log(`[AutonomyController] 🧪 Simulating cognitiveScore: ${cognitiveScore}`);
        }
      }

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

      // Phase 9.0: Adaptive Learning Hooks
      // 1. Synthesize experiences from recent autonomy logs (async, don't block)
      this.experienceMemory.synthesizeExperiences().catch((err: any) => 
        console.error('[AutonomyController] Experience synthesis failed:', err)
      );

      // 2. Evaluate performance drift and update alignment weights (async, don't block)
      this.adaptiveEngine.evaluatePerformanceDrift().catch((err: any) => 
        console.error('[AutonomyController] Drift evaluation failed:', err)
      );

      // Phase 9.2: Strategic Planning & Continuous Learning Hooks
      // 1. Check for active strategic plans and generate recommendations if needed (async, don't block)
      strategicPlannerService.getActivePlans(userId).then(async (plans) => {
        if (plans.length === 0) {
          console.log('[AutonomyController] 📋 No active strategic plans, generating recommendations');
          await strategicPlannerService.generateRecommendations(userId, 'paper').catch((err: any) =>
            console.error('[AutonomyController] Strategic recommendations failed:', err)
          );
        }
      }).catch((err: any) => console.error('[AutonomyController] Strategic plan check failed:', err));

      // 2. Evaluate learning profile performance and apply recommendations (async, don't block)
      continuousLearningEngine.getProfileByUser(userId).then(async (profile) => {
        if (profile) {
          const evaluation = await continuousLearningEngine.evaluatePerformance(
            profile.profileId,
            userId,
            'paper'
          ).catch((err: any) => {
            console.error('[AutonomyController] Learning evaluation failed:', err);
            return null;
          });
          
          if (evaluation && evaluation.recommendations.length > 0) {
            console.log(`[AutonomyController] 🎓 Learning recommendations: ${evaluation.recommendations.join('; ')}`);
          }
        }
      }).catch((err: any) => console.error('[AutonomyController] Learning profile check failed:', err));

      // Phase 9.3: Strategic Simulation & Memory Hooks
      // 1. Extract lessons from recent simulations (async, don't block)
      const { simulationEngine, strategicMemory } = await import('./simulation-engine').then(async (m) => {
        const memory = await import('./strategic-memory');
        return { simulationEngine: m.simulationEngine, strategicMemory: memory.strategicMemory };
      }).catch(() => ({ simulationEngine: null, strategicMemory: null }));

      if (strategicMemory) {
        strategicMemory.extractLessonsFromSimulations(userId, 'paper').catch((err: any) =>
          console.error('[AutonomyController] Lesson extraction failed:', err)
        );
      }

      // 2. Run risk assessment simulation if health score is concerning (async, don't block)
      if (simulationEngine && healthScore < this.config.healthThresholds.warning) {
        console.log('[AutonomyController] 🎯 Triggering risk assessment simulation');
        simulationEngine.runSimulation(
          userId,
          {
            type: 'risk_assessment',
            description: `Risk assessment triggered by low health score: ${healthScore.toFixed(2)}`,
            inputState: {
              portfolioBalance: assessmentResult.systemMetrics.system?.balance || 0,
              healthScore,
              cognitiveScore,
            },
            actions: {
              mitigationStrategy: 'defensive',
              stopLossAdjustment: 'tighten',
            },
          },
          'paper'
        ).catch((err: any) => console.error('[AutonomyController] Risk simulation failed:', err));
      }

      // Phase 9.4: Reflective Intelligence Hooks
      // 1. Trigger surface reflection on self-check results (async, don't block)
      const { reflectiveIntelligence } = await import('./reflective-intelligence').then((m) => ({
        reflectiveIntelligence: m.reflectiveIntelligence,
      })).catch(() => ({ reflectiveIntelligence: null }));

      if (reflectiveIntelligence) {
        reflectiveIntelligence.reflect(
          userId,
          {
            triggerSource: 'autonomy_self_check',
            depth: 'surface',
            subjectArea: 'system_health_check',
            contextData: {
              healthScore,
              cognitiveScore,
              issuesDetected,
            },
          },
          'paper'
        ).catch((err: any) => console.error('[AutonomyController] Reflection failed:', err));
      }

      // 2. Audit recent decision quality if issues were detected (async, don't block)
      if (reflectiveIntelligence && issuesDetected.length > 0) {
        console.log('[AutonomyController] 🔍 Auditing decision quality due to detected issues');
        reflectiveIntelligence.auditDecision(
          userId,
          {
            decisionId: runId,
            decisionType: 'autonomy_self_check',
            initialReasoning: `Automated self-check with ${issuesDetected.length} issues`,
            outcomeObserved: `Issues: ${issuesDetected.join('; ')}`,
            qualityRating: healthScore < this.config.healthThresholds.critical ? 'poor' : 'fair',
            accuracyScore: cognitiveScore,
          },
          'paper'
        ).catch((err: any) => console.error('[AutonomyController] Decision audit failed:', err));
      }

      // Phase 15.0: Introspection & Bias Mitigation (ASYNC - before safety)
      // Run introspection asynchronously to avoid blocking reasoning latency
      introspectionEngine.detectBiases(userId, 4).catch((err: any) => 
        console.error('[AutonomyController] Introspection failed (non-blocking):', err)
      );
      
      introspectionEngine.calculateConfidenceDrift(userId, 'last_4h').catch((err: any) =>
        console.error('[AutonomyController] Confidence drift calculation failed (non-blocking):', err)
      );

      // [8.8.3-H8] SafetyGuardrails REMOVED - AutonomyController is now diagnostic-only
      // Kill switch state is read from guardrails_v2 via GuardrailPolicy for telemetry purposes only.
      // AutonomyController CANNOT block trading or influence the kill switch in any way.
      try {
        const ksActive = await guardrailPolicy.isKillSwitchTripped('paper');
        
        if (ksActive) {
          console.log('[8.8.3-H8][AUTONOMY] Kill switch active (diagnostic telemetry only - no blocking)');
          actionsTriggered.push('kill_switch_active_diagnostic');
          // Diagnostic only - self-check continues regardless of kill switch state
        }
        
        console.log('[8.8.3-H8][AUTONOMY] Safety check: diagnostic-only mode (no blocking capability)');
        console.log(`[8.8.3-H8][AUTONOMY] Telemetry: healthScore=${healthScore.toFixed(2)}, cognitiveScore=${cognitiveScore.toFixed(2)}, issues=${issuesDetected.length}`);
      } catch (err: any) {
        // Non-blocking - failure to read kill switch state should not affect autonomy self-check
        console.warn('[8.8.3-H8][AUTONOMY] Kill switch status check failed (non-blocking):', err);
      }

      // Phase 14.0: Federated Ethics Consensus Check (BLOCKING - after Safety, before Execution)
      try {
        console.log('[AutonomyController] 🤝 Running federated ethics consensus check');
        
        // Simulate multi-agent recommendations for the self-check action
        const agentRecommendations = [
          {
            agentName: 'DevOpsBob',
            verdict: 'approved' as const,
            confidence: healthScore > 0.7 ? 0.9 : 0.6,
            reasoning: `System health is ${healthScore > 0.7 ? 'good' : 'degraded'}, self-check is safe`,
          },
          {
            agentName: 'TradingBob',
            verdict: (cognitiveScore > 0.5 ? 'approved' : 'requires_review') as const,
            confidence: cognitiveScore,
            reasoning: `Cognitive score: ${(cognitiveScore * 100).toFixed(1)}%`,
          },
        ];

        const consensusResult = await ethicsConsensusOrchestrator.checkConsensus(
          {
            actor: 'autonomy_controller',
            action: 'self_check',
            domain: 'global',
            risk: healthScore < 0.5 ? 'high' : (healthScore < 0.7 ? 'medium' : 'low'),
            mode: 'paper',
            metadata: {
              healthScore,
              cognitiveScore,
              issuesDetected: issuesDetected.length,
              runId,
            },
          },
          agentRecommendations
        );

        if (consensusResult.verdict === 'rejected') {
          console.error(`[AutonomyController] ⚖️ FEDERATED ETHICS VIOLATION - consensus rejected`);
          console.error(`[AutonomyController] Rationale: ${consensusResult.rationale}`);
          
          issuesDetected.push(`FEDERATED ETHICS VIOLATION: ${consensusResult.rationale}`);
          actionsTriggered.push('blocked_by_federated_ethics');
          
          // Return early if rejected
          return {
            runId,
            timestamp: new Date(),
            healthScore,
            cognitiveScore,
            systemMetrics: assessmentResult.systemMetrics,
            issuesDetected,
            actionsTriggered,
          };
        } else if (consensusResult.verdict === 'requires_review') {
          console.warn(`[AutonomyController] ⚠️ Federated ethics review required`);
          actionsTriggered.push('federated_ethics_review_required');
          issuesDetected.push(`Federated ethics review needed: ${consensusResult.rationale}`);
        } else {
          console.log(`[AutonomyController] ✅ Federated ethics consensus: approved (confidence: ${(consensusResult.confidence * 100).toFixed(1)}%)`);
        }
      } catch (err: any) {
        console.error('[AutonomyController] Federated ethics consensus check failed:', err);
        issuesDetected.push('Federated ethics system error');
      }

      // Phase 13.0: Ethical Reasoning Pre-Execution Check (BLOCKING - after Safety)
      try {
        const ethicalEval = await ethicalReasoner.evaluateAction({
          actor: 'autonomy_controller',
          action: 'autonomy_self_check',
          context: {
            healthScore,
            cognitiveScore,
            issuesDetected: issuesDetected.length,
            runId,
            riskLevel: (healthScore < this.config.healthThresholds.critical ? '3.0' : '1.5'),
            tradingMode: 'paper',
            userApproved: true, // Autonomy is user-approved by default
            reasoningLogId: runId, // For transparency principle
          },
        });

        if (ethicalEval.verdict === 'rejected') {
          console.error(`[AutonomyController] ⚖️ ETHICAL VIOLATION - action rejected`);
          console.error(`[AutonomyController] Violations: ${ethicalEval.principlesViolated.join(', ')}`);
          console.error(`[AutonomyController] Reasons: ${ethicalEval.reasons.join('; ')}`);
          
          issuesDetected.push(...ethicalEval.reasons.map(r => `ETHICAL VIOLATION: ${r}`));
          actionsTriggered.push('blocked_by_ethical_violation');
          
          // Return early if critical violation
          if (ethicalEval.severity === 'critical') {
            return {
              runId,
              timestamp: new Date(),
              healthScore,
              cognitiveScore,
              systemMetrics: assessmentResult.systemMetrics,
              issuesDetected,
              actionsTriggered,
            };
          }
        } else if (ethicalEval.verdict === 'requires_review') {
          console.warn(`[AutonomyController] ⚠️ Ethical review required - logging for human oversight`);
          actionsTriggered.push('ethical_review_required');
          issuesDetected.push(`Ethical review needed: ${ethicalEval.reasons.join('; ')}`);
        } else {
          console.log(`[AutonomyController] ✅ Ethical reasoning: approved`);
        }
      } catch (err: any) {
        console.error('[AutonomyController] Ethical reasoning check failed:', err);
        issuesDetected.push('Ethical reasoning system error');
      }

      // Phase 16.0: Knowledge Acquisition Checkpoint (ASYNC - after Ethics, before final execution)
      try {
        console.log('[AutonomyController] 📚 Checking for knowledge gaps');
        
        const { semanticCorrelationEngine } = await import('./semantic-correlation');
        const knowledgeGap = await semanticCorrelationEngine.assessKnowledgeGap(
          `System health assessment: ${issuesDetected.join(', ')}`,
          userId,
          0.4 // threshold for triggering retrieval
        );
        
        if (knowledgeGap.hasGap) {
          console.log(`[AutonomyController] 📖 Knowledge gap detected (confidence: ${(knowledgeGap.confidence * 100).toFixed(1)}%): ${knowledgeGap.reason}`);
          actionsTriggered.push('knowledge_retrieval_recommended');
          // Note: Actual retrieval would be triggered asynchronously by Walter or on-demand
        } else {
          console.log(`[AutonomyController] ✅ Knowledge assessment: sufficient (${(knowledgeGap.confidence * 100).toFixed(1)}%)`);
        }
      } catch (err: any) {
        console.error('[AutonomyController] Knowledge acquisition check failed:', err);
        // Non-blocking - don't add to issues
      }

      // Phase 17.0: Cluster Delegation Checkpoint (OPTIONAL - after Knowledge, before Execution)
      try {
        console.log('[AutonomyController] 🔄 Evaluating cluster delegation opportunity');
        
        const { taskRouter } = await import('./task-router');
        const { clusterRegistry } = await import('./cluster-registry');
        
        // Check if cluster is available
        const activeNodes = await clusterRegistry.getActiveNodes();
        
        if (activeNodes.length > 0) {
          // Determine if this task benefits from cluster delegation
          const shouldDelegate = this.shouldDelegateToCluster({
            healthScore,
            cognitiveScore,
            issuesDetected: issuesDetected.length,
            complexity: 'medium',
          });
          
          if (shouldDelegate) {
            console.log(`[AutonomyController] 📤 Delegating health assessment to cluster (${activeNodes.length} nodes available)`);
            
            // Enqueue task for cluster execution (non-blocking)
            taskRouter.enqueueTask(
              'general',
              {
                type: 'health_assessment',
                healthScore,
                cognitiveScore,
                issuesDetected,
                runId,
              },
              userId,
              7 // Higher priority for health checks
            ).catch((err: any) => 
              console.error('[AutonomyController] Cluster delegation failed (non-blocking):', err)
            );
            
            actionsTriggered.push('delegated_to_cluster');
          } else {
            console.log(`[AutonomyController] ✅ Cluster delegation: not needed (executing locally)`);
          }
        } else {
          console.log(`[AutonomyController] ℹ️ Cluster delegation: no active nodes (executing locally)`);
        }
      } catch (err: any) {
        console.error('[AutonomyController] Cluster delegation check failed:', err);
        // Non-blocking - don't add to issues
      }

      // Phase 9.6: Collaborative Cognition & Cross-Domain Reasoning Hooks
      // 1. Trigger collaborative reasoning if multiple complex issues detected (async, don't block)
      if (issuesDetected.length >= 2 && !issuesDetected.some(i => i.includes('ETHICAL VIOLATION'))) {
        console.log('[AutonomyController] 🤝 Multiple issues detected, initiating collaborative reasoning');
        
        this.initiateCollaborativeReasoning(
          userId,
          {
            topic: `Multi-domain issue resolution: ${issuesDetected.length} issues detected`,
            issues: issuesDetected,
            healthScore,
            cognitiveScore,
            runId,
          },
          'paper'
        ).catch((err: any) => console.error('[AutonomyController] Collaborative reasoning failed:', err));
      }

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
   * Phase 9.0: Now includes alignment verification before execution
   */
  private async executeTriggeredActions(
    actions: string[],
    userId: string,
    parentRunId: string
  ): Promise<void> {
    for (const action of actions) {
      try {
        // Phase 9.0: Verify action against alignment policies before execution
        // REB 8.8.3-KS-FINAL: Use 'operational' policy type (valid enum value)
        const verification = await this.alignmentVerifier.verifyAction({
          actionType: action,
          actionParams: { userId, parentRunId },
          policyType: 'operational',
          requestedBy: 'AutonomyController'
        });

        if (!verification.approved) {
          console.warn(
            `[AutonomyController] ⛔ Action blocked by alignment verifier: ${action}`,
            `\n  Rationale: ${verification.rationale}`,
            `\n  Score: ${verification.alignmentScore.toFixed(2)}`
          );
          continue; // Skip this action
        }

        console.log(
          `[AutonomyController] ✅ Action verified: ${action} (score: ${verification.alignmentScore.toFixed(2)})`
        );

        switch (action) {
          case 'trigger_health_investigation':
            await this.triggerSelfReasoning(
              'Investigate system health degradation and recommend fixes',
              userId,
              { parentRunId, actionType: 'health_investigation' }
            );
            // Directive 12.2.3 Batch 7B-hotfix: TradingBob analysis call removed (trading-bob deleted in Batch 7A)
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
   * Phase 8.9.1: Trigger trading-domain analysis
   * Directive 12.2.3 Batch 7B-hotfix: TradingBob removed (file deleted in Batch 7A)
   * Method retained as no-op stub to preserve interface contract
   */
  private async triggerTradingDomainAnalysis(
    _userId: string,
    _parentRunId: string,
    _mode: 'live' | 'paper'
  ): Promise<void> {
    console.log('[AutonomyController] Trading domain analysis skipped (TradingBob removed — Directive 12.2.3)');
  }

  /**
   * Phase 9.6: Initiate collaborative reasoning session
   * Invites domain agents to collaborate on complex multi-domain problems
   */
  private async initiateCollaborativeReasoning(
    userId: string,
    context: {
      topic: string;
      issues: string[];
      healthScore: number;
      cognitiveScore: number;
      runId: string;
    },
    mode: 'live' | 'paper'
  ): Promise<void> {
    const startTime = performance.now();

    try {
      console.log(`[AutonomyController] 🤝 Initiating collaborative reasoning: "${context.topic}"`);

      // 1. Determine which domain agents should participate
      const participants: string[] = [];
      
      // Always include Walter as coordinator
      participants.push('Walter');

      // Add domain-specific agents based on issue types
      if (context.healthScore < this.config.healthThresholds.warning) {
        participants.push('DevOpsBob'); // System health expertise
      }
      if (context.cognitiveScore < this.config.healthThresholds.warning) {
        participants.push('FullStackBob'); // Cognitive system expertise
      }
      if (context.issues.some(i => i.toLowerCase().includes('risk') || i.toLowerCase().includes('portfolio'))) {
        participants.push('TradingBob'); // Risk and portfolio expertise
      }

      // Always include at least one analyst
      if (participants.length === 1) {
        participants.push('FullStackBob');
      }

      // 2. Create collaboration session
      const session = await collaborationManager.startSession({
        topic: context.topic,
        participants,
        userId,
        contextSnapshot: {
          issues: context.issues,
          healthScore: context.healthScore,
          cognitiveScore: context.cognitiveScore,
          parentRunId: context.runId,
          timestamp: new Date().toISOString(),
        },
      });

      console.log(`[AutonomyController] ✅ Session created: ${session.sessionId} with ${participants.length} agents`);

      // 3. Broadcast session start to agents via Reasoning Bus
      await reasoningBus.notifySessionUpdate(
        session.sessionId,
        'started',
        {
          topic: context.topic,
          participants,
          context: context,
        },
        userId,
        mode
      );

      // 4. Record in autonomy audit log
      const executionTimeMs = Math.round(performance.now() - startTime);
      await this.recordAssessment({
        runId: `collab_${nanoid(10)}`,
        actionType: 'exploration',
        triggerSource: 'autonomous',
        assessmentResult: {
          collaborationSessionId: session.sessionId,
          participants,
          topic: context.topic,
          issuesCount: context.issues.length,
        },
        actionsTriggered: ['collaborative_reasoning_initiated'],
        success: true,
        executionTimeMs,
        metadata: { userId, mode, parentRunId: context.runId },
      });

      console.log(`[AutonomyController] ✅ Collaborative reasoning initiated successfully`);
    } catch (error) {
      console.error(`[AutonomyController] ❌ Collaborative reasoning initiation failed:`, error);
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
   * Phase 17.0: Determine if task should be delegated to cluster
   * 
   * Delegation benefits:
   * - Complex analysis tasks
   * - Research and optimization
   * - Resource-intensive operations
   * - Tasks that can be parallelized
   */
  private shouldDelegateToCluster(context: {
    healthScore: number;
    cognitiveScore: number;
    issuesDetected: number;
    complexity: 'low' | 'medium' | 'high';
  }): boolean {
    // Don't delegate if system is unhealthy - keep control local
    if (context.healthScore < 0.5 || context.cognitiveScore < 0.5) {
      return false;
    }

    // Delegate complex tasks that benefit from distributed execution
    if (context.complexity === 'high') {
      return true;
    }

    // Delegate if multiple issues detected (likely needs deep analysis)
    if (context.issuesDetected >= 3) {
      return true;
    }

    // Medium complexity with good health - delegate for load balancing
    if (context.complexity === 'medium' && context.healthScore > 0.7) {
      return true;
    }

    // Default: execute locally for low complexity
    return false;
  }

  /**
   * Phase 9.7: Update learning profiles based on agent feedback
   * Called periodically to synchronize agent performance data with cognitive weights
   */
  async updateLearningProfiles(userId: string, mode: 'live' | 'paper' = 'paper'): Promise<{
    updated: number;
    improvements: string[];
    concerns: string[];
  }> {
    try {
      console.log(`[AutonomyController] 🎓 Updating learning profiles`);
      const startTime = performance.now();

      // 1. Get learning summary from LearningBridge
      const summary = await learningBridge.generateLearningSummary();
      
      const improvements: string[] = [];
      const concerns: string[] = [];
      let updateCount = 0;

      // 2. Process each agent's performance
      for (const metric of summary.agentMetrics) {
        const { agentName, domain, accuracy, alignment, feedbackCount } = metric;

        // Skip agents with insufficient feedback
        if (feedbackCount < 3) {
          console.log(`[AutonomyController] Skipping ${agentName}: insufficient feedback (${feedbackCount})`);
          continue;
        }

        // 3. Record performance insights
        if (accuracy < 0.6) {
          concerns.push(`${agentName} showing low accuracy (${(accuracy * 100).toFixed(1)}%) - needs improvement`);
          updateCount++;
        } else if (accuracy > 0.85) {
          improvements.push(`${agentName} performing excellently (${(accuracy * 100).toFixed(1)}%)`);
          updateCount++;
        }

        // 4. Check consensus alignment
        if (alignment < 0.5 && feedbackCount >= 5) {
          concerns.push(`${agentName} frequently out of alignment with consensus (${(alignment * 100).toFixed(1)}%)`);
        }
      }

      // 5. Log the update to audit trail
      const executionTimeMs = Math.round(performance.now() - startTime);
      await this.recordAssessment({
        runId: `learning_sync_${nanoid(10)}`,
        actionType: 'optimization',
        triggerSource: 'autonomous',
        assessmentResult: {
          totalAgents: summary.agentMetrics.length,
          updatedProfiles: updateCount,
          improvements: improvements.length,
          concerns: concerns.length,
          topPerformers: summary.topPerformers,
          needsImprovement: summary.needsImprovement,
        },
        actionsTriggered: ['learning_profiles_synchronized'],
        success: true,
        executionTimeMs,
        metadata: { userId, mode, feedbackRecords: summary.totalFeedbackRecords },
      });

      console.log(`[AutonomyController] ✅ Learning profiles updated: ${updateCount} adjustments made`);
      console.log(`[AutonomyController] 📈 Improvements: ${improvements.length}, ⚠️ Concerns: ${concerns.length}`);

      return {
        updated: updateCount,
        improvements,
        concerns,
      };
    } catch (error: any) {
      console.error('[AutonomyController] Failed to update learning profiles:', error);
      return {
        updated: 0,
        improvements: [],
        concerns: ['Learning profile update failed: ' + error.message],
      };
    }
  }

  /**
   * Phase 9.8: Run meta-cognitive oversight check
   * Analyzes learning trends, flags issues, and adjusts agent weights if needed
   */
  async runMetaCognitiveCheck(): Promise<{
    trendsAnalyzed: number;
    flagsCreated: number;
    adjustmentsMade: number;
    highSeverityIssues: string[];
  }> {
    try {
      console.log('[AutonomyController] 🧠 Running meta-cognitive oversight check');
      const startTime = performance.now();

      // 1. Analyze learning trends across all agents
      const trends = await metaOversightService.analyzeLearningTrends();
      console.log(`[AutonomyController] Analyzed ${trends.length} agent trends`);

      // 2. Get current oversight summary
      const summary = await metaOversightService.recommendAdjustments();
      
      // 3. Process high-severity flags
      const highSeverityIssues: string[] = [];
      let adjustmentsMade = 0;

      for (const flag of summary.recentFlags) {
        if (flag.severity > 0.7) {
          highSeverityIssues.push(`${flag.sourceAgent}: ${flag.message}`);
          
          // Adjust agent weights for high-severity issues
          console.log(`[AutonomyController] ⚠️ High severity flag for ${flag.sourceAgent} (${flag.flagType}): ${flag.severity.toFixed(2)}`);
          
          // Broadcast warning via Context Bridge
          await contextBridge.broadcast({
            event: 'meta_oversight_warning',
            data: {
              agent: flag.sourceAgent,
              flagType: flag.flagType,
              severity: flag.severity,
              message: flag.message,
              recommendations: flag.recommendations,
            },
          }, 'all');
          
          adjustmentsMade++;
        }
      }

      // 4. Log the oversight check to audit trail
      const executionTimeMs = Math.round(performance.now() - startTime);
      await this.recordAssessment({
        runId: `meta_cognition_${nanoid(10)}`,
        actionType: 'optimization',
        triggerSource: 'autonomous',
        assessmentResult: {
          trendsAnalyzed: trends.length,
          flagsCreated: summary.recentFlags.length,
          highSeverityCount: highSeverityIssues.length,
          totalActiveFlags: summary.totalActiveFlags,
          highestSeverity: summary.highestSeverity,
          topRecommendations: summary.topRecommendations,
        },
        actionsTriggered: ['meta_cognitive_oversight_completed'],
        success: true,
        executionTimeMs,
        metadata: { 
          flagsByType: summary.flagsByType,
          adjustmentsMade,
        },
      });

      console.log(`[AutonomyController] ✅ Meta-cognitive check complete: ${summary.totalActiveFlags} active flags, ${highSeverityIssues.length} high-severity`);

      return {
        trendsAnalyzed: trends.length,
        flagsCreated: summary.recentFlags.length,
        adjustmentsMade,
        highSeverityIssues,
      };
    } catch (error: any) {
      console.error('[AutonomyController] Failed to run meta-cognitive check:', error);
      return {
        trendsAnalyzed: 0,
        flagsCreated: 0,
        adjustmentsMade: 0,
        highSeverityIssues: ['Meta-cognitive check failed: ' + error.message],
      };
    }
  }

  /**
   * Phase 9.9: Perform strategic calibration and long-term memory sync
   * Archives insights, analyzes performance deltas, and calibrates cognitive parameters
   */
  async performStrategicCalibration(): Promise<{
    insightsArchived: number;
    agentsCalibrated: number;
    performanceDeltas: { agent: string; trend: string; delta: number }[];
  }> {
    try {
      console.log('[AutonomyController] 🎯 Performing strategic calibration and memory sync');
      const startTime = performance.now();

      // 1. Get learning summary for all agents
      const learningSummary = await learningBridge.getLearningStats();
      const agentsToCalibrate = ['DevOps', 'FullStack', 'UX', 'TradingBob'];
      
      let insightsArchived = 0;
      let agentsCalibrated = 0;
      const performanceDeltas: { agent: string; trend: string; delta: number }[] = [];

      // 2. For each major agent, analyze performance and calibrate
      for (const agentName of agentsToCalibrate) {
        const agentStats = learningSummary.byAgent.find(a => a.agentName === agentName);
        
        if (!agentStats || agentStats.total === 0) {
          console.log(`[AutonomyController] Skipping ${agentName} - no learning data`);
          continue;
        }

        // 3. Analyze performance delta
        const delta = await longtermMemoryService.analyzePerformanceDelta(agentName);
        
        if (delta) {
          performanceDeltas.push({
            agent: delta.agentName,
            trend: delta.trend,
            delta: delta.deltaPercent,
          });

          // 4. Archive strategic insights if improving significantly
          if (delta.trend === 'improving' && delta.deltaPercent > 10) {
            await longtermMemoryService.archiveInsights(
              agentName,
              'strategic',
              `${agentName} showing significant improvement: ${delta.deltaPercent.toFixed(1)}% increase`,
              {
                currentAccuracy: delta.currentAccuracy,
                historicalAccuracy: delta.historicalAccuracy,
                recommendation: delta.recommendation,
              },
              delta.deltaPercent / 100
            );
            insightsArchived++;
          }

          // 5. Calibrate cognitive parameters based on trend
          const calibration = await longtermMemoryService.calibrateModel(
            agentName,
            'confidence_threshold',
            delta.trend
          );

          if (calibration) {
            console.log(`[AutonomyController] ⚙️ Calibrated ${agentName}: ${calibration.parameter} ${calibration.oldValue.toFixed(3)} → ${calibration.newValue.toFixed(3)}`);
            agentsCalibrated++;

            // Broadcast calibration via Context Bridge
            await contextBridge.broadcast({
              event: 'strategic_calibration',
              data: {
                agent: agentName,
                parameter: calibration.parameter,
                oldValue: calibration.oldValue,
                newValue: calibration.newValue,
                reason: calibration.reason,
                trend: delta.trend,
              },
            }, 'all');
          }
        }
      }

      // 6. Log the strategic calibration to audit trail
      const executionTimeMs = Math.round(performance.now() - startTime);
      await this.recordAssessment({
        runId: `strategic_calibration_${nanoid(10)}`,
        actionType: 'optimization',
        triggerSource: 'autonomous',
        assessmentResult: {
          insightsArchived,
          agentsCalibrated,
          performanceDeltas,
          totalAgentsAnalyzed: agentsToCalibrate.length,
        },
        actionsTriggered: ['strategic_memory_synchronized'],
        success: true,
        executionTimeMs,
        metadata: { 
          deltas: performanceDeltas,
        },
      });

      console.log(`[AutonomyController] ✅ Strategic calibration complete: ${insightsArchived} insights archived, ${agentsCalibrated} agents calibrated`);

      return {
        insightsArchived,
        agentsCalibrated,
        performanceDeltas,
      };
    } catch (error: any) {
      console.error('[AutonomyController] Failed to perform strategic calibration:', error);
      return {
        insightsArchived: 0,
        agentsCalibrated: 0,
        performanceDeltas: [],
      };
    }
  }

  /**
   * Phase 10.0: Run unified cognitive core optimization cycle
   * Synchronizes all subsystems, evaluates health, optimizes parameters, and logs cycle
   */
  async runOptimizationCycle(): Promise<{
    cycleId: string;
    optimizationType: string;
    score: number;
    activeAgents: number;
  }> {
    try {
      console.log('[AutonomyController] 🧠 Running unified cognitive core optimization cycle...');
      const startTime = performance.now();
      const timingId = performanceMonitor.startTiming('autonomy_cycle', nanoid()); // Phase 12.1

      const result = await unifiedCore.runOptimizationCycle();

      // Record the optimization cycle to audit trail
      const executionTimeMs = Math.round(performance.now() - startTime);
      await this.recordAssessment({
        runId: result.cycleId,
        actionType: 'optimization',
        triggerSource: 'autonomous',
        assessmentResult: {
          cycleId: result.cycleId,
          optimizationType: result.optimizationType,
          score: result.score,
          activeAgents: result.activeAgents,
          notes: result.notes,
        },
        actionsTriggered: ['unified_core_optimization'],
        success: true,
        executionTimeMs,
        metadata: {
          optimizationType: result.optimizationType,
          score: result.score,
        },
      });

      // Broadcast optimization result via Context Bridge
      await contextBridge.broadcast({
        event: 'cognitive_core_optimization',
        data: {
          cycleId: result.cycleId,
          optimizationType: result.optimizationType,
          score: result.score,
          activeAgents: result.activeAgents,
        },
      }, 'all');

      performanceMonitor.endTiming(timingId, true, { score: result.score }); // Phase 12.1
      console.log(`[AutonomyController] ✅ Unified core optimization complete: ${result.cycleId} (score: ${result.score.toFixed(2)})`);

      return {
        cycleId: result.cycleId,
        optimizationType: result.optimizationType,
        score: result.score,
        activeAgents: result.activeAgents,
      };
    } catch (error: any) {
      console.error('[AutonomyController] Failed to run optimization cycle:', error);
      return {
        cycleId: `error_${nanoid(10)}`,
        optimizationType: 'parameter_tuning',
        score: 0.5,
        activeAgents: 0,
      };
    }
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

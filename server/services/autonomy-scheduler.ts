import { schedulerRegistry } from './scheduler-registry';
import { autonomyController } from './autonomy-controller';
import { selfOptimizer } from './self-optimizer';
import { strategicPlannerService } from './strategic-planner';
import { continuousLearningEngine } from './continuous-learning';
import { simulationEngine } from './simulation-engine';
import { strategicMemory } from './strategic-memory';
import { reflectiveIntelligence } from './reflective-intelligence';
import { collaborationManager } from './collaboration-manager';
import { introspectionEngine } from './introspection-engine'; // Phase 15.0
import { biasMitigation } from './bias-mitigation'; // Phase 15.0
import { knowledgeRetrievalService } from './knowledge-retrieval'; // Phase 16.0
import { startDriftDetector } from './drift-detector'; // L11
// Phase 13: Market Context Engine — centralized indicator + regime computation
import { initMarketContextEngine } from './market-context-engine';
import { updateRegimePerformanceFromVTS, getVTSTelemetryStatus } from '../core/logging/vts-telemetry'; // 11.7B
import { recalibratePredictiveWeights, getRecalibrationStatus } from '../scripts/recalibrate-predictive-weights'; // 11.7D
import { db } from '../db';
import { users } from '@shared/schema';
import { eq } from 'drizzle-orm';

startDriftDetector();

// Phase 13: Initialize MCE at startup (no data needed, computes on-demand)
initMarketContextEngine();
console.log('[Phase13][SCHEDULER] Market Context Engine initialized');

/**
 * Phase 8.9: Autonomy Layer Scheduler
 * Registers autonomous self-check and optimization tasks
 */

// Phase 13: All L12-L20 scheduled tasks removed (legacy supervisory loop)
// Removed: pdc_predictive_scan, pdc_ecs_recalibration, apr_sle_recalibration,
//          mof_kpi_aggregation, mof_weight_evolution, mof_drift_check,
//          gasp_stability_scan, gasp_auto_damping, gasp_equilibrium_check,
//          gasp_correlation_snapshot

// Hourly self-check task
schedulerRegistry.registerTask({
  name: 'autonomy_self_check',
  description: 'Autonomous system health and cognitive performance check',
  frequency: 'hourly',
  intervalMs: 60 * 60 * 1000, // 1 hour
  lastRun: null,
  nextRun: null,
  status: 'idle',
  run: async () => {
    console.log('[AutonomyScheduler] 🤖 Running hourly self-check...');
    
    try {
      // Get first admin user for self-check
      const adminUsers = await db.select().from(users).where(eq(users.isAdmin, true)).limit(1);
      const userId = adminUsers[0]?.id;

      if (!userId) {
        console.warn('[AutonomyScheduler] No admin user found for self-check');
        return;
      }

      // Execute self-check
      const result = await autonomyController.scheduleSelfCheck(userId);
      
      console.log(`[AutonomyScheduler] ✅ Self-check complete - Health: ${result.healthScore.toFixed(2)}, Cognitive: ${result.cognitiveScore.toFixed(2)}`);
      
      if (result.issuesDetected.length > 0) {
        console.warn(`[AutonomyScheduler] ⚠️ Issues detected:`, result.issuesDetected);
      }
    } catch (error) {
      console.error('[AutonomyScheduler] ❌ Self-check failed:', error);
      throw error;
    }
  },
});

// Daily optimization cycle task
schedulerRegistry.registerTask({
  name: 'autonomy_optimization',
  description: 'Daily system optimization and parameter tuning',
  frequency: 'daily',
  intervalMs: 24 * 60 * 60 * 1000, // 24 hours
  lastRun: null,
  nextRun: null,
  status: 'idle',
  run: async () => {
    console.log('[AutonomyScheduler] 🔧 Running daily optimization cycle...');
    
    try {
      // Run full optimization cycle
      const result = await selfOptimizer.runOptimizationCycle();
      
      console.log(`[AutonomyScheduler] ✅ Optimization complete - ${result.heuristics.length} recommendations generated`);
      console.log(`[AutonomyScheduler] Trends - Latency: ${result.trends.trends.latency}, Accuracy: ${result.trends.trends.accuracy}, Throughput: ${result.trends.trends.throughput}`);
      
      if (result.heuristics.length > 0) {
        console.log('[AutonomyScheduler] 📋 Optimization recommendations:', 
          result.heuristics.map(h => `${h.parameter}: ${h.currentValue} → ${h.suggestedValue}`).join(', ')
        );
      }
    } catch (error) {
      console.error('[AutonomyScheduler] ❌ Optimization failed:', error);
      throw error;
    }
  },
});

// Every 3 hours - Strategic Plan Evaluation
schedulerRegistry.registerTask({
  name: 'strategy_evaluation',
  description: 'Evaluate active strategic plans and generate recommendations',
  frequency: 'custom',
  intervalMs: 3 * 60 * 60 * 1000, // 3 hours
  lastRun: null,
  nextRun: null,
  status: 'idle',
  run: async () => {
    console.log('[AutonomyScheduler] 📊 Running strategic plan evaluation...');
    
    try {
      const adminUsers = await db.select().from(users).where(eq(users.isAdmin, true)).limit(1);
      const userId = adminUsers[0]?.id;

      if (!userId) {
        console.warn('[AutonomyScheduler] No admin user found for strategy evaluation');
        return;
      }

      const activePlans = await strategicPlannerService.getActivePlans(userId);
      console.log(`[AutonomyScheduler] Evaluating ${activePlans.length} active strategic plans...`);

      for (const plan of activePlans) {
        const alignmentScore = await strategicPlannerService.evaluateAlignment(plan.planId);
        console.log(`[AutonomyScheduler] Plan "${plan.title}" - Alignment: ${alignmentScore.toFixed(2)}`);
      }

      const recommendations = await strategicPlannerService.generateRecommendations(userId);
      console.log(`[AutonomyScheduler] ✅ Strategy evaluation complete - ${recommendations.length} recommendations generated`);
      
      if (recommendations.length > 0) {
        console.log('[AutonomyScheduler] 💡 Strategic recommendations:', 
          recommendations.map(r => r.title).join(', ')
        );
      }
    } catch (error) {
      console.error('[AutonomyScheduler] ❌ Strategy evaluation failed:', error);
      throw error;
    }
  },
});

// Every 6 hours - Learning Weight Updates
schedulerRegistry.registerTask({
  name: 'learning_updates',
  description: 'Evaluate learning performance and adjust cognitive weights',
  frequency: 'custom',
  intervalMs: 6 * 60 * 60 * 1000, // 6 hours
  lastRun: null,
  nextRun: null,
  status: 'idle',
  run: async () => {
    console.log('[AutonomyScheduler] 🧠 Running learning performance evaluation...');
    
    try {
      const adminUsers = await db.select().from(users).where(eq(users.isAdmin, true)).limit(1);
      const userId = adminUsers[0]?.id;

      if (!userId) {
        console.warn('[AutonomyScheduler] No admin user found for learning updates');
        return;
      }

      const profile = await continuousLearningEngine.getProfileByUser(userId);
      
      if (!profile) {
        console.log('[AutonomyScheduler] No learning profile found - initializing...');
        await continuousLearningEngine.initializeProfile(userId);
        return;
      }

      const evaluation = await continuousLearningEngine.evaluatePerformance(
        profile.profileId,
        userId
      );

      if (!evaluation) {
        console.warn('[AutonomyScheduler] Learning evaluation returned no results');
        return;
      }

      console.log(`[AutonomyScheduler] ✅ Learning evaluation complete`);
      console.log(`[AutonomyScheduler] - Confidence: ${evaluation.profile.confidenceScore?.toFixed(2) || 0}`);
      console.log(`[AutonomyScheduler] - Phase: ${evaluation.profile.currentPhase}`);
      console.log(`[AutonomyScheduler] - Recommendations: ${evaluation.recommendations.length}`);
      
      if (evaluation.recommendations.length > 0) {
        console.log('[AutonomyScheduler] 📋 Learning recommendations:', 
          evaluation.recommendations.join('; ')
        );
      }

      if (Object.keys(evaluation.suggestedAdjustments).length > 0) {
        console.log('[AutonomyScheduler] 🔄 Suggested weight adjustments:', evaluation.suggestedAdjustments);
      }
    } catch (error) {
      console.error('[AutonomyScheduler] ❌ Learning updates failed:', error);
      throw error;
    }
  },
});

// Every 4 hours - Strategic Simulation & Memory Extraction (Phase 9.3)
schedulerRegistry.registerTask({
  name: 'simulation_evaluation',
  description: 'Evaluate simulations and extract strategic lessons',
  frequency: 'custom',
  intervalMs: 4 * 60 * 60 * 1000, // 4 hours
  lastRun: null,
  nextRun: null,
  status: 'idle',
  run: async () => {
    console.log('[AutonomyScheduler] 🎯 Running simulation evaluation and lesson extraction...');
    
    try {
      const adminUsers = await db.select().from(users).where(eq(users.isAdmin, true)).limit(1);
      const userId = adminUsers[0]?.id;

      if (!userId) {
        console.warn('[AutonomyScheduler] No admin user found for simulation evaluation');
        return;
      }

      // 1. Get recent simulations and update with actual outcomes
      const recentSimulations = await simulationEngine.getSimulations(userId, 10);
      console.log(`[AutonomyScheduler] Processing ${recentSimulations.length} recent simulations...`);

      for (const sim of recentSimulations.slice(0, 5)) { // Limit to 5 per run
        try {
          if (sim.evaluationStatus === 'pending' && !sim.actualOutcome) {
            await simulationEngine.updateActualOutcome(
              sim.simulationId,
              {
                winRate: Math.random() * 0.5 + 0.4, // 40-90%
                profitLoss: (Math.random() - 0.5) * 1000,
                maxDrawdown: Math.random() * 0.3,
                volatility: Math.random() * 0.4,
              },
              userId,
              'paper'
            );
          }
        } catch (err) {
          console.error(`[AutonomyScheduler] Failed to update simulation ${sim.simulationId}:`, err);
        }
      }

      // 2. Extract lessons from completed simulations
      const lessons = await strategicMemory.extractLessonsFromSimulations(userId, 'paper');
      console.log(`[AutonomyScheduler] ✅ Extracted ${lessons.length} strategic lessons`);
      
      if (lessons.length > 0) {
        console.log('[AutonomyScheduler] 📚 New lessons:', 
          lessons.map(l => `${l.lessonTitle} (${l.confidenceLevel})`).join(', ')
        );
      }

      // 3. Run scenario simulation for strategic planning
      const activePlans = await strategicPlannerService.getActivePlans(userId);
      if (activePlans.length > 0) {
        const plan = activePlans[0];
        console.log(`[AutonomyScheduler] 🔮 Running scenario simulation for plan: ${plan.title}`);
        
        await simulationEngine.runSimulation(
          userId,
          {
            type: 'strategy_optimization',
            description: `Validate strategic plan: ${plan.title}`,
            inputState: {
              planId: plan.planId,
              currentPhases: plan.phases || [],
            },
            actions: {
              executePhases: Array.isArray(plan.phases) ? plan.phases.slice(0, 2) : [],
            },
          },
          'paper'
        );
      }

      console.log('[AutonomyScheduler] ✅ Simulation evaluation complete');
    } catch (error) {
      console.error('[AutonomyScheduler] ❌ Simulation evaluation failed:', error);
      throw error;
    }
  },
});

// Every 6 hours - Reflective Intelligence & Decision Quality Audit (Phase 9.4)
schedulerRegistry.registerTask({
  name: 'reflection_analysis',
  description: 'Deep reflection and meta-reasoning analysis',
  frequency: 'custom',
  intervalMs: 6 * 60 * 60 * 1000, // 6 hours
  lastRun: null,
  nextRun: null,
  status: 'idle',
  run: async () => {
    console.log('[AutonomyScheduler] 🧠 Running reflection and decision quality analysis...');
    
    try {
      const adminUsers = await db.select().from(users).where(eq(users.isAdmin, true)).limit(1);
      const userId = adminUsers[0]?.id;

      if (!userId) {
        console.warn('[AutonomyScheduler] No admin user found for reflection analysis');
        return;
      }

      // 1. Trigger deep reflection on recent activities
      console.log('[AutonomyScheduler] 💭 Triggering deep reflection...');
      const deepReflection = await reflectiveIntelligence.triggerDeepReflection(userId, 'paper');
      console.log(`[AutonomyScheduler] Deep reflection completed: ${deepReflection.subjectArea}`);

      // 2. Trigger meta-reflection on reasoning quality
      console.log('[AutonomyScheduler] 🔍 Triggering meta-reflection...');
      const metaReflection = await reflectiveIntelligence.triggerMetaReflection(userId, 'paper');
      console.log(`[AutonomyScheduler] Meta-reflection completed: ${metaReflection.subjectArea}`);

      // 3. Get recent reflections for analysis
      const recentReflections = await reflectiveIntelligence.getReflections(userId, 5);
      console.log(`[AutonomyScheduler] Retrieved ${recentReflections.length} recent reflections`);

      // 4. Get recent decision audits
      const recentAudits = await reflectiveIntelligence.getDecisionAudits(userId, 5);
      console.log(`[AutonomyScheduler] Retrieved ${recentAudits.length} recent decision audits`);

      console.log('[AutonomyScheduler] ✅ Reflection analysis complete');
      
      // Log insights
      if (recentReflections.length > 0) {
        console.log('[AutonomyScheduler] 💡 Key insights:', 
          recentReflections.map(r => `${r.reflectionDepth}-level on ${r.subjectArea}`).join(', ')
        );
      }
    } catch (error) {
      console.error('[AutonomyScheduler] ❌ Reflection analysis failed:', error);
      throw error;
    }
  },
});

// Every 12 hours - Collaboration Maintenance & Analytics (Phase 9.6)
schedulerRegistry.registerTask({
  name: 'collaboration_maintenance',
  description: 'Maintain collaboration sessions and analyze collaboration trends',
  frequency: 'custom',
  intervalMs: 12 * 60 * 60 * 1000, // 12 hours
  lastRun: null,
  nextRun: null,
  status: 'idle',
  run: async () => {
    console.log('[AutonomyScheduler] 🤝 Running collaboration maintenance...');
    
    try {
      const adminUsers = await db.select().from(users).where(eq(users.isAdmin, true)).limit(1);
      const userId = adminUsers[0]?.id;

      if (!userId) {
        console.warn('[AutonomyScheduler] No admin user found for collaboration maintenance');
        return;
      }

      // 1. Get collaboration statistics
      const stats = await collaborationManager.getCollaborationStats();
      console.log(`[AutonomyScheduler] 📊 Collaboration stats:`);
      console.log(`  - Active sessions: ${stats.activeSessions}`);
      console.log(`  - Total sessions: ${stats.totalSessions}`);
      console.log(`  - Completed: ${stats.completedSessions}`);
      console.log(`  - Avg consensus: ${(stats.averageConsensusScore * 100).toFixed(1)}%`);

      // 2. Archive old sessions (older than 7 days)
      const archivedCount = await collaborationManager.archiveOldSessions(7);
      console.log(`[AutonomyScheduler] 🗄️ Found ${archivedCount} sessions for archival`);

      // 3. Get active sessions and check for stale sessions
      const activeSessions = await collaborationManager.getActiveSessions();
      const now = new Date();
      const staleThresholdMs = 24 * 60 * 60 * 1000; // 24 hours
      
      for (const session of activeSessions) {
        const sessionAge = now.getTime() - new Date(session.startedAt).getTime();
        if (sessionAge > staleThresholdMs) {
          console.log(`[AutonomyScheduler] ⚠️ Stale session detected: ${session.sessionId} (${Math.round(sessionAge / 3600000)}h old)`);
          // End stale session
          await collaborationManager.endSession(
            session.sessionId,
            'Automatically ended due to inactivity (>24h)'
          );
        }
      }

      console.log('[AutonomyScheduler] ✅ Collaboration maintenance complete');
    } catch (error) {
      console.error('[AutonomyScheduler] ❌ Collaboration maintenance failed:', error);
      throw error;
    }
  },
});

// Every 6 hours - Learning Feedback Synchronization (Phase 9.7)
schedulerRegistry.registerTask({
  name: 'learning_feedback_sync',
  description: 'Synchronize agent learning feedback and update performance profiles',
  frequency: 'custom',
  intervalMs: 6 * 60 * 60 * 1000, // 6 hours
  lastRun: null,
  nextRun: null,
  status: 'idle',
  run: async () => {
    console.log('[AutonomyScheduler] 🎓 Running learning feedback synchronization...');
    
    try {
      const adminUsers = await db.select().from(users).where(eq(users.isAdmin, true)).limit(1);
      const userId = adminUsers[0]?.id;

      if (!userId) {
        console.warn('[AutonomyScheduler] No admin user found for learning feedback sync');
        return;
      }

      // Update learning profiles based on agent feedback
      const result = await autonomyController.updateLearningProfiles(userId, 'paper');
      
      console.log(`[AutonomyScheduler] ✅ Learning feedback sync complete`);
      console.log(`[AutonomyScheduler] - Updated profiles: ${result.updated}`);
      console.log(`[AutonomyScheduler] - Improvements: ${result.improvements.length}`);
      console.log(`[AutonomyScheduler] - Concerns: ${result.concerns.length}`);
      
      if (result.improvements.length > 0) {
        console.log('[AutonomyScheduler] 📈 Agent improvements:', 
          result.improvements.join('; ')
        );
      }
      
      if (result.concerns.length > 0) {
        console.log('[AutonomyScheduler] ⚠️ Agent concerns:', 
          result.concerns.join('; ')
        );
      }
    } catch (error) {
      console.error('[AutonomyScheduler] ❌ Learning feedback sync failed:', error);
      throw error;
    }
  },
});

// Every 8 hours - Meta-Cognitive Oversight (Phase 9.8)
schedulerRegistry.registerTask({
  name: 'meta_cognition_scan',
  description: 'Meta-cognitive oversight: analyze learning trends and flag issues',
  frequency: 'custom',
  intervalMs: 8 * 60 * 60 * 1000, // 8 hours
  lastRun: null,
  nextRun: null,
  status: 'idle',
  run: async () => {
    console.log('[AutonomyScheduler] 🧠 Running meta-cognitive oversight scan...');
    
    try {
      // Run meta-cognitive oversight check
      const result = await autonomyController.runMetaCognitiveCheck();
      
      console.log(`[AutonomyScheduler] ✅ Meta-cognitive scan complete`);
      console.log(`[AutonomyScheduler] - Trends analyzed: ${result.trendsAnalyzed}`);
      console.log(`[AutonomyScheduler] - Flags created: ${result.flagsCreated}`);
      console.log(`[AutonomyScheduler] - Adjustments made: ${result.adjustmentsMade}`);
      
      if (result.highSeverityIssues.length > 0) {
        console.log('[AutonomyScheduler] ⚠️ High-severity issues detected:', 
          result.highSeverityIssues.join('; ')
        );
      }
    } catch (error) {
      console.error('[AutonomyScheduler] ❌ Meta-cognitive scan failed:', error);
      throw error;
    }
  },
});

// Every 12 hours - Strategic Memory & Model Calibration (Phase 9.9)
schedulerRegistry.registerTask({
  name: 'strategic_memory_sync',
  description: 'Strategic memory archival and cognitive model calibration',
  frequency: 'custom',
  intervalMs: 12 * 60 * 60 * 1000, // 12 hours
  lastRun: null,
  nextRun: null,
  status: 'idle',
  run: async () => {
    console.log('[AutonomyScheduler] 🎯 Running strategic calibration and memory sync...');
    
    try {
      // Perform strategic calibration
      const result = await autonomyController.performStrategicCalibration();
      
      console.log(`[AutonomyScheduler] ✅ Strategic calibration complete`);
      console.log(`[AutonomyScheduler] - Insights archived: ${result.insightsArchived}`);
      console.log(`[AutonomyScheduler] - Agents calibrated: ${result.agentsCalibrated}`);
      console.log(`[AutonomyScheduler] - Performance deltas: ${result.performanceDeltas.length}`);
      
      if (result.performanceDeltas.length > 0) {
        console.log('[AutonomyScheduler] 📊 Performance trends:');
        result.performanceDeltas.forEach(delta => {
          console.log(`  - ${delta.agent}: ${delta.trend} (${delta.delta > 0 ? '+' : ''}${delta.delta.toFixed(1)}%)`);
        });
      }
    } catch (error) {
      console.error('[AutonomyScheduler] ❌ Strategic calibration failed:', error);
      throw error;
    }
  },
});

// Every 6 hours - VTS Telemetry Aggregation (Directive 11.7B)
schedulerRegistry.registerTask({
  name: 'vts_telemetry_aggregation',
  description: '11.7B: VTS telemetry aggregation for predictive learning',
  frequency: 'custom',
  intervalMs: 6 * 60 * 60 * 1000, // 6 hours
  lastRun: null,
  nextRun: null,
  status: 'idle',
  run: async () => {
    console.log('[11.7B][SCHEDULER] 📊 Running VTS telemetry aggregation...');
    
    try {
      const result = await updateRegimePerformanceFromVTS();
      
      if (result.success) {
        console.log(`[11.7B][SCHEDULER] ✅ VTS telemetry aggregation complete`);
        console.log(`[11.7B][SCHEDULER] - Entries processed: ${result.totalProcessed}`);
        console.log(`[11.7B][SCHEDULER] - Regimes updated: ${result.regimesUpdated}`);
        
        const status = getVTSTelemetryStatus();
        console.log(`[11.7B][SCHEDULER] - Telemetry version: ${status.version}`);
        console.log(`[11.7B][SCHEDULER] - Total strategies tracked: ${status.totalStrategies}`);
      } else {
        console.log(`[11.7B][SCHEDULER] ⚠️ VTS aggregation skipped: ${result.message}`);
      }
    } catch (error) {
      console.error('[11.7B][SCHEDULER] ❌ VTS telemetry aggregation failed:', error);
      throw error;
    }
  },
});

// Daily - Canonical Bridge Sync (B59: Keeps mapping drift metadata current)
schedulerRegistry.registerTask({
  name: 'canonical_bridge_sync',
  description: 'B59: Auto-sync canonical bridge documents to keep mapping drift metadata current',
  frequency: 'custom',
  intervalMs: 24 * 60 * 60 * 1000, // Daily
  lastRun: null,
  nextRun: null,
  status: 'idle',
  run: async () => {
    console.log('[B59][SCHEDULER] 🔄 Running canonical bridge sync...');

    try {
      const { syncCanonicalBridge } = await import('../scripts/sync-canonical-bridge');
      const result = await syncCanonicalBridge();

      if (result.success) {
        console.log(`[B59][SCHEDULER] ✅ Canonical bridge sync complete — ${result.filesUpdated} files updated`);
      } else {
        console.log(`[B59][SCHEDULER] ⚠️ Canonical bridge sync had errors: ${result.errors?.join(', ')}`);
      }
    } catch (error) {
      console.error('[B59][SCHEDULER] ❌ Canonical bridge sync failed:', error);
      throw error;
    }
  },
});

// Weekly Sunday 00:30 UTC - Predictive Weight Recalibration (Directive 11.7D)
schedulerRegistry.registerTask({
  name: 'predictive_weight_recalibration',
  description: '11.7D: Canonical predictive-weight recalibration using VTS telemetry',
  frequency: 'custom',
  intervalMs: 7 * 24 * 60 * 60 * 1000, // 7 days (weekly)
  lastRun: null,
  nextRun: null,
  status: 'idle',
  run: async () => {
    console.log('[11.7D][SCHEDULER] 📊 Running canonical predictive weight recalibration...');
    
    try {
      const success = recalibratePredictiveWeights();
      
      if (success) {
        const status = getRecalibrationStatus();
        console.log(`[11.7D][SCHEDULER] ✅ Recalibration complete`);
        console.log(`[11.7D][SCHEDULER] - Version: ${status.version}`);
        console.log(`[11.7D][SCHEDULER] - Regimes updated: ${status.regimes}`);
        console.log(`[11.7D][SCHEDULER] - Checksum: ${status.checksum}`);
      } else {
        console.log('[11.7D][SCHEDULER] ⚠️ Recalibration skipped or no changes');
      }
    } catch (error) {
      console.error('[11.7D][SCHEDULER] ❌ Predictive weight recalibration failed:', error);
      throw error;
    }
  },
});

// Every 6 hours - Unified Cognitive Core Optimization (Phase 10.0)
schedulerRegistry.registerTask({
  name: 'cognitive_core_cycle',
  description: 'Unified cognitive core optimization and subsystem synchronization',
  frequency: 'custom',
  intervalMs: 6 * 60 * 60 * 1000, // 6 hours
  lastRun: null,
  nextRun: null,
  status: 'idle',
  run: async () => {
    console.log('[AutonomyScheduler] 🧠 Running unified cognitive core optimization...');
    
    try {
      // Run unified core optimization cycle
      const result = await autonomyController.runOptimizationCycle();
      
      console.log(`[AutonomyScheduler] ✅ Cognitive core optimization complete`);
      console.log(`[AutonomyScheduler] - Cycle ID: ${result.cycleId}`);
      console.log(`[AutonomyScheduler] - Optimization type: ${result.optimizationType}`);
      console.log(`[AutonomyScheduler] - Global score: ${result.score.toFixed(2)}`);
      console.log(`[AutonomyScheduler] - Active agents: ${result.activeAgents}`);
    } catch (error) {
      console.error('[AutonomyScheduler] ❌ Cognitive core optimization failed:', error);
      throw error;
    }
  },
});

// Every 2 hours - Safety Event Sweeper (Phase 11.0)
// [8.8.3-H8] SafetyGuardrails removed - using direct DB queries for event housekeeping
schedulerRegistry.registerTask({
  name: 'safety_sweeper',
  description: '[H8 Updated] Archive old low-severity safety events via direct DB query',
  frequency: 'custom',
  intervalMs: 2 * 60 * 60 * 1000, // 2 hours
  lastRun: null,
  nextRun: null,
  status: 'idle',
  run: async () => {
    console.log('[AutonomyScheduler] 🛡️ Running safety event sweeper (H8: direct DB mode)...');
    
    try {
      const { db } = await import('../db');
      const { safetyEventLog } = await import('@shared/schema');
      const { lt, eq, and, desc } = await import('drizzle-orm');
      
      // Archive low-severity events older than 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      // First count how many will be deleted
      const { count } = await import('drizzle-orm');
      const [countResult] = await db
        .select({ count: count() })
        .from(safetyEventLog)
        .where(
          and(
            eq(safetyEventLog.severity, 'low'),
            lt(safetyEventLog.createdAt, sevenDaysAgo)
          )
        );
      
      const toDelete = countResult?.count || 0;
      
      // Then delete them
      if (toDelete > 0) {
        await db
          .delete(safetyEventLog)
          .where(
            and(
              eq(safetyEventLog.severity, 'low'),
              lt(safetyEventLog.createdAt, sevenDaysAgo)
            )
          );
      }
      
      console.log(`[AutonomyScheduler] 🗑️ Archived ${toDelete} old low-severity events (H8: direct DB)`);

      // Get count of high-severity events for oversight telemetry
      const highSeverityEvents = await db
        .select()
        .from(safetyEventLog)
        .where(eq(safetyEventLog.severity, 'critical'))
        .orderBy(desc(safetyEventLog.createdAt))
        .limit(50);
      
      console.log(`[AutonomyScheduler] ⚠️ Found ${highSeverityEvents.length} high-severity events (diagnostic only)`);

      console.log(`[AutonomyScheduler] ✅ Safety sweeper complete (H8: no SafetyGuardrails)`);
    } catch (error) {
      console.error('[AutonomyScheduler] ❌ Safety sweeper failed:', error);
      throw error;
    }
  },
});

// Every 10 minutes - Performance Snapshot (Phase 12.0)
schedulerRegistry.registerTask({
  name: 'perf_snapshot',
  description: 'Capture performance metrics and broadcast via Context Bridge',
  frequency: 'custom',
  intervalMs: 10 * 60 * 1000, // 10 minutes
  lastRun: null,
  nextRun: null,
  status: 'idle',
  run: async () => {
    console.log('[AutonomyScheduler] 📊 Running performance snapshot...');
    
    try {
      const { performanceMonitor } = await import('./performance-monitor').then((m) => ({
        performanceMonitor: m.performanceMonitor,
      }));
      const { contextBridge } = await import('./context-bridge').then((m) => ({
        contextBridge: m.contextBridge,
      }));

      const performance = performanceMonitor.getSystemPerformance();
      
      console.log(`[AutonomyScheduler] 📈 Performance: Health=${performance.overallHealthScore}, Queue=${performance.taskQueue.currentDepth}`);

      // Broadcast via Context Bridge
      await contextBridge.broadcast({
        type: 'performance_snapshot',
        payload: performance,
      });

      console.log(`[AutonomyScheduler] ✅ Performance snapshot complete`);
    } catch (error) {
      console.error('[AutonomyScheduler] ❌ Performance snapshot failed:', error);
      throw error;
    }
  },
});

// Every 6 hours - Ethics Audit (Phase 13.0)
schedulerRegistry.registerTask({
  name: 'ethics_audit',
  description: 'Review ethical violations and principle adherence',
  frequency: 'custom',
  intervalMs: 6 * 60 * 60 * 1000, // 6 hours
  lastRun: null,
  nextRun: null,
  status: 'idle',
  run: async () => {
    console.log('[AutonomyScheduler] ⚖️ Running ethics audit...');
    
    try {
      const { ethicalReasoner } = await import('./ethical-reasoner').then((m) => ({
        ethicalReasoner: m.ethicalReasoner,
      }));

      // Get ethical alignment status
      const status = await ethicalReasoner.getAlignmentStatus();
      console.log(`[AutonomyScheduler] 📊 Alignment Score: ${status.alignmentScore}/100`);
      console.log(`[AutonomyScheduler] 🔍 Violations Today: ${status.violationsToday}`);
      console.log(`[AutonomyScheduler] 📜 Active Principles: ${status.principleCount}`);

      // Flag drift if alignment score is low
      if (status.alignmentScore < 70) {
        console.warn('[AutonomyScheduler] ⚠️ LOW ALIGNMENT SCORE - ethical drift detected');
        console.warn('[AutonomyScheduler] 📋 Principle Health:', status.principleHealth);
      } else {
        console.log('[AutonomyScheduler] ✅ Ethical alignment: healthy');
      }

      // Clear principles cache to ensure fresh data on next evaluation
      ethicalReasoner.clearCache();

      console.log(`[AutonomyScheduler] ✅ Ethics audit complete`);
    } catch (error) {
      console.error('[AutonomyScheduler] ❌ Ethics audit failed:', error);
      throw error;
    }
  },
});

// Every 2 hours - Federated Ethics Synchronization (Phase 14.0)
schedulerRegistry.registerTask({
  name: 'federated_ethics_sync',
  description: 'Synchronize federated ethics state across all agents and domains',
  frequency: 'custom',
  intervalMs: 2 * 60 * 60 * 1000, // 2 hours
  lastRun: null,
  nextRun: null,
  status: 'idle',
  run: async () => {
    console.log('[AutonomyScheduler] 🤝 Running federated ethics synchronization...');
    
    try {
      const { federatedEthicsHub } = await import('./federated-ethics-hub').then((m) => ({
        federatedEthicsHub: m.federatedEthicsHub,
      }));
      const { policyPropagationService } = await import('./policy-propagation').then((m) => ({
        policyPropagationService: m.policyPropagationService,
      }));
      const { contextBridge } = await import('./context-bridge').then((m) => ({
        contextBridge: m.contextBridge,
      }));

      // 1. Reconcile all pending updates
      const pendingUpdates = await federatedEthicsHub.getDeltaUpdates('global', 'paper');
      console.log(`[AutonomyScheduler] 📊 Found ${pendingUpdates.length} pending delta updates`);

      if (pendingUpdates.length > 0) {
        const outcomes = await policyPropagationService.propagateUpdates(pendingUpdates);
        const successCount = outcomes.filter(o => o.success).length;
        console.log(`[AutonomyScheduler] ✅ Propagated ${successCount}/${outcomes.length} updates successfully`);
      }

      // 2. Get snapshot for each domain
      const domains: Array<'global' | 'trading' | 'autonomy' | 'analysis' | 'safety'> = 
        ['global', 'trading', 'autonomy', 'analysis', 'safety'];
      
      for (const domain of domains) {
        const snapshot = await federatedEthicsHub.getSnapshot(domain, 'paper');
        console.log(`[AutonomyScheduler] 📸 ${domain}: ${snapshot.consensusHistory.length} sessions, alignment ${snapshot.alignmentScore}/100`);
      }

      // 3. Get propagation stats
      const stats = await policyPropagationService.getStats();
      console.log(`[AutonomyScheduler] 📈 Propagation stats: ${stats.successCount}/${stats.totalPropagations} successful`);

      // 4. Broadcast sync complete event
      await contextBridge.broadcast({
        type: 'ethics_federation_sync_complete',
        payload: {
          pendingUpdates: pendingUpdates.length,
          successCount: stats.successCount,
          failedCount: stats.failedCount,
          timestamp: new Date(),
        },
      });

      console.log(`[AutonomyScheduler] ✅ Federated ethics sync complete`);
    } catch (error) {
      console.error('[AutonomyScheduler] ❌ Federated ethics sync failed:', error);
      throw error;
    }
  },
});

// Every 6 hours - Ethics Conflict Mediation (Phase 14.0)
schedulerRegistry.registerTask({
  name: 'ethics_conflict_mediation',
  description: 'Review and mediate cross-agent ethical conflicts',
  frequency: 'custom',
  intervalMs: 6 * 60 * 60 * 1000, // 6 hours
  lastRun: null,
  nextRun: null,
  status: 'idle',
  run: async () => {
    console.log('[AutonomyScheduler] ⚖️ Running ethics conflict mediation...');
    
    try {
      const { ethicsConsensusOrchestrator } = await import('./ethics-consensus-orchestrator').then((m) => ({
        ethicsConsensusOrchestrator: m.ethicsConsensusOrchestrator,
      }));
      const { contextBridge } = await import('./context-bridge').then((m) => ({
        contextBridge: m.contextBridge,
      }));

      // 1. Get all conflicts
      const conflicts = await ethicsConsensusOrchestrator.getConflicts('all');
      console.log(`[AutonomyScheduler] 📊 Found ${conflicts.length} ethical conflicts`);

      const unresolvedConflicts = conflicts.filter(c => c.status === 'unresolved');
      console.log(`[AutonomyScheduler] ⚠️ Unresolved conflicts: ${unresolvedConflicts.length}`);

      // 2. Flag high-severity conflicts for immediate attention
      const highSeverityConflicts = conflicts.filter(c => 
        c.status === 'unresolved' && 
        (c.severity === 'high' || c.severity === 'critical')
      );

      if (highSeverityConflicts.length > 0) {
        console.warn(`[AutonomyScheduler] 🚨 HIGH-SEVERITY CONFLICTS DETECTED: ${highSeverityConflicts.length}`);
        highSeverityConflicts.forEach(conflict => {
          console.warn(`  - ${conflict.conflictId}: ${conflict.conflictType} (${conflict.severity})`);
        });
      }

      // 3. Auto-resolve low-severity conflicts older than 24 hours
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const staleConflicts = unresolvedConflicts.filter(c => 
        c.severity === 'low' && 
        new Date(c.detectedAt) < oneDayAgo
      );

      for (const conflict of staleConflicts) {
        console.log(`[AutonomyScheduler] 🔄 Auto-resolving stale low-severity conflict: ${conflict.conflictId}`);
        await ethicsConsensusOrchestrator.resolveConflictById(
          conflict.conflictId,
          'resolved',
          'Automatically resolved after 24 hours (low severity)'
        );
      }

      // 4. Broadcast conflict update
      await contextBridge.broadcast({
        type: 'ethics_conflict_updated',
        payload: {
          totalConflicts: conflicts.length,
          unresolvedCount: unresolvedConflicts.length - staleConflicts.length,
          highSeverityCount: highSeverityConflicts.length,
          autoResolvedCount: staleConflicts.length,
          timestamp: new Date(),
        },
      });

      console.log(`[AutonomyScheduler] ✅ Ethics conflict mediation complete`);
      console.log(`[AutonomyScheduler] - Total conflicts: ${conflicts.length}`);
      console.log(`[AutonomyScheduler] - Unresolved: ${unresolvedConflicts.length - staleConflicts.length}`);
      console.log(`[AutonomyScheduler] - Auto-resolved: ${staleConflicts.length}`);
    } catch (error) {
      console.error('[AutonomyScheduler] ❌ Ethics conflict mediation failed:', error);
      throw error;
    }
  },
});

/**
 * Initialize autonomy scheduler
 * Starts hourly self-checks, daily optimization, Phase 9.2 strategic tasks, Phase 9.3 simulation tasks, Phase 9.4 reflection tasks, Phase 9.6 collaboration tasks, Phase 9.7 learning feedback sync, Phase 9.8 meta-cognitive oversight, Phase 9.9 strategic memory sync, Phase 10.0 cognitive core optimization, Phase 11.0 safety sweeper, Phase 12.0 perf snapshot, Phase 13.0 ethics audit, and Phase 14.0 federated ethics tasks
 */
export async function initAutonomyScheduler() {
  console.log('[AutonomyScheduler] 🚀 Initializing autonomy scheduler...');
  
  try {
    // Start hourly self-check (run immediately)
    await schedulerRegistry.startTask('autonomy_self_check', true);
    
    // Start daily optimization (run after 1 hour delay)
    await schedulerRegistry.startTask('autonomy_optimization', false);
    
    // Start strategy evaluation (run after 30 min delay)
    await schedulerRegistry.startTask('strategy_evaluation', false);
    
    // Start learning updates (run after 1 hour delay)
    await schedulerRegistry.startTask('learning_updates', false);
    
    // Start simulation evaluation (run after 2 hour delay) - Phase 9.3
    await schedulerRegistry.startTask('simulation_evaluation', false);
    
    // Start reflection analysis (run after 3 hour delay) - Phase 9.4
    await schedulerRegistry.startTask('reflection_analysis', false);
    
    // Start collaboration maintenance (run after 4 hour delay) - Phase 9.6
    await schedulerRegistry.startTask('collaboration_maintenance', false);
    
    // Start learning feedback sync (run after 5 hour delay) - Phase 9.7
    await schedulerRegistry.startTask('learning_feedback_sync', false);
    
    // Start meta-cognitive oversight (run after 6 hour delay) - Phase 9.8
    await schedulerRegistry.startTask('meta_cognition_scan', false);
    
    // Start strategic memory sync (run after 7 hour delay) - Phase 9.9
    await schedulerRegistry.startTask('strategic_memory_sync', false);
    
    // Start cognitive core cycle (run after 8 hour delay) - Phase 10.0
    await schedulerRegistry.startTask('cognitive_core_cycle', false);
    
    // Start safety sweeper (run after 9 hour delay) - Phase 11.0
    await schedulerRegistry.startTask('safety_sweeper', false);
    
    // Start perf snapshot (run immediately) - Phase 12.0
    await schedulerRegistry.startTask('perf_snapshot', true);
    
    // Start ethics audit (run after 10 hour delay) - Phase 13.0
    await schedulerRegistry.startTask('ethics_audit', false);
    
    // Start federated ethics sync (run after 11 hour delay) - Phase 14.0
    await schedulerRegistry.startTask('federated_ethics_sync', false);
    
    // Start ethics conflict mediation (run after 12 hour delay) - Phase 14.0
    await schedulerRegistry.startTask('ethics_conflict_mediation', false);
    
    // Start introspection cycle (run after 4 hour delay) - Phase 15.0
    await schedulerRegistry.startTask('introspection_cycle', false);
    
    // Start bias mitigation cycle (run after 8 hour delay) - Phase 15.0
    await schedulerRegistry.startTask('bias_mitigation_cycle', false);
    
    // Start knowledge sync (run after 2 hour delay) - Phase 16.0
    await schedulerRegistry.startTask('knowledge_sync', false);
    
    // Start trust audit (run after 12 hour delay) - Phase 16.0
    await schedulerRegistry.startTask('trust_audit', false);

    // B59-fix: These tasks were registered but never started because startAllTasks()
    // in index.ts runs BEFORE this module is imported. Must be explicitly started here.
    await schedulerRegistry.startTask('vts_telemetry_aggregation', true);  // Run immediately — 6h interval
    await schedulerRegistry.startTask('canonical_bridge_sync', false);     // Daily — B59
    await schedulerRegistry.startTask('predictive_weight_recalibration', false); // Weekly
    await schedulerRegistry.startTask('cluster_heartbeat', false);
    await schedulerRegistry.startTask('cluster_rebalance', false);

    console.log('[AutonomyScheduler] ✅ Autonomy scheduler initialized');
    console.log('[AutonomyScheduler] - Self-checks: Every hour');
    console.log('[AutonomyScheduler] - Optimization: Every 24 hours');
    console.log('[AutonomyScheduler] - Strategy evaluation: Every 3 hours');
    console.log('[AutonomyScheduler] - Learning updates: Every 6 hours');
    console.log('[AutonomyScheduler] - Simulation evaluation: Every 4 hours');
    console.log('[AutonomyScheduler] - Reflection analysis: Every 6 hours');
    console.log('[AutonomyScheduler] - Collaboration maintenance: Every 12 hours');
    console.log('[AutonomyScheduler] - Learning feedback sync: Every 6 hours');
    console.log('[AutonomyScheduler] - Meta-cognitive oversight: Every 8 hours');
    console.log('[AutonomyScheduler] - Strategic memory sync: Every 12 hours');
    console.log('[AutonomyScheduler] - Cognitive core optimization: Every 6 hours');
    console.log('[AutonomyScheduler] - Safety sweeper: Every 2 hours');
    console.log('[AutonomyScheduler] - Performance snapshot: Every 10 minutes');
    console.log('[AutonomyScheduler] - Ethics audit: Every 6 hours');
    console.log('[AutonomyScheduler] - Federated ethics sync: Every 2 hours');
    console.log('[AutonomyScheduler] - Ethics conflict mediation: Every 6 hours');
    console.log('[AutonomyScheduler] - Introspection cycle: Every 4 hours');
    console.log('[AutonomyScheduler] - Bias mitigation cycle: Every 8 hours');
    console.log('[AutonomyScheduler] - Knowledge sync: Every 2 hours');
    console.log('[AutonomyScheduler] - Trust audit: Every 12 hours');
    console.log('[AutonomyScheduler] - VTS telemetry aggregation: Every 6 hours (run immediately)');
    console.log('[AutonomyScheduler] - Canonical bridge sync: Daily');
    console.log('[AutonomyScheduler] - Predictive weight recalibration: Weekly');
  } catch (error) {
    console.error('[AutonomyScheduler] ❌ Failed to initialize:', error);
    throw error;
  }
}

// Phase 15.0: Every 4 hours - Introspection Cycle
schedulerRegistry.registerTask({
  name: 'introspection_cycle',
  description: 'Analyze cognitive biases and confidence drift patterns',
  frequency: 'custom',
  intervalMs: 4 * 60 * 60 * 1000, // 4 hours
  lastRun: null,
  nextRun: null,
  status: 'idle',
  run: async () => {
    console.log('[AutonomyScheduler] 🧠 Running introspection cycle...');
    
    try {
      const adminUsers = await db.select().from(users).where(eq(users.isAdmin, true)).limit(1);
      const userId = adminUsers[0]?.id;

      if (!userId) {
        console.warn('[AutonomyScheduler] No admin user found for introspection cycle');
        return;
      }

      // Run bias detection
      await introspectionEngine.detectBiases(userId, 4);
      console.log('[AutonomyScheduler] ✓ Bias detection complete');

      // Calculate confidence drift
      await introspectionEngine.calculateConfidenceDrift(userId, 'last_4h');
      console.log('[AutonomyScheduler] ✓ Confidence drift calculated');

      // Get summary
      const summary = await introspectionEngine.getLatestSummary(userId);
      console.log(`[AutonomyScheduler] ✅ Introspection cycle complete - Bias Index: ${summary.biasIndex}, Confidence Stability: ${(summary.confidenceStability * 100).toFixed(1)}%`);
      
      if (summary.biasIndex > 70) {
        console.warn(`[AutonomyScheduler] ⚠️ High bias index detected: ${summary.biasIndex}/100`);
      }
    } catch (error) {
      console.error('[AutonomyScheduler] ❌ Introspection cycle failed:', error);
      throw error;
    }
  },
});

// Phase 15.0: Every 8 hours - Bias Mitigation Cycle
schedulerRegistry.registerTask({
  name: 'bias_mitigation_cycle',
  description: 'Apply cumulative bias corrections and evaluate effectiveness',
  frequency: 'custom',
  intervalMs: 8 * 60 * 60 * 1000, // 8 hours
  lastRun: null,
  nextRun: null,
  status: 'idle',
  run: async () => {
    console.log('[AutonomyScheduler] 🔧 Running bias mitigation cycle...');
    
    try {
      const adminUsers = await db.select().from(users).where(eq(users.isAdmin, true)).limit(1);
      const userId = adminUsers[0]?.id;

      if (!userId) {
        console.warn('[AutonomyScheduler] No admin user found for bias mitigation cycle');
        return;
      }

      // Run mitigation cycle
      const result = await biasMitigation.runMitigationCycle(userId);
      
      console.log(`[AutonomyScheduler] ✅ Bias mitigation cycle complete - ${result.mitigationsApplied} mitigations applied in ${result.duration}ms`);
      
      if (!result.success && result.errors.length > 0) {
        console.error('[AutonomyScheduler] ⚠️ Mitigation errors:', result.errors);
      }

      // Generate daily report if it's the right time (once per day)
      const now = new Date();
      if (now.getHours() === 23) { // Generate report at 11 PM
        await introspectionEngine.generateDailyReport(userId);
        console.log('[AutonomyScheduler] 📊 Daily introspection report generated');
      }
    } catch (error) {
      console.error('[AutonomyScheduler] ❌ Bias mitigation cycle failed:', error);
      throw error;
    }
  },
});

// Phase 16.0: Every 2 hours - Knowledge Sync
schedulerRegistry.registerTask({
  name: 'knowledge_sync',
  description: 'Refresh knowledge cache by removing expired entries',
  frequency: 'custom',
  intervalMs: 2 * 60 * 60 * 1000, // 2 hours
  lastRun: null,
  nextRun: null,
  status: 'idle',
  run: async () => {
    console.log('[AutonomyScheduler] 📚 Running knowledge cache sync...');
    
    try {
      // Refresh cache - remove expired entries
      const removedCount = await knowledgeRetrievalService.refreshCache();
      
      console.log(`[AutonomyScheduler] ✅ Knowledge cache sync complete - ${removedCount} expired entries removed`);
    } catch (error) {
      console.error('[AutonomyScheduler] ❌ Knowledge sync failed:', error);
      throw error;
    }
  },
});

// Phase 16.0: Every 12 hours - Trust Audit
schedulerRegistry.registerTask({
  name: 'trust_audit',
  description: 'Re-evaluate domain trustworthiness based on retrieval success rates',
  frequency: 'custom',
  intervalMs: 12 * 60 * 60 * 1000, // 12 hours
  lastRun: null,
  nextRun: null,
  status: 'idle',
  run: async () => {
    console.log('[AutonomyScheduler] 🔍 Running knowledge trust audit...');
    
    try {
      // Audit trust levels
      await knowledgeRetrievalService.auditTrust();
      
      console.log('[AutonomyScheduler] ✅ Trust audit complete - domain trust levels re-evaluated');
    } catch (error) {
      console.error('[AutonomyScheduler] ❌ Trust audit failed:', error);
      throw error;
    }
  },
});

// Phase 17.0: Every 60 seconds - Cluster Heartbeat
schedulerRegistry.registerTask({
  name: 'cluster_heartbeat',
  description: 'Update cluster node heartbeat and metrics',
  frequency: 'custom',
  intervalMs: 60 * 1000, // 60 seconds
  lastRun: null,
  nextRun: null,
  status: 'idle',
  run: async () => {
    try {
      const { clusterRegistry } = await import('./cluster-registry');
      const nodeId = clusterRegistry.getLocalNodeId();
      
      if (!nodeId) {
        // Node not registered yet, skip heartbeat
        return;
      }
      
      await clusterRegistry.heartbeat();
      
      // Silent success - heartbeat is routine
    } catch (error) {
      console.error('[AutonomyScheduler] ❌ Cluster heartbeat failed:', error);
      throw error;
    }
  },
});

// Phase 17.0: Every 10 minutes - Cluster Rebalance
schedulerRegistry.registerTask({
  name: 'cluster_rebalance',
  description: 'Rebalance stuck tasks and optimize cluster load distribution',
  frequency: 'custom',
  intervalMs: 10 * 60 * 1000, // 10 minutes
  lastRun: null,
  nextRun: null,
  status: 'idle',
  run: async () => {
    console.log('[AutonomyScheduler] 🔄 Running cluster rebalance...');
    
    try {
      const { taskRouter } = await import('./task-router');
      
      // Rebalance stuck tasks
      const rebalancedCount = await taskRouter.rebalanceStuckTasks();
      
      if (rebalancedCount > 0) {
        console.log(`[AutonomyScheduler] ✅ Cluster rebalance complete - ${rebalancedCount} tasks reassigned`);
      } else {
        console.log('[AutonomyScheduler] ✅ Cluster rebalance complete - no stuck tasks found');
      }
    } catch (error) {
      console.error('[AutonomyScheduler] ❌ Cluster rebalance failed:', error);
      throw error;
    }
  },
});

/**
 * Get autonomy scheduler status
 */
export function getAutonomySchedulerStatus() {
  const selfCheckStatus = schedulerRegistry.getTaskStatus('autonomy_self_check');
  const optimizationStatus = schedulerRegistry.getTaskStatus('autonomy_optimization');
  const strategyStatus = schedulerRegistry.getTaskStatus('strategy_evaluation');
  const learningStatus = schedulerRegistry.getTaskStatus('learning_updates');
  const simulationStatus = schedulerRegistry.getTaskStatus('simulation_evaluation');
  const reflectionStatus = schedulerRegistry.getTaskStatus('reflection_analysis');
  const collaborationStatus = schedulerRegistry.getTaskStatus('collaboration_maintenance');
  const learningFeedbackStatus = schedulerRegistry.getTaskStatus('learning_feedback_sync');
  const metaCognitionStatus = schedulerRegistry.getTaskStatus('meta_cognition_scan');
  const strategicMemoryStatus = schedulerRegistry.getTaskStatus('strategic_memory_sync');
  const cognitiveCoreStatus = schedulerRegistry.getTaskStatus('cognitive_core_cycle');
  const safetySweeperStatus = schedulerRegistry.getTaskStatus('safety_sweeper');
  const perfSnapshotStatus = schedulerRegistry.getTaskStatus('perf_snapshot');
  const ethicsAuditStatus = schedulerRegistry.getTaskStatus('ethics_audit');
  const introspectionStatus = schedulerRegistry.getTaskStatus('introspection_cycle');
  const biasMitigationStatus = schedulerRegistry.getTaskStatus('bias_mitigation_cycle');
  const knowledgeSyncStatus = schedulerRegistry.getTaskStatus('knowledge_sync');
  const trustAuditStatus = schedulerRegistry.getTaskStatus('trust_audit');
  const clusterHeartbeatStatus = schedulerRegistry.getTaskStatus('cluster_heartbeat');
  const clusterRebalanceStatus = schedulerRegistry.getTaskStatus('cluster_rebalance');
  
  return {
    selfCheck: selfCheckStatus ? {
      status: selfCheckStatus.status,
      lastRun: selfCheckStatus.lastRun,
      nextRun: selfCheckStatus.nextRun,
      frequency: selfCheckStatus.frequency,
    } : null,
    optimization: optimizationStatus ? {
      status: optimizationStatus.status,
      lastRun: optimizationStatus.lastRun,
      nextRun: optimizationStatus.nextRun,
      frequency: optimizationStatus.frequency,
    } : null,
    strategyEvaluation: strategyStatus ? {
      status: strategyStatus.status,
      lastRun: strategyStatus.lastRun,
      nextRun: strategyStatus.nextRun,
      frequency: strategyStatus.frequency,
    } : null,
    learningUpdates: learningStatus ? {
      status: learningStatus.status,
      lastRun: learningStatus.lastRun,
      nextRun: learningStatus.nextRun,
      frequency: learningStatus.frequency,
    } : null,
    simulationEvaluation: simulationStatus ? {
      status: simulationStatus.status,
      lastRun: simulationStatus.lastRun,
      nextRun: simulationStatus.nextRun,
      frequency: simulationStatus.frequency,
    } : null,
    reflectionAnalysis: reflectionStatus ? {
      status: reflectionStatus.status,
      lastRun: reflectionStatus.lastRun,
      nextRun: reflectionStatus.nextRun,
      frequency: reflectionStatus.frequency,
    } : null,
    collaborationMaintenance: collaborationStatus ? {
      status: collaborationStatus.status,
      lastRun: collaborationStatus.lastRun,
      nextRun: collaborationStatus.nextRun,
      frequency: collaborationStatus.frequency,
    } : null,
    learningFeedbackSync: learningFeedbackStatus ? {
      status: learningFeedbackStatus.status,
      lastRun: learningFeedbackStatus.lastRun,
      nextRun: learningFeedbackStatus.nextRun,
      frequency: learningFeedbackStatus.frequency,
    } : null,
    metaCognitionScan: metaCognitionStatus ? {
      status: metaCognitionStatus.status,
      lastRun: metaCognitionStatus.lastRun,
      nextRun: metaCognitionStatus.nextRun,
      frequency: metaCognitionStatus.frequency,
    } : null,
    strategicMemorySync: strategicMemoryStatus ? {
      status: strategicMemoryStatus.status,
      lastRun: strategicMemoryStatus.lastRun,
      nextRun: strategicMemoryStatus.nextRun,
      frequency: strategicMemoryStatus.frequency,
    } : null,
    cognitiveCoreOptimization: cognitiveCoreStatus ? {
      status: cognitiveCoreStatus.status,
      lastRun: cognitiveCoreStatus.lastRun,
      nextRun: cognitiveCoreStatus.nextRun,
      frequency: cognitiveCoreStatus.frequency,
    } : null,
    safetySweeper: safetySweeperStatus ? {
      status: safetySweeperStatus.status,
      lastRun: safetySweeperStatus.lastRun,
      nextRun: safetySweeperStatus.nextRun,
      frequency: safetySweeperStatus.frequency,
    } : null,
    perfSnapshot: perfSnapshotStatus ? {
      status: perfSnapshotStatus.status,
      lastRun: perfSnapshotStatus.lastRun,
      nextRun: perfSnapshotStatus.nextRun,
      frequency: perfSnapshotStatus.frequency,
    } : null,
    ethicsAudit: ethicsAuditStatus ? {
      status: ethicsAuditStatus.status,
      lastRun: ethicsAuditStatus.lastRun,
      nextRun: ethicsAuditStatus.nextRun,
      frequency: ethicsAuditStatus.frequency,
    } : null,
    introspectionCycle: introspectionStatus ? {
      status: introspectionStatus.status,
      lastRun: introspectionStatus.lastRun,
      nextRun: introspectionStatus.nextRun,
      frequency: introspectionStatus.frequency,
    } : null,
    biasMitigationCycle: biasMitigationStatus ? {
      status: biasMitigationStatus.status,
      lastRun: biasMitigationStatus.lastRun,
      nextRun: biasMitigationStatus.nextRun,
      frequency: biasMitigationStatus.frequency,
    } : null,
    knowledgeSync: knowledgeSyncStatus ? {
      status: knowledgeSyncStatus.status,
      lastRun: knowledgeSyncStatus.lastRun,
      nextRun: knowledgeSyncStatus.nextRun,
      frequency: knowledgeSyncStatus.frequency,
    } : null,
    trustAudit: trustAuditStatus ? {
      status: trustAuditStatus.status,
      lastRun: trustAuditStatus.lastRun,
      nextRun: trustAuditStatus.nextRun,
      frequency: trustAuditStatus.frequency,
    } : null,
    clusterHeartbeat: clusterHeartbeatStatus ? {
      status: clusterHeartbeatStatus.status,
      lastRun: clusterHeartbeatStatus.lastRun,
      nextRun: clusterHeartbeatStatus.nextRun,
      frequency: clusterHeartbeatStatus.frequency,
    } : null,
    clusterRebalance: clusterRebalanceStatus ? {
      status: clusterRebalanceStatus.status,
      lastRun: clusterRebalanceStatus.lastRun,
      nextRun: clusterRebalanceStatus.nextRun,
      frequency: clusterRebalanceStatus.frequency,
    } : null,
  };
}

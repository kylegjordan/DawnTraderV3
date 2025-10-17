import { schedulerRegistry } from './scheduler-registry';
import { autonomyController } from './autonomy-controller';
import { selfOptimizer } from './self-optimizer';
import { strategicPlannerService } from './strategic-planner';
import { continuousLearningEngine } from './continuous-learning';
import { db } from '../db';
import { users } from '@shared/schema';
import { eq } from 'drizzle-orm';

/**
 * Phase 8.9: Autonomy Layer Scheduler
 * Registers autonomous self-check and optimization tasks
 */

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

/**
 * Initialize autonomy scheduler
 * Starts hourly self-checks, daily optimization, and Phase 9.2 strategic tasks
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
    
    console.log('[AutonomyScheduler] ✅ Autonomy scheduler initialized');
    console.log('[AutonomyScheduler] - Self-checks: Every hour');
    console.log('[AutonomyScheduler] - Optimization: Every 24 hours');
    console.log('[AutonomyScheduler] - Strategy evaluation: Every 3 hours');
    console.log('[AutonomyScheduler] - Learning updates: Every 6 hours');
  } catch (error) {
    console.error('[AutonomyScheduler] ❌ Failed to initialize:', error);
    throw error;
  }
}

/**
 * Get autonomy scheduler status
 */
export function getAutonomySchedulerStatus() {
  const selfCheckStatus = schedulerRegistry.getTaskStatus('autonomy_self_check');
  const optimizationStatus = schedulerRegistry.getTaskStatus('autonomy_optimization');
  const strategyStatus = schedulerRegistry.getTaskStatus('strategy_evaluation');
  const learningStatus = schedulerRegistry.getTaskStatus('learning_updates');
  
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
  };
}

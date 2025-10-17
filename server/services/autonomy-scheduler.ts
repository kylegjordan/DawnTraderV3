import { schedulerRegistry } from './scheduler-registry';
import { autonomyController } from './autonomy-controller';
import { selfOptimizer } from './self-optimizer';
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

/**
 * Initialize autonomy scheduler
 * Starts hourly self-checks and daily optimization
 */
export async function initAutonomyScheduler() {
  console.log('[AutonomyScheduler] 🚀 Initializing autonomy scheduler...');
  
  try {
    // Start hourly self-check (run immediately)
    await schedulerRegistry.startTask('autonomy_self_check', true);
    
    // Start daily optimization (run after 1 hour delay)
    await schedulerRegistry.startTask('autonomy_optimization', false);
    
    console.log('[AutonomyScheduler] ✅ Autonomy scheduler initialized');
    console.log('[AutonomyScheduler] - Self-checks: Every hour');
    console.log('[AutonomyScheduler] - Optimization: Every 24 hours');
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
  };
}

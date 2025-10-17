/**
 * Phase 8.94: Awareness Scheduler
 * 
 * Schedules periodic awareness updates and deep reflections
 * - Every hour: Update awareness state
 * - Every 6 hours: Run deep self-reflection (reflectAndRespond)
 */

import cron, { type ScheduledTask } from 'node-cron';
import { awarenessCore } from './awareness-core';

let stateUpdateTask: ScheduledTask | null = null;
let reflectionTask: ScheduledTask | null = null;

/**
 * Initialize awareness scheduler
 * Registers hourly state updates and 6-hour reflections
 */
export function initializeAwarenessScheduler() {
  console.log('[AwarenessScheduler] 🧭 Initializing awareness scheduler...');
  
  // Every hour: Update awareness state
  stateUpdateTask = cron.schedule('0 * * * *', async () => {
    console.log('[AwarenessScheduler] ⏰ Hourly awareness state update triggered');
    try {
      await awarenessCore.updateAwarenessState();
      console.log('[AwarenessScheduler] ✅ Hourly state update complete');
    } catch (error) {
      console.error('[AwarenessScheduler] ❌ Hourly state update failed:', error);
    }
  });
  
  // Every 6 hours: Run deep self-reflection
  reflectionTask = cron.schedule('0 */6 * * *', async () => {
    console.log('[AwarenessScheduler] ⏰ 6-hour deep reflection triggered');
    try {
      const reflection = await awarenessCore.reflectAndRespond();
      console.log(`[AwarenessScheduler] ✅ Reflection complete - ${reflection.patterns.length} patterns, ${reflection.insights.length} insights`);
    } catch (error) {
      console.error('[AwarenessScheduler] ❌ Reflection failed:', error);
    }
  });
  
  console.log('[AwarenessScheduler] ✅ Awareness scheduler initialized');
  console.log('[AwarenessScheduler] 📅 Hourly state updates scheduled (0 * * * *)');
  console.log('[AwarenessScheduler] 📅 6-hour reflections scheduled (0 */6 * * *)');
  
  // Run initial state update on startup
  setTimeout(async () => {
    console.log('[AwarenessScheduler] 🚀 Running initial awareness state update...');
    try {
      await awarenessCore.updateAwarenessState();
      console.log('[AwarenessScheduler] ✅ Initial state update complete');
    } catch (error) {
      console.error('[AwarenessScheduler] ❌ Initial state update failed:', error);
    }
  }, 5000); // Wait 5 seconds after startup
}

/**
 * Stop awareness scheduler
 */
export function stopAwarenessScheduler() {
  console.log('[AwarenessScheduler] 🛑 Stopping awareness scheduler...');
  
  if (stateUpdateTask) {
    stateUpdateTask.stop();
    stateUpdateTask = null;
  }
  
  if (reflectionTask) {
    reflectionTask.stop();
    reflectionTask = null;
  }
  
  console.log('[AwarenessScheduler] ✅ Awareness scheduler stopped');
}

/**
 * Get awareness scheduler status
 */
export function getAwarenessSchedulerStatus() {
  return {
    stateUpdateActive: stateUpdateTask !== null,
    reflectionActive: reflectionTask !== null,
    schedules: {
      stateUpdate: 'Every hour (0 * * * *)',
      reflection: 'Every 6 hours (0 */6 * * *)',
    },
  };
}

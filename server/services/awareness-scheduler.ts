/**
 * Phase 8.94: Awareness Scheduler
 * 
 * Schedules periodic awareness updates and deep reflections
 * - Every hour: Update awareness state
 * - Every 6 hours: Run deep self-reflection (reflectAndRespond)
 */

import cron, { type ScheduledTask } from 'node-cron';
import { awarenessCore } from './awareness-core';
// B-NEW-49 (2026-05-31): cron-registry + fire-evidence wiring per scope §1.5.
import { cronRegistry } from './cron-registry.js';
import { logCronArm } from './cron-arm-logger.js';
import { scheduledJobsAudit } from './scheduled-jobs-audit.js';

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
    // B-NEW-49: fire-evidence write to scheduled_tasks_audit (in addition
    // to the awareness_state_log row written by updateAwarenessState).
    const firedAt = new Date();
    const startMs = firedAt.getTime();
    let status: 'success' | 'error' = 'success';
    let errorMessage: string | undefined;
    try {
      await awarenessCore.updateAwarenessState();
      console.log('[AwarenessScheduler] ✅ Hourly state update complete');
    } catch (error) {
      status = 'error';
      errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[AwarenessScheduler] ❌ Hourly state update failed:', error);
    } finally {
      await scheduledJobsAudit.writeFireRow({
        jobName: 'awareness_state_update_cron',
        scheduledFor: firedAt,
        firedAt,
        status,
        errorMessage,
        meta: { trigger_source: 'cron', duration_ms: Date.now() - startMs },
      });
    }
  });

  // Every 6 hours: Run deep self-reflection
  reflectionTask = cron.schedule('0 */6 * * *', async () => {
    console.log('[AwarenessScheduler] ⏰ 6-hour deep reflection triggered');
    const firedAt = new Date();
    const startMs = firedAt.getTime();
    let status: 'success' | 'error' = 'success';
    let errorMessage: string | undefined;
    try {
      const reflection = await awarenessCore.reflectAndRespond();
      console.log(`[AwarenessScheduler] ✅ Reflection complete - ${reflection.patterns.length} patterns, ${reflection.insights.length} insights`);
    } catch (error) {
      status = 'error';
      errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[AwarenessScheduler] ❌ Reflection failed:', error);
    } finally {
      await scheduledJobsAudit.writeFireRow({
        jobName: 'awareness_reflection_cron',
        scheduledFor: firedAt,
        firedAt,
        status,
        errorMessage,
        meta: { trigger_source: 'cron', duration_ms: Date.now() - startMs },
      });
    }
  });

  console.log('[AwarenessScheduler] ✅ Awareness scheduler initialized');
  console.log('[AwarenessScheduler] 📅 Hourly state updates scheduled (0 * * * *)');
  console.log('[AwarenessScheduler] 📅 6-hour reflections scheduled (0 */6 * * *)');

  // B-NEW-49: register both schedules with cron-registry + emit arm-logger.
  cronRegistry.register({
    name: 'awareness_state_update_cron',
    task: stateUpdateTask,
    expression: '0 * * * *',
    timezone: 'UTC',
    intervalSeconds: 3600,  // hourly
    enabled: true,
  });
  logCronArm(cronRegistry.get('awareness_state_update_cron')!);

  cronRegistry.register({
    name: 'awareness_reflection_cron',
    task: reflectionTask,
    expression: '0 */6 * * *',
    timezone: 'UTC',
    intervalSeconds: 21600,  // 6h
    enabled: true,
  });
  logCronArm(cronRegistry.get('awareness_reflection_cron')!);
  
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

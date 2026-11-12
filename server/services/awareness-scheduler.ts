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
import { cronOccurrenceRunner } from './cron-occurrence-runner.js';

const STATE_JOB = 'awareness_state_update_cron';
const REFLECTION_JOB = 'awareness_reflection_cron';

let stateUpdateTask: ScheduledTask | null = null;
let reflectionTask: ScheduledTask | null = null;

/**
 * Initialize awareness scheduler
 * Registers hourly state updates and 6-hour reflections
 */
export async function initializeAwarenessScheduler(): Promise<void> {
  console.log('[AwarenessScheduler] 🧭 Initializing awareness scheduler...');

  // Every hour: Update awareness state
  stateUpdateTask = cron.createTask('0 * * * *', async (context) => {
    await cronOccurrenceRunner.runNatural(STATE_JOB, context.date);
  });

  // Every 6 hours: Run deep self-reflection
  reflectionTask = cron.createTask('0 */6 * * *', async (context) => {
    await cronOccurrenceRunner.runNatural(REFLECTION_JOB, context.date);
  });

  // B-NEW-49: register both schedules with cron-registry + emit arm-logger.
  cronRegistry.register({
    name: STATE_JOB,
    task: stateUpdateTask,
    expression: '0 * * * *',
    timezone: 'UTC',
    intervalSeconds: 3600,  // hourly
    enabled: true,
    recovery: {
      policyKey: STATE_JOB,
      run: async () => {
        console.log('[AwarenessScheduler] ⏰ Hourly awareness state update triggered');
        await awarenessCore.updateAwarenessState();
        console.log('[AwarenessScheduler] ✅ Hourly state update complete');
      },
    },
  });
  stateUpdateTask.on('execution:missed', (context) => {
    cronOccurrenceRunner.dispatchMissed(STATE_JOB, context.date);
  });

  cronRegistry.register({
    name: REFLECTION_JOB,
    task: reflectionTask,
    expression: '0 */6 * * *',
    timezone: 'UTC',
    intervalSeconds: 21600,  // 6h
    enabled: true,
    recovery: {
      policyKey: REFLECTION_JOB,
      run: async () => {
        console.log('[AwarenessScheduler] ⏰ 6-hour deep reflection triggered');
        const reflection = await awarenessCore.reflectAndRespond();
        console.log(`[AwarenessScheduler] ✅ Reflection complete - ${reflection.patterns.length} patterns, ${reflection.insights.length} insights`);
        return { meta: { patterns: reflection.patterns.length, insights: reflection.insights.length } };
      },
    },
  });
  reflectionTask.on('execution:missed', (context) => {
    cronOccurrenceRunner.dispatchMissed(REFLECTION_JOB, context.date);
  });
  await cronOccurrenceRunner.prepareJob(STATE_JOB);
  await cronOccurrenceRunner.prepareJob(REFLECTION_JOB);
  stateUpdateTask.start();
  reflectionTask.start();
  console.log('[AwarenessScheduler] ✅ Awareness scheduler initialized after startup reconciliation');
  console.log('[AwarenessScheduler] 📅 Hourly state updates scheduled (0 * * * *)');
  console.log('[AwarenessScheduler] 📅 6-hour reflections scheduled (0 */6 * * *)');
  logCronArm(cronRegistry.get(STATE_JOB)!);
  logCronArm(cronRegistry.get(REFLECTION_JOB)!);
  
  // Run initial state update on startup
  setTimeout(async () => {
    console.log('[AwarenessScheduler] 🚀 Running initial awareness state update...');
    try {
      await cronOccurrenceRunner.runAuxiliary(STATE_JOB, 'boot', () => awarenessCore.updateAwarenessState());
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

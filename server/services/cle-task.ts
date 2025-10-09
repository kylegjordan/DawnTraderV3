// server/services/cle-task.ts
// Continuous Learning Engine autonomous task

import { cleOrchestratorService } from './cle-orchestrator';
import { ScheduledTask } from './scheduler-registry';

export class CLETask implements Omit<ScheduledTask, 'lastRun' | 'nextRun' | 'status'> {
  name = 'Continuous Learning';
  description = 'Autonomous learning cycle for filter optimization and confidence tracking';
  frequency = 'Every 1 hour';
  intervalMs = 1 * 60 * 60 * 1000; // 1 hour

  async run(): Promise<void> {
    console.log('[CLETask] Starting Continuous Learning Engine cycle...');

    try {
      // Run a single learning cycle
      // The scheduler registry handles the interval timing
      await cleOrchestratorService['runLearningCycle']();

      console.log('[CLETask] Continuous Learning cycle complete');
    } catch (error) {
      console.error('[CLETask] Error during learning cycle:', error);
      throw error;
    }
  }
}

export const cleTask = new CLETask();

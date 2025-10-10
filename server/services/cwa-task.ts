// server/services/cwa-task.ts
// Cognitive Weight Adjuster autonomous task

import { cognitiveWeightAdjuster } from './cognitive-weight-adjuster';
import { ScheduledTask } from './scheduler-registry';
import { storage } from '../storage';

export class CWATask implements Omit<ScheduledTask, 'lastRun' | 'nextRun' | 'status'> {
  name = 'Intelligence Refinement';
  description = 'Reviews prediction outcomes and adjusts learning source weights for confidence optimization';
  frequency = 'Every 6 hours';
  intervalMs = 6 * 60 * 60 * 1000; // 6 hours

  async run(): Promise<void> {
    console.log('[CWATask] Starting Intelligence Refinement cycle...');

    try {
      // Get all users
      const users = await storage.getAllUsers();

      for (const user of users) {
        console.log(`[CWATask] Running refinement for user ${user.username}...`);
        
        // Adjust weights based on recent prediction outcomes
        await cognitiveWeightAdjuster.adjustWeights(user.id);
        
        console.log(`[CWATask] Refinement complete for user ${user.username}`);
      }

      console.log('[CWATask] Intelligence Refinement cycle complete');
    } catch (error) {
      console.error('[CWATask] Error during refinement cycle:', error);
      throw error;
    }
  }
}

export const cwaTask = new CWATask();

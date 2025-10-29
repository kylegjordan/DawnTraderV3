// server/services/scheduler-registry.ts
// Centralized registry for all autonomous schedulers

import { storage } from '../storage';

export interface ScheduledTask {
  name: string;
  description: string;
  frequency: string;
  lastRun: Date | null;
  nextRun: Date | null;
  status: 'running' | 'idle' | 'error';
  intervalMs: number;
  run: () => Promise<void>;
  getInitialDelay?: () => number; // Optional: calculate custom initial delay (ms)
}

export class SchedulerRegistry {
  private tasks: Map<string, ScheduledTask> = new Map();
  private intervals: Map<string, NodeJS.Timeout> = new Map();

  registerTask(task: ScheduledTask): void {
    this.tasks.set(task.name, task);
  }

  async startTask(taskName: string, runImmediately = false): Promise<void> {
    const task = this.tasks.get(taskName);
    if (!task) {
      throw new Error(`Task ${taskName} not found in registry`);
    }

    // Calculate initial delay
    const initialDelay = runImmediately ? 0 : (task.getInitialDelay?.() ?? task.intervalMs);
    
    // Log initial delay for tasks with custom scheduling
    if (task.getInitialDelay && !runImmediately) {
      const nextRunTime = new Date(Date.now() + initialDelay);
      console.log(`[SchedulerRegistry] ${taskName} scheduled for ${nextRunTime.toISOString()} (${Math.round(initialDelay / 1000 / 60)} minutes)`);
    }

    // Schedule first run
    setTimeout(async () => {
      await this.executeTask(taskName);
    }, initialDelay);

    // Schedule recurring execution
    const intervalId = setInterval(async () => {
      await this.executeTask(taskName);
    }, task.intervalMs);

    this.intervals.set(taskName, intervalId);
  }

  async startAllTasks(): Promise<void> {
    // Start all tasks in parallel without blocking
    const startPromises = Array.from(this.tasks.keys()).map(taskName => 
      this.startTask(taskName, false).catch(err => {
        console.error(`[SchedulerRegistry] Error starting ${taskName}:`, err);
      })
    );
    
    await Promise.all(startPromises);
  }

  async executeTask(taskName: string): Promise<void> {
    const task = this.tasks.get(taskName);
    if (!task) {
      throw new Error(`Task ${taskName} not found in registry`);
    }

    const startTime = Date.now();
    const executedAt = new Date();
    
    try {
      task.status = 'running';
      task.lastRun = executedAt;
      
      await task.run();
      
      const duration = (Date.now() - startTime) / 1000; // in seconds
      task.status = 'idle';
      task.nextRun = new Date(Date.now() + task.intervalMs);

      // Log to transparency log
      await storage.createTransparencyLog({
        taskName: task.name,
        duration: duration.toString(),
        resultSummary: `Task completed successfully`,
        success: true,
        notes: `Frequency: ${task.frequency}`
      });

    } catch (error) {
      const duration = (Date.now() - startTime) / 1000;
      task.status = 'error';
      task.nextRun = new Date(Date.now() + task.intervalMs);

      // Log error to transparency log
      await storage.createTransparencyLog({
        taskName: task.name,
        duration: duration.toString(),
        resultSummary: `Task failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        success: false,
        notes: `Error: ${error instanceof Error ? error.stack : String(error)}`
      });

      console.error(`[SchedulerRegistry] Error executing task ${taskName}:`, error);
    }
  }

  stopTask(taskName: string): void {
    const intervalId = this.intervals.get(taskName);
    if (intervalId) {
      clearInterval(intervalId);
      this.intervals.delete(taskName);
    }
  }

  stopAllTasks(): void {
    for (const taskName of this.intervals.keys()) {
      this.stopTask(taskName);
    }
  }

  getTaskStatus(taskName: string): ScheduledTask | undefined {
    return this.tasks.get(taskName);
  }

  getAllTaskStatuses(): ScheduledTask[] {
    return Array.from(this.tasks.values());
  }
}

export const schedulerRegistry = new SchedulerRegistry();

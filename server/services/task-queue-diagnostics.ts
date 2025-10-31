/**
 * Phase 35.3.C: Task Queue Reliability Diagnostic Logger
 * Tracks every engine task from submission to confirmation for reliability testing
 */

import * as fs from 'fs';
import * as path from 'path';

interface TaskEvent {
  taskId: string;
  event: 'enqueued' | 'locked' | 'completed' | 'failed';
  timestamp: number;
  taskType?: string;
  executionTime?: number;
  error?: string;
}

class TaskQueueDiagnostics {
  private enabled: boolean = false;
  private events: TaskEvent[] = [];
  private taskTimings: Map<string, number> = new Map(); // taskId -> enqueue timestamp
  private simulationStartTime: number = 0;

  /**
   * Start diagnostic logging session
   */
  start(): void {
    this.enabled = true;
    this.events = [];
    this.taskTimings.clear();
    this.simulationStartTime = Date.now();
    console.log('[35.3][DIAG] Task queue diagnostics enabled');
  }

  /**
   * Stop diagnostic logging session
   */
  stop(): void {
    this.enabled = false;
    console.log('[35.3][DIAG] Task queue diagnostics disabled');
  }

  /**
   * Log task enqueued event
   */
  logEnqueued(taskId: string, taskType: string): void {
    if (!this.enabled) return;
    
    const timestamp = Date.now();
    this.taskTimings.set(taskId, timestamp);
    this.events.push({
      taskId,
      event: 'enqueued',
      timestamp,
      taskType
    });
    console.log(`[35.3][QUEUE] ENQUEUED: ${taskId} (${taskType}) at +${timestamp - this.simulationStartTime}ms`);
  }

  /**
   * Log task locked event (picked up for execution)
   */
  logLocked(taskId: string): void {
    if (!this.enabled) return;
    
    const timestamp = Date.now();
    this.events.push({
      taskId,
      event: 'locked',
      timestamp
    });
    
    const enqueueTime = this.taskTimings.get(taskId);
    if (enqueueTime) {
      const waitTime = timestamp - enqueueTime;
      console.log(`[35.3][QUEUE] LOCKED: ${taskId} (waited ${waitTime}ms)`);
    }
  }

  /**
   * Log task completed event
   */
  logCompleted(taskId: string): void {
    if (!this.enabled) return;
    
    const timestamp = Date.now();
    const enqueueTime = this.taskTimings.get(taskId);
    const executionTime = enqueueTime ? timestamp - enqueueTime : 0;
    
    this.events.push({
      taskId,
      event: 'completed',
      timestamp,
      executionTime
    });
    
    console.log(`[35.3][QUEUE] COMPLETED: ${taskId} (total time: ${executionTime}ms)`);
  }

  /**
   * Log task failed event
   */
  logFailed(taskId: string, error: string): void {
    if (!this.enabled) return;
    
    const timestamp = Date.now();
    const enqueueTime = this.taskTimings.get(taskId);
    const executionTime = enqueueTime ? timestamp - enqueueTime : 0;
    
    this.events.push({
      taskId,
      event: 'failed',
      timestamp,
      executionTime,
      error
    });
    
    console.log(`[35.3][QUEUE] FAILED: ${taskId} (error: ${error})`);
  }

  /**
   * Generate diagnostic report
   */
  generateReport(): string {
    if (!this.enabled && this.events.length === 0) {
      return 'No diagnostic data available. Start diagnostics first.';
    }

    const totalDuration = Date.now() - this.simulationStartTime;
    
    // Group events by taskId
    const taskGroups = new Map<string, TaskEvent[]>();
    for (const event of this.events) {
      if (!taskGroups.has(event.taskId)) {
        taskGroups.set(event.taskId, []);
      }
      taskGroups.get(event.taskId)!.push(event);
    }

    // Analyze task completion
    const totalTasks = taskGroups.size;
    const completedTasks = Array.from(taskGroups.values()).filter(events => 
      events.some(e => e.event === 'completed')
    ).length;
    const failedTasks = Array.from(taskGroups.values()).filter(events => 
      events.some(e => e.event === 'failed')
    ).length;
    const incompleteTasks = totalTasks - completedTasks - failedTasks;

    // Calculate execution times
    const executionTimes = this.events
      .filter(e => e.event === 'completed' && e.executionTime)
      .map(e => e.executionTime!);
    
    const avgExecutionTime = executionTimes.length > 0
      ? executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length
      : 0;
    
    const maxExecutionTime = executionTimes.length > 0
      ? Math.max(...executionTimes)
      : 0;
    
    const minExecutionTime = executionTimes.length > 0
      ? Math.min(...executionTimes)
      : 0;

    // Detect duplicates
    const duplicates: string[] = [];
    const seenTasks = new Set<string>();
    for (const event of this.events.filter(e => e.event === 'enqueued')) {
      if (seenTasks.has(event.taskId)) {
        duplicates.push(event.taskId);
      }
      seenTasks.add(event.taskId);
    }

    // Generate report
    let report = `# Phase 35.3 - Task Queue Reliability Simulation\n\n`;
    report += `**Test Duration:** ${(totalDuration / 1000).toFixed(2)}s (${(totalDuration / 60000).toFixed(2)} minutes)\n`;
    report += `**Simulation Start:** ${new Date(this.simulationStartTime).toISOString()}\n`;
    report += `**Simulation End:** ${new Date().toISOString()}\n\n`;
    
    report += `## Task Completion Summary\n\n`;
    report += `- **Total Tasks:** ${totalTasks}\n`;
    report += `- **Completed:** ${completedTasks} (${((completedTasks / totalTasks) * 100).toFixed(2)}%)\n`;
    report += `- **Failed:** ${failedTasks} (${((failedTasks / totalTasks) * 100).toFixed(2)}%)\n`;
    report += `- **Incomplete:** ${incompleteTasks} (${((incompleteTasks / totalTasks) * 100).toFixed(2)}%)\n\n`;
    
    report += `## Execution Performance\n\n`;
    report += `- **Average Execution Time:** ${avgExecutionTime.toFixed(2)}ms\n`;
    report += `- **Min Execution Time:** ${minExecutionTime.toFixed(2)}ms\n`;
    report += `- **Max Execution Time:** ${maxExecutionTime.toFixed(2)}ms\n`;
    report += `- **Target Avg:** ≤ 200ms\n`;
    report += `- **Performance Status:** ${avgExecutionTime <= 200 ? '✅ PASS' : '❌ FAIL'}\n\n`;
    
    report += `## Reliability Checks\n\n`;
    report += `- **Duplicate Tasks:** ${duplicates.length}\n`;
    report += `- **Dropped Tasks:** ${incompleteTasks} (enqueued but never completed/failed)\n`;
    report += `- **Completion Rate Target:** 100%\n`;
    report += `- **Actual Completion Rate:** ${((completedTasks / totalTasks) * 100).toFixed(2)}%\n`;
    report += `- **Reliability Status:** ${completedTasks === totalTasks && duplicates.length === 0 ? '✅ PASS' : '❌ FAIL'}\n\n`;
    
    if (duplicates.length > 0) {
      report += `### Duplicate Task IDs\n\n`;
      duplicates.forEach(id => {
        report += `- ${id}\n`;
      });
      report += `\n`;
    }
    
    if (incompleteTasks > 0) {
      report += `### Incomplete Task IDs\n\n`;
      Array.from(taskGroups.entries())
        .filter(([_, events]) => !events.some(e => e.event === 'completed' || e.event === 'failed'))
        .forEach(([taskId, _]) => {
          report += `- ${taskId}\n`;
        });
      report += `\n`;
    }
    
    report += `## Event Log (First 20)\n\n`;
    report += `| Task ID | Event | Timestamp | Execution Time | Type |\n`;
    report += `|---------|-------|-----------|----------------|------|\n`;
    
    const displayEvents = this.events.slice(0, 20);
    displayEvents.forEach(event => {
      const relativeTime = `+${event.timestamp - this.simulationStartTime}ms`;
      const execTime = event.executionTime ? `${event.executionTime}ms` : '-';
      const taskType = event.taskType || '-';
      report += `| ${event.taskId.substring(0, 8)}... | ${event.event} | ${relativeTime} | ${execTime} | ${taskType} |\n`;
    });
    
    if (this.events.length > 20) {
      report += `\n*Showing first 20 of ${this.events.length} total events*\n`;
    }
    
    report += `\n## Validation Results\n\n`;
    const allPassed = (
      completedTasks === totalTasks &&
      duplicates.length === 0 &&
      avgExecutionTime <= 200
    );
    
    report += `- **100% Task Completion:** ${completedTasks === totalTasks ? '✅' : '❌'}\n`;
    report += `- **No Duplicates:** ${duplicates.length === 0 ? '✅' : '❌'}\n`;
    report += `- **No Drops:** ${incompleteTasks === 0 ? '✅' : '❌'}\n`;
    report += `- **Avg Execution ≤ 200ms:** ${avgExecutionTime <= 200 ? '✅' : '❌'}\n\n`;
    
    report += `**Overall Status:** ${allPassed ? '✅ PASS' : '❌ FAIL'}\n`;
    
    return report;
  }

  /**
   * Save report to file
   */
  async saveReport(filename: string = 'phase-35.3-task-queue-simulation.md'): Promise<void> {
    const report = this.generateReport();
    const reportPath = path.join(process.cwd(), 'diagnostic-reports', filename);
    
    // Ensure directory exists
    const dir = path.dirname(reportPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(reportPath, report, 'utf-8');
    console.log(`[35.3][DIAG] Report saved to ${reportPath}`);
  }

  /**
   * Get current stats (for real-time monitoring)
   */
  getStats(): any {
    const totalTasks = new Set(this.events.map(e => e.taskId)).size;
    const completedTasks = this.events.filter(e => e.event === 'completed').length;
    const failedTasks = this.events.filter(e => e.event === 'failed').length;
    
    const executionTimes = this.events
      .filter(e => e.event === 'completed' && e.executionTime)
      .map(e => e.executionTime!);
    
    const avgExecutionTime = executionTimes.length > 0
      ? executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length
      : 0;

    return {
      totalTasks,
      completedTasks,
      failedTasks,
      incompleteTasks: totalTasks - completedTasks - failedTasks,
      avgExecutionTime: avgExecutionTime.toFixed(2),
      totalEvents: this.events.length,
      enabled: this.enabled
    };
  }
}

// Singleton instance
export const taskQueueDiagnostics = new TaskQueueDiagnostics();

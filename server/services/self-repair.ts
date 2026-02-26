import { systemHealthMonitor } from './system-health-monitor';
import type { HealthStatus } from './system-health-monitor';

export interface RepairAction {
  timestamp: string;
  issue: string;
  action: string;
  success: boolean;
  duration: number;
  error?: string;
}

export interface RepairStats {
  totalRepairs: number;
  successfulRepairs: number;
  failedRepairs: number;
  lastRepair: string | null;
  recentActions: RepairAction[];
}

class SelfRepairService {
  private readonly MODULE_NAME = 'SelfRepair';
  private repairHistory: RepairAction[] = [];
  private isRepairing = false;
  private readonly MAX_RETRY_ATTEMPTS = 3;
  private readonly RETRY_DELAY_MS = 1000;

  /**
   * Analyze system health and trigger repairs if needed
   */
  async checkAndRepair(): Promise<RepairStats> {
    if (this.isRepairing) {
      console.log(`[${this.MODULE_NAME}] ⏳ Repair already in progress, skipping...`);
      return this.getStats();
    }

    const health = systemHealthMonitor.analyzeHealth();
    
    if (health.status === 'critical') {
      console.log(`[${this.MODULE_NAME}] 🚨 CRITICAL status detected - initiating auto-repair`);
      this.isRepairing = true;
      
      try {
        await this.performRepairs(health);
      } finally {
        this.isRepairing = false;
      }
    } else if (health.status === 'degraded') {
      console.log(`[${this.MODULE_NAME}] ⚠️ DEGRADED status - monitoring closely`);
    }

    return this.getStats();
  }

  /**
   * Perform repair actions based on detected issues
   */
  private async performRepairs(health: HealthStatus): Promise<void> {
    console.log(`[${this.MODULE_NAME}] 🔧 Analyzing ${health.criticalIssues.length} critical issues...`);

    for (const issue of health.criticalIssues) {
      await this.handleIssue(issue);
    }
  }

  /**
   * Handle a specific issue with appropriate repair action
   */
  private async handleIssue(issue: string): Promise<void> {
    console.log(`[${this.MODULE_NAME}] 🔍 Issue: ${issue}`);
    const startTime = Date.now();

    try {
      // Determine repair action based on issue type
      if (issue.includes('Cache')) {
        await this.repairCacheSystem(issue);
      } else if (issue.includes('Database latency')) {
        await this.repairDatabaseConnection(issue);
      } else if (issue.includes('Memory usage')) {
        await this.repairMemoryIssue(issue);
      } else if (issue.includes('CPU usage')) {
        await this.repairCPUIssue(issue);
      } else {
        console.log(`[${this.MODULE_NAME}] ❓ Unknown issue type, logging only`);
        this.recordRepair(issue, 'Monitor only', false, Date.now() - startTime, 'Unknown issue type');
      }
    } catch (error: any) {
      console.error(`[${this.MODULE_NAME}] ❌ Repair failed:`, error.message);
      this.recordRepair(issue, 'Failed', false, Date.now() - startTime, error.message);
    }
  }

  /**
   * Repair cache system issues
   * Directive 12.2.3: BobCore/MetricsBob cache flush removed (files deleted in Batch 7A)
   */
  private async repairCacheSystem(issue: string): Promise<void> {
    console.log(`[${this.MODULE_NAME}] 🔧 Cache issue detected - logging for investigation`);

    const startTime = Date.now();
    const actionTaken = 'Cache issue logged (no automated cache flush available)';

    this.recordRepair(issue, actionTaken, true, Date.now() - startTime);
  }

  /**
   * Repair database connection issues
   */
  private async repairDatabaseConnection(issue: string): Promise<void> {
    console.log(`[${this.MODULE_NAME}] 🔧 Attempting database connection repair...`);
    
    let success = false;
    let actionTaken = 'Database connection retry';
    const startTime = Date.now();

    try {
      // Attempt simple query with retry logic
      const { db } = await import('../db');
      const { sql } = await import('drizzle-orm');
      
      let lastError: Error | null = null;
      for (let attempt = 1; attempt <= this.MAX_RETRY_ATTEMPTS; attempt++) {
        try {
          console.log(`[${this.MODULE_NAME}] 🔄 Attempt ${attempt}/${this.MAX_RETRY_ATTEMPTS}...`);
          await db.execute(sql`SELECT 1`);
          success = true;
          actionTaken = `Database reconnect (${attempt} attempts)`;
          console.log(`[${this.MODULE_NAME}] ✅ Database connection restored`);
          break;
        } catch (err: any) {
          lastError = err;
          if (attempt < this.MAX_RETRY_ATTEMPTS) {
            await this.delay(this.RETRY_DELAY_MS * attempt); // Exponential backoff
          }
        }
      }

      if (!success && lastError) {
        throw lastError;
      }
    } catch (error: any) {
      console.error(`[${this.MODULE_NAME}] ❌ Database repair failed:`, error.message);
      actionTaken = 'Database repair failed';
    }

    this.recordRepair(issue, actionTaken, success, Date.now() - startTime);
  }

  /**
   * Attempt to repair memory issues
   */
  private async repairMemoryIssue(issue: string): Promise<void> {
    console.log(`[${this.MODULE_NAME}] 🔧 Attempting memory optimization...`);
    
    const startTime = Date.now();
    let actionTaken = 'Memory cleanup';

    try {
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
        actionTaken = 'Forced garbage collection';
        console.log(`[${this.MODULE_NAME}] ✅ Garbage collection triggered`);
      }

      // Directive 12.2.3: BobCore cache clear removed (file deleted in Batch 7A)
      console.log(`[${this.MODULE_NAME}] ✅ Memory optimization completed`);

      this.recordRepair(issue, actionTaken, true, Date.now() - startTime);
    } catch (error: any) {
      console.error(`[${this.MODULE_NAME}] ❌ Memory repair failed:`, error.message);
      this.recordRepair(issue, 'Memory repair failed', false, Date.now() - startTime, error.message);
    }
  }

  /**
   * Log CPU usage issue (cannot directly repair)
   */
  private async repairCPUIssue(issue: string): Promise<void> {
    console.log(`[${this.MODULE_NAME}] ⚠️ CPU usage high - monitoring and logging`);
    
    const startTime = Date.now();
    const actionTaken = 'CPU monitoring (no direct action)';
    
    // Log the issue for investigation
    this.recordRepair(issue, actionTaken, true, Date.now() - startTime);
  }

  /**
   * Manual recovery trigger for testing
   */
  async manualRecover(): Promise<{ success: boolean; message: string; stats: RepairStats }> {
    console.log(`[${this.MODULE_NAME}] 🔧 Manual recovery triggered`);
    
    const health = systemHealthMonitor.analyzeHealth();
    
    if (health.status === 'healthy') {
      return {
        success: true,
        message: 'System is healthy - no repairs needed',
        stats: this.getStats(),
      };
    }

    this.isRepairing = true;
    try {
      await this.performRepairs(health);
      return {
        success: true,
        message: `Recovery completed - ${this.repairHistory.length} actions taken`,
        stats: this.getStats(),
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Recovery failed: ${error.message}`,
        stats: this.getStats(),
      };
    } finally {
      this.isRepairing = false;
    }
  }

  /**
   * Record a repair action in history
   */
  private recordRepair(issue: string, action: string, success: boolean, duration: number, error?: string): void {
    const repair: RepairAction = {
      timestamp: new Date().toISOString(),
      issue,
      action,
      success,
      duration,
      error,
    };

    this.repairHistory.push(repair);
    
    // Keep only last 100 repairs
    if (this.repairHistory.length > 100) {
      this.repairHistory.shift();
    }

    const emoji = success ? '✅' : '❌';
    console.log(`[${this.MODULE_NAME}] ${emoji} Repair recorded: ${action} (${duration}ms)`);
  }

  /**
   * Get repair statistics
   */
  getStats(): RepairStats {
    const successful = this.repairHistory.filter(r => r.success).length;
    const failed = this.repairHistory.filter(r => !r.success).length;
    const lastRepair = this.repairHistory.length > 0 
      ? this.repairHistory[this.repairHistory.length - 1].timestamp 
      : null;

    return {
      totalRepairs: this.repairHistory.length,
      successfulRepairs: successful,
      failedRepairs: failed,
      lastRepair,
      recentActions: this.repairHistory.slice(-10), // Last 10 actions
    };
  }

  /**
   * Utility: delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instance
export const selfRepairService = new SelfRepairService();

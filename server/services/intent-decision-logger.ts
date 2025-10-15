/**
 * Phase 8.4 Addendum C: Intent Decision Logger
 * Logs all intent classification decisions for transparency and analysis
 * 
 * Logs to: /logs/intent-decisions.log
 */

import fs from 'fs/promises';
import path from 'path';
import type { IntentClassification } from './intent-classifier';

export interface IntentDecisionLog {
  timestamp: string;
  userId: string;
  rawInput: string;
  detectedIntent: string;
  action?: string;
  confidence: number;
  contextSnapshot: {
    hadContext: boolean;
    topic?: string | null;
    lastIntent?: string | null;
    minutesSinceLastIntent?: number;
  };
  actionExecuted?: {
    actionId: string;
    success: boolean;
    message: string;
  };
  guardrailBlocked?: {
    blocked: boolean;
    reason: string;
  };
  processingTimeMs: number;
}

export interface IntentStats {
  totalDecisions: number;
  averageConfidence: number;
  intentBreakdown: Record<string, number>;
  actionsExecuted: number;
  guardrailBlocks: number;
  averageProcessingTimeMs: number;
}

export class IntentDecisionLogger {
  private readonly MODULE_NAME = 'Intent-Logger';
  private readonly LOG_DIR = path.join(process.cwd(), 'logs');
  private readonly LOG_FILE = path.join(this.LOG_DIR, 'intent-decisions.log');
  private readonly MAX_LOG_SIZE = 10 * 1024 * 1024; // 10MB
  
  private decisionCache: IntentDecisionLog[] = [];
  private readonly CACHE_SIZE = 1000;

  /**
   * Log an intent decision
   */
  async logDecision(log: IntentDecisionLog): Promise<void> {
    try {
      // Add to in-memory cache
      this.decisionCache.push(log);
      if (this.decisionCache.length > this.CACHE_SIZE) {
        this.decisionCache.shift();
      }

      // Format log entry
      const logEntry = this.formatLogEntry(log);

      // Ensure log directory exists
      await fs.mkdir(this.LOG_DIR, { recursive: true });

      // Append to log file
      await fs.appendFile(this.LOG_FILE, logEntry + '\n', 'utf-8');

      // Check and rotate log if needed
      await this.rotateIfNeeded();

      console.log(
        `[${this.MODULE_NAME}] Logged: ${log.detectedIntent} (conf: ${log.confidence.toFixed(2)})`
      );
    } catch (error) {
      console.error(`[${this.MODULE_NAME}] ❌ Failed to log decision:`, error);
    }
  }

  /**
   * Format log entry as JSON line
   */
  private formatLogEntry(log: IntentDecisionLog): string {
    return JSON.stringify({
      ...log,
      rawInput: log.rawInput.substring(0, 200), // Limit length
    });
  }

  /**
   * Get recent decisions from cache
   */
  getRecentDecisions(limit: number = 20): IntentDecisionLog[] {
    return this.decisionCache.slice(-limit);
  }

  /**
   * Get statistics from recent decisions
   */
  getStats(fromTimestamp?: string): IntentStats {
    let logs = this.decisionCache;

    if (fromTimestamp) {
      const cutoff = new Date(fromTimestamp).getTime();
      logs = logs.filter(log => new Date(log.timestamp).getTime() >= cutoff);
    }

    if (logs.length === 0) {
      return {
        totalDecisions: 0,
        averageConfidence: 0,
        intentBreakdown: {},
        actionsExecuted: 0,
        guardrailBlocks: 0,
        averageProcessingTimeMs: 0,
      };
    }

    const totalConfidence = logs.reduce((sum, log) => sum + log.confidence, 0);
    const totalProcessingTime = logs.reduce((sum, log) => sum + log.processingTimeMs, 0);
    
    const intentBreakdown: Record<string, number> = {};
    let actionsExecuted = 0;
    let guardrailBlocks = 0;

    for (const log of logs) {
      intentBreakdown[log.detectedIntent] = (intentBreakdown[log.detectedIntent] || 0) + 1;
      
      if (log.actionExecuted) {
        actionsExecuted++;
      }
      
      if (log.guardrailBlocked?.blocked) {
        guardrailBlocks++;
      }
    }

    return {
      totalDecisions: logs.length,
      averageConfidence: totalConfidence / logs.length,
      intentBreakdown,
      actionsExecuted,
      guardrailBlocks,
      averageProcessingTimeMs: totalProcessingTime / logs.length,
    };
  }

  /**
   * Get daily summary for health reports
   */
  async getDailySummary(): Promise<string> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const stats = this.getStats(oneDayAgo);

    let summary = '## Intent Classification Summary (24h)\n';
    summary += `- Total Decisions: ${stats.totalDecisions}\n`;
    summary += `- Average Confidence: ${(stats.averageConfidence * 100).toFixed(1)}%\n`;
    summary += `- Actions Executed: ${stats.actionsExecuted}\n`;
    summary += `- Guardrail Blocks: ${stats.guardrailBlocks}\n`;
    summary += `- Avg Processing Time: ${stats.averageProcessingTimeMs.toFixed(1)}ms\n`;
    
    if (Object.keys(stats.intentBreakdown).length > 0) {
      summary += '\n### Intent Breakdown:\n';
      const sorted = Object.entries(stats.intentBreakdown)
        .sort((a, b) => b[1] - a[1]);
      
      for (const [intent, count] of sorted) {
        const percentage = ((count / stats.totalDecisions) * 100).toFixed(1);
        summary += `  - ${intent}: ${count} (${percentage}%)\n`;
      }
    }

    // Detect potential issues
    if (stats.averageConfidence < 0.80) {
      summary += '\n⚠️  **Low average confidence detected** - May need intent pattern refinement\n';
    }

    if (stats.guardrailBlocks > stats.totalDecisions * 0.1) {
      summary += '\n⚠️  **High guardrail block rate** - Users may be using ambiguous ticker references\n';
    }

    return summary;
  }

  /**
   * Read log file entries
   */
  async readLogFile(limit: number = 100): Promise<IntentDecisionLog[]> {
    try {
      const content = await fs.readFile(this.LOG_FILE, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.trim());
      
      const logs = lines
        .slice(-limit)
        .map(line => {
          try {
            return JSON.parse(line) as IntentDecisionLog;
          } catch {
            return null;
          }
        })
        .filter((log): log is IntentDecisionLog => log !== null);

      return logs;
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        return []; // File doesn't exist yet
      }
      throw error;
    }
  }

  /**
   * Rotate log file if it exceeds max size
   */
  private async rotateIfNeeded(): Promise<void> {
    try {
      const stats = await fs.stat(this.LOG_FILE);
      
      if (stats.size > this.MAX_LOG_SIZE) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const archivePath = path.join(
          this.LOG_DIR,
          `intent-decisions-${timestamp}.log`
        );
        
        await fs.rename(this.LOG_FILE, archivePath);
        console.log(`[${this.MODULE_NAME}] 📦 Log rotated to: ${archivePath}`);
      }
    } catch (error) {
      if ((error as any).code !== 'ENOENT') {
        console.error(`[${this.MODULE_NAME}] ❌ Rotation failed:`, error);
      }
    }
  }

  /**
   * Clear logs (for testing)
   */
  async clearLogs(): Promise<void> {
    this.decisionCache = [];
    try {
      await fs.unlink(this.LOG_FILE);
      console.log(`[${this.MODULE_NAME}] 🧹 Logs cleared`);
    } catch (error) {
      if ((error as any).code !== 'ENOENT') {
        throw error;
      }
    }
  }
}

export const intentDecisionLogger = new IntentDecisionLogger();

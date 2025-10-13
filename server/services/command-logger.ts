import fs from 'fs/promises';
import path from 'path';
import type { ParsedIntent } from './intent-parser';
import type { CommandResult } from './command-router';

interface CommandLogEntry {
  timestamp: string;
  userId: string;
  username?: string;
  intent: {
    type: string;
    action?: string;
    entity?: string;
    parameters: Record<string, any>;
    rawInput: string;
    confidence: number;
    requiresConfirmation: boolean;
  };
  result: {
    success: boolean;
    message: string;
    data?: any;
    warnings?: string[];
    errors?: string[];
    requiresConfirmation?: boolean;
    confirmationId?: string;
  };
  executionTimeMs?: number;
}

interface ConfirmationLogEntry {
  timestamp: string;
  userId: string;
  username?: string;
  confirmationId: string;
  confirmed: boolean;
  result: {
    success: boolean;
    message: string;
    data?: any;
  };
}

class CommandLogger {
  private logsDir = path.join(process.cwd(), 'logs', 'command_history');

  async logCommand(
    userId: string,
    intent: ParsedIntent,
    result: CommandResult,
    username?: string,
    executionTimeMs?: number
  ): Promise<void> {
    try {
      await fs.mkdir(this.logsDir, { recursive: true });

      const entry: CommandLogEntry = {
        timestamp: new Date().toISOString(),
        userId,
        username,
        intent: {
          type: intent.type,
          action: intent.action,
          entity: intent.entity,
          parameters: intent.parameters,
          rawInput: intent.rawInput,
          confidence: intent.confidence,
          requiresConfirmation: intent.requiresConfirmation,
        },
        result: {
          success: result.success,
          message: result.message,
          data: result.data,
          warnings: result.warnings,
          errors: result.errors,
          requiresConfirmation: result.requiresConfirmation,
          confirmationId: result.confirmationId,
        },
        executionTimeMs,
      };

      // Log to date-specific file
      const dateStr = new Date().toISOString().split('T')[0];
      const logFile = path.join(this.logsDir, `commands_${dateStr}.jsonl`);
      
      await fs.appendFile(logFile, JSON.stringify(entry) + '\n');

      // Also log to user-specific file
      const userLogFile = path.join(this.logsDir, `user_${userId}_${dateStr}.jsonl`);
      await fs.appendFile(userLogFile, JSON.stringify(entry) + '\n');

      console.log(`[CommandLogger] Logged command: ${intent.type} - ${intent.action} ${intent.entity} (User: ${userId})`);
    } catch (error) {
      console.error('[CommandLogger] Error logging command:', error);
    }
  }

  async logConfirmation(
    userId: string,
    confirmationId: string,
    confirmed: boolean,
    result: CommandResult,
    username?: string
  ): Promise<void> {
    try {
      await fs.mkdir(this.logsDir, { recursive: true });

      const entry: ConfirmationLogEntry = {
        timestamp: new Date().toISOString(),
        userId,
        username,
        confirmationId,
        confirmed,
        result: {
          success: result.success,
          message: result.message,
          data: result.data,
        },
      };

      const dateStr = new Date().toISOString().split('T')[0];
      const logFile = path.join(this.logsDir, `confirmations_${dateStr}.jsonl`);
      
      await fs.appendFile(logFile, JSON.stringify(entry) + '\n');

      console.log(`[CommandLogger] Logged confirmation: ${confirmationId} - ${confirmed ? 'accepted' : 'rejected'} (User: ${userId})`);
    } catch (error) {
      console.error('[CommandLogger] Error logging confirmation:', error);
    }
  }

  async getCommandHistory(userId: string, limit: number = 50): Promise<CommandLogEntry[]> {
    try {
      const dateStr = new Date().toISOString().split('T')[0];
      const userLogFile = path.join(this.logsDir, `user_${userId}_${dateStr}.jsonl`);

      try {
        const content = await fs.readFile(userLogFile, 'utf-8');
        const lines = content.trim().split('\n').filter(l => l.length > 0);
        const entries = lines.map(line => JSON.parse(line) as CommandLogEntry);
        
        // Return most recent entries
        return entries.slice(-limit).reverse();
      } catch (err) {
        // File doesn't exist or is empty
        return [];
      }
    } catch (error) {
      console.error('[CommandLogger] Error getting command history:', error);
      return [];
    }
  }

  async getRecentCommands(hours: number = 24): Promise<CommandLogEntry[]> {
    try {
      const entries: CommandLogEntry[] = [];
      const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);

      // Get log files from the last few days
      const files = await fs.readdir(this.logsDir);
      const commandFiles = files.filter(f => f.startsWith('commands_') && f.endsWith('.jsonl'));

      for (const file of commandFiles) {
        const filePath = path.join(this.logsDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.trim().split('\n').filter(l => l.length > 0);
        
        for (const line of lines) {
          const entry = JSON.parse(line) as CommandLogEntry;
          if (new Date(entry.timestamp) >= cutoffTime) {
            entries.push(entry);
          }
        }
      }

      // Sort by timestamp descending
      return entries.sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
    } catch (error) {
      console.error('[CommandLogger] Error getting recent commands:', error);
      return [];
    }
  }

  async getCommandStats(userId?: string): Promise<{
    totalCommands: number;
    successfulCommands: number;
    failedCommands: number;
    commandsRequiringConfirmation: number;
    topCommands: Array<{ type: string; action: string; entity: string; count: number }>;
  }> {
    try {
      const entries = await this.getRecentCommands(24 * 7); // Last 7 days
      const userEntries = userId ? entries.filter(e => e.userId === userId) : entries;

      const totalCommands = userEntries.length;
      const successfulCommands = userEntries.filter(e => e.result.success).length;
      const failedCommands = totalCommands - successfulCommands;
      const commandsRequiringConfirmation = userEntries.filter(e => e.result.requiresConfirmation).length;

      // Count command types
      const commandCounts = new Map<string, number>();
      for (const entry of userEntries) {
        const key = `${entry.intent.type}:${entry.intent.action}:${entry.intent.entity}`;
        commandCounts.set(key, (commandCounts.get(key) || 0) + 1);
      }

      const topCommands = Array.from(commandCounts.entries())
        .map(([key, count]) => {
          const [type, action, entity] = key.split(':');
          return { type, action, entity, count };
        })
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      return {
        totalCommands,
        successfulCommands,
        failedCommands,
        commandsRequiringConfirmation,
        topCommands,
      };
    } catch (error) {
      console.error('[CommandLogger] Error getting command stats:', error);
      return {
        totalCommands: 0,
        successfulCommands: 0,
        failedCommands: 0,
        commandsRequiringConfirmation: 0,
        topCommands: [],
      };
    }
  }
}

export const commandLogger = new CommandLogger();

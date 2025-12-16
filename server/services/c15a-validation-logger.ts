/**
 * C15A Validation Logger Service
 * Directive 8.8.4-C.15.A: Structured logging for validation sessions
 * Directive 8.8.4-C.15.A-R1: Validation Execution Protocol with observation-only mode
 * 
 * Logs to: logs/validation/8.8.4-C.15.A_validation_run1.md
 */

import fs from 'fs/promises';
import path from 'path';

interface ValidationLogEntry {
  timestamp: string;
  type: string;
  data: Record<string, any>;
}

interface SessionSummary {
  sessionId: string;
  startTime: string;
  endTime?: string;
  mode: 'paper' | 'live';
  startingBalance: number;
  fx5Cycles: number;
  rtbUpdates: number;
  promotions: number;
  tradeCloses: number;
  authErrors: number;
  isHealthy: boolean;
}

class C15aValidationLogger {
  private logFilePath: string;
  private sessionId: string | null = null;
  private sessionStart: Date | null = null;
  private sessionMode: 'paper' | 'live' = 'paper';
  private sessionBalance: number = 0;
  private entries: ValidationLogEntry[] = [];
  private metrics = {
    fx5Cycles: 0,
    rtbUpdates: 0,
    promotions: 0,
    tradeCloses: 0,
    authErrors: 0,
  };

  constructor() {
    this.logFilePath = path.join(process.cwd(), 'logs/validation/8.8.4-C.15.A_validation_run1.md');
  }

  /**
   * Start a new validation session
   */
  async startSession(mode: 'paper' | 'live', balance: number): Promise<string> {
    this.sessionId = `C15A_VALIDATION_${Date.now()}`;
    this.sessionStart = new Date();
    this.sessionMode = mode;
    this.sessionBalance = balance;
    this.entries = [];
    this.metrics = {
      fx5Cycles: 0,
      rtbUpdates: 0,
      promotions: 0,
      tradeCloses: 0,
      authErrors: 0,
    };

    await this.log('SESSION_START', { mode, balance, sessionId: this.sessionId });
    
    // Write initial header to file
    const header = `# 8.8.4-C.15.A-R1 Validation Run Log

Session ID: ${this.sessionId}
Start Time: ${this.sessionStart.toISOString()}
Mode: ${mode.toUpperCase()}
Starting Balance: $${balance.toFixed(2)}

---

## Event Log

`;
    await fs.mkdir(path.dirname(this.logFilePath), { recursive: true });
    await fs.writeFile(this.logFilePath, header);
    
    // C15A-R1: Use new log format per directive
    console.log(`[C15A-R1][SESSION_START] mode=${mode} balance=${balance.toFixed(2)}`);
    return this.sessionId;
  }

  /**
   * Log an event
   */
  async log(type: string, data: Record<string, any>): Promise<void> {
    const entry: ValidationLogEntry = {
      timestamp: new Date().toISOString(),
      type,
      data,
    };
    
    this.entries.push(entry);
    
    // Update metrics
    switch (type) {
      case 'FX5_CYCLE':
        this.metrics.fx5Cycles++;
        break;
      case 'RTB_UPDATE':
        this.metrics.rtbUpdates++;
        break;
      case 'PROMOTION':
        this.metrics.promotions++;
        break;
      case 'TRADE_CLOSE':
        this.metrics.tradeCloses++;
        break;
      case 'AUTH_ERROR':
        this.metrics.authErrors++;
        break;
    }

    // Format for console - C15A-R1: Use new log prefix per directive
    const dataStr = Object.entries(data)
      .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
      .join(' ');
    const logLine = `[C15A-R1][${type}] ${dataStr}`;
    console.log(logLine);

    // Append to file
    const fileLine = `\`${entry.timestamp}\` **${type}** ${dataStr}\n`;
    try {
      await fs.appendFile(this.logFilePath, fileLine);
    } catch (err) {
      // Silently fail if file write fails (don't crash the system)
    }
  }

  /**
   * Log FX5 scan cycle
   */
  async logFx5Cycle(count: number, eligible: number, duration: number): Promise<void> {
    await this.log('FX5_CYCLE', { count, eligible, duration: `${duration}s` });
  }

  /**
   * Log RTB table update
   */
  async logRtbUpdate(signalCount: number, promotions: number): Promise<void> {
    await this.log('RTB_UPDATE', { signals: signalCount, promotions });
  }

  /**
   * Log authentication status
   */
  async logAuthStatus(apiOk: boolean, wsOk: boolean): Promise<void> {
    await this.log('AUTH_STATUS', { api: apiOk ? 'OK' : 'FAIL', websocket: wsOk ? 'OK' : 'FAIL' });
    if (!apiOk) {
      this.metrics.authErrors++;
    }
  }

  /**
   * Log trade closure
   * Note: log() already increments tradeCloses for TRADE_CLOSE type
   */
  async logTradeClose(symbol: string, pnl: number): Promise<void> {
    await this.log('TRADE_CLOSE', { symbol, pnl: pnl.toFixed(4) });
  }

  /**
   * End the session and write summary
   */
  async endSession(): Promise<SessionSummary | null> {
    if (!this.sessionId || !this.sessionStart) {
      return null;
    }

    const endTime = new Date();
    const durationMs = endTime.getTime() - this.sessionStart.getTime();
    const durationMin = Math.round(durationMs / 60000);

    const summary: SessionSummary = {
      sessionId: this.sessionId,
      startTime: this.sessionStart.toISOString(),
      endTime: endTime.toISOString(),
      mode: this.sessionMode,
      startingBalance: this.sessionBalance,
      fx5Cycles: this.metrics.fx5Cycles,
      rtbUpdates: this.metrics.rtbUpdates,
      promotions: this.metrics.promotions,
      tradeCloses: this.metrics.tradeCloses,
      authErrors: this.metrics.authErrors,
      isHealthy: this.metrics.authErrors === 0 && this.metrics.fx5Cycles > 0,
    };

    await this.log('SESSION_SUMMARY', {
      duration: `${durationMin}min`,
      cycles: this.metrics.fx5Cycles,
      promotions: this.metrics.promotions,
      closes: this.metrics.tradeCloses,
      authErrors: this.metrics.authErrors,
      healthy: summary.isHealthy,
    });

    // Write summary to file
    const summaryMd = `
---

## Session Summary

| Metric | Value |
|--------|-------|
| Duration | ${durationMin} minutes |
| FX5 Cycles | ${this.metrics.fx5Cycles} |
| RTB Updates | ${this.metrics.rtbUpdates} |
| Promotions | ${this.metrics.promotions} |
| Trade Closes | ${this.metrics.tradeCloses} |
| Auth Errors | ${this.metrics.authErrors} |
| Status | ${summary.isHealthy ? '✅ HEALTHY' : '❌ UNHEALTHY'} |
`;
    try {
      await fs.appendFile(this.logFilePath, summaryMd);
    } catch (err) {
      // Silently fail
    }

    // C15A-R1: Use new log format per directive
    console.log(`[C15A-R1][SESSION_SUMMARY] cycles=${this.metrics.fx5Cycles} promotions=${this.metrics.promotions} authErrors=${this.metrics.authErrors}`);
    return summary;
  }

  /**
   * Get current session metrics
   */
  getMetrics(): typeof this.metrics & { sessionId: string | null; isActive: boolean } {
    return {
      ...this.metrics,
      sessionId: this.sessionId,
      isActive: this.sessionId !== null,
    };
  }

  /**
   * Check if a validation session is currently active
   */
  isSessionActive(): boolean {
    return this.sessionId !== null;
  }
}

export const c15aValidationLogger = new C15aValidationLogger();

/**
 * Phase 8.8.3-AJ18: Enhanced RTB Starvation Diagnostic Runner
 * 
 * Builds on AJ17's automated session management with:
 * - MAX_POSITIONS_SKIP detection (early exit when at max positions)
 * - POOL_STATE tracking (symbols evaluated/skipped per cycle)
 * - CRITERIA_FAIL with specific failure reasons per strategy
 * - TRADE_LIFECYCLE auditing (OPEN/CLOSE/ERROR events)
 * 
 * Key files generated:
 * - raw-log-stream.jsonl - All AJ18 logs in JSONL format
 * - aj18-snapshots.json - All cycle snapshots with detailed metrics
 * - aj18-diagnostic-report.md - Comprehensive diagnostic report
 * - aj18-diagnostic-bundle.zip - Complete bundle for download
 * 
 * Performance: Uses async buffered writes to avoid blocking the trading loop
 */

import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import AdmZip from 'adm-zip';
import { aj18Diagnostic } from './aj18-rtb-diagnostic';
import { contextBridge } from './context-bridge';

interface DiagnosticSession {
  sessionId: string;
  startTime: Date;
  endTime?: Date;
  mode: 'live' | 'paper';
  sessionDir: string;
  logCount: number;
  snapshotCount: number;
  zipPath?: string;
  reportPath?: string;
  status: 'active' | 'completed' | 'error';
}

interface AJ18LogEntry {
  timestamp: string;
  category: string;
  message: string;
  raw: string;
  cycleId?: string;
  metadata?: Record<string, any>;
}

interface CriteriaFailBreakdown {
  strategy: string;
  specificReason: string;
  count: number;
}

interface PoolStateMetrics {
  totalCycles: number;
  avgSymbolsEvaluated: number;
  avgSymbolsSkipped: number;
  avgRtbCandidates: number;
  maxPositionsSkipCount: number;
}

interface TradeLifecycleMetrics {
  totalOpens: number;
  totalCloses: number;
  totalErrors: number;
  avgHoldingMinutes: number;
}

class AJ18DiagnosticRunner {
  private static instance: AJ18DiagnosticRunner;
  private currentSession: DiagnosticSession | null = null;
  private lastCompletedSession: DiagnosticSession | null = null;
  private logBuffer: AJ18LogEntry[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private originalConsoleLog: typeof console.log;
  private isIntercepting: boolean = false;
  private isFlushingLogs: boolean = false;
  private logWriteStream: fs.WriteStream | null = null;

  private readonly BASE_DIR = '/tmp/aj18';
  private readonly FLUSH_INTERVAL_MS = 5000;
  private readonly MAX_BUFFER_SIZE = 100;

  private constructor() {
    this.originalConsoleLog = console.log.bind(console);
    this.ensureBaseDir();
  }

  static getInstance(): AJ18DiagnosticRunner {
    if (!AJ18DiagnosticRunner.instance) {
      AJ18DiagnosticRunner.instance = new AJ18DiagnosticRunner();
    }
    return AJ18DiagnosticRunner.instance;
  }

  private ensureBaseDir(): void {
    if (!fs.existsSync(this.BASE_DIR)) {
      fs.mkdirSync(this.BASE_DIR, { recursive: true });
    }
  }

  private generateSessionId(): string {
    const now = new Date();
    return `aj18_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  }

  startSession(mode: 'live' | 'paper', durationMinutes: number = 20): void {
    if (this.currentSession && this.currentSession.status === 'active') {
      console.log(`[AJ18] Session already active, skipping start`);
      return;
    }

    try {
      const sessionId = this.generateSessionId();
      const sessionDir = path.join(this.BASE_DIR, sessionId);

      fs.mkdirSync(sessionDir, { recursive: true });

      this.currentSession = {
        sessionId,
        startTime: new Date(),
        mode,
        sessionDir,
        logCount: 0,
        snapshotCount: 0,
        status: 'active'
      };

      this.logBuffer = [];
      
      const logPath = path.join(sessionDir, 'raw-log-stream.jsonl');
      this.logWriteStream = fs.createWriteStream(logPath, { flags: 'a' });
      
      aj18Diagnostic.reset();
      this.startLogInterception();
      this.startFlushTimer();

      console.log(`[AJ18][SESSION_START] sessionId=${sessionId} | mode=${mode} | duration=${durationMinutes}min | dir=${sessionDir}`);

      const sessionInfo = {
        sessionId,
        startTime: this.currentSession.startTime.toISOString(),
        mode,
        plannedDuration: durationMinutes,
        diagnosticVersion: 'AJ18',
        focus: 'RTB signal starvation root cause analysis'
      };
      fsPromises.writeFile(
        path.join(sessionDir, 'session-info.json'),
        JSON.stringify(sessionInfo, null, 2)
      ).catch(err => console.error('[AJ18] Failed to write session info:', err));

      setTimeout(() => {
        if (this.currentSession && this.currentSession.status === 'active') {
          console.log(`[AJ18] Session duration reached (${durationMinutes}min), auto-stopping...`);
          this.stopSessionAndGenerateReport();
        }
      }, durationMinutes * 60 * 1000);

    } catch (error) {
      console.error('[AJ18] Failed to start session:', error);
      this.stopLogInterception();
    }
  }

  private startLogInterception(): void {
    if (this.isIntercepting) return;
    this.isIntercepting = true;

    const self = this;
    const originalLog = this.originalConsoleLog;

    console.log = function(...args: any[]) {
      originalLog.apply(console, args);
      
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ');

      if (message.includes('[AJ18]') || message.includes('[AJ16]')) {
        self.captureLog(message);
      }
    };
  }

  private stopLogInterception(): void {
    if (!this.isIntercepting) return;
    console.log = this.originalConsoleLog;
    this.isIntercepting = false;
  }

  private captureLog(rawMessage: string): void {
    if (!this.currentSession || this.currentSession.status !== 'active') {
      return;
    }

    const categoryMatch = rawMessage.match(/\[AJ(?:16|18)\]\[([A-Z_]+)\]/);
    const category = categoryMatch ? categoryMatch[1] : 'UNKNOWN';

    const cycleIdMatch = rawMessage.match(/cycleId=([^\s|,}]+)/);
    const cycleId = cycleIdMatch ? cycleIdMatch[1] : undefined;

    const entry: AJ18LogEntry = {
      timestamp: new Date().toISOString(),
      category,
      message: rawMessage.replace(/\[AJ(?:16|18)\]\[[A-Z_]+\]\s*/, ''),
      raw: rawMessage,
      cycleId
    };

    this.logBuffer.push(entry);
    this.currentSession.logCount++;

    if (this.logBuffer.length >= this.MAX_BUFFER_SIZE) {
      this.flushLogsAsync();
    }
  }

  private startFlushTimer(): void {
    if (this.flushInterval) return;
    
    this.flushInterval = setInterval(() => {
      this.flushLogsAsync();
    }, this.FLUSH_INTERVAL_MS);
  }

  private stopFlushTimer(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
  }

  private flushLogsAsync(): void {
    if (!this.currentSession || this.logBuffer.length === 0 || this.isFlushingLogs) return;
    if (!this.logWriteStream) return;

    this.isFlushingLogs = true;
    const logsToFlush = [...this.logBuffer];
    this.logBuffer = [];

    const lines = logsToFlush.map(entry => JSON.stringify(entry)).join('\n') + '\n';
    
    this.logWriteStream.write(lines, (err) => {
      this.isFlushingLogs = false;
      if (err) {
        console.error('[AJ18] Error writing logs:', err);
        this.logBuffer = [...logsToFlush, ...this.logBuffer];
      }
    });
  }

  private async flushLogsFinal(): Promise<void> {
    if (!this.currentSession || this.logBuffer.length === 0) return;

    const logPath = path.join(this.currentSession.sessionDir, 'raw-log-stream.jsonl');
    const lines = this.logBuffer.map(entry => JSON.stringify(entry)).join('\n') + '\n';
    
    await fsPromises.appendFile(logPath, lines);
    this.logBuffer = [];
  }

  private closeWriteStream(): Promise<void> {
    return new Promise((resolve) => {
      if (this.logWriteStream) {
        this.logWriteStream.end(() => {
          this.logWriteStream = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  async stopSessionAndGenerateReport(): Promise<DiagnosticSession | null> {
    if (!this.currentSession || this.currentSession.status !== 'active') {
      console.log(`[AJ18] No active session to stop`);
      return null;
    }

    this.currentSession.endTime = new Date();
    this.currentSession.status = 'completed';

    this.stopLogInterception();
    this.stopFlushTimer();

    try {
      await this.closeWriteStream();
      await this.flushLogsFinal();

      console.log(`[AJ18][SESSION_STOP] sessionId=${this.currentSession.sessionId} | duration=${this.getSessionDurationMinutes()}min | logs=${this.currentSession.logCount}`);

      await this.captureSnapshots();
      await this.generateReport();
      await this.createBundle();

      this.lastCompletedSession = { ...this.currentSession };

      this.emitReportReady();

      const result = { ...this.currentSession };
      this.currentSession = null;
      
      return result;
    } catch (error) {
      console.error(`[AJ18] Error generating report:`, error);
      if (this.currentSession) {
        this.currentSession.status = 'error';
      }
      return this.currentSession;
    }
  }

  private getSessionDurationMinutes(): number {
    if (!this.currentSession) return 0;
    const end = this.currentSession.endTime || new Date();
    return Math.round((end.getTime() - this.currentSession.startTime.getTime()) / 60000);
  }

  private async captureSnapshots(): Promise<void> {
    if (!this.currentSession) return;

    const snapshots = aj18Diagnostic.getSnapshots();
    const snapshotsPath = path.join(this.currentSession.sessionDir, 'aj18-snapshots.json');
    
    await fsPromises.writeFile(snapshotsPath, JSON.stringify(snapshots, null, 2));
    this.currentSession.snapshotCount = snapshots.length;

    console.log(`[AJ18] Captured ${snapshots.length} snapshots`);
  }

  private async generateReport(): Promise<void> {
    if (!this.currentSession) return;

    const summary = aj18Diagnostic.getSummary();
    const snapshots = aj18Diagnostic.getSnapshots();
    
    let report = `# AJ18 RTB Starvation Diagnostic Report\n\n`;
    
    report += `## Session Overview\n\n`;
    report += `| Property | Value |\n`;
    report += `|----------|-------|\n`;
    report += `| Session ID | ${this.currentSession.sessionId} |\n`;
    report += `| Mode | ${this.currentSession.mode} |\n`;
    report += `| Start Time | ${this.currentSession.startTime.toISOString()} |\n`;
    report += `| End Time | ${this.currentSession.endTime?.toISOString() || 'N/A'} |\n`;
    report += `| Duration | ${this.getSessionDurationMinutes()} minutes |\n`;
    report += `| Total Logs Captured | ${this.currentSession.logCount} |\n`;
    report += `| Total Snapshots | ${this.currentSession.snapshotCount} |\n\n`;

    report += `## Executive Summary\n\n`;
    report += `- **Total Cycles:** ${summary.totalCycles}\n`;
    report += `- **Total Signals Generated:** ${summary.signalsGenerated}\n`;
    report += `- **Total Criteria Failures:** ${summary.criteriaFailures}\n`;
    report += `- **Max Positions Skip Events:** ${summary.maxPositionsSkips}\n`;
    report += `- **Trade Opens:** ${summary.tradeOpens}\n`;
    report += `- **Trade Closes:** ${summary.tradeCloses}\n`;
    report += `- **Trade Errors:** ${summary.tradeErrors}\n\n`;

    report += `## Root Cause Analysis\n\n`;
    
    const signalRate = summary.totalCycles > 0 
      ? (summary.signalsGenerated / summary.totalCycles * 100).toFixed(1) 
      : '0';
    const failRate = summary.totalCycles > 0 
      ? (summary.criteriaFailures / summary.totalCycles).toFixed(0) 
      : '0';
    
    if (summary.maxPositionsSkips > summary.totalCycles * 0.3) {
      report += `**Primary Issue: MAX_POSITIONS bottleneck**\n`;
      report += `- Max positions skip occurred in ${summary.maxPositionsSkips} cycles (>${((summary.maxPositionsSkips / summary.totalCycles) * 100).toFixed(0)}% of cycles)\n`;
      report += `- This indicates the engine is frequently at capacity and cannot take new positions\n\n`;
    } else if (summary.signalsGenerated < summary.totalCycles * 0.1) {
      report += `**Primary Issue: Strategy criteria too restrictive**\n`;
      report += `- Signal generation rate: ${signalRate}% (should be >10%)\n`;
      report += `- Average criteria failures per cycle: ${failRate}\n\n`;
    } else {
      report += `**No obvious bottleneck detected**\n`;
      report += `- Signal generation rate: ${signalRate}%\n`;
      report += `- System appears to be functioning normally\n\n`;
    }

    report += `## Criteria Failure Breakdown\n\n`;
    const failuresByStrategy = this.aggregateCriteriaFailures(snapshots);
    if (failuresByStrategy.length > 0) {
      report += `| Strategy | Specific Reason | Count |\n`;
      report += `|----------|-----------------|-------|\n`;
      for (const failure of failuresByStrategy.slice(0, 20)) {
        report += `| ${failure.strategy} | ${failure.specificReason} | ${failure.count} |\n`;
      }
      report += `\n`;
    } else {
      report += `*No criteria failures recorded*\n\n`;
    }

    report += `## Pool State Metrics\n\n`;
    const poolMetrics = this.calculatePoolMetrics(snapshots);
    report += `| Metric | Value |\n`;
    report += `|--------|-------|\n`;
    report += `| Total Cycles | ${poolMetrics.totalCycles} |\n`;
    report += `| Avg Symbols Evaluated | ${poolMetrics.avgSymbolsEvaluated.toFixed(1)} |\n`;
    report += `| Avg Symbols Skipped | ${poolMetrics.avgSymbolsSkipped.toFixed(1)} |\n`;
    report += `| Avg RTB Candidates | ${poolMetrics.avgRtbCandidates.toFixed(2)} |\n`;
    report += `| Max Positions Skip Events | ${poolMetrics.maxPositionsSkipCount} |\n\n`;

    report += `## Trade Lifecycle Metrics\n\n`;
    const tradeMetrics = this.calculateTradeMetrics(snapshots);
    report += `| Metric | Value |\n`;
    report += `|--------|-------|\n`;
    report += `| Trade Opens | ${tradeMetrics.totalOpens} |\n`;
    report += `| Trade Closes | ${tradeMetrics.totalCloses} |\n`;
    report += `| Trade Errors | ${tradeMetrics.totalErrors} |\n`;
    report += `| Avg Holding Time | ${tradeMetrics.avgHoldingMinutes.toFixed(1)} minutes |\n\n`;

    report += `## Signal Generation by Strategy\n\n`;
    const signalsByStrategy = this.aggregateSignalsByStrategy(snapshots);
    if (Object.keys(signalsByStrategy).length > 0) {
      report += `| Strategy | Signals Generated |\n`;
      report += `|----------|------------------|\n`;
      for (const [strategy, count] of Object.entries(signalsByStrategy).sort((a, b) => (b[1] as number) - (a[1] as number))) {
        report += `| ${strategy} | ${count} |\n`;
      }
      report += `\n`;
    } else {
      report += `*No signals generated*\n\n`;
    }

    report += `## Recommendations\n\n`;
    report += this.generateRecommendations(summary, poolMetrics, failuresByStrategy);
    
    report += `\n---\n`;
    report += `*Report generated by AJ18 Diagnostic Runner*\n`;
    report += `*Timestamp: ${new Date().toISOString()}*\n`;

    const reportPath = path.join(this.currentSession.sessionDir, 'aj18-diagnostic-report.md');
    await fsPromises.writeFile(reportPath, report);
    this.currentSession.reportPath = reportPath;

    console.log(`[AJ18] Generated diagnostic report: ${reportPath}`);
  }

  private aggregateCriteriaFailures(snapshots: any[]): CriteriaFailBreakdown[] {
    const failureMap = new Map<string, number>();
    
    for (const snapshot of snapshots) {
      if (snapshot.criteriaFails) {
        for (const fail of snapshot.criteriaFails) {
          const key = `${fail.strategy}|${fail.specificReason}`;
          failureMap.set(key, (failureMap.get(key) || 0) + 1);
        }
      }
    }

    return Array.from(failureMap.entries())
      .map(([key, count]) => {
        const [strategy, specificReason] = key.split('|');
        return { strategy, specificReason, count };
      })
      .sort((a, b) => b.count - a.count);
  }

  private calculatePoolMetrics(snapshots: any[]): PoolStateMetrics {
    if (snapshots.length === 0) {
      return {
        totalCycles: 0,
        avgSymbolsEvaluated: 0,
        avgSymbolsSkipped: 0,
        avgRtbCandidates: 0,
        maxPositionsSkipCount: 0
      };
    }

    let totalEvaluated = 0;
    let totalSkipped = 0;
    let totalRtb = 0;
    let maxPosSkips = 0;

    for (const snapshot of snapshots) {
      if (snapshot.poolState) {
        totalEvaluated += snapshot.poolState.symbolsEvaluated || 0;
        totalSkipped += snapshot.poolState.symbolsSkipped || 0;
        totalRtb += snapshot.poolState.rtbCandidatesProposed || 0;
      }
      if (snapshot.maxPositionsSkipped) {
        maxPosSkips++;
      }
    }

    return {
      totalCycles: snapshots.length,
      avgSymbolsEvaluated: totalEvaluated / snapshots.length,
      avgSymbolsSkipped: totalSkipped / snapshots.length,
      avgRtbCandidates: totalRtb / snapshots.length,
      maxPositionsSkipCount: maxPosSkips
    };
  }

  private calculateTradeMetrics(snapshots: any[]): TradeLifecycleMetrics {
    let opens = 0;
    let closes = 0;
    let errors = 0;
    let totalHoldingTime = 0;
    let holdingCount = 0;

    for (const snapshot of snapshots) {
      if (snapshot.tradeLifecycle) {
        for (const event of snapshot.tradeLifecycle) {
          switch (event.eventType) {
            case 'OPEN':
              opens++;
              break;
            case 'CLOSE':
              closes++;
              if (event.holdingMinutes) {
                totalHoldingTime += event.holdingMinutes;
                holdingCount++;
              }
              break;
            case 'ERROR':
              errors++;
              break;
          }
        }
      }
    }

    return {
      totalOpens: opens,
      totalCloses: closes,
      totalErrors: errors,
      avgHoldingMinutes: holdingCount > 0 ? totalHoldingTime / holdingCount : 0
    };
  }

  private aggregateSignalsByStrategy(snapshots: any[]): Record<string, number> {
    const signalMap: Record<string, number> = {};
    
    for (const snapshot of snapshots) {
      if (snapshot.signalsGenerated) {
        for (const signal of snapshot.signalsGenerated) {
          signalMap[signal.strategy] = (signalMap[signal.strategy] || 0) + 1;
        }
      }
    }

    return signalMap;
  }

  private generateRecommendations(
    summary: any, 
    poolMetrics: PoolStateMetrics, 
    failures: CriteriaFailBreakdown[]
  ): string {
    const recommendations: string[] = [];

    if (poolMetrics.maxPositionsSkipCount > poolMetrics.totalCycles * 0.2) {
      recommendations.push(`1. **Increase MAX_POSITIONS**: Currently hitting max positions limit in ${poolMetrics.maxPositionsSkipCount} cycles. Consider increasing from current value.`);
    }

    if (poolMetrics.avgRtbCandidates < 0.5) {
      recommendations.push(`2. **Relax Strategy Criteria**: Average RTB candidates per cycle is only ${poolMetrics.avgRtbCandidates.toFixed(2)}. Consider loosening entry conditions.`);
    }

    const topFailure = failures[0];
    if (topFailure && topFailure.count > 50) {
      recommendations.push(`3. **Address Top Failure Mode**: "${topFailure.strategy}" failing with "${topFailure.specificReason}" ${topFailure.count} times. Review this strategy's criteria.`);
    }

    if (summary.signalsGenerated === 0 && summary.totalCycles > 10) {
      recommendations.push(`4. **Critical: No signals generated** across ${summary.totalCycles} cycles. Verify market data feeds and strategy logic.`);
    }

    if (recommendations.length === 0) {
      recommendations.push(`System is performing within expected parameters. Continue monitoring.`);
    }

    return recommendations.join('\n\n');
  }

  private async createBundle(): Promise<void> {
    if (!this.currentSession) return;

    const zip = new AdmZip();
    const sessionDir = this.currentSession.sessionDir;

    const files = [
      'aj18-diagnostic-report.md',
      'raw-log-stream.jsonl',
      'aj18-snapshots.json',
      'session-info.json'
    ];

    for (const file of files) {
      const filePath = path.join(sessionDir, file);
      if (fs.existsSync(filePath)) {
        zip.addLocalFile(filePath);
      }
    }

    const zipPath = path.join(sessionDir, 'aj18-diagnostic-bundle.zip');
    zip.writeZip(zipPath);
    this.currentSession.zipPath = zipPath;

    const projectRootZip = path.join(process.cwd(), 'aj18-diagnostic-bundle.zip');
    fs.copyFileSync(zipPath, projectRootZip);

    console.log(`[AJ18] Created diagnostic bundle: ${zipPath}`);
    console.log(`[AJ18] Copied to project root: ${projectRootZip}`);
  }

  private emitReportReady(): void {
    if (!this.currentSession) return;

    contextBridge.broadcast({
      type: 'aj18_report_ready' as any,
      payload: {
        sessionId: this.currentSession.sessionId,
        mode: this.currentSession.mode,
        duration: this.getSessionDurationMinutes(),
        logCount: this.currentSession.logCount,
        snapshotCount: this.currentSession.snapshotCount,
        message: 'Your AJ18 diagnostic report is ready for download.'
      }
    });

    console.log(`[AJ18] Emitted report_ready event`);
  }

  getLastCompletedSession(): DiagnosticSession | null {
    return this.lastCompletedSession;
  }

  getLastBundlePath(): string | null {
    return this.lastCompletedSession?.zipPath || null;
  }

  getCurrentSession(): DiagnosticSession | null {
    return this.currentSession;
  }

  isSessionActive(): boolean {
    return this.currentSession !== null && this.currentSession.status === 'active';
  }

  getSessionStatus(): { 
    active: boolean; 
    currentSession: DiagnosticSession | null;
    lastCompleted: DiagnosticSession | null;
  } {
    return {
      active: this.isSessionActive(),
      currentSession: this.currentSession,
      lastCompleted: this.lastCompletedSession
    };
  }

  getLiveMetrics(): any {
    return {
      sessionActive: this.isSessionActive(),
      currentSessionId: this.currentSession?.sessionId,
      logsCollected: this.currentSession?.logCount || 0,
      durationMinutes: this.getSessionDurationMinutes(),
      summary: aj18Diagnostic.getSummary(),
      recentSnapshots: aj18Diagnostic.getSnapshots().slice(-5)
    };
  }
}

export const aj18DiagnosticRunner = AJ18DiagnosticRunner.getInstance();
export type { DiagnosticSession, AJ18LogEntry, CriteriaFailBreakdown, PoolStateMetrics, TradeLifecycleMetrics };

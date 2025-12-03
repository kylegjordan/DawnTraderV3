/**
 * Phase 8.8.3-AJ17: Automated RTB Cooling Diagnostic Runner
 * 
 * Provides automated diagnostic session management:
 * - Tracks when diagnostic sessions begin & end
 * - Captures all [AJ16] logs during trading session
 * - Stores data to /tmp/aj16/<timestamp>/ directory
 * - Auto-generates diagnostic bundle on session end
 * 
 * Key files generated:
 * - raw-log-stream.jsonl - All AJ16 logs in JSONL format
 * - snapshots.json - All cycle snapshots
 * - aj16-diagnostic-report.md - Markdown diagnostic report
 * - aj16-diagnostic-bundle.zip - Complete bundle for download
 * 
 * Performance: Uses async buffered writes to avoid blocking the trading loop
 */

import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import AdmZip from 'adm-zip';
import { aj16Diagnostic } from './aj16-rtb-diagnostic';
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

interface AJ16LogEntry {
  timestamp: string;
  category: string;
  message: string;
  raw: string;
  cycleId?: string;
  metadata?: Record<string, any>;
}

class AJ17DiagnosticRunner {
  private static instance: AJ17DiagnosticRunner;
  private currentSession: DiagnosticSession | null = null;
  private lastCompletedSession: DiagnosticSession | null = null;
  private logBuffer: AJ16LogEntry[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private originalConsoleLog: typeof console.log;
  private isIntercepting: boolean = false;
  private isFlushingLogs: boolean = false;
  private logWriteStream: fs.WriteStream | null = null;

  private readonly BASE_DIR = '/tmp/aj16';
  private readonly FLUSH_INTERVAL_MS = 5000;
  private readonly MAX_BUFFER_SIZE = 100;

  private constructor() {
    this.originalConsoleLog = console.log.bind(console);
    this.ensureBaseDir();
  }

  static getInstance(): AJ17DiagnosticRunner {
    if (!AJ17DiagnosticRunner.instance) {
      AJ17DiagnosticRunner.instance = new AJ17DiagnosticRunner();
    }
    return AJ17DiagnosticRunner.instance;
  }

  private ensureBaseDir(): void {
    if (!fs.existsSync(this.BASE_DIR)) {
      fs.mkdirSync(this.BASE_DIR, { recursive: true });
    }
  }

  private generateSessionId(): string {
    const now = new Date();
    return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  }

  startSession(mode: 'live' | 'paper'): void {
    if (this.currentSession && this.currentSession.status === 'active') {
      console.log(`[AJ17] Session already active, skipping start`);
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
      
      this.startLogInterception();
      this.startFlushTimer();

      console.log(`[AJ17][SESSION_START] sessionId=${sessionId} | mode=${mode} | dir=${sessionDir}`);

      const sessionInfo = {
        sessionId,
        startTime: this.currentSession.startTime.toISOString(),
        mode
      };
      fsPromises.writeFile(
        path.join(sessionDir, 'session-info.json'),
        JSON.stringify(sessionInfo, null, 2)
      ).catch(err => console.error('[AJ17] Failed to write session info:', err));
    } catch (error) {
      console.error('[AJ17] Failed to start session:', error);
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

      if (message.includes('[AJ16]')) {
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

    const categoryMatch = rawMessage.match(/\[AJ16\]\[([A-Z_]+)\]/);
    const category = categoryMatch ? categoryMatch[1] : 'UNKNOWN';

    const cycleIdMatch = rawMessage.match(/cycleId=([^\s|]+)/);
    const cycleId = cycleIdMatch ? cycleIdMatch[1] : undefined;

    const entry: AJ16LogEntry = {
      timestamp: new Date().toISOString(),
      category,
      message: rawMessage.replace(/\[AJ16\]\[[A-Z_]+\]\s*/, ''),
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
        console.error('[AJ17] Error writing logs:', err);
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
      console.log(`[AJ17] No active session to stop`);
      return null;
    }

    this.currentSession.endTime = new Date();
    this.currentSession.status = 'completed';

    this.stopLogInterception();
    this.stopFlushTimer();

    try {
      await this.closeWriteStream();
      await this.flushLogsFinal();

      console.log(`[AJ17][SESSION_STOP] sessionId=${this.currentSession.sessionId} | duration=${this.getSessionDurationMinutes()}min | logs=${this.currentSession.logCount}`);

      await this.captureSnapshots();
      await this.generateReport();
      await this.createBundle();

      this.lastCompletedSession = { ...this.currentSession };

      this.emitReportReady();

      const result = { ...this.currentSession };
      this.currentSession = null;
      
      return result;
    } catch (error) {
      console.error(`[AJ17] Error generating report:`, error);
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

    const snapshots = aj16Diagnostic.getRecentSnapshots(100);
    const snapshotsPath = path.join(this.currentSession.sessionDir, 'snapshots.json');
    
    await fsPromises.writeFile(snapshotsPath, JSON.stringify(snapshots, null, 2));
    this.currentSession.snapshotCount = snapshots.length;

    console.log(`[AJ17] Captured ${snapshots.length} snapshots`);
  }

  private async generateReport(): Promise<void> {
    if (!this.currentSession) return;

    const report = aj16Diagnostic.generateDiagnosticReport();
    
    let enhancedReport = `# AJ17 Diagnostic Session Report\n\n`;
    enhancedReport += `**Session ID:** ${this.currentSession.sessionId}\n`;
    enhancedReport += `**Mode:** ${this.currentSession.mode}\n`;
    enhancedReport += `**Start Time:** ${this.currentSession.startTime.toISOString()}\n`;
    enhancedReport += `**End Time:** ${this.currentSession.endTime?.toISOString() || 'N/A'}\n`;
    enhancedReport += `**Duration:** ${this.getSessionDurationMinutes()} minutes\n`;
    enhancedReport += `**Total Logs Captured:** ${this.currentSession.logCount}\n`;
    enhancedReport += `**Total Snapshots:** ${this.currentSession.snapshotCount}\n\n`;
    enhancedReport += `---\n\n`;
    enhancedReport += report;

    const reportPath = path.join(this.currentSession.sessionDir, 'aj16-diagnostic-report.md');
    await fsPromises.writeFile(reportPath, enhancedReport);
    this.currentSession.reportPath = reportPath;

    console.log(`[AJ17] Generated diagnostic report: ${reportPath}`);
  }

  private async createBundle(): Promise<void> {
    if (!this.currentSession) return;

    const zip = new AdmZip();
    const sessionDir = this.currentSession.sessionDir;

    const files = [
      'aj16-diagnostic-report.md',
      'raw-log-stream.jsonl',
      'snapshots.json',
      'session-info.json'
    ];

    for (const file of files) {
      const filePath = path.join(sessionDir, file);
      if (fs.existsSync(filePath)) {
        zip.addLocalFile(filePath);
      }
    }

    const zipPath = path.join(sessionDir, 'aj16-diagnostic-bundle.zip');
    zip.writeZip(zipPath);
    this.currentSession.zipPath = zipPath;

    console.log(`[AJ17] Created diagnostic bundle: ${zipPath}`);
  }

  private emitReportReady(): void {
    if (!this.currentSession) return;

    contextBridge.broadcast({
      type: 'aj17_report_ready' as any,
      payload: {
        sessionId: this.currentSession.sessionId,
        mode: this.currentSession.mode,
        duration: this.getSessionDurationMinutes(),
        logCount: this.currentSession.logCount,
        snapshotCount: this.currentSession.snapshotCount,
        message: 'Your AJ16 diagnostic report is ready for download.'
      }
    });

    console.log(`[AJ17] Emitted report_ready event`);
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
}

export const aj17DiagnosticRunner = AJ17DiagnosticRunner.getInstance();
export type { DiagnosticSession, AJ16LogEntry };

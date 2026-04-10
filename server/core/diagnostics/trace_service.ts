/**
 * Directive 8.8.4-A3.R9.0.D: Diagnostic Signal Flow Tracing Service
 * 
 * Non-invasive diagnostic probes for tracing signal flow from creation → evaluation → queue.
 * 
 * Features:
 * - Truly async buffered logging with non-blocking writes (flush every 2s or 200 entries)
 * - Auto-disable after 10 minutes or 1 MB log size
 * - Zero mutation, zero delay impact on trading operations
 * - Uses [A3.R9.TRACE] tag for all diagnostic entries
 * 
 * Log output: logs/diagnostic/trace_A3R9.log
 */

import * as fs from 'fs';
import * as path from 'path';
import { promises as fsPromises } from 'fs';

export type TracePhase = 'orchestrator' | 'preprocessor' | 'sqe' | 'rtb' | 'queue';

export interface TraceEntry {
  phase: TracePhase;
  symbol: string;
  strategy: string;
  finalScoreRaw: number | null;
  profit: number | null;
  risk: number | null;
  normalized: boolean;
  passed: boolean | null;
  rejected: boolean | null;
  inserted: boolean | null;
  timestamp: number;
  extra?: Record<string, unknown>;
}

const LOG_DIR = path.resolve(process.cwd(), 'logs/diagnostic');
const LOG_FILE = path.join(LOG_DIR, 'trace_A3R9.log');
const MAX_LOG_SIZE_BYTES = 1 * 1024 * 1024; // 1 MB
const AUTO_DISABLE_MS = 10 * 60 * 1000; // 10 minutes
const BUFFER_FLUSH_INTERVAL_MS = 2000; // 2 seconds
const BUFFER_MAX_ENTRIES = 200;

class DiagnosticTraceService {
  private buffer: string[] = [];
  private isEnabled: boolean = false;
  private startTime: number = 0;
  private flushTimer: NodeJS.Timeout | null = null;
  private autoDisableTimer: NodeJS.Timeout | null = null;
  private totalBytesWritten: number = 0;
  private entryCount: number = 0;
  private flushPending: boolean = false;

  constructor() {
    this.ensureLogDirectory();
  }

  private ensureLogDirectory(): void {
    try {
      if (!fs.existsSync(LOG_DIR)) {
        fs.mkdirSync(LOG_DIR, { recursive: true });
      }
    } catch (err) {
      console.error('[A3.R9.TRACE][ERROR] Failed to create log directory:', err);
    }
  }

  start(): void {
    if (this.isEnabled) {
      console.log('[A3.R9.TRACE][WARN] Tracing already enabled');
      return;
    }

    this.isEnabled = true;
    this.startTime = Date.now();
    this.buffer = [];
    this.totalBytesWritten = 0;
    this.entryCount = 0;
    this.flushPending = false;

    fsPromises.writeFile(LOG_FILE, `# Directive 8.8.4-A3.R9.0.D Trace Log\n# Started: ${new Date().toISOString()}\n`)
      .catch(err => console.error('[A3.R9.TRACE][ERROR] Failed to initialize log file:', err));

    this.flushTimer = setInterval(() => this.flushBufferAsync(), BUFFER_FLUSH_INTERVAL_MS);
    
    this.autoDisableTimer = setTimeout(() => {
      console.log('[A3.R9.TRACE][AUTO_DISABLE] 10-minute limit reached, stopping trace');
      this.stop();
    }, AUTO_DISABLE_MS);

    console.log(`[A3.R9.TRACE][START] Signal flow tracing enabled (auto-disable in 10 min, max 1 MB)`);
    console.log(`[A3.R9.TRACE][LOG_PATH] ${LOG_FILE}`);
  }

  stop(): void {
    if (!this.isEnabled) {
      return;
    }

    this.isEnabled = false;

    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.autoDisableTimer) {
      clearTimeout(this.autoDisableTimer);
      this.autoDisableTimer = null;
    }

    const durationSec = Math.round((Date.now() - this.startTime) / 1000);
    const summary = `\n# Trace stopped: ${new Date().toISOString()}\n# Duration: ${durationSec}s, Entries: ${this.entryCount}, Bytes: ${this.totalBytesWritten}\n`;
    
    const finalBuffer = [...this.buffer];
    this.buffer = [];
    
    const finalContent = finalBuffer.join('') + summary;
    fsPromises.appendFile(LOG_FILE, finalContent)
      .then(() => {
        this.totalBytesWritten += finalContent.length;
      })
      .catch(err => console.error('[A3.R9.TRACE][ERROR] Failed to write final buffer:', err));

    console.log(`[A3.R9.TRACE][STOP] Tracing stopped after ${durationSec}s, ${this.entryCount} entries, ${this.totalBytesWritten} bytes`);
  }

  isActive(): boolean {
    return this.isEnabled;
  }

  getStats(): { enabled: boolean; entries: number; bytes: number; elapsedMs: number } {
    return {
      enabled: this.isEnabled,
      entries: this.entryCount,
      bytes: this.totalBytesWritten,
      elapsedMs: this.isEnabled ? Date.now() - this.startTime : 0
    };
  }

  trace(entry: TraceEntry): void {
    if (!this.isEnabled) {
      return;
    }

    if (this.totalBytesWritten >= MAX_LOG_SIZE_BYTES) {
      console.log('[A3.R9.TRACE][AUTO_DISABLE] 1 MB limit reached, stopping trace');
      this.stop();
      return;
    }

    const logLine = `[A3.R9.TRACE] ${JSON.stringify(entry)}\n`;
    this.buffer.push(logLine);
    this.entryCount++;

    if (this.buffer.length >= BUFFER_MAX_ENTRIES && !this.flushPending) {
      this.flushBufferAsync();
    }
  }

  traceOrchestrator(
    symbol: string, 
    strategy: string, 
    rawMetrics: { finalScore?: number; profit?: number; risk?: number },
    normalized: boolean = false
  ): void {
    this.trace({
      phase: 'orchestrator',
      symbol,
      strategy,
      finalScoreRaw: rawMetrics.finalScore ?? null,
      profit: rawMetrics.profit ?? null,
      risk: rawMetrics.risk ?? null,
      normalized,
      passed: null,
      rejected: null,
      inserted: null,
      timestamp: Date.now()
    });
  }

  traceSQE(
    symbol: string,
    strategy: string,
    metrics: { finalScore?: number; regimeWeight?: number; profit?: number; risk?: number },
    passed: boolean,
    normalized: boolean = true
  ): void {
    this.trace({
      phase: 'sqe',
      symbol,
      strategy,
      finalScoreRaw: metrics.finalScore ?? metrics.regimeWeight ?? null,
      profit: metrics.profit ?? null,
      risk: metrics.risk ?? null,
      normalized,
      passed,
      rejected: !passed,
      inserted: null,
      timestamp: Date.now()
    });
  }

  traceRTB(
    symbol: string,
    strategy: string,
    inserted: boolean,
    extra?: Record<string, unknown>
  ): void {
    this.trace({
      phase: 'rtb',
      symbol,
      strategy,
      finalScoreRaw: null,
      profit: null,
      risk: null,
      normalized: true,
      passed: true,
      rejected: false,
      inserted,
      timestamp: Date.now(),
      extra
    });
  }

  private flushBufferAsync(): void {
    if (this.buffer.length === 0 || this.flushPending) {
      return;
    }

    const content = this.buffer.join('');
    this.buffer = [];
    this.flushPending = true;

    fsPromises.appendFile(LOG_FILE, content)
      .then(() => {
        this.totalBytesWritten += content.length;
        this.flushPending = false;
      })
      .catch(err => {
        console.error('[A3.R9.TRACE][ERROR] Failed to flush buffer:', err);
        this.flushPending = false;
      });
  }
}

export const diagnosticTrace = new DiagnosticTraceService();

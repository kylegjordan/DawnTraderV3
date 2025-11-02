import fs from 'fs/promises';
import path from 'path';

interface TraceEvent {
  timestamp: string;
  timestampMs: number;
  service: string;
  event: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
  data?: any;
  duration?: number;
  error?: string;
  stackTrace?: string;
}

interface TraceSession {
  sessionId: string;
  startTime: string;
  endTime?: string;
  events: TraceEvent[];
  metadata: {
    mode?: string;
    portfolioValue?: number;
    userId?: string;
  };
}

class TelemetryTraceService {
  private static instance: TelemetryTraceService;
  private currentSession: TraceSession | null = null;
  private traceBuffer: TraceEvent[] = [];
  private traceFilePath: string = '';
  private isTracing: boolean = false;
  private flushInterval: NodeJS.Timeout | null = null;

  private constructor() {}

  static getInstance(): TelemetryTraceService {
    if (!TelemetryTraceService.instance) {
      TelemetryTraceService.instance = new TelemetryTraceService();
    }
    return TelemetryTraceService.instance;
  }

  startSession(sessionId: string, metadata: TraceSession['metadata'] = {}): void {
    const timestamp = new Date().toISOString();
    
    this.currentSession = {
      sessionId,
      startTime: timestamp,
      events: [],
      metadata
    };

    this.traceBuffer = [];
    this.isTracing = true;

    this.traceFilePath = path.join(
      process.cwd(),
      'diagnostic-reports',
      `phase-41c-trace-${sessionId}-${Date.now()}.json`
    );

    this.trace('TelemetryTrace', 'SESSION_START', 'INFO', {
      sessionId,
      metadata
    });

    this.flushInterval = setInterval(() => {
      this.flushToFile().catch(err => 
        console.error('[TelemetryTrace] Flush error:', err)
      );
    }, 5000);

    console.log(`[TelemetryTrace] 📊 Session started: ${sessionId}`);
  }

  async stopSession(): Promise<string> {
    if (!this.currentSession) {
      return '';
    }

    this.trace('TelemetryTrace', 'SESSION_END', 'INFO', {
      sessionId: this.currentSession.sessionId,
      duration: Date.now() - new Date(this.currentSession.startTime).getTime(),
      eventCount: this.currentSession.events.length
    });

    this.currentSession.endTime = new Date().toISOString();
    this.isTracing = false;

    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }

    await this.flushToFile();

    const filePath = this.traceFilePath;
    console.log(`[TelemetryTrace] ✅ Session stopped. Trace saved to: ${filePath}`);
    
    this.currentSession = null;
    this.traceBuffer = [];
    
    return filePath;
  }

  trace(
    service: string,
    event: string,
    level: TraceEvent['level'] = 'INFO',
    data?: any,
    duration?: number
  ): void {
    if (!this.isTracing) return;

    const traceEvent: TraceEvent = {
      timestamp: new Date().toISOString(),
      timestampMs: Date.now(),
      service,
      event,
      level,
      data: this.sanitizeData(data),
      duration
    };

    this.traceBuffer.push(traceEvent);
    
    if (this.currentSession) {
      this.currentSession.events.push(traceEvent);
    }

    const prefix = level === 'ERROR' ? '❌' : level === 'WARN' ? '⚠️' : level === 'DEBUG' ? '🔍' : '📍';
    const dataStr = data ? ` | ${JSON.stringify(data).substring(0, 200)}` : '';
    console.log(`[TRACE] ${prefix} [${service}] ${event}${dataStr}`);
  }

  traceError(service: string, event: string, error: Error | any, data?: any): void {
    const traceEvent: TraceEvent = {
      timestamp: new Date().toISOString(),
      timestampMs: Date.now(),
      service,
      event,
      level: 'ERROR',
      data: this.sanitizeData(data),
      error: error?.message || String(error),
      stackTrace: error?.stack
    };

    this.traceBuffer.push(traceEvent);
    
    if (this.currentSession) {
      this.currentSession.events.push(traceEvent);
    }

    console.error(`[TRACE] ❌ [${service}] ${event}:`, error);
  }

  async traceAsync<T>(
    service: string,
    event: string,
    fn: () => Promise<T>,
    data?: any
  ): Promise<T> {
    const start = Date.now();
    this.trace(service, `${event}_START`, 'DEBUG', data);

    try {
      const result = await fn();
      const duration = Date.now() - start;
      this.trace(service, `${event}_COMPLETE`, 'INFO', { ...data, duration });
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      this.traceError(service, `${event}_FAILED`, error, { ...data, duration });
      throw error;
    }
  }

  traceSync<T>(
    service: string,
    event: string,
    fn: () => T,
    data?: any
  ): T {
    const start = Date.now();
    this.trace(service, `${event}_START`, 'DEBUG', data);

    try {
      const result = fn();
      const duration = Date.now() - start;
      this.trace(service, `${event}_COMPLETE`, 'INFO', { ...data, duration });
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      this.traceError(service, `${event}_FAILED`, error, { ...data, duration });
      throw error;
    }
  }

  private sanitizeData(data: any): any {
    if (!data) return data;
    
    const sensitiveKeys = ['password', 'token', 'apiKey', 'secret', 'authorization'];
    
    if (typeof data === 'object' && data !== null) {
      const sanitized: any = Array.isArray(data) ? [] : {};
      
      for (const key in data) {
        if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
          sanitized[key] = '***';
        } else if (typeof data[key] === 'object') {
          sanitized[key] = this.sanitizeData(data[key]);
        } else {
          sanitized[key] = data[key];
        }
      }
      
      return sanitized;
    }
    
    return data;
  }

  private async flushToFile(): Promise<void> {
    if (!this.currentSession || this.traceBuffer.length === 0) return;

    try {
      await fs.mkdir(path.dirname(this.traceFilePath), { recursive: true });
      
      const content = JSON.stringify(this.currentSession, null, 2);
      await fs.writeFile(this.traceFilePath, content, 'utf-8');
      
      this.traceBuffer = [];
    } catch (error) {
      console.error('[TelemetryTrace] Failed to flush:', error);
    }
  }

  getSessionInfo(): { sessionId: string; eventCount: number; isTracing: boolean } | null {
    if (!this.currentSession) return null;
    
    return {
      sessionId: this.currentSession.sessionId,
      eventCount: this.currentSession.events.length,
      isTracing: this.isTracing
    };
  }

  async generateMarkdownReport(jsonFilePath: string): Promise<string> {
    const jsonContent = await fs.readFile(jsonFilePath, 'utf-8');
    const session: TraceSession = JSON.parse(jsonContent);

    const mdFilePath = jsonFilePath.replace('.json', '.md');
    
    const lines: string[] = [];
    lines.push('# Phase 41C - Application Trace Report');
    lines.push('');
    lines.push(`**Session ID:** ${session.sessionId}`);
    lines.push(`**Start Time:** ${session.startTime}`);
    lines.push(`**End Time:** ${session.endTime || 'In Progress'}`);
    lines.push(`**Total Events:** ${session.events.length}`);
    lines.push('');
    lines.push('## Session Metadata');
    lines.push('```json');
    lines.push(JSON.stringify(session.metadata, null, 2));
    lines.push('```');
    lines.push('');
    lines.push('## Event Timeline');
    lines.push('');

    const eventsByService: Record<string, TraceEvent[]> = {};
    for (const event of session.events) {
      if (!eventsByService[event.service]) {
        eventsByService[event.service] = [];
      }
      eventsByService[event.service].push(event);
    }

    lines.push('### Events by Service');
    for (const [service, events] of Object.entries(eventsByService)) {
      lines.push(`\n#### ${service} (${events.length} events)`);
      lines.push('');
      
      const errors = events.filter(e => e.level === 'ERROR');
      const warnings = events.filter(e => e.level === 'WARN');
      
      if (errors.length > 0) {
        lines.push(`⚠️ **Errors:** ${errors.length}`);
      }
      if (warnings.length > 0) {
        lines.push(`⚠️ **Warnings:** ${warnings.length}`);
      }
      
      lines.push('');
      lines.push('| Time | Event | Level | Duration | Data |');
      lines.push('|------|-------|-------|----------|------|');
      
      for (const event of events.slice(0, 50)) {
        const time = new Date(event.timestamp).toLocaleTimeString();
        const data = event.data ? JSON.stringify(event.data).substring(0, 100) : '';
        const duration = event.duration ? `${event.duration}ms` : '';
        lines.push(`| ${time} | ${event.event} | ${event.level} | ${duration} | ${data} |`);
      }
      
      if (events.length > 50) {
        lines.push(`\n*... and ${events.length - 50} more events*`);
      }
    }

    lines.push('');
    lines.push('## Summary Statistics');
    lines.push('');
    
    const totalDuration = session.endTime 
      ? new Date(session.endTime).getTime() - new Date(session.startTime).getTime()
      : 0;
    
    lines.push(`- **Total Duration:** ${Math.round(totalDuration / 1000)}s`);
    lines.push(`- **Total Events:** ${session.events.length}`);
    lines.push(`- **Services Traced:** ${Object.keys(eventsByService).length}`);
    lines.push(`- **Errors:** ${session.events.filter(e => e.level === 'ERROR').length}`);
    lines.push(`- **Warnings:** ${session.events.filter(e => e.level === 'WARN').length}`);

    const avgEventDuration = session.events
      .filter(e => e.duration)
      .reduce((sum, e) => sum + (e.duration || 0), 0) / session.events.filter(e => e.duration).length;
    
    if (!isNaN(avgEventDuration)) {
      lines.push(`- **Average Event Duration:** ${avgEventDuration.toFixed(2)}ms`);
    }

    await fs.writeFile(mdFilePath, lines.join('\n'), 'utf-8');
    
    return mdFilePath;
  }
}

export const telemetryTrace = TelemetryTraceService.getInstance();

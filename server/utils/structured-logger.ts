import { randomUUID } from 'crypto';

export interface LogContext {
  traceId?: string;
  service?: string;
  phase?: string;
  mode?: 'paper' | 'live';
  symbol?: string;
  userId?: string;
  [key: string]: any;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context: LogContext;
  stack?: string;
}

class StructuredLogger {
  private defaultContext: LogContext = {};

  setDefaultContext(context: LogContext): void {
    this.defaultContext = { ...this.defaultContext, ...context };
  }

  private formatLog(level: LogLevel, message: string, context: LogContext, error?: Error): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: {
        ...this.defaultContext,
        ...context,
        traceId: context.traceId || randomUUID(),
      },
    };

    if (error) {
      entry.stack = error.stack;
      entry.context.errorMessage = error.message;
      entry.context.errorName = error.name;
    }

    return entry;
  }

  private emit(entry: LogEntry): void {
    const jsonLog = JSON.stringify(entry);
    
    switch (entry.level) {
      case 'error':
        console.error(jsonLog);
        break;
      case 'warn':
        console.warn(jsonLog);
        break;
      case 'debug':
        if (process.env.LOG_LEVEL === 'debug') {
          console.log(jsonLog);
        }
        break;
      default:
        console.log(jsonLog);
    }
  }

  debug(message: string, context: LogContext = {}): void {
    this.emit(this.formatLog('debug', message, context));
  }

  info(message: string, context: LogContext = {}): void {
    this.emit(this.formatLog('info', message, context));
  }

  warn(message: string, context: LogContext = {}, error?: Error): void {
    this.emit(this.formatLog('warn', message, context, error));
  }

  error(message: string, context: LogContext = {}, error?: Error): void {
    this.emit(this.formatLog('error', message, context, error));
  }

  metric(metricName: string, value: number, labels: Record<string, string> = {}): void {
    this.info(`METRIC: ${metricName}`, {
      metric: metricName,
      value,
      labels,
    });
  }
}

export const logger = new StructuredLogger();

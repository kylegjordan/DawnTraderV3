type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: any;
}

class Logger {
  private context: LogContext;
  private minLevel: LogLevel;

  constructor(context: LogContext = {}, minLevel: LogLevel = 'info') {
    this.context = context;
    this.minLevel = minLevel;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.minLevel);
  }

  private formatMessage(level: LogLevel, message: string, meta?: LogContext): string {
    const timestamp = new Date().toISOString();
    const contextStr = Object.keys(this.context).length > 0 
      ? ` [${Object.entries(this.context).map(([k, v]) => `${k}=${v}`).join(', ')}]` 
      : '';
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} ${level.toUpperCase()}${contextStr}: ${message}${metaStr}`;
  }

  debug(message: string, meta?: LogContext): void {
    if (this.shouldLog('debug')) {
      console.log(this.formatMessage('debug', message, meta));
    }
  }

  info(message: string, meta?: LogContext): void {
    if (this.shouldLog('info')) {
      console.log(this.formatMessage('info', message, meta));
    }
  }

  warn(message: string, meta?: LogContext): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message, meta));
    }
  }

  error(message: string, error?: Error | any, meta?: LogContext): void {
    if (this.shouldLog('error')) {
      const errorMeta = error instanceof Error 
        ? { ...meta, error: error.message, stack: error.stack }
        : { ...meta, error };
      console.error(this.formatMessage('error', message, errorMeta));
    }
  }

  child(additionalContext: LogContext): Logger {
    return new Logger(
      { ...this.context, ...additionalContext },
      this.minLevel
    );
  }
}

export const logger = new Logger({ service: 'trading-app' }, process.env.LOG_LEVEL as LogLevel || 'info');

export function createLogger(context: LogContext, minLevel?: LogLevel): Logger {
  return new Logger(context, minLevel || (process.env.LOG_LEVEL as LogLevel) || 'info');
}

/**
 * Structured logging utility for Chubao AI
 * Provides consistent log formatting and level management
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4,
}

export interface LogContext {
  [key: string]: unknown;
}

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  context?: LogContext;
  stack?: string;
}

class Logger {
  private minLevel: LogLevel;
  private serviceName: string;

  constructor(serviceName = 'chubao-ai', minLevel: LogLevel = LogLevel.INFO) {
    this.serviceName = serviceName;
    this.minLevel = minLevel;
  }

  setLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.minLevel;
  }

  private formatMessage(level: string, message: string, context?: LogContext): string {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
    };

    // Production: JSON format for structured logging
    if (process.env.NODE_ENV === 'production') {
      return JSON.stringify(entry);
    }

    // Development: Human-readable format with emojis
    const emoji = this.getLevelEmoji(level);
    const contextStr = context ? ` ${JSON.stringify(context)}` : '';
    return `${emoji} [${entry.timestamp}] ${level.toUpperCase()}: ${message}${contextStr}`;
  }

  private getLevelEmoji(level: string): string {
    const emojiMap: Record<string, string> = {
      debug: '🔍',
      info: 'ℹ️',
      warn: '⚠️',
      error: '❌',
      fatal: '💀',
    };
    return emojiMap[level.toLowerCase()] || 'ℹ️';
  }

  debug(message: string, context?: LogContext): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return;
    console.debug(this.formatMessage('debug', message, context));
  }

  info(message: string, context?: LogContext): void {
    if (!this.shouldLog(LogLevel.INFO)) return;
    console.log(this.formatMessage('info', message, context));
  }

  warn(message: string, context?: LogContext): void {
    if (!this.shouldLog(LogLevel.WARN)) return;
    console.warn(this.formatMessage('warn', message, context));
  }

  error(message: string, error?: Error | unknown, context?: LogContext): void {
    if (!this.shouldLog(LogLevel.ERROR)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'error',
      message,
      context,
    };

    if (error instanceof Error) {
      entry.stack = error.stack;
      entry.context = {
        ...entry.context,
        errorName: error.name,
        errorMessage: error.message,
      };
    } else if (error) {
      entry.context = {
        ...entry.context,
        error: String(error),
      };
    }

    if (process.env.NODE_ENV === 'production') {
      console.error(JSON.stringify(entry));
    } else {
      const emoji = this.getLevelEmoji('error');
      const contextStr = entry.context ? ` ${JSON.stringify(entry.context)}` : '';
      console.error(`${emoji} [${entry.timestamp}] ERROR: ${message}${contextStr}`);
      if (entry.stack) {
        console.error(entry.stack);
      }
    }
  }

  fatal(message: string, error?: Error | unknown, context?: LogContext): void {
    if (!this.shouldLog(LogLevel.FATAL)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'fatal',
      message,
      context,
    };

    if (error instanceof Error) {
      entry.stack = error.stack;
      entry.context = {
        ...entry.context,
        errorName: error.name,
        errorMessage: error.message,
      };
    }

    if (process.env.NODE_ENV === 'production') {
      console.error(JSON.stringify(entry));
    } else {
      const emoji = this.getLevelEmoji('fatal');
      const contextStr = entry.context ? ` ${JSON.stringify(entry.context)}` : '';
      console.error(`${emoji} [${entry.timestamp}] FATAL: ${message}${contextStr}`);
      if (entry.stack) {
        console.error(entry.stack);
      }
    }
  }

  // Specialized logging methods
  apiRequest(method: string, path: string, statusCode: number, durationMs: number): void {
    this.info('API request', {
      method,
      path,
      statusCode,
      durationMs: durationMs.toFixed(2),
    });
  }

  toolExecution(toolName: string, success: boolean, durationMs: number, error?: string): void {
    if (success) {
      this.debug(`Tool executed: ${toolName}`, { durationMs: durationMs.toFixed(2) });
    } else {
      this.error(`Tool failed: ${toolName}`, undefined, { durationMs: durationMs.toFixed(2), error });
    }
  }

  agentAction(action: string, details?: LogContext): void {
    this.info(`Agent action: ${action}`, details);
  }

  memoryOperation(operation: string, success: boolean, details?: LogContext): void {
    if (success) {
      this.debug(`Memory operation: ${operation}`, details);
    } else {
      this.warn(`Memory operation failed: ${operation}`, details);
    }
  }
}

// Singleton instance
export const logger = new Logger('chubao-ai', LogLevel.INFO);

// Set log level from environment
if (process.env.LOG_LEVEL) {
  const levelMap: Record<string, LogLevel> = {
    debug: LogLevel.DEBUG,
    info: LogLevel.INFO,
    warn: LogLevel.WARN,
    error: LogLevel.ERROR,
    fatal: LogLevel.FATAL,
  };
  const envLevel = levelMap[process.env.LOG_LEVEL.toLowerCase()];
  if (envLevel !== undefined) {
    logger.setLevel(envLevel);
  }
}

// Export convenience function for child loggers
export function createLogger(serviceName: string, minLevel?: LogLevel): Logger {
  return new Logger(serviceName, minLevel);
}

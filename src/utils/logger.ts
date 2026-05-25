type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

class Logger {
  private readonly level: LogLevel;

  constructor(level: LogLevel = 'info') {
    this.level = level;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_ORDER[level] <= LOG_LEVEL_ORDER[this.level];
  }

  private format(level: string, message: string): string {
    return `[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}`;
  }

  error(message: string, ...args: unknown[]): void {
    if (this.shouldLog('error')) console.error(this.format('error', message), ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.shouldLog('warn')) console.warn(this.format('warn', message), ...args);
  }

  info(message: string, ...args: unknown[]): void {
    if (this.shouldLog('info')) console.info(this.format('info', message), ...args);
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.shouldLog('debug')) console.debug(this.format('debug', message), ...args);
  }
}

const rawLevel = process.env['LOG_LEVEL'] ?? 'info';
const validLevels: LogLevel[] = ['error', 'warn', 'info', 'debug'];
const logLevel: LogLevel = validLevels.includes(rawLevel as LogLevel)
  ? (rawLevel as LogLevel)
  : 'info';

export const logger = new Logger(logLevel);

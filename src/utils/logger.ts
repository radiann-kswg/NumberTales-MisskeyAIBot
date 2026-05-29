import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

interface FileLogRecord {
  timestamp: string;
  level: string;
  message: string;
  detail?: string;
}

class Logger {
  private readonly level: LogLevel;
  /** ファイル出力が有効な場合の追記先パス */
  private logFilePath: string | null = null;

  constructor(level: LogLevel = 'info') {
    this.level = level;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_ORDER[level] <= LOG_LEVEL_ORDER[this.level];
  }

  private format(level: string, message: string): string {
    return `[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}`;
  }

  /**
   * ファイルへのエラーログ出力を有効にする。
   * 起動時に一度だけ呼び出すこと（index.ts の main() 先頭付近）。
   * error / warn レベルのログを NDJSON 形式で追記する。
   */
  enableFileOutput(filePath: string): void {
    mkdirSync(dirname(filePath), { recursive: true });
    this.logFilePath = filePath;
    this.writeFile('info', `Error log file output enabled: ${filePath}`);
  }

  private writeFile(level: string, message: string, detail?: string): void {
    if (!this.logFilePath) return;
    const record: FileLogRecord = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(detail !== undefined ? { detail } : {}),
    };
    try {
      appendFileSync(this.logFilePath, JSON.stringify(record) + '\n', 'utf8');
    } catch {
      // ファイル書き込み失敗はコンソールのみに抑止（無限ループ防止）
    }
  }

  error(message: string, ...args: unknown[]): void {
    if (this.shouldLog('error')) {
      console.error(this.format('error', message), ...args);
      this.writeFile('error', message, args.length > 0 ? String(args[0]) : undefined);
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.shouldLog('warn')) {
      console.warn(this.format('warn', message), ...args);
      this.writeFile('warn', message, args.length > 0 ? String(args[0]) : undefined);
    }
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

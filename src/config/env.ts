import 'dotenv/config';

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

function optionalEnv(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

function parseCsvEnv(key: string): string[] {
  const value = process.env[key] ?? '';
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export const config = {
  misskey: {
    host: requireEnv('MISSKEY_HOST'),
    token: requireEnv('MISSKEY_TOKEN'),
  },
  ai: {
    provider: optionalEnv('AI_PROVIDER', 'openai') as 'openai' | 'gemini',
    openaiApiKey: process.env['OPENAI_API_KEY'],
    geminiApiKey: process.env['GEMINI_API_KEY'],
  },
  storage: {
    dbPath: optionalEnv('DB_PATH', '.cache/session.db'),
    /** ハラスメント・インシデントログの出力先ファイルパス */
    incidentLogPath: optionalEnv('INCIDENT_LOG_PATH', '.cache/incident.log'),
    /** エラー・警告ログの出力先ファイルパス（error / warn レベル） */
    errorLogPath: optionalEnv('ERROR_LOG_PATH', '.cache/error.log'),
  },
  bot: {
    nodeEnv: optionalEnv('NODE_ENV', 'development') as 'development' | 'production',
    logLevel: optionalEnv('LOG_LEVEL', 'info') as 'error' | 'warn' | 'info' | 'debug',
    defaultCharacterNum: optionalEnv('DEFAULT_CHARACTER_NUM', '000'),
    adminUserIds: parseCsvEnv('ADMIN_USER_IDS'),
  },
  rateLimit: {
    replyCooldownMs: parseInt(optionalEnv('RATE_LIMIT_REPLY_COOLDOWN_MS', '0'), 10),
    globalPerHour: parseInt(optionalEnv('RATE_LIMIT_GLOBAL_PER_HOUR', '10'), 10),
  },
} as const;

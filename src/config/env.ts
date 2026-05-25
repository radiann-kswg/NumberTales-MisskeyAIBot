import 'dotenv/config';

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

function optionalEnv(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
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
    creationsDbPath: optionalEnv(
      'CREATIONS_DB_PATH',
      './_creations-db/data/Works_NumberTales/DataBases/db_Primary.json',
    ),
  },
  bot: {
    nodeEnv: optionalEnv('NODE_ENV', 'development') as 'development' | 'production',
    logLevel: optionalEnv('LOG_LEVEL', 'info') as 'error' | 'warn' | 'info' | 'debug',
  },
  rateLimit: {
    replyCooldownMs: parseInt(optionalEnv('RATE_LIMIT_REPLY_COOLDOWN_MS', '60000'), 10),
    globalPerHour: parseInt(optionalEnv('RATE_LIMIT_GLOBAL_PER_HOUR', '10'), 10),
  },
} as const;

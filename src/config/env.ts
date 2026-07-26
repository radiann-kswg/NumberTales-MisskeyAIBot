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
    /** ハートビートファイルの出力先（VM 内ウォッチドッグが鮮度を監視） */
    heartbeatPath: optionalEnv('HEARTBEAT_PATH', '.cache/heartbeat.json'),
    /** ハートビート書き込み間隔（ミリ秒） */
    heartbeatIntervalMs: parseInt(optionalEnv('HEARTBEAT_INTERVAL_MS', '30000'), 10),
  },
  bot: {
    nodeEnv: optionalEnv('NODE_ENV', 'development') as 'development' | 'production',
    logLevel: optionalEnv('LOG_LEVEL', 'info') as 'error' | 'warn' | 'info' | 'debug',
    defaultCharacterNum: optionalEnv('DEFAULT_CHARACTER_NUM', '000'),
    adminUserIds: parseCsvEnv('ADMIN_USER_IDS'),
  },
  rateLimit: {
    replyCooldownMs: parseInt(optionalEnv('RATE_LIMIT_REPLY_COOLDOWN_MS', '0'), 10),
    globalPerHour: parseInt(optionalEnv('RATE_LIMIT_GLOBAL_PER_HOUR', '30'), 10),
  },
  features: {
    enableGlobalTL: optionalEnv('ENABLE_GLOBAL_TL', 'false') === 'true',
  },
  recoveryNotice: {
    /** ダウンタイム通知の下限閾値（これ未満は無言復帰。reload やウォッチドッグ再起動の数分を除外）。既定30分 */
    thresholdMs: parseInt(optionalEnv('DOWNTIME_NOTICE_THRESHOLD_MS', String(30 * 60 * 1000)), 10),
    /** ダウンタイム通知のクールダウン（クラッシュループでの連投を防ぐ）。既定6時間 */
    cooldownMs: parseInt(optionalEnv('DOWNTIME_NOTICE_COOLDOWN_MS', String(6 * 60 * 60 * 1000)), 10),
    /** ダウンタイム通知の上限（スナップショット復元で古い heartbeat が蘇る誤検知を弾く）。既定7日 */
    maxMs: parseInt(optionalEnv('DOWNTIME_NOTICE_MAX_MS', String(7 * 24 * 60 * 60 * 1000)), 10),
  },
} as const;

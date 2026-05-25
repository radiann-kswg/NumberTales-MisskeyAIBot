import 'dotenv/config';
import { config } from './config/env.js';
import { createAIProvider } from './ai/index.js';
import { logger } from './utils/logger.js';

async function main(): Promise<void> {
  logger.info('NumberTales Misskey AI Bot — starting...');
  logger.info(`Environment : ${config.bot.nodeEnv}`);
  logger.info(`AI Provider : ${config.ai.provider}`);

  // AI プロバイダーの初期化（OpenAI / Gemini を抽象レイヤー経由で切り替え）
  const ai = createAIProvider({
    provider: config.ai.provider,
    openaiApiKey: config.ai.openaiApiKey,
    geminiApiKey: config.ai.geminiApiKey,
  });
  logger.info(`AI provider initialized: ${ai.name}`);

  // Phase 1: Misskey WebSocket 接続・イベントハンドラ登録
  // Phase 2: スケジューラー起動（自発投稿・時間帯制御）

  logger.info('Bot initialized. Waiting for Phase 1 implementation...');
}

main().catch((err: unknown) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

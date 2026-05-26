import 'dotenv/config';
import { config } from './config/env.js';
import { createAIProvider } from './ai/index.js';
import { MisskeyClient } from './misskey/client.js';
import { RateLimiter } from './bot/ratelimit/index.js';
import { SessionStore } from './storage/session.js';
import { handleMention, type MentionEvent } from './bot/handlers/mention.js';
import { createTimelineHandler } from './bot/handlers/timeline.js';
import { PostScheduler } from './bot/scheduler/index.js';
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

  // Misskey クライアント初期化
  const misskeyClient = new MisskeyClient(config.misskey.host, config.misskey.token);
  const myUserId = await misskeyClient.getMyUserId();
  logger.info(`Logged in as userId: ${myUserId}`);

  // レートリミッター初期化
  const rateLimiter = new RateLimiter(
    config.rateLimit.replyCooldownMs,
    config.rateLimit.globalPerHour,
  );

  // セッションコンテキストストア初期化（TTL 付き SQLite）
  const sessionStore = new SessionStore(config.storage.dbPath);
  sessionStore.pruneExpired(); // 起動時に期限切れをクリーン
  logger.info(`Session store ready: ${config.storage.dbPath}`);

  // メンション受信ループ開始
  misskeyClient.onMention(async (note) => {
    // @username メンション部分を除去してテキストを抽出
    const rawText = note.text ?? '';
    const text = rawText.replace(/@\S+/g, '').trim();

    const event: MentionEvent = {
      noteId: note.id,
      userId: note.userId,
      text,
      replyId: note.replyId ?? undefined,
    };

    await handleMention(event, { ai, misskeyClient, myUserId, rateLimiter, sessionStore });
  });

  logger.info('Bot is listening for mentions...');

  // homeTimeline リアクションハンドラ起動
  const handleTimelineNote = createTimelineHandler({ misskeyClient, myUserId });
  misskeyClient.onHomeTL(handleTimelineNote);

  // 時間帯別自発投稿スケジューラー起動
  const scheduler = new PostScheduler({ ai, misskeyClient });
  scheduler.start();

  // プロセス終了時のクリーンアップ
  const shutdown = (): void => {
    logger.info('Shutting down...');
    scheduler.stop();
    misskeyClient.close();
    sessionStore.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err: unknown) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

import 'dotenv/config';
import { config } from './config/env.js';
import { createAIProvider } from './ai/index.js';
import { MisskeyClient } from './misskey/client.js';
import { RateLimiter } from './bot/ratelimit/index.js';
import { ActiveCharacterStore } from './bot/character/store.js';
import { SessionStore } from './storage/session.js';
import { GameSessionStore } from './storage/game-session.js';
import { BotStateStore } from './storage/bot-state.js';
import { handleMention, type MentionEvent } from './bot/handlers/mention.js';
import { createTimelineHandler } from './bot/handlers/timeline.js';
import { createGlobalTLHandler } from './bot/handlers/global-tl.js';
import { createFollowBackHandler } from './bot/handlers/follow.js';
import { PostScheduler } from './bot/scheduler/index.js';
import { setEmojiCache } from './bot/responder/emoji.js';
import { initializeCharacterDB } from './bot/character/loader.js';
import { logger } from './utils/logger.js';
import { IncidentLogger } from './utils/incident-logger.js';

async function main(): Promise<void> {
  logger.info('NumberTales Misskey AI Bot — starting...');
  logger.info(`Environment : ${config.bot.nodeEnv}`);
  logger.info(`AI Provider : ${config.ai.provider}`);

  // キャラクターDB を CreationsDBClient 経由で初期化（失敗時はフォールバック）
  await initializeCharacterDB();

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

  // カスタム絵文字キャッシュを起動時に一度取得（失敗時はスキップ）
  await misskeyClient.fetchEmojis().then((emojis) => {
    setEmojiCache(emojis);
    logger.info(`Emoji cache loaded: ${emojis.length} emojis`);
  }).catch((err: unknown) => {
    logger.warn('Failed to load emoji cache. Emoji resolution will use fallback names.', err);
  });
  // レートリミッター初期化
  const rateLimiter = new RateLimiter(
    config.rateLimit.replyCooldownMs,
    config.rateLimit.globalPerHour,
  );

  // セッションコンテキストストア初期化（TTL 付き SQLite）
  const sessionStore = new SessionStore(config.storage.dbPath);
  sessionStore.pruneExpired(); // 起動時に期限切れをクリーン
  logger.info(`Session store ready: ${config.storage.dbPath}`);

  // ゲームセッションストア初期化（ターン制ミニゲーム用）
  const gameSessionStore = new GameSessionStore(config.storage.dbPath);
  gameSessionStore.pruneExpired();
  logger.info('Game session store ready');

  // Bot 状態ストア初期化（週次担当キャラクター等の永続状態）
  const botState = new BotStateStore(config.storage.dbPath);
  logger.info('Bot state store ready');

  // ユーザーごとのアクティブキャラクター状態（Phase A 基盤）
  const activeCharacterStore = new ActiveCharacterStore(
    config.storage.dbPath,
    config.bot.defaultCharacterNum,
  );

  // インシデントロガー初期化
  const incidentLogger = new IncidentLogger(config.storage.incidentLogPath);
  logger.info(`Incident log: ${config.storage.incidentLogPath}`);

  // エラーログのファイル出力を有効化
  logger.enableFileOutput(config.storage.errorLogPath);
  logger.info(`Error log: ${config.storage.errorLogPath}`);

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
      username: note.user.username,
      userHost: note.user.host ?? null,
      noteCreatedAt: note.createdAt,
    };

    await handleMention(event, { ai, misskeyClient, myUserId, rateLimiter, sessionStore, gameSessionStore, activeCharacterStore, incidentLogger, botState });
  });

  logger.info('Bot is listening for mentions...');

  // homeTimeline リアクションハンドラ起動
  const handleTimelineNote = createTimelineHandler({ misskeyClient, myUserId, ai });
  misskeyClient.onHomeTL(handleTimelineNote);

  // globalTimeline ハッシュタグ検出リアクションハンドラ起動（ENABLE_GLOBAL_TL=true の場合のみ）
  if (config.features.enableGlobalTL) {
    const handleGlobalTLNote = createGlobalTLHandler({ misskeyClient, myUserId, ai });
    misskeyClient.onGlobalTL(handleGlobalTLNote);
  } else {
    logger.info('GlobalTL handler is disabled (ENABLE_GLOBAL_TL=false)');
  }

  // フォローバックハンドラ起動
  const handleFollowed = createFollowBackHandler({ misskeyClient, myUserId });
  misskeyClient.onFollowed(handleFollowed);

  // 時間帯別自発投稿スケジューラー起動
  const scheduler = new PostScheduler({ ai, misskeyClient, botState });
  scheduler.start();

  // プロセス終了時のクリーンアップ
  const shutdown = (): void => {
    logger.info('Shutting down...');
    scheduler.stop();
    misskeyClient.close();
    activeCharacterStore.close();
    sessionStore.close();
    gameSessionStore.close();
    botState.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err: unknown) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

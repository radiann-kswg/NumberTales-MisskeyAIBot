import 'dotenv/config';
import { config } from './config/env.js';
import { createAIProvider } from './ai/index.js';
import { MisskeyClient } from './misskey/client.js';
import { RateLimiter } from './bot/ratelimit/index.js';
import { ActiveCharacterStore } from './bot/character/store.js';
import { SessionStore } from './storage/session.js';
import { GameSessionStore } from './storage/game-session.js';
import { BotStateStore } from './storage/bot-state.js';
import { TaskStore } from './storage/task.js';
import { TrustStore } from './storage/trust.js';
import { handleMention, type MentionEvent } from './bot/handlers/mention.js';
import { createTimelineHandler } from './bot/handlers/timeline.js';
import { createGlobalTLHandler } from './bot/handlers/global-tl.js';
import { createFollowBackHandler } from './bot/handlers/follow.js';
import { PostScheduler } from './bot/scheduler/index.js';
import { setEmojiCache } from './bot/responder/emoji.js';
import { initializeCharacterDB } from './bot/character/loader.js';
import { logger } from './utils/logger.js';
import { IncidentLogger } from './utils/incident-logger.js';
import { HeartbeatWriter, readLastHeartbeat } from './utils/heartbeat.js';
import { postRecoveryNoticeIfNeeded } from './features/recovery-notice.js';

/**
 * イベントハンドラ（onMention/onHomeTL 等）内で発生した未捕捉エラーはこのプロセスの
 * 通常の Promise チェーンの外側で発生するため、`main().catch()` では拾えない。
 * ここで拾わないと Node が unhandledRejection/uncaughtException でプロセスごと
 * 落ちてしまう（1件の投稿処理の失敗が Bot 全体のダウンに直結してしまう）ため、
 * ログに記録した上でプロセスは継続させる。
 */
function registerGlobalErrorHandlers(): void {
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection (process kept alive):', reason);
  });
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception (process kept alive):', err);
  });
}

async function main(): Promise<void> {
  registerGlobalErrorHandlers();

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

  // タスクストア初期化（F-12）
  const taskStore = new TaskStore(config.storage.dbPath);
  taskStore.pruneExpiredPendingDrafts(); // 起動時に期限切れの確認待ちドラフトをクリーン
  logger.info('Task store ready');

  // 信頼度ストア初期化（F-12B）
  const trustStore = new TrustStore(config.storage.dbPath);
  logger.info('Trust store ready');

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

    await handleMention(event, { ai, misskeyClient, myUserId, rateLimiter, sessionStore, gameSessionStore, activeCharacterStore, incidentLogger, botState, taskStore, trustStore });
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
  const scheduler = new PostScheduler({ ai, misskeyClient, botState, taskStore, trustStore, activeCharacterStore });
  scheduler.start();

  // ダウンタイム算出用に、HeartbeatWriter が上書きする前の前回 ts を退避しておく
  const prevHeartbeatTs = readLastHeartbeat(config.storage.heartbeatPath)?.ts ?? null;

  // ハートビート開始（VM 内ウォッチドッグによるハング・WS切断検知用）
  const heartbeat = new HeartbeatWriter(
    config.storage.heartbeatPath,
    config.storage.heartbeatIntervalMs,
    () => misskeyClient.isConnected(),
  );
  heartbeat.start();

  // ダウンタイム明けの復旧通知（WS 接続確立を待って1回だけ home 投稿。起動をブロックしない）
  void postRecoveryNoticeIfNeeded(prevHeartbeatTs, Date.now(), {
    ai,
    misskeyClient,
    botState,
    thresholdMs: config.recoveryNotice.thresholdMs,
    cooldownMs: config.recoveryNotice.cooldownMs,
    maxMs: config.recoveryNotice.maxMs,
  }).catch((err: unknown) => logger.error('Recovery notice failed:', err));

  // プロセス終了時のクリーンアップ
  const shutdown = (): void => {
    logger.info('Shutting down...');
    heartbeat.stop();
    scheduler.stop();
    misskeyClient.close();
    activeCharacterStore.close();
    sessionStore.close();
    gameSessionStore.close();
    botState.close();
    taskStore.close();
    trustStore.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err: unknown) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

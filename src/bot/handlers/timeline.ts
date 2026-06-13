import type { entities } from 'misskey-js';
import type { MisskeyClient } from '../../misskey/client.js';
import type { AIProvider } from '../../ai/provider.js';
import { shouldSkipReaction, classifyNoteEmotion } from '../reactor/classify.js';
import { REACTION_EMOJI_MAP } from '../reactor/emoji-reaction-map.js';
import { logger } from '../../utils/logger.js';

type Note = entities.Note;

/** 同一ユーザーへのリアクション間隔 (1時間) */
const REACTION_COOLDOWN_MS = 60 * 60 * 1000;

/** 全体の1時間あたり最大リアクション数 */
const REACTION_GLOBAL_PER_HOUR = 20;

export interface TimelineHandlerDeps {
  misskeyClient: MisskeyClient;
  myUserId: string;
  ai: AIProvider;
}

/**
 * homeTimeline ノートへのリアクションハンドラを生成する。
 *
 * 処理フロー:
 *   1. 自己ノート除外
 *   2. フィルタリング（画像・高度MFM・長文・絵文字多用）
 *   3. 感情カテゴリ判定（マッチなしはスキップ）
 *   4. レートリミット確認（ユーザー1時間1回・全体20回/時）
 *   5. 絵文字をランダム選択してリアクション送信
 */
export function createTimelineHandler(deps: TimelineHandlerDeps) {
  const { misskeyClient, myUserId, ai } = deps;

  /** userId -> 最後にリアクションしたタイムスタンプ (ms) */
  const lastReacted = new Map<string, number>();

  /** 直近1時間のリアクション送信タイムスタンプ一覧 */
  let reactionTimes: number[] = [];

  return async function handleTimelineNote(note: Note): Promise<void> {
    // 1. 自分自身のノートは対象外
    if (note.userId === myUserId) return;

    // 2. フィルタリング
    if (shouldSkipReaction(note)) return;

    // 3. 感情カテゴリ判定（挨拶は正規表現、それ以外は LLM）
    const category = await classifyNoteEmotion(note, ai);
    if (category === null) return;

    // 4. レートリミット確認
    const now = Date.now();
    reactionTimes = reactionTimes.filter((t) => now - t < 3_600_000);

    if (reactionTimes.length >= REACTION_GLOBAL_PER_HOUR) {
      logger.debug('Reaction rate limit reached (global)');
      return;
    }

    const lastTime = lastReacted.get(note.userId);
    if (lastTime !== undefined && now - lastTime < REACTION_COOLDOWN_MS) {
      logger.debug(`Reaction cooldown active for user: ${note.userId}`);
      return;
    }

    // 5. 絵文字をランダム選択してリアクション送信
    const pool = REACTION_EMOJI_MAP[category] as readonly string[];
    const emoji = pool[Math.floor(Math.random() * pool.length)] as string;

    try {
      await misskeyClient.react(note.id, emoji);
      lastReacted.set(note.userId, now);
      reactionTimes.push(now);
      logger.info(`Reacted :${emoji}: to ${note.userId} (category: ${category})`);
    } catch (err) {
      logger.error('Failed to send reaction:', err);
    }
  };
}

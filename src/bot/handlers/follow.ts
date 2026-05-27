import type { entities } from 'misskey-js';
import type { MisskeyClient } from '../../misskey/client.js';
import { logger } from '../../utils/logger.js';

/** 重複フォローバック防止のクールダウン（5分） */
const FOLLOWBACK_DEDUP_MS = 5 * 60 * 1000;

export interface FollowBackHandlerDeps {
  misskeyClient: MisskeyClient;
  myUserId: string;
}

/**
 * フォローバックハンドラファクトリ
 * - followed イベントを受け取り、フォローバックを実行する
 * - 同一ユーザーへの重複フォローバックは FOLLOWBACK_DEDUP_MS 以内でスキップ
 */
export function createFollowBackHandler(deps: FollowBackHandlerDeps) {
  const { misskeyClient, myUserId } = deps;
  const recentlyFollowedBack = new Map<string, number>();

  return async function handleFollowed(
    user: entities.UserDetailed | entities.UserLite,
  ): Promise<void> {
    if (user.id === myUserId) return;

    const now = Date.now();
    const lastTime = recentlyFollowedBack.get(user.id);
    if (lastTime !== undefined && now - lastTime < FOLLOWBACK_DEDUP_MS) {
      logger.debug(`Follow-back skipped (cooldown): @${user.username ?? user.id}`);
      return;
    }

    try {
      await misskeyClient.follow(user.id);
      recentlyFollowedBack.set(user.id, now);
      logger.info(`Followed back: @${user.username ?? user.id}`);
    } catch (err) {
      logger.warn(`Follow-back failed for ${user.id}:`, err);
    }
  };
}

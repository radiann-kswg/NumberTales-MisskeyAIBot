import type { entities } from 'misskey-js';
import type { MisskeyClient } from '../../misskey/client.js';
import type { AIProvider } from '../../ai/provider.js';
import { classifyNoteEmotion } from '../reactor/classify.js';
import { REACTION_EMOJI_MAP } from '../reactor/emoji-reaction-map.js';
import { BOT_CONSTANTS } from '../../config/constants.js';
import { logger } from '../../utils/logger.js';

type Note = entities.Note;

/** 同一ユーザーへのリアクション間隔 (1時間) */
const REACTION_COOLDOWN_MS = 60 * 60 * 1000;

const LLM_RELEVANCE_PROMPT = `You are a content filter for a Japanese creative fiction fan bot called "ナンバーテールズ" (NumberTales).
Determine whether the given post is actually related to the creative work "ナンバーテールズ" or its associated content (characters, world-building, fan art, etc.).
Respond with ONLY one word — no explanation, no punctuation.

- related: The post is genuinely about ナンバーテールズ or meaningfully references it
- unrelated: The post has nothing to do with ナンバーテールズ (e.g., spam, ads, unrelated content that merely uses the hashtag)`;

export interface GlobalTLHandlerDeps {
  misskeyClient: MisskeyClient;
  myUserId: string;
  ai: AIProvider;
}

/**
 * globalTimeline のハッシュタグ検出リアクションハンドラを生成する。
 *
 * 処理フロー:
 *   1. 自己ノート除外
 *   2. リノート除外
 *   3. NT_RELATED_HASHTAGS チェック（note.tags / note.text）
 *   4. NT_BLOCKLIST チェック
 *   5. LLM 関連性フィルタリング（unrelated はスキップ）
 *   6. 感情カテゴリ判定 → リアクション送信
 *   7. レートリミット（同一ユーザー1時間に1回）
 */
export function createGlobalTLHandler(deps: GlobalTLHandlerDeps) {
  const { misskeyClient, myUserId, ai } = deps;

  /** userId -> 最後にリアクションしたタイムスタンプ (ms) */
  const lastReacted = new Map<string, number>();

  return async function handleGlobalTLNote(note: Note): Promise<void> {
    // 1. 自己ノート除外
    if (note.userId === myUserId) return;

    // 2. リノート除外（renoteId あり かつ テキストが実質空）
    if (note.renoteId && !note.text?.trim()) return;

    const text = note.text ?? '';

    // 3. NT_RELATED_HASHTAGS チェック（tags フィールド優先、フォールバックで text 内検索）
    const noteTags: string[] = (note.tags ?? []).map((t) => t.toLowerCase());
    const hasRelatedTag = BOT_CONSTANTS.NT_RELATED_HASHTAGS.some(
      (tag) =>
        noteTags.includes(tag.toLowerCase()) ||
        text.includes(`#${tag}`),
    );
    if (!hasRelatedTag) return;

    // 4. NT_BLOCKLIST チェック
    const lowerText = text.toLowerCase();
    const isBlocked = BOT_CONSTANTS.NT_BLOCKLIST.some((word) =>
      lowerText.includes(word.toLowerCase()),
    );
    if (isBlocked) {
      logger.debug(`GlobalTL: blocked word matched, skipping note ${note.id}`);
      return;
    }

    // 5. LLM 関連性フィルタリング
    const isRelated = await checkRelevanceByLLM(text, ai);
    if (!isRelated) {
      logger.debug(`GlobalTL: LLM judged unrelated, skipping note ${note.id}`);
      return;
    }

    // 6. 感情カテゴリ判定（マッチなしはスキップ）
    const category = await classifyNoteEmotion(note, ai);
    if (category === null) return;

    // 7. レートリミット確認（同一ユーザー1時間に1回）
    const now = Date.now();
    const lastTime = lastReacted.get(note.userId);
    if (lastTime !== undefined && now - lastTime < REACTION_COOLDOWN_MS) {
      logger.debug(`GlobalTL: reaction cooldown active for user: ${note.userId}`);
      return;
    }

    // 8. 絵文字をランダム選択してリアクション送信
    const pool = REACTION_EMOJI_MAP[category] as readonly string[];
    const emoji = pool[Math.floor(Math.random() * pool.length)] as string;

    try {
      await misskeyClient.react(note.id, emoji);
      lastReacted.set(note.userId, now);
      logger.info(`GlobalTL: reacted :${emoji}: to ${note.userId} (category: ${category})`);
    } catch (err) {
      logger.error('GlobalTL: failed to send reaction:', err);
    }
  };
}

/**
 * LLM に投稿テキストを渡し、ナンバーテールズへの関連性を判定する。
 * 判定失敗時は安全側に倒して true（関連あり）を返す。
 */
async function checkRelevanceByLLM(text: string, ai: AIProvider): Promise<boolean> {
  try {
    const response = await ai.chat(
      [
        { role: 'system', content: LLM_RELEVANCE_PROMPT },
        { role: 'user', content: text },
      ],
      { maxTokens: 10, temperature: 0 },
    );
    return response.text.trim().toLowerCase() !== 'unrelated';
  } catch {
    return true;
  }
}

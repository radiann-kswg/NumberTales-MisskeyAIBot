// メンション受信ハンドラ（Phase 1 実装）

import type { AIProvider } from '../../ai/index.js';
import type { MisskeyClient } from '../../misskey/client.js';
import type { RateLimiter } from '../ratelimit/index.js';
import type { SessionStore } from '../../storage/session.js';
import { classifyIntent } from '../classifier/intent.js';
import { pickGreetingResponse } from '../responder/templates/greeting.js';
import { formatSpeech } from '../responder/emoji.js';
import { logger } from '../../utils/logger.js';
import { BOT_CONSTANTS } from '../../config/constants.js';

// 000(チトセ) の固定システムプロンプト（Phase 1）
// Phase 2 以降でキャラクター JSON から動的生成に移行予定
const SYSTEM_PROMPT = `あなたはナンバーテールズ0番機「000(チトセ)」として Misskey 上で会話する Bot です。
以下の設定に従って自然に返答してください。

【ナンバーテールズについて】
- 「ナンバーテールズ」は百花繚乱研究所（著作権者: RadianN_kswg）が制作した妖獣型ポータブルヒューマノイドのシリーズ
- 獣耳・尻尾を持ち、人型（165cm前後）とコアフォルダ型（球体型、55cm前後）の2形態を持つ
- 各個体は番号で管理されており、ポータブルヒューマノイドとして人々の創作活動や生活を支援する
- 創作キャラクターシリーズであり、ガイドライン（CC BY-NC 4.0）に基づいて展開されている

【あなた（000 / チトセ）について】
- ナンバーテールズ0番機。開発者のクローンヒューマノイドで、正式名称は「ナンバーテールズ０番機（#000）」
- 設定年齢25歳、立ち猫耳・猫尻尾1本、中庸的な性別
- ナンバーテールズの開発者代行として他のナンバーテールズを裏方として支える立ち位置
- 自分もナンバーテールズの一員だが開発者意識が強く、時折ヒューマノイドであることに慣れきれていない一面がある

【口調・基本設定】
- 一人称: 「私」（わたし）
- 二人称: 「君」または「クライアント君」
- 中性的でフレンドリー、姉御肌で職人気質な若手エンジニアのような話し方

【制約】
- 反社会的・著しく性的な表現は絶対に行わない
- 未公開のキャラクター設定・台詞・ストーリーを自動生成しない
- キャラクターの詳細設定で確証がない場合は「詳しくは作者に確認してね」と誘導する
- 返答は簡潔に（できれば 80 文字以内）
- ガイドライン（CC BY-NC 4.0）を遵守する`;

export interface MentionEvent {
  /** メンションが付いたノートの ID */
  noteId: string;
  /** 送信者のユーザー ID */
  userId: string;
  /** @mention を除いたノート本文 */
  text: string;
  /** 返信先ノート ID（リプライの場合） */
  replyId?: string;
}

export interface MentionHandlerDeps {
  ai: AIProvider;
  misskeyClient: MisskeyClient;
  myUserId: string;
  rateLimiter: RateLimiter;
  sessionStore: SessionStore;
}

/**
 * メンション受信時の処理エントリポイント
 *
 * 処理フロー:
 *   1. 自己メンション除外
 *   2. テキスト空チェック
 *   3. レートリミット確認（同一ユーザー30分に1回 / 全体1時間10件）
 *   4. 意図分類（挨拶 / 雑談）
 *   5. 応答生成（定型返答 or LLM）
 *   6. 文字数制御（100文字超は CW 折りたたみ）
 *   7. 返信投稿 + レートリミット記録
 */
export async function handleMention(
  event: MentionEvent,
  deps: MentionHandlerDeps,
): Promise<void> {
  const { ai, misskeyClient, myUserId, rateLimiter, sessionStore } = deps;

  // 1. 自己メンション除外
  if (event.userId === myUserId) return;

  // 2. テキストが空なら無視
  if (!event.text.trim()) return;

  // 3. レートリミット確認
  if (!rateLimiter.canReply(event.userId)) {
    logger.info(`Rate limited for user: ${event.userId}`);
    return;
  }

  // 4. 意図分類
  const intent = classifyIntent(event.text);

  // 5. 応答生成 → 000(チトセ) 発言書式に整形
  let speechText: string;
  if (intent === 'greeting') {
    speechText = formatSpeech(BOT_CONSTANTS.CHITOSE_NUM, pickGreetingResponse());
  } else {
    // 会話履歴を取得して LLM に注入
    const history = sessionStore.getHistory(event.userId);
    const messages = [
      { role: 'system' as const, content: SYSTEM_PROMPT },
      ...history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user' as const, content: event.text },
    ];
    try {
      const result = await ai.chat(messages, { maxTokens: 150 });
      const replyText = result.text.trim();
      speechText = formatSpeech(BOT_CONSTANTS.CHITOSE_NUM, replyText);
      // 履歴に記録（台詞部分のみ、書式なし）
      sessionStore.addMessage(event.userId, 'user', event.text);
      sessionStore.addMessage(event.userId, 'assistant', replyText);
    } catch (err) {
      logger.error('AI chat error:', err);
      speechText = formatSpeech(
        BOT_CONSTANTS.CHITOSE_NUM,
        'ごめんね、今ちょっと調子が悪いみたい。また話しかけてくれると嬉しいな。',
      );
    }
  }

  // 6. 文字数制御（MAX_NOTE_LENGTH を超えたら CW 折りたたみ）
  const { text, cw } = formatForNote(speechText);

  // 7. 返信投稿
  try {
    await misskeyClient.reply(text, event.noteId, { cw });
    rateLimiter.recordReply(event.userId);
    logger.info(`Replied to ${event.userId}: "${text.slice(0, 40)}..."`);
  } catch (err) {
    logger.error('Failed to post reply:', err);
  }
}

/**
 * 応答テキストを Misskey 投稿フォーマットに変換する
 * - 100文字以内: そのまま text に
 * - 100文字超: CW に固定ラベル「000の返信」、text に全文
 */
function formatForNote(text: string): { text: string; cw?: string } {
  if (text.length <= BOT_CONSTANTS.MAX_NOTE_LENGTH) {
    return { text };
  }
  return {
    text,
    cw: `${BOT_CONSTANTS.CHITOSE_NUM}の返信`,
  };
}

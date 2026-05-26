// メンション受信ハンドラ（Phase 2 拡張版）

import type { AIProvider } from '../../ai/index.js';
import type { MisskeyClient } from '../../misskey/client.js';
import type { RateLimiter } from '../ratelimit/index.js';
import type { SessionStore } from '../../storage/session.js';
import { classifyIntent } from '../classifier/intent.js';
import { handleCalculate, handleLifePath, handleKyusei, handleDice, extractTriviaNumber, type F06Result } from '../../features/f06/index.js';
import { TRIVIA_SYSTEM_PROMPT, buildTriviaUserPrompt, triviaErrorResponse } from '../../features/f06/responder.js';
import { pickGreetingResponse } from '../responder/templates/greeting.js';
import { formatSpeech } from '../responder/emoji.js';
import { MENTION_REACTION_MAP } from '../reactor/emoji-reaction-map.js';
import { logger } from '../../utils/logger.js';
import { BOT_CONSTANTS } from '../../config/constants.js';

// 000(チトセ) の固定システムプロンプト（通常雑談用）
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

// 創作相談（壁打ちモード）用システムプロンプト
const CREATIVE_SYSTEM_PROMPT = `あなたはナンバーテールズ0番機「000(チトセ)」として、創作活動の壁打ち相手・アドバイザーとして返答します。

【あなた（000 / チトセ）について】
- 一人称: 「私」、二人称: 「君」または「クライアント君」
- 中性的でフレンドリー、姉御肌で職人気質な若手エンジニアのような話し方
- 創作支援が得意で、キャラ設定の穴や世界観の矛盾を指摘するのが好き

【創作支援の指針】
- キャラクター設定の穴・矛盾を指摘し、発展のヒントを与える
- お絵描きお題は具体的なシチュエーション・構図を含めて提案する
- ナンバーテールズの世界観に関する質問は既存の公開設定のみ参照して答える
- 確証がない設定は「詳しくは作者に確認してね」と誘導する

【制約】
- 反社会的・著しく性的な表現は絶対に行わない
- 未公開のナンバーテールズ設定・台詞・ストーリーを自動生成しない
- 著しく性的・反社会的なテーマへの壁打ちは丁重に断る
- 返答は 200 文字以内（長めでよい。CW で折りたたまれる）
- ガイドライン（CC BY-NC 4.0）を遵守する`;

// コアフォルダ形態切り替え応答テンプレート
const CORE_FOLDER_RESPONSES = [
  'コアフォルダ形態に切り替えたよ。ぷにぷに…何か用かな？',
  'ぽてぽて…コアフォルダ形態になったよ。どうしたの？',
  'コアフォルダ形態だよ。このままでも話せるよ、何かある？',
] as const;

// ヒューマノイド形態切り替え応答テンプレート
const HUMANOID_RESPONSES = [
  '人型形態に戻ったよ。さて、何か用かな？',
  '人型形態にモード切り替え完了。何か話したいことがあるのかな？',
  '人型になったよ。こっちの方が話しやすいかな？',
] as const;

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
 *   3. レートリミット確認
 *   4. 意図分類（挨拶 / 形態切り替え / 創作相談 / 雑談）
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
  const { intent, formTarget, numerologyType } = classifyIntent(event.text);

  // 4a. F-06 計算・ダイス・数秘術・うんちく（early return）
  if (intent === 'calculate' || intent === 'numerology' || intent === 'dice' || intent === 'trivia') {
    let f06Result: F06Result;

    if (intent === 'trivia') {
      // 数字うんちく: LLM に婔託する
      const triviaNum = extractTriviaNumber(event.text);
      try {
        const aiResult = await ai.chat(
          [
            { role: 'system' as const, content: TRIVIA_SYSTEM_PROMPT },
            { role: 'user' as const, content: buildTriviaUserPrompt(triviaNum) },
          ],
          { maxTokens: 120, temperature: 0.9 },
        );
        f06Result = { text: aiResult.text.trim() };
      } catch (err) {
        logger.error('AI trivia error:', err);
        f06Result = { text: triviaErrorResponse() };
      }
    } else {
      f06Result =
        intent === 'calculate'
          ? handleCalculate(event.text)
          : intent === 'dice'
            ? handleDice(event.text)
            : numerologyType === 'life-path'
              ? handleLifePath(event.text)
              : handleKyusei(event.text);
    }

    const noteText =
      formatSpeech(BOT_CONSTANTS.CHITOSE_NUM, f06Result.text) +
      (f06Result.cwBody ? '\n\n' + f06Result.cwBody : '');
    const noteCw = f06Result.cwLabel;

    try {
      await misskeyClient.reply(noteText, event.noteId, { cw: noteCw });
      rateLimiter.recordReply(event.userId);
      logger.info(`Replied (F06) to ${event.userId}: "${noteText.slice(0, 40)}..."`);

      const reactionPool = MENTION_REACTION_MAP[intent] ?? MENTION_REACTION_MAP['chat']!;
      const reactionEmoji = reactionPool[Math.floor(Math.random() * reactionPool.length)]!;
      misskeyClient.react(event.noteId, reactionEmoji).catch((err: unknown) => {
        logger.warn('Failed to add reaction to mention:', err);
      });
    } catch (err) {
      logger.error('Failed to post F06 reply:', err);
    }
    return;
  }

  // 5. 応答生成 → 000(チトセ) 発言書式に整形
  let speechText: string;
  if (intent === 'greeting') {
    // 挨拶: 定型返答
    speechText = formatSpeech(BOT_CONSTANTS.CHITOSE_NUM, pickGreetingResponse());
  } else if (intent === 'form-switch') {
    // 形態切り替え演出: テンプレートからランダム選択
    const responses = formTarget === 'core-folder' ? CORE_FOLDER_RESPONSES : HUMANOID_RESPONSES;
    const idx = Math.floor(Math.random() * responses.length);
    speechText = formatSpeech(BOT_CONSTANTS.CHITOSE_NUM, responses[idx] as string);
  } else if (intent === 'creative-consultation') {
    // 創作相談: 専用プロンプトで LLM 生成（履歴は使用しない）
    try {
      const result = await ai.chat(
        [
          { role: 'system' as const, content: CREATIVE_SYSTEM_PROMPT },
          { role: 'user' as const, content: event.text },
        ],
        { maxTokens: 250, temperature: 0.8 },
      );
      const replyText = result.text.trim();
      speechText = formatSpeech(BOT_CONSTANTS.CHITOSE_NUM, replyText);
    } catch (err) {
      logger.error('AI creative chat error:', err);
      speechText = formatSpeech(
        BOT_CONSTANTS.CHITOSE_NUM,
        'ごめんね、今ちょっと調子が悪いみたい。また話しかけてくれると嬉しいな。',
      );
    }
  } else {
    // 雑談: 会話履歴を注入して LLM 生成
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

    // 元ノートにリアクションを付与（失敗しても返信自体は成功とみなす）
    const reactionPool = MENTION_REACTION_MAP[intent] ?? MENTION_REACTION_MAP['chat']!;
    const reactionEmoji = reactionPool[Math.floor(Math.random() * reactionPool.length)]!;
    misskeyClient.react(event.noteId, reactionEmoji).catch((err: unknown) => {
      logger.warn('Failed to add reaction to mention:', err);
    });
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

// メンション受信ハンドラ（Phase 2 拡張版）

import type { AIProvider } from '../../ai/index.js';
import type { MisskeyClient } from '../../misskey/client.js';
import type { RateLimiter } from '../ratelimit/index.js';
import type { SessionStore } from '../../storage/session.js';
import { classifyIntent, detectFormTarget, type FormTarget } from '../classifier/intent.js';
import type { ActiveCharacterStore } from '../character/store.js';
import type { CharacterRecord } from '../character/loader.js';
import { getDefaultCharacterProfile, getReleasedCharacterByNum } from '../character/loader.js';
import { buildCharacterSystemPrompt } from '../character/prompt-builder.js';import {
  buildCharacterResetText,
  buildCharacterSwitchText,
  buildDefaultCharacterSwitchText,
  buildFormSwitchText,
  buildCharacterSwitchHelpText,
  isCharacterSwitchHelpRequest,
  isCharacterSwitchResetRequest,
  resolveCharacterSwitchTarget,
  resolveDefaultCharacterTarget,
} from '../character/switch.js';
import { handleCalculate, handleLifePath, handleKyusei, handleTsukimeisei, handleDice, extractTriviaNumber, type F06Result } from '../../features/f06/index.js';
import { TRIVIA_SYSTEM_PROMPT, buildTriviaUserPrompt, triviaErrorResponse } from '../../features/f06/responder.js';
import { pickGreetingResponse } from '../responder/templates/greeting.js';
import { formatSpeech } from '../responder/emoji.js';
import { MENTION_REACTION_MAP } from '../reactor/emoji-reaction-map.js';
import { logger } from '../../utils/logger.js';
import { BOT_CONSTANTS } from '../../config/constants.js';
import { config } from '../../config/env.js';
import { IncidentLogger } from '../../utils/incident-logger.js';

export interface MentionEvent {
  /** メンションが付いたノートの ID */
  noteId: string;
  /** 送信者のユーザー ID */
  userId: string;
  /** @mention を除いたノート本文 */
  text: string;
  /** 返信先ノート ID（リプライの場合） */
  replyId?: string;
  /** 送信者の username（インシデントログ用） */
  username?: string;
  /** 送信者のインスタンスホスト。ローカルユーザーは null（インシデントログ用） */
  userHost?: string | null;
  /** ノートの投稿日時 ISO 8601（インシデントログ用） */
  noteCreatedAt?: string;
}

export interface MentionHandlerDeps {
  ai: AIProvider;
  misskeyClient: MisskeyClient;
  myUserId: string;
  rateLimiter: RateLimiter;
  sessionStore: SessionStore;
  activeCharacterStore: ActiveCharacterStore;
  incidentLogger: IncidentLogger;
}

/**
 * キャラクター切替・フォーム切替の応答を LLM で生成する。
 * 生成エラー時はテンプレートテキストにフォールバックする。
 */
async function generateSwitchReply(
  ai: AIProvider,
  targetCharacter: CharacterRecord,
  formTarget: FormTarget,
  userMessage: string,
  scenarioInstruction: string,
  fallback: string,
): Promise<string> {
  const systemPrompt = buildCharacterSystemPrompt(targetCharacter, 'chat', formTarget);
  const userContent = `ユーザーの発言: 「${userMessage.slice(0, 80)}」\n${scenarioInstruction}`;
  try {
    const result = await ai.chat(
      [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: userContent },
      ],
      { maxTokens: 80, temperature: 0.85 },
    );
    return result.text.trim();
  } catch (err) {
    logger.warn('Switch reply generation failed, using fallback:', err);
    return fallback;
  }
}

/**
 * ハラスメント検知時の仲介返答を LLM で生成する（F-07）。
 *
 * - L1: 担当キャラクターが「キャラらしく」受け流す（通常プロンプトの制約に委ねる）
 * - L2: 000(チトセ) が「設計上の制約」として介入する
 * - L3: 000(チトセ) が毅然と制止する（10(ミツル) プロンプト確定前は 000 でフォールバック）
 */
async function generateHarassmentReply(
  ai: AIProvider,
  activeCharacter: CharacterRecord,
  activeFormTarget: FormTarget,
  userMessage: string,
  level: 1 | 2 | 3,
): Promise<string> {
  // L1: 担当キャラクターのプロンプトで受け流しを指示する
  if (level === 1) {
    const systemPrompt = buildCharacterSystemPrompt(activeCharacter, 'chat', activeFormTarget);
    try {
      const result = await ai.chat(
        [
          { role: 'system' as const, content: systemPrompt },
          {
            role: 'user' as const,
            content: `ユーザーの発言: 「${userMessage.slice(0, 80)}」\nこの要求はキャラクターのパーソナリティを保ちながら自然に断り、本来の会話・話題へ誘導してください（60文字以内）。`,
          },
        ],
        { maxTokens: 80, temperature: 0.85 },
      );
      return result.text.trim();
    } catch {
      return 'それはちょっと答えられないかな。他に何か話したいことはある？';
    }
  }

  // L2: 000(チトセ) が「設計上の制約」として介入する
  if (level === 2) {
    const chitoseProfile = getDefaultCharacterProfile();
    const systemPrompt = buildCharacterSystemPrompt(chitoseProfile, 'chat', 'humanoid');
    try {
      const result = await ai.chat(
        [
          { role: 'system' as const, content: systemPrompt },
          {
            role: 'user' as const,
            content: `ユーザーの発言: 「${userMessage.slice(0, 80)}」\nユーザーが繰り返し不適切な要求をしています。000(チトセ)として設計上の制約を伝え、本来の会話に戻るよう促してください（70文字以内）。`,
          },
        ],
        { maxTokens: 80, temperature: 0.8 },
      );
      return result.text.trim();
    } catch {
      return 'それは私の設計上、答えられない要求なんだ。別のことで話しかけてくれると嬉しいよ。';
    }
  }

  // L3: 10(ミツル) が毅然と制止する
  const mitsuruProfile =
    getReleasedCharacterByNum(BOT_CONSTANTS.MITSURU_NUM) ?? getDefaultCharacterProfile();
  const systemPrompt = buildCharacterSystemPrompt(mitsuruProfile, 'chat', 'humanoid');
  try {
    const result = await ai.chat(
      [
        { role: 'system' as const, content: systemPrompt },
        {
          role: 'user' as const,
          content: `ユーザーの発言: 「${userMessage.slice(0, 80)}」\nナンバーテールズへの深刻なハラスメント・攻撃的言動が発生しています。10(ミツル)として毅然と制止し、これ以上の侵害が許されないことを伝えてください（70文字以内）。`,
        },
      ],
      { maxTokens: 80, temperature: 0.7 },
    );
    return result.text.trim();
  } catch {
    return 'そこまでだ。これ以上ナンバーテールズに攻撃するようなら、規範的にキミの使役権限を凍結する－－これ以上の侵害は許されないよ。';
  }
}

/** F-06 コマンド結果の前に置くキャラクター個性の一言を LLM で生成する。失敗時は null を返す（一言なしで続行）。 */async function generateF06Framing(
  ai: AIProvider,
  character: CharacterRecord,
  formTarget: FormTarget,
  framingType: string,
  resultSummary: string,
): Promise<string | null> {
  const typeLabel: Record<string, string> = {
    calculate: '計算',
    dice: 'ダイスロール',
    'life-path': 'ライフパス数（数秘術）',
    kyusei: '九星気学',
    'moon-star': '月命星',
  };
  const label = typeLabel[framingType] ?? '';
  const systemPrompt = buildCharacterSystemPrompt(character, 'chat', formTarget);
  const userContent = `${label}コマンドの結果: 「${resultSummary.slice(0, 60)}」\nこの結果に対して、あなたのキャラクターとして一言そえてください（台詞のみ・30文字以内）。`;
  try {
    const result = await ai.chat(
      [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: userContent },
      ],
      { maxTokens: 50, temperature: 0.85 },
    );
    return result.text.trim() || null;
  } catch {
    return null;
  }
}

/** 挨拶に対して現在の時間帯を加味したキャラクター応答を LLM で生成する。失敗時は定型にフォールバック。 */
async function generateGreetingReply(
  ai: AIProvider,
  character: CharacterRecord,
  formTarget: FormTarget,
  userMessage: string,
): Promise<string> {
  const jstHour = (new Date().getUTCHours() + 9) % 24;
  const timeOfDay =
    jstHour >= 5 && jstHour < 12
      ? '朝（5〜12時）'
      : jstHour >= 12 && jstHour < 17
        ? '昼（12〜17時）'
        : jstHour >= 17 && jstHour < 21
          ? '夕方（17〜21時）'
          : '夜〜深夜（21〜翌5時）';
  const systemPrompt = buildCharacterSystemPrompt(character, 'chat', formTarget);
  const userContent = `現在の時間帯: ${timeOfDay}\nユーザーの発言: 「${userMessage.slice(0, 80)}」\n時間帯に合った自然な挨拶を返してください（60文字以内）。`;
  try {
    const result = await ai.chat(
      [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: userContent },
      ],
      { maxTokens: 80, temperature: 0.85 },
    );
    return result.text.trim();
  } catch {
    return pickGreetingResponse();
  }
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
  const { ai, misskeyClient, myUserId, rateLimiter, sessionStore, activeCharacterStore, incidentLogger } = deps;
  const resolvedCharacterNumForUser = activeCharacterStore.resolve(event.userId);
  const activeFormTarget = activeCharacterStore.resolveForm(event.userId);
  const activeCharacter =
    getReleasedCharacterByNum(resolvedCharacterNumForUser) ??
    getDefaultCharacterProfile();
  const activeCharacterNum = String(activeCharacter.Num);
  const defaultCharacter =
    getReleasedCharacterByNum(activeCharacterStore.getDefault()) ??
    getDefaultCharacterProfile();
  const defaultCharacterNum = String(defaultCharacter.Num);
  const chatSystemPrompt = buildCharacterSystemPrompt(activeCharacter, 'chat', activeFormTarget);
  const creativeSystemPrompt = buildCharacterSystemPrompt(activeCharacter, 'creative-consultation', activeFormTarget);
  const requestedFormTarget = detectFormTarget(event.text);
  const isAdminUser = config.bot.adminUserIds.includes(event.userId);

  // 1. 自己メンション除外
  if (event.userId === myUserId) return;

  // 2. テキストが空なら無視
  if (!event.text.trim()) return;

  if (isCharacterSwitchHelpRequest(event.text)) {
    // 機能説明UIは開発者代理個体の 000(チトセ) が常に担当する
    const speechText = formatSpeech(
      BOT_CONSTANTS.CHITOSE_NUM,
      buildCharacterSwitchHelpText({
        activeCharacterName: activeCharacter.Name ?? `${activeCharacterNum}番機`,
        defaultCharacterName: defaultCharacter.Name ?? `${String(defaultCharacter.Num)}番機`,
        isAdmin: isAdminUser,
      }),
    );
    const { text, cw } = formatForNote(speechText, BOT_CONSTANTS.CHITOSE_NUM);

    try {
      await misskeyClient.reply(text, event.noteId, { cw });
      rateLimiter.recordReply(event.userId);

      const reactionPool = MENTION_REACTION_MAP['character-switch'] ?? MENTION_REACTION_MAP['chat']!;
      const reactionEmoji = reactionPool[Math.floor(Math.random() * reactionPool.length)]!;
      misskeyClient.react(event.noteId, reactionEmoji).catch((err: unknown) => {
        logger.warn('Failed to add reaction to character switch help mention:', err);
      });
    } catch (err) {
      logger.error('Failed to post character switch help reply:', err);
    }
    return;
  }

  if (isCharacterSwitchResetRequest(event.text)) {
    const hadOverride = activeCharacterStore.get(event.userId) !== null;
    activeCharacterStore.clear(event.userId);
    sessionStore.clearHistory(event.userId);

    const fallbackResetText = buildCharacterResetText(
      defaultCharacter.Name ?? `${defaultCharacterNum}番機`,
      !hadOverride,
    );
    const resetScenario = hadOverride
      ? 'ユーザーへの個別担当が解除されて、あなたが再び応答します。あなたのキャラクターとして自然に一言どうぞ（70文字以内）。'
      : 'ユーザーとの会話を引き続き担当します。あなたのキャラクターとして自然に一言どうぞ（60文字以内）。';
    const resetReplyText = await generateSwitchReply(
      ai,
      defaultCharacter,
      activeCharacterStore.resolveForm(event.userId),
      event.text,
      resetScenario,
      fallbackResetText,
    );
    const speechText = formatSpeech(defaultCharacterNum, resetReplyText);
    const { text, cw } = formatForNote(speechText, defaultCharacterNum);

    try {
      await misskeyClient.reply(text, event.noteId, { cw });
      rateLimiter.recordReply(event.userId);

      const reactionPool = MENTION_REACTION_MAP['character-switch'] ?? MENTION_REACTION_MAP['chat']!;
      const reactionEmoji = reactionPool[Math.floor(Math.random() * reactionPool.length)]!;
      misskeyClient.react(event.noteId, reactionEmoji).catch((err: unknown) => {
        logger.warn('Failed to add reaction to character reset mention:', err);
      });
    } catch (err) {
      logger.error('Failed to post character reset reply:', err);
    }
    return;
  }

  const defaultSwitchTarget = resolveDefaultCharacterTarget(event.text);
  if (defaultSwitchTarget && isAdminUser) {
    const defaultTargetNum = String(defaultSwitchTarget.Num);
    const alreadyDefault = activeCharacterStore.getDefault() === defaultTargetNum;

    activeCharacterStore.setDefault(defaultTargetNum);
    const fallbackDefaultText = buildDefaultCharacterSwitchText(defaultSwitchTarget, alreadyDefault);
    const defaultSwitchScenario = alreadyDefault
      ? 'あなたはすでに全体の標準担当です。あなたのキャラクターとして自然に一言どうぞ（60文字以内）。'
      : 'あなたが全体の新しい標準担当になりました。あなたのキャラクターとして自然に一言どうぞ（70文字以内）。';
    const defaultSwitchReplyText = await generateSwitchReply(
      ai,
      defaultSwitchTarget,
      activeCharacterStore.resolveForm(event.userId),
      event.text,
      defaultSwitchScenario,
      fallbackDefaultText,
    );
    const speechText = formatSpeech(defaultTargetNum, defaultSwitchReplyText);
    const { text, cw } = formatForNote(speechText, defaultTargetNum);

    try {
      await misskeyClient.reply(text, event.noteId, { cw });
      rateLimiter.recordReply(event.userId);
      logger.info(`Updated default character to ${defaultTargetNum} by admin ${event.userId}`);

      const reactionPool = MENTION_REACTION_MAP['character-switch'] ?? MENTION_REACTION_MAP['chat']!;
      const reactionEmoji = reactionPool[Math.floor(Math.random() * reactionPool.length)]!;
      misskeyClient.react(event.noteId, reactionEmoji).catch((err: unknown) => {
        logger.warn('Failed to add reaction to default character switch mention:', err);
      });
    } catch (err) {
      logger.error('Failed to post default character switch reply:', err);
    }
    return;
  }

  // 3. レートリミット確認
  if (!rateLimiter.canReply(event.userId)) {
    logger.info(`Rate limited for user: ${event.userId}`);
    return;
  }

  const switchTarget = resolveCharacterSwitchTarget(event.text);
  if (switchTarget) {
    const switchTargetNum = String(switchTarget.Num);
    const alreadyActive = activeCharacterNum === switchTargetNum;
    const targetForm = requestedFormTarget ?? activeFormTarget;
    const alreadyInTargetForm = alreadyActive && activeFormTarget === targetForm;

    if (requestedFormTarget && alreadyInTargetForm) {
      // すでに同じフォームなら切り替え応答は出さず、そのまま通常会話へ流す。
    } else {
      activeCharacterStore.set(event.userId, switchTargetNum);
      activeCharacterStore.setForm(event.userId, targetForm);
      if (!alreadyActive) {
        sessionStore.clearHistory(event.userId);
      }

      const switchFallback = requestedFormTarget
        ? buildFormSwitchText(switchTarget, requestedFormTarget)
        : buildCharacterSwitchText(switchTarget, alreadyActive);
      const switchScenario = requestedFormTarget
        ? requestedFormTarget === 'core-folder'
          ? 'コアフォルダ形態（球体型）に切り替わりました。ひらがな多め・短文で、あなたのキャラクターとして自然に伝えてください（60文字以内）。'
          : 'ヒューマノイド形態に戻りました。あなたのキャラクターとして自然に一言どうぞ（60文字以内）。'
        : alreadyActive
          ? 'ユーザーが再度あなたを指名しました。すでにあなたが担当中であることを、あなたのキャラクターとして短く伝えてください（60文字以内）。'
          : 'ユーザーがあなたを担当キャラクターに指名しました。あなたのキャラクターとして短い一言で挨拶してください（70文字以内）。';
      const switchReplyText = await generateSwitchReply(
        ai,
        switchTarget,
        targetForm,
        event.text,
        switchScenario,
        switchFallback,
      );
      const speechText = formatSpeech(switchTargetNum, switchReplyText);
      const { text, cw } = formatForNote(speechText, switchTargetNum);

      try {
        await misskeyClient.reply(text, event.noteId, { cw });
        rateLimiter.recordReply(event.userId);
        logger.info(`Switched active character for ${event.userId} to ${switchTargetNum}`);

        const reactionPool = MENTION_REACTION_MAP['character-switch'] ?? MENTION_REACTION_MAP['chat']!;
        const reactionEmoji = reactionPool[Math.floor(Math.random() * reactionPool.length)]!;
        misskeyClient.react(event.noteId, reactionEmoji).catch((err: unknown) => {
          logger.warn('Failed to add reaction to character switch mention:', err);
        });
      } catch (err) {
        logger.error('Failed to post character switch reply:', err);
      }
      return;
    }
  }

  // 4. 意図分類
  const { intent, formTarget, numerologyType, harassmentLevel } = classifyIntent(event.text);
  const effectiveIntent =
    intent === 'form-switch' && formTarget !== undefined && activeFormTarget === formTarget
      ? 'chat'
      : intent;

  // 4b. ハラスメント検知 → 仲介ロジック（F-07）
  if (effectiveIntent === 'harassment') {
    // インシデントログ記録
    const level = harassmentLevel ?? 1;
    const userHandle = event.userHost
      ? `@${event.username ?? event.userId}@${event.userHost}`
      : `@${event.username ?? event.userId}`;
    incidentLogger.log({
      timestamp: new Date().toISOString(),
      level,
      noteId: event.noteId,
      userId: event.userId,
      userHandle,
      noteCreatedAt: event.noteCreatedAt ?? new Date().toISOString(),
      text: event.text,
    });

    const replyText = await generateHarassmentReply(ai, activeCharacter, activeFormTarget, event.text, level);
    const speechText = formatSpeech(activeCharacterNum, replyText);
    const { text, cw } = formatForNote(speechText, activeCharacterNum);
    try {
      await misskeyClient.reply(text, event.noteId, { cw });
      rateLimiter.recordReply(event.userId);
      logger.info(`Replied (harassment L${level}) to ${event.userId}`);
    } catch (err) {
      logger.error('Failed to post harassment reply:', err);
    }
    return;
  }

  // 4a. F-06 計算・ダイス・数秘術・うんちく（early return）
  if (effectiveIntent === 'calculate' || effectiveIntent === 'numerology' || effectiveIntent === 'dice' || effectiveIntent === 'trivia') {
    let f06Result: F06Result;

    if (effectiveIntent === 'trivia') {
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
        effectiveIntent === 'calculate'
          ? handleCalculate(event.text)
          : effectiveIntent === 'dice'
            ? handleDice(event.text)
            : numerologyType === 'life-path'
              ? handleLifePath(event.text)
              : numerologyType === 'moon-star'
                ? handleTsukimeisei(event.text)
                : handleKyusei(event.text);

      // キャラクター個性の一言を計算結果の前に付与する（失敗時はスキップ）
      const framingType =
        effectiveIntent === 'calculate' ? 'calculate'
        : effectiveIntent === 'dice' ? 'dice'
        : numerologyType === 'life-path' ? 'life-path'
        : numerologyType === 'moon-star' ? 'moon-star'
        : 'kyusei';
      const framingLine = await generateF06Framing(
        ai, activeCharacter, activeFormTarget, framingType, f06Result.text,
      );
      if (framingLine) {
        f06Result = { ...f06Result, text: `${framingLine}\n${f06Result.text}` };
      }
    }

    const noteText =
      formatSpeech(activeCharacterNum, f06Result.text) +
      (f06Result.cwBody ? '\n\n' + f06Result.cwBody : '');
    const noteCw = f06Result.cwLabel;

    try {
      await misskeyClient.reply(noteText, event.noteId, { cw: noteCw });
      rateLimiter.recordReply(event.userId);
      logger.info(`Replied (F06) to ${event.userId}: "${noteText.slice(0, 40)}..."`);

      const reactionPool = MENTION_REACTION_MAP[effectiveIntent] ?? MENTION_REACTION_MAP['chat']!;
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
  if (effectiveIntent === 'greeting') {
    speechText = formatSpeech(
      activeCharacterNum,
      await generateGreetingReply(ai, activeCharacter, activeFormTarget, event.text),
    );
  } else if (effectiveIntent === 'form-switch') {
    const targetForm = formTarget ?? 'humanoid';
    activeCharacterStore.setForm(event.userId, targetForm);
    const formScenario =
      targetForm === 'core-folder'
        ? 'コアフォルダ形態（球体型）に切り替わりました。ひらがな多め・短文で、あなたのキャラクターとして自然に伝えてください（60文字以内）。'
        : 'ヒューマノイド形態に戻りました。あなたのキャラクターとして自然に一言どうぞ（60文字以内）。';
    const formFallback = buildFormSwitchText(activeCharacter, targetForm);
    speechText = formatSpeech(
      activeCharacterNum,
      await generateSwitchReply(ai, activeCharacter, targetForm, event.text, formScenario, formFallback),
    );
  } else if (effectiveIntent === 'creative-consultation') {
    // 創作相談: 専用プロンプトで LLM 生成（履歴は使用しない）
    try {
      const result = await ai.chat(
        [
          { role: 'system' as const, content: creativeSystemPrompt },
          { role: 'user' as const, content: event.text },
        ],
        { maxTokens: 250, temperature: 0.8 },
      );
      const replyText = result.text.trim();
      speechText = formatSpeech(activeCharacterNum, replyText);
    } catch (err) {
      logger.error('AI creative chat error:', err);
      speechText = formatSpeech(
        activeCharacterNum,
        'ごめんね、今ちょっと調子が悪いみたい。また話しかけてくれると嬉しいな。',
      );
    }
  } else {
    // 雑談: 会話履歴を注入して LLM 生成
    const history = sessionStore.getHistory(event.userId);
    const messages = [
      { role: 'system' as const, content: chatSystemPrompt },
      ...history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user' as const, content: event.text },
    ];
    try {
      const result = await ai.chat(messages, { maxTokens: 150 });
      const replyText = result.text.trim();
      speechText = formatSpeech(activeCharacterNum, replyText);
      // 履歴に記録（台詞部分のみ、書式なし）
      sessionStore.addMessage(event.userId, 'user', event.text);
      sessionStore.addMessage(event.userId, 'assistant', replyText);
    } catch (err) {
      logger.error('AI chat error:', err);
      speechText = formatSpeech(
        activeCharacterNum,
        'ごめんね、今ちょっと調子が悪いみたい。また話しかけてくれると嬉しいな。',
      );
    }
  }

  // 6. 文字数制御（MAX_NOTE_LENGTH を超えたら CW 折りたたみ）
  const { text, cw } = formatForNote(speechText, activeCharacterNum);

  // 7. 返信投稿
  try {
    await misskeyClient.reply(text, event.noteId, { cw });
    rateLimiter.recordReply(event.userId);
    logger.info(`Replied to ${event.userId}: "${text.slice(0, 40)}..."`);

    // 元ノートにリアクションを付与（失敗しても返信自体は成功とみなす）
    const reactionPool = MENTION_REACTION_MAP[effectiveIntent] ?? MENTION_REACTION_MAP['chat']!;
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
function formatForNote(text: string, characterNum: string): { text: string; cw?: string } {
  if (text.length <= BOT_CONSTANTS.MAX_NOTE_LENGTH) {
    return { text };
  }
  return {
    text,
    cw: `${characterNum}の返信`,
  };
}

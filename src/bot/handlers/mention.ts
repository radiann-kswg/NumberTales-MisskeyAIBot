// メンション受信ハンドラ（Phase 2 拡張版）

import type { AIProvider } from '../../ai/index.js';
import type { MisskeyClient } from '../../misskey/client.js';
import type { RateLimiter } from '../ratelimit/index.js';
import type { SessionStore } from '../../storage/session.js';
import type { GameSessionStore } from '../../storage/game-session.js';
import { BotStateStore, STATE_KEY_SCHEDULER_CHAR } from '../../storage/bot-state.js';
import { type TaskStore, TASK_MAX_ACTIVE } from '../../storage/task.js';
import { type TrustStore, type TrustContext } from '../../storage/trust.js';
import {
  extractTaskRequest,
  calculateProgress,
  formatTaskList,
  formatCandidateList,
  extractTaskTarget,
  extractProgressPercent,
  DONE_ACTION_PATTERN,
  CANCEL_ACTION_PATTERN,
  PROGRESS_ACTION_PATTERN,
} from '../../features/task/index.js';
import { classifyIntent, detectFormTarget, type FormTarget, type Intent } from '../classifier/intent.js';
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
  resolveSchedulerCharTarget,
} from '../character/switch.js';
import {
  handleCalculate, handleLifePath, handleKyusei, handleTsukimeisei, handleDice, handleSlot,
  handlePoker, handleMahjong,
  handleYachtStart, handleYachtReroll, handleYachtKeep, handleYachtAbandon,
  handleHitBlowStart, handleHitBlowGuess, handleHitBlowAbandon,
  needsRevealConfirmation, buildPendingStartFromText, handleHitBlowStartWithReveal,
  extractTriviaNumber,
  type F06Result, type YachtState, type HitBlowState, type HitBlowPendingStart,
} from '../../features/f06/index.js';
import { parseRerollCommand, parseConfirmResponse, yachtConfirmPrompt } from '../../features/f06/yacht.js';
import {
  parseGuess,
  symbolLabel,
  HITBLOW_DIGITS_PATTERN,
  HITBLOW_DUPLICATE_PATTERN,
  HITBLOW_ALPHABET_PATTERN,
  HITBLOW_REVEAL_ON_END_PATTERN,
} from '../../features/f06/hitblow.js';
import { containsFlaggedWord } from '../../features/f06/hitblow-words.js';
import { TRIVIA_SYSTEM_PROMPT, buildTriviaUserPrompt, triviaErrorResponse } from '../../features/f06/responder.js';
import { pickGreetingResponse } from '../responder/templates/greeting.js';
import { formatSpeech } from '../responder/emoji.js';
import { MENTION_REACTION_MAP } from '../reactor/emoji-reaction-map.js';
import { logger } from '../../utils/logger.js';
import { BOT_CONSTANTS } from '../../config/constants.js';
import { config } from '../../config/env.js';
import { IncidentLogger } from '../../utils/incident-logger.js';

/** F-12B 会話ボーナス（1日1回+3pt）の対象となる「意味のある交流」インテント */
const TRUST_BONUS_INTENTS: ReadonlySet<Intent> = new Set<Intent>([
  'chat', 'creative-consultation', 'numerology-consultation',
  'calculate', 'numerology', 'dice', 'trivia',
  'game-slot', 'game-poker', 'game-yacht', 'game-hitblow', 'game-mahjong',
  'task-add', 'task-list', 'task-done', 'task-cancel', 'task-progress-update',
]);

/** 現在時刻（ms）を JST の 'YYYY-MM-DD' 文字列に変換する（会話ボーナスの1日1回判定用） */
function getJstDateString(nowMs: number): string {
  const jst = new Date(nowMs + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(jst.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

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
  gameSessionStore: GameSessionStore;
  activeCharacterStore: ActiveCharacterStore;
  incidentLogger: IncidentLogger;
  botState: BotStateStore;
  taskStore: TaskStore;
  trustStore: TrustStore;
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
    'game-slot':    'スロットゲーム',
    'game-poker':   'ポーカーゲーム',
    'game-yacht':   'ヨットゲーム',
    'game-hitblow': 'ヒット＆ブロウ',
    'game-mahjong': '麻雀配牌チャレンジ',
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

/**
 * ヌメロジー相談モード: 悩みテキスト + ライフパスナンバー情報を組み合わせて LLM で返答を生成する。
 *
 * - テキストに生年月日が含まれている場合: ライフパスナンバーを算出し、数字の意味と悩みを絡めた解釈を生成
 * - 生年月日がない場合: キャラクターらしく悩みに寄り添いつつ生年月日の提供を促す
 */
async function generateNumerologyConsultationReply(
  ai: AIProvider,
  character: CharacterRecord,
  formTarget: FormTarget,
  userText: string,
  trust?: TrustContext,
): Promise<string> {
  const lpResult = handleLifePath(userText);
  const hasNumerology = lpResult.cwBody !== undefined;

  const systemPrompt = buildCharacterSystemPrompt(character, 'chat', formTarget, trust);
  const consultConstraint = `
【ヌメロジー相談モードの制約】
- 押しつけがましくならず、寄り添うトーンで話す
- ユーザーの悩みに具体的に触れる
- 台詞テキストのみ返す（書式は呼び出し元が付与する）`;

  const userContent = hasNumerology
    ? `ユーザーの相談: 「${userText.slice(0, 100)}」\n\nライフパスナンバーの算出結果:\n${lpResult.cwBody}\n\nこの悩みに対して、上記ヌメロジーの視点からあなたのキャラクターとして寄り添う返答をしてください（120文字程度）。`
    : `ユーザーの相談: 「${userText.slice(0, 100)}」\n\n生年月日がわからないため数字を算出できていません。悩みに寄り添いつつ、生年月日（例: 1990年1月1日）を教えてもらえるともっと詳しく見られると伝えてください（80文字以内）。`;

  try {
    const result = await ai.chat(
      [
        { role: 'system', content: systemPrompt + consultConstraint },
        { role: 'user', content: userContent },
      ],
      { maxTokens: 200, temperature: 0.85 },
    );
    return result.text.trim();
  } catch (err) {
    logger.error('Numerology consultation AI error:', err);
    return 'ちょっと今うまく繋がれなかった。生年月日を教えてくれたら数字で見られるから、また聞いてね。';
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
  const { ai, misskeyClient, myUserId, rateLimiter, sessionStore, gameSessionStore, activeCharacterStore, incidentLogger, botState, taskStore, trustStore } = deps;
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
  // F-12B: 信頼度コンテキスト（chat/creative-consultation/numerology-consultation・タスク登録確認に反映）
  const trustContext: TrustContext = trustStore.getLevel(trustStore.getPoints(event.userId));
  const chatSystemPrompt = buildCharacterSystemPrompt(activeCharacter, 'chat', activeFormTarget, trustContext);
  const creativeSystemPrompt = buildCharacterSystemPrompt(activeCharacter, 'creative-consultation', activeFormTarget, trustContext);
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
        activeCharacterName: (activeCharacter.Name_JP ?? activeCharacter.Name) ?? `${activeCharacterNum}番機`,
        defaultCharacterName: (defaultCharacter.Name_JP ?? defaultCharacter.Name) ?? `${String(defaultCharacter.Num)}番機`,
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
      (defaultCharacter.Name_JP ?? defaultCharacter.Name) ?? `${defaultCharacterNum}番機`,
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

  // 管理者コマンド: 自発投稿担当（スケジューラーキャラクター）の切り替え
  const schedulerSwitchTarget = resolveSchedulerCharTarget(event.text);
  if (schedulerSwitchTarget && !isAdminUser) {
    logger.warn(`[Admin] Scheduler switch denied: userId=${event.userId} isAdmin=${isAdminUser} configuredIds=${JSON.stringify(config.bot.adminUserIds)}`);
  }
  if (schedulerSwitchTarget && isAdminUser) {
    const schedulerTargetNum = String(schedulerSwitchTarget.Num);
    const prevNum = botState.getState(STATE_KEY_SCHEDULER_CHAR) ?? '000';
    const alreadyScheduler = prevNum === schedulerTargetNum;

    botState.setState(STATE_KEY_SCHEDULER_CHAR, schedulerTargetNum);
    const schedulerTargetName = (schedulerSwitchTarget.Name_JP ?? schedulerSwitchTarget.Name) ?? `${schedulerTargetNum}番機`;

    const replyContent = alreadyScheduler
      ? `自発投稿担当はすでに${schedulerTargetName}だよ。そのまま継続するね。`
      : `自発投稿担当を${schedulerTargetName}に切り替えたよ。次の投稿から適用されるよ。`;
    const speechText = formatSpeech(BOT_CONSTANTS.CHITOSE_NUM, replyContent);
    const { text, cw } = formatForNote(speechText, BOT_CONSTANTS.CHITOSE_NUM);

    try {
      await misskeyClient.reply(text, event.noteId, { cw });
      rateLimiter.recordReply(event.userId);
      logger.info(`[Admin] Scheduler character updated: ${prevNum} → ${schedulerTargetNum} by ${event.userId}`);

      const reactionPool = MENTION_REACTION_MAP['character-switch'] ?? MENTION_REACTION_MAP['chat']!;
      const reactionEmoji = reactionPool[Math.floor(Math.random() * reactionPool.length)]!;
      misskeyClient.react(event.noteId, reactionEmoji).catch((err: unknown) => {
        logger.warn('Failed to add reaction to scheduler switch mention:', err);
      });

      // 実際に切り替えが行われた場合のみ、投票結果告知と同様の公開投稿を行う
      if (!alreadyScheduler) {
        const announceText = formatSpeech(
          BOT_CONSTANTS.CHITOSE_NUM,
          `今週のつぶやき担当は${schedulerTargetName}に決まったよ！よろしくね`,
        );
        misskeyClient.post(announceText).catch((err: unknown) => {
          logger.error('[Admin] Scheduler switch announcement post failed:', err);
        });
      }
    } catch (err) {
      logger.error('Failed to post scheduler character switch reply:', err);
    }
    return;
  }

  // 3. レートリミット確認
  // アクティブなゲームセッション（ヒット＆ブロウ・ヨット）の手番継続は、新規の呼びかけではなく
  // 既に許可された1:1のやり取りの続きなので、他ユーザーへの応答枠を圧迫する全体の時間あたり
  // 上限のチェックからは除外する（同一ユーザーへのクールダウンはそのまま適用する）。
  const hasActiveGameSession =
    gameSessionStore.getSession<YachtState>(event.userId, 'yacht') !== null ||
    gameSessionStore.getSession<HitBlowState>(event.userId, 'hitblow') !== null ||
    gameSessionStore.getSession<HitBlowPendingStart>(event.userId, 'hitblow-pending') !== null;
  const canReplyNow = hasActiveGameSession
    ? rateLimiter.canReplyIgnoringGlobalCap(event.userId)
    : rateLimiter.canReply(event.userId);
  if (!canReplyNow) {
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

  // 4-pre-a. ヒット＆ブロウ開始前の「色ヒント」事前確認待ちがあれば、まず y/n として解釈する
  const pendingHitBlowStart = gameSessionStore.getSession<HitBlowPendingStart>(event.userId, 'hitblow-pending');
  if (pendingHitBlowStart) {
    if (/やめ|終了|キャンセル|abort/i.test(event.text)) {
      gameSessionStore.deleteSession(event.userId, 'hitblow-pending');
      try {
        await misskeyClient.reply(formatSpeech(activeCharacterNum, 'ヒット＆ブロウの準備をやめたよ。また気が向いたら誘ってね'), event.noteId);
        rateLimiter.recordReply(event.userId, { countsTowardGlobalCap: false });
      } catch (err) {
        logger.error('Failed to post hitblow pending-start cancel reply:', err);
      }
      return;
    }
    const confirm = parseConfirmResponse(event.text);
    if (confirm === 'yes' || confirm === 'no') {
      gameSessionStore.deleteSession(event.userId, 'hitblow-pending');
      const startResult = handleHitBlowStartWithReveal(event.userId, gameSessionStore, pendingHitBlowStart, confirm === 'yes');
      gameSessionStore.recordPlayed(event.userId, 'hitblow');
      try {
        await misskeyClient.reply(formatSpeech(activeCharacterNum, startResult.text), event.noteId);
        rateLimiter.recordReply(event.userId, { countsTowardGlobalCap: false });
        logger.info(`Replied (hitblow-start-confirmed) to ${event.userId}`);
      } catch (err) {
        logger.error('Failed to post hitblow confirmed-start reply:', err);
      }
      return;
    }
    // y/n として解釈できなければ再度確認する
    try {
      await misskeyClient.reply(
        formatSpeech(activeCharacterNum, '色ヒントは結果発表の時だけにする？「する」か「しない」で教えてね'),
        event.noteId,
      );
      rateLimiter.recordReply(event.userId, { countsTowardGlobalCap: false });
    } catch (err) {
      logger.error('Failed to post hitblow reveal re-confirm reply:', err);
    }
    return;
  }

  // 4-pre. アクティブなゲームセッションを確認し、進行中コマンドを優先処理する
  const activeYachtState = gameSessionStore.getSession<YachtState>(event.userId, 'yacht');
  if (activeYachtState) {
    let handled: boolean;
    try {
      handled = await handleActiveYachtTurn(activeYachtState);
    } catch (err) {
      logger.error('Yacht active-session handler error:', err);
      try {
        await misskeyClient.reply(
          formatSpeech(activeCharacterNum, 'あれ、うまく処理できなかったみたい。もう一回試してみて？'),
          event.noteId,
        );
        rateLimiter.recordReply(event.userId, { countsTowardGlobalCap: false });
      } catch (replyErr) {
        logger.error('Failed to post yacht error fallback reply:', replyErr);
      }
      handled = true;
    }
    if (handled) return;
  }

  /** アクティブなヨットセッションへのターン操作を処理する。処理して返信済みなら true、対象外で呼び出し元にフォールスルーさせるなら false を返す。 */
  async function handleActiveYachtTurn(activeYachtState: YachtState): Promise<boolean> {
    const postYachtResult = async (result: F06Result): Promise<void> => {
      const yachtFraming = await generateF06Framing(ai, activeCharacter, activeFormTarget, 'game-yacht', result.text);
      const finalText = yachtFraming ? `${yachtFraming}\n${result.text}` : result.text;
      const yachtNoteText = formatSpeech(activeCharacterNum, finalText);
      try {
        await misskeyClient.reply(yachtNoteText, event.noteId);
        rateLimiter.recordReply(event.userId, { countsTowardGlobalCap: false });
        logger.info(`Replied (yacht-action) to ${event.userId}`);
        const reactionPool = MENTION_REACTION_MAP['game-yacht'] ?? MENTION_REACTION_MAP['chat']!;
        misskeyClient.react(event.noteId, reactionPool[Math.floor(Math.random() * reactionPool.length)]!).catch(() => {});
      } catch (err) {
        logger.error('Failed to post yacht action reply:', err);
      }
    };

    if (/やめ|終了|キャンセル|abort/i.test(event.text)) {
      const abandonResult = handleYachtAbandon(gameSessionStore, event.userId);
      try {
        await misskeyClient.reply(formatSpeech(activeCharacterNum, abandonResult.text), event.noteId);
        rateLimiter.recordReply(event.userId, { countsTowardGlobalCap: false });
      } catch (err) {
        logger.error('Failed to post yacht abandon reply:', err);
      }
      return true;
    }

    // 確認待ちの振り直し指定があれば、まず肯定/否定の返答として解釈する
    if (activeYachtState.pendingReroll !== null) {
      const confirm = parseConfirmResponse(event.text);
      if (confirm === 'yes') {
        const yachtResult = handleYachtReroll(
          activeYachtState,
          activeYachtState.pendingReroll,
          gameSessionStore,
          event.userId,
        );
        await postYachtResult(yachtResult);
        return true;
      }
      if (confirm === 'no') {
        gameSessionStore.setSession(event.userId, 'yacht', { ...activeYachtState, pendingReroll: null });
        try {
          await misskeyClient.reply(formatSpeech(activeCharacterNum, 'じゃあどれを振り直す？'), event.noteId);
          rateLimiter.recordReply(event.userId, { countsTowardGlobalCap: false });
        } catch (err) {
          logger.error('Failed to post yacht confirm-cancel reply:', err);
        }
        return true;
      }
      // 確認への返答と解釈できなければ、新規の振り直し指定として下で再解析する
    }

    const rerollCmd = parseRerollCommand(event.text, activeYachtState.dice);
    if (rerollCmd !== null) {
      if (rerollCmd === 'keep' || activeYachtState.rerollCount >= 2) {
        const yachtResult = handleYachtKeep(activeYachtState, gameSessionStore, event.userId);
        await postYachtResult(yachtResult);
        return true;
      }
      if (rerollCmd.requiresConfirm) {
        gameSessionStore.setSession(event.userId, 'yacht', {
          ...activeYachtState,
          pendingReroll: rerollCmd.indices,
        });
        try {
          await misskeyClient.reply(
            formatSpeech(activeCharacterNum, yachtConfirmPrompt(rerollCmd.indices)),
            event.noteId,
          );
          rateLimiter.recordReply(event.userId, { countsTowardGlobalCap: false });
        } catch (err) {
          logger.error('Failed to post yacht confirm prompt:', err);
        }
        return true;
      }
      const yachtResult = handleYachtReroll(activeYachtState, rerollCmd.indices, gameSessionStore, event.userId);
      await postYachtResult(yachtResult);
      return true;
    }

    // 振り直しコマンドとして認識できなかった: 呼び出し元で通常の意図分類へフォールスルーさせる
    return false;
  }

  const activeHitBlowState = gameSessionStore.getSession<HitBlowState>(event.userId, 'hitblow');
  if (activeHitBlowState) {
    let handled: boolean;
    try {
      handled = await handleActiveHitBlowTurn(activeHitBlowState);
    } catch (err) {
      logger.error('HitBlow active-session handler error:', err);
      try {
        await misskeyClient.reply(
          formatSpeech(activeCharacterNum, 'あれ、うまく処理できなかったみたい。もう一回試してみて？'),
          event.noteId,
        );
        rateLimiter.recordReply(event.userId, { countsTowardGlobalCap: false });
      } catch (replyErr) {
        logger.error('Failed to post hitblow error fallback reply:', replyErr);
      }
      handled = true;
    }
    if (handled) return;
  }

  /** アクティブなヒット＆ブロウセッションへのターン操作を処理する。処理して返信済みなら true、対象外なら false。 */
  async function handleActiveHitBlowTurn(activeHitBlowState: HitBlowState): Promise<boolean> {
    const guess = parseGuess(
      event.text,
      activeHitBlowState.digits,
      activeHitBlowState.allowDuplicates,
      activeHitBlowState.mode,
    );
    if (guess !== null) {
      if (activeHitBlowState.mode === 'alphabet') {
        const guessWord = guess.map((g) => symbolLabel('alphabet', g)).join('');
        if (containsFlaggedWord(guessWord)) {
          // 放送事故的な表現を含む予想: ゲームは中断せず、手番を消費させずにやんわり注意する
          try {
            await misskeyClient.reply(
              formatSpeech(activeCharacterNum, 'うーん、その文字列はちょっと聞こえがよくないかも……別の単語で予想してみてくれる？'),
              event.noteId,
            );
            rateLimiter.recordReply(event.userId, { countsTowardGlobalCap: false });
          } catch (err) {
            logger.error('Failed to post hitblow flagged-word reply:', err);
          }
          return true;
        }
      }
      let hbResult = handleHitBlowGuess(activeHitBlowState, guess, gameSessionStore, event.userId);
      const hbFraming = await generateF06Framing(ai, activeCharacter, activeFormTarget, 'game-hitblow', hbResult.text);
      if (hbFraming) hbResult = { ...hbResult, text: `${hbFraming}\n${hbResult.text}` };
      const hbNoteText =
        formatSpeech(activeCharacterNum, hbResult.text) +
        (hbResult.cwBody ? '\n\n' + hbResult.cwBody : '');
      try {
        await misskeyClient.reply(hbNoteText, event.noteId, { cw: hbResult.cwLabel });
        rateLimiter.recordReply(event.userId, { countsTowardGlobalCap: false });
        logger.info(`Replied (hitblow-guess) to ${event.userId}`);
        const reactionPool = MENTION_REACTION_MAP['game-hitblow'] ?? MENTION_REACTION_MAP['chat']!;
        misskeyClient.react(event.noteId, reactionPool[Math.floor(Math.random() * reactionPool.length)]!).catch(() => {});
      } catch (err) {
        logger.error('Failed to post hitblow guess reply:', err);
      }
      return true;
    }
    if (
      HITBLOW_DIGITS_PATTERN.test(event.text) ||
      HITBLOW_DUPLICATE_PATTERN.test(event.text) ||
      HITBLOW_ALPHABET_PATTERN.test(event.text) ||
      HITBLOW_REVEAL_ON_END_PATTERN.test(event.text)
    ) {
      // 予想としては解釈できず、桁数・重複あり・モード・色ヒント設定の指定が含まれている: 条件変更の指示とみなし新条件で再スタートする
      if (needsRevealConfirmation(event.text)) {
        const pending = buildPendingStartFromText(event.text, activeHitBlowState.mode);
        if (pending) {
          gameSessionStore.deleteSession(event.userId, 'hitblow');
          gameSessionStore.setSession(event.userId, 'hitblow-pending', pending);
          try {
            await misskeyClient.reply(
              formatSpeech(activeCharacterNum, '条件を変えるね。色ヒントは結果発表の時だけにする？「する」か「しない」で教えてね'),
              event.noteId,
            );
            rateLimiter.recordReply(event.userId, { countsTowardGlobalCap: false });
            logger.info(`Replied (hitblow-restart-needs-confirm) to ${event.userId}`);
          } catch (err) {
            logger.error('Failed to post hitblow restart confirm-prompt reply:', err);
          }
          return true;
        }
      }
      const restartResult = handleHitBlowStart(event.userId, gameSessionStore, event.text, activeHitBlowState.mode);
      const restartText = `条件を変えて、ゲームをやり直すね。\n${restartResult.text}`;
      try {
        await misskeyClient.reply(formatSpeech(activeCharacterNum, restartText), event.noteId);
        rateLimiter.recordReply(event.userId, { countsTowardGlobalCap: false });
        logger.info(`Replied (hitblow-restart) to ${event.userId}`);
      } catch (err) {
        logger.error('Failed to post hitblow restart reply:', err);
      }
      return true;
    }
    if (/やめ|終了|キャンセル|abort/i.test(event.text)) {
      const abandonResult = handleHitBlowAbandon(activeHitBlowState, gameSessionStore, event.userId);
      try {
        await misskeyClient.reply(formatSpeech(activeCharacterNum, abandonResult.text), event.noteId);
        rateLimiter.recordReply(event.userId, { countsTowardGlobalCap: false });
      } catch (err) {
        logger.error('Failed to post hitblow abandon reply:', err);
      }
      return true;
    }
    return false;
  }

  // 4. 意図分類
  const { intent, formTarget, numerologyType, harassmentLevel } = classifyIntent(event.text);
  let effectiveIntent: Intent =
    intent === 'form-switch' && formTarget !== undefined && activeFormTarget === formTarget
      ? 'chat'
      : intent;

  // 4a-pre. 継続コマンド（「もう一回」等、D3-7）: 直近プレイしたゲームの intent にリマップする。
  // リマップ後は通常の game-* intent として扱われるため、以降の並行ゲーム禁止チェック・
  // 投稿・リアクションロジックをそのまま再利用できる。
  if (effectiveIntent === 'game-repeat') {
    const target = gameSessionStore.getRepeatTarget(event.userId);
    if (target && gameSessionStore.canRepeat(event.userId)) {
      gameSessionStore.recordRepeatTrigger(event.userId);
      effectiveIntent = `game-${target}` as Intent;
    } else {
      effectiveIntent = 'chat';
    }
  }

  // 4a-post. F-12B 会話ボーナス（1日1回+3pt）: 意味のある交流インテントのみ対象。
  // 挨拶・フォーム切替・ハラスメント対応・キャラ切替は対象外。
  if (TRUST_BONUS_INTENTS.has(effectiveIntent)) {
    trustStore.maybeAddDailyChatBonus(event.userId, getJstDateString(Date.now()));
  }

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

  // 4a. F-06 計算・ダイス・スロット・ゲーム・数秘術・うんちく（early return）
  if (
    effectiveIntent === 'calculate' || effectiveIntent === 'numerology' ||
    effectiveIntent === 'dice' || effectiveIntent === 'trivia' || effectiveIntent === 'game-slot' ||
    effectiveIntent === 'game-poker' || effectiveIntent === 'game-yacht' || effectiveIntent === 'game-hitblow' ||
    effectiveIntent === 'game-mahjong'
  ) {
    // 並行ゲーム禁止: 新規ゲーム開始時に既存セッションがあれば拒否する
    if (effectiveIntent === 'game-poker' || effectiveIntent === 'game-yacht' || effectiveIntent === 'game-hitblow') {
      const existingGame = gameSessionStore.getAnyActiveSession(event.userId);
      if (existingGame) {
        const gameNames: Record<string, string> = { yacht: 'ヨット', hitblow: 'ヒット＆ブロウ' };
        const ongoingName = gameNames[existingGame] ?? 'ゲーム';
        const busyText = formatSpeech(activeCharacterNum, `今${ongoingName}の途中だよ！「やめ」か「終了」で終わらせてから試してね`);
        try {
          await misskeyClient.reply(busyText, event.noteId);
          rateLimiter.recordReply(event.userId);
        } catch (err) {
          logger.error('Failed to post busy-game reply:', err);
        }
        return;
      }
    }

    // ヒット＆ブロウ新規開始時、色ヒントの扱いが曖昧な言及なら、開始前に事前確認を挟む
    if (effectiveIntent === 'game-hitblow' && needsRevealConfirmation(event.text)) {
      const pending = buildPendingStartFromText(event.text);
      if (pending) {
        gameSessionStore.setSession(event.userId, 'hitblow-pending', pending);
        try {
          await misskeyClient.reply(
            formatSpeech(activeCharacterNum, '色ヒントは結果発表の時だけにする？（今はヒットのたびに色で分かるようになってるよ）「する」か「しない」で教えてね'),
            event.noteId,
          );
          rateLimiter.recordReply(event.userId);
          logger.info(`Replied (hitblow-start-needs-confirm) to ${event.userId}`);
        } catch (err) {
          logger.error('Failed to post hitblow start confirm-prompt reply:', err);
        }
        return;
      }
    }

    let f06Result: F06Result;

    // F06 各ハンドラ（handleDice 等）や recordPlayed の SQLite 書き込みで想定外の例外が
    // 発生しても、この投稿1件の処理失敗に留め Bot プロセス全体を落とさないためのガード。
    try {
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
        if (effectiveIntent === 'game-mahjong') {
          f06Result = handleMahjong();
          gameSessionStore.recordPlayed(event.userId, 'mahjong');
        } else if (effectiveIntent === 'game-poker') {
          f06Result = handlePoker();
          gameSessionStore.recordPlayed(event.userId, 'poker');
        } else if (effectiveIntent === 'game-yacht') {
          f06Result = handleYachtStart(event.userId, gameSessionStore);
          gameSessionStore.recordPlayed(event.userId, 'yacht');
        } else if (effectiveIntent === 'game-hitblow') {
          f06Result = handleHitBlowStart(event.userId, gameSessionStore, event.text);
          gameSessionStore.recordPlayed(event.userId, 'hitblow');
        } else {
          if (effectiveIntent === 'game-slot') {
            gameSessionStore.recordPlayed(event.userId, 'slot');
          }
          f06Result =
            effectiveIntent === 'calculate'
              ? handleCalculate(event.text)
              : effectiveIntent === 'dice'
                ? handleDice(event.text, activeCharacterNum)
                : effectiveIntent === 'game-slot'
                  ? handleSlot()
                  : numerologyType === 'life-path'
                    ? handleLifePath(event.text)
                    : numerologyType === 'moon-star'
                      ? handleTsukimeisei(event.text)
                      : handleKyusei(event.text);
        }

        // キャラクター個性の一言を計算結果の前に付与する（失敗時はスキップ）
        const framingType =
          effectiveIntent === 'calculate' ? 'calculate'
          : effectiveIntent === 'dice' ? 'dice'
          : effectiveIntent === 'game-slot' ? 'game-slot'
          : effectiveIntent === 'game-poker' ? 'game-poker'
          : effectiveIntent === 'game-yacht' ? 'game-yacht'
          : effectiveIntent === 'game-hitblow' ? 'game-hitblow'
          : effectiveIntent === 'game-mahjong' ? 'game-mahjong'
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
    } catch (err) {
      logger.error(`F06 handler error (intent: ${effectiveIntent}):`, err);
      f06Result = { text: 'あれ、うまく処理できなかったみたい。もう一回試してみて？' };
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

  // 4c. ヌメロジー相談モード（F-06 拡張）
  if (effectiveIntent === 'numerology-consultation') {
    const consultReply = await generateNumerologyConsultationReply(ai, activeCharacter, activeFormTarget, event.text, trustContext);
    const speechText = formatSpeech(activeCharacterNum, consultReply);
    const { text, cw } = formatForNote(speechText, activeCharacterNum);

    try {
      await misskeyClient.reply(text, event.noteId, { cw });
      rateLimiter.recordReply(event.userId);
      logger.info(`Replied (numerology-consultation) to ${event.userId}`);

      const reactionPool = MENTION_REACTION_MAP['numerology-consultation'] ?? MENTION_REACTION_MAP['chat']!;
      const reactionEmoji = reactionPool[Math.floor(Math.random() * reactionPool.length)]!;
      misskeyClient.react(event.noteId, reactionEmoji).catch((err: unknown) => {
        logger.warn('Failed to add reaction to numerology-consultation mention:', err);
      });
    } catch (err) {
      logger.error('Failed to post numerology-consultation reply:', err);
    }
    return;
  }

  // 4d. タスク＆スケジュール管理（F-12）
  if (
    effectiveIntent === 'task-add' ||
    effectiveIntent === 'task-list' ||
    effectiveIntent === 'task-done' ||
    effectiveIntent === 'task-cancel' ||
    effectiveIntent === 'task-progress-update'
  ) {
    const priorityLabel: Record<number, string> = { 1: '高', 2: '中', 3: '低' };
    const difficultyLabel: Record<number, string> = { 1: '易', 2: '普通', 3: '難' };

    let taskReplyText: string;
    try {
      if (effectiveIntent === 'task-list') {
        const active = taskStore.listActive(event.userId);
        if (active.length === 0) {
          taskReplyText = '今のところタスクはないよ。';
        } else {
          const progress = calculateProgress(taskStore.listAllNonCancelled(event.userId));
          taskReplyText =
            `今抱えているタスクを教えるね。\n${formatTaskList(active)}\n` +
            `（全${progress.totalCount}件中${progress.doneCount}件完了・進捗${progress.percent}%）`;
        }
      } else if (effectiveIntent === 'task-done' || effectiveIntent === 'task-cancel') {
        const isDone = effectiveIntent === 'task-done';
        const target = extractTaskTarget(event.text, isDone ? DONE_ACTION_PATTERN : CANCEL_ACTION_PATTERN);

        const resolved =
          target.type === 'index'
            ? taskStore.findByIndex(event.userId, target.value)
            : null;
        const candidates =
          target.type === 'query' ? taskStore.findCandidatesByTitle(event.userId, target.value) : [];

        if (target.type === 'index') {
          if (!resolved) {
            taskReplyText = 'その番号のタスクが見つからなかった。「タスク一覧」で確認してみて？';
          } else if (isDone) {
            taskStore.markDone(resolved.id, Date.now());
            trustStore.recordTaskCompletion(event.userId, resolved.priority, resolved.difficulty);
            taskReplyText = `「${resolved.title}」、おつかれ！ちゃんと終わったんだね。`;
          } else {
            taskStore.markCancelled(resolved.id);
            taskReplyText = `「${resolved.title}」のタスク、キャンセルしたよ。`;
          }
        } else if (candidates.length === 1) {
          const t = candidates[0]!;
          if (isDone) {
            taskStore.markDone(t.id, Date.now());
            trustStore.recordTaskCompletion(event.userId, t.priority, t.difficulty);
            taskReplyText = `「${t.title}」、おつかれ！ちゃんと終わったんだね。`;
          } else {
            taskStore.markCancelled(t.id);
            taskReplyText = `「${t.title}」のタスク、キャンセルしたよ。`;
          }
        } else if (candidates.length > 1) {
          taskReplyText = `複数見つかったよ。番号で教えてくれる？\n${formatCandidateList(candidates)}`;
        } else if (isDone) {
          // task-done の広めのパターンは雑談中の「〇〇できた」等にも反応しうるため、
          // 該当タスクが1件も無ければ通常の雑談として処理する（4d ブロックの外へ抜ける）。
          taskReplyText = '';
        } else {
          taskReplyText = '該当するタスクが見つからなかった。「タスク一覧」で確認してみて？';
        }
      } else if (effectiveIntent === 'task-progress-update') {
        const percent = extractProgressPercent(event.text);
        if (percent === null) {
          taskReplyText = '';
        } else {
          const target = extractTaskTarget(event.text, PROGRESS_ACTION_PATTERN);
          const resolved =
            target.type === 'index' ? taskStore.findByIndex(event.userId, target.value) : null;
          const candidates =
            target.type === 'query' ? taskStore.findCandidatesByTitle(event.userId, target.value) : [];

          if (target.type === 'index') {
            if (!resolved) {
              taskReplyText = 'その番号のタスクが見つからなかった。「タスク一覧」で確認してみて？';
            } else {
              taskStore.updateProgress(resolved.id, percent);
              taskReplyText = `「${resolved.title}」の進捗を${percent}%にしたよ。`;
            }
          } else if (candidates.length === 1) {
            const t = candidates[0]!;
            taskStore.updateProgress(t.id, percent);
            taskReplyText = `「${t.title}」の進捗を${percent}%にしたよ。`;
          } else if (candidates.length > 1) {
            taskReplyText = `複数見つかったよ。番号で教えてくれる？\n${formatCandidateList(candidates)}`;
          } else {
            // task-done と同様、数字%を含む広めのパターンは雑談中の言及にも反応しうるため、
            // 該当タスクが1件も無ければ通常の雑談として処理する。
            taskReplyText = '';
          }
        }
      } else {
        // task-add
        if (taskStore.countActive(event.userId) >= TASK_MAX_ACTIVE) {
          taskReplyText = `今${TASK_MAX_ACTIVE}件抱えてるから、どれか終わらせるかキャンセルしてから追加してね。`;
        } else {
          const extracted = await extractTaskRequest(event.text, ai, Date.now());
          if (!extracted.ok) {
            taskReplyText =
              extracted.reason === 'too_short'
                ? '1分より先の時間を指定してね。'
                : extracted.reason === 'too_far'
                  ? '365日以内の日時を指定してね。'
                  : '何をいつまでにやりたいか、もう少しはっきり教えてくれる？';
          } else {
            taskStore.create({
              userId: event.userId,
              username: event.username ?? null,
              userHost: event.userHost ?? null,
              title: extracted.title,
              dueAt: extracted.dueAtMs,
              remindAt: extracted.remindAtMs,
              remindType: extracted.remindType,
              priority: extracted.priority,
              difficulty: extracted.difficulty,
            });
            const dueLabel = extracted.dueAtMs
              ? new Intl.DateTimeFormat('ja-JP', {
                  timeZone: 'Asia/Tokyo',
                  month: 'numeric',
                  day: 'numeric',
                }).format(new Date(extracted.dueAtMs))
              : 'なし';
            const remindLabel = extracted.remindAtMs
              ? new Intl.DateTimeFormat('ja-JP', {
                  timeZone: 'Asia/Tokyo',
                  month: 'numeric',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false,
                }).format(new Date(extracted.remindAtMs))
              : 'なし';
            try {
              const aiResult = await ai.chat(
                [
                  { role: 'system' as const, content: chatSystemPrompt },
                  {
                    role: 'user' as const,
                    content:
                      `タスク登録の確認メッセージを40文字以内で返してください（台詞のみ）。\n` +
                      `タスク: ${extracted.title}、優先度: ${priorityLabel[extracted.priority]}、` +
                      `難易度: ${difficultyLabel[extracted.difficulty]}\n期日: ${dueLabel}、通知: ${remindLabel}`,
                  },
                ],
                { maxTokens: 100, temperature: 0.9 },
              );
              taskReplyText = aiResult.text.trim();
            } catch (err) {
              logger.error('AI task confirm error:', err);
              taskReplyText = `了解、「${extracted.title}」のタスクを追加したよ。`;
            }
          }
        }
      }
    } catch (err) {
      logger.error(`Task handler error (intent: ${effectiveIntent}):`, err);
      taskReplyText = 'あれ、うまく処理できなかったみたい。もう一回試してみて？';
    }

    if (taskReplyText !== '') {
      const taskSpeechText = formatSpeech(activeCharacterNum, taskReplyText);
      try {
        await misskeyClient.reply(taskSpeechText, event.noteId);
        rateLimiter.recordReply(event.userId);
        logger.info(`Replied (${effectiveIntent}) to ${event.userId}`);

        const reactionPool = MENTION_REACTION_MAP[effectiveIntent] ?? MENTION_REACTION_MAP['chat']!;
        const reactionEmoji = reactionPool[Math.floor(Math.random() * reactionPool.length)]!;
        misskeyClient.react(event.noteId, reactionEmoji).catch((err: unknown) => {
          logger.warn('Failed to add reaction to task mention:', err);
        });
      } catch (err) {
        logger.error('Failed to post task reply:', err);
      }
      return;
    }
    // taskReplyText === '' の場合（task-done で該当タスクなし）は通常の雑談応答へフォールスルーする
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

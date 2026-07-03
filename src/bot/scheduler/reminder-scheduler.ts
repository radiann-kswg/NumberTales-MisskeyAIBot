/**
 * F-12 リマインダー配信スケジューラー
 *
 * 5分ごとに期限切れ（remind_at 経過）の pending リマインダーを確認し、
 * 現在の担当キャラクターの口調で配信する。
 */

import type { AIProvider } from '../../ai/index.js';
import type { MisskeyClient } from '../../misskey/client.js';
import { getReleasedCharacterByNum, getDefaultCharacterProfile } from '../character/loader.js';
import { buildCharacterSystemPrompt } from '../character/prompt-builder.js';
import { BotStateStore, STATE_KEY_SCHEDULER_CHAR } from '../../storage/bot-state.js';
import { ReminderStore, type ReminderRecord } from '../../storage/reminder.js';
import { formatSpeech } from '../responder/emoji.js';
import { logger } from '../../utils/logger.js';
import { BOT_CONSTANTS } from '../../config/constants.js';

/** 配信チェック間隔（5分） */
const REMINDER_CHECK_INTERVAL_MS = 5 * 60 * 1000;

export interface ReminderSchedulerDeps {
  ai: AIProvider;
  misskeyClient: MisskeyClient;
  botState: BotStateStore;
  reminderStore: ReminderStore;
}

/** リマインド本文をキャラクターの口調で LLM 生成する。失敗時はテンプレートにフォールバックする。 */
async function generateReminderMessage(
  ai: AIProvider,
  systemPrompt: string,
  content: string,
): Promise<string> {
  try {
    const result = await ai.chat(
      [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content:
            `リマインドの時間になりました。\n内容: ${content}\n\n` +
            'ユーザーへのリマインドメッセージを40文字以内で生成してください。' +
            '「主人/クライアント」への奉仕として、キャラクターらしく知らせてください（台詞のみ）。',
        },
      ],
      { maxTokens: 100, temperature: 0.9 },
    );
    return result.text.trim();
  } catch (err) {
    logger.error('[ReminderScheduler] LLM message generation failed, falling back to template:', err);
    return `お約束の時間だよ。「${content}」、忘れてない？`;
  }
}

export class ReminderScheduler {
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly deps: ReminderSchedulerDeps) {}

  start(): void {
    this.intervalHandle = setInterval(
      () => void this.tick(),
      REMINDER_CHECK_INTERVAL_MS,
    );
    logger.info('ReminderScheduler started');
  }

  stop(): void {
    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  private async tick(): Promise<void> {
    this.deps.reminderStore.pruneOld();

    const due = this.deps.reminderStore.getDue(Date.now());
    if (due.length === 0) return;

    const charNum = this.deps.botState.getState(STATE_KEY_SCHEDULER_CHAR) ?? BOT_CONSTANTS.CHITOSE_NUM;
    const profile = getReleasedCharacterByNum(charNum) ?? getDefaultCharacterProfile();
    const systemPrompt = buildCharacterSystemPrompt(profile, 'chat');

    for (const reminder of due) {
      await this.deliverOne(reminder, charNum, systemPrompt);
    }
  }

  private async deliverOne(reminder: ReminderRecord, charNum: string, systemPrompt: string): Promise<void> {
    try {
      const messageText = await generateReminderMessage(this.deps.ai, systemPrompt, reminder.content);
      const mentionPrefix = reminder.username
        ? `@${reminder.username}${reminder.userHost ? `@${reminder.userHost}` : ''} `
        : '';
      const speechText = formatSpeech(charNum, `${mentionPrefix}${messageText}`);
      await this.deps.misskeyClient.remindUser(speechText, reminder.userId);
      this.deps.reminderStore.markDone(reminder.id);
      logger.info(`[ReminderScheduler] Delivered reminder #${reminder.id} to ${reminder.userId}`);
    } catch (err) {
      logger.error(`[ReminderScheduler] Failed to deliver reminder #${reminder.id}:`, err);
    }
  }
}

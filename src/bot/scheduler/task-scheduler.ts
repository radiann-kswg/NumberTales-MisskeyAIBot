/**
 * F-12 タスク＆スケジュール通知スケジューラー
 *
 * 5分ごとに以下3種類の通知を確認する:
 *   1. remind_at 経過分（alert/schedule）の配信
 *   2. due_at 経過・未通知の alert タスクの期日超過通知
 *   3. 期日・remind_atの有無に関係なく、todoタスクが残っている間 PERIODIC_NUDGE_INTERVAL_MS ごとに送る定期催促
 *
 * 安全設計: 1回の tick で処理する件数は MAX_PROCESS_PER_RUN で上限を設ける。
 */

import type { AIProvider } from '../../ai/index.js';
import type { MisskeyClient } from '../../misskey/client.js';
import { getReleasedCharacterByNum, getDefaultCharacterProfile } from '../character/loader.js';
import { buildCharacterSystemPrompt } from '../character/prompt-builder.js';
import { BotStateStore, STATE_KEY_SCHEDULER_CHAR } from '../../storage/bot-state.js';
import { TaskStore, type TaskRecord } from '../../storage/task.js';
import type { TrustStore } from '../../storage/trust.js';
import { formatSpeech } from '../responder/emoji.js';
import { logger } from '../../utils/logger.js';
import { BOT_CONSTANTS } from '../../config/constants.js';

/** 配信チェック間隔（5分） */
const TASK_CHECK_INTERVAL_MS = 5 * 60 * 1000;

/** 1回の tick で処理する件数の安全上限 */
const MAX_PROCESS_PER_RUN = 5;

/** 期日・remind_atに関係のない定期催促の間隔（12時間） */
const PERIODIC_NUDGE_INTERVAL_MS = 12 * 60 * 60 * 1000;

export interface TaskSchedulerDeps {
  ai: AIProvider;
  misskeyClient: MisskeyClient;
  botState: BotStateStore;
  taskStore: TaskStore;
  trustStore: TrustStore;
}

function mentionPrefix(task: TaskRecord): string {
  if (!task.username) return '';
  return `@${task.username}${task.userHost ? `@${task.userHost}` : ''} `;
}

/** リマインド本文をキャラクターの口調で LLM 生成する。失敗時はテンプレートにフォールバックする。 */
async function generateReminderMessage(
  ai: AIProvider,
  systemPrompt: string,
  task: TaskRecord,
): Promise<string> {
  const flavor =
    task.remindType === 'schedule'
      ? 'イベント発生・達成を祝う、または激励するメッセージにしてください。'
      : 'まだ終わっていないかもしれないことを、やさしく思い出させるメッセージにしてください。';
  try {
    const result = await ai.chat(
      [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content:
            `タスクの通知・リマインドメッセージを40文字以内で生成してください（台詞のみ）。\n` +
            `タスク: ${task.title}（種別: ${task.remindType}）\n${flavor}`,
        },
      ],
      { maxTokens: 100, temperature: 0.9 },
    );
    return result.text.trim();
  } catch (err) {
    logger.error('[TaskScheduler] LLM reminder message generation failed, falling back:', err);
    return task.remindType === 'schedule'
      ? `「${task.title}」の時間だよ！うまくいくといいね。`
      : `「${task.title}」のリマインドだよ。まだ終わってない？`;
  }
}

/** 期日超過メッセージをキャラクターの口調で LLM 生成する。失敗時はテンプレートにフォールバックする。 */
async function generateOverdueMessage(
  ai: AIProvider,
  systemPrompt: string,
  task: TaskRecord,
): Promise<string> {
  try {
    const result = await ai.chat(
      [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content:
            `タスクの期日超過を伝えるメッセージを40文字以内で生成してください（台詞のみ）。\n` +
            `タスク: ${task.title}`,
        },
      ],
      { maxTokens: 100, temperature: 0.9 },
    );
    return result.text.trim();
  } catch (err) {
    logger.error('[TaskScheduler] LLM overdue message generation failed, falling back:', err);
    return `「${task.title}」の期日が過ぎているよ。まだ終わってない？`;
  }
}

/** 定期催促メッセージをキャラクターの口調で LLM 生成する。失敗時はテンプレートにフォールバックする。 */
async function generateNudgeMessage(
  ai: AIProvider,
  systemPrompt: string,
  task: TaskRecord,
): Promise<string> {
  try {
    const result = await ai.chat(
      [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content:
            `残っているタスクを気にかける定期的な声かけメッセージを40文字以内で生成してください（台詞のみ）。\n` +
            `タスク: ${task.title}`,
        },
      ],
      { maxTokens: 100, temperature: 0.9 },
    );
    return result.text.trim();
  } catch (err) {
    logger.error('[TaskScheduler] LLM nudge message generation failed, falling back:', err);
    return `「${task.title}」、まだ残ってるよ。無理しない範囲で進めてね。`;
  }
}

export class TaskScheduler {
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly deps: TaskSchedulerDeps) {}

  start(): void {
    this.intervalHandle = setInterval(
      () => void this.tick(),
      TASK_CHECK_INTERVAL_MS,
    );
    logger.info('TaskScheduler started');
  }

  stop(): void {
    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  private async tick(): Promise<void> {
    const charNum = this.deps.botState.getState(STATE_KEY_SCHEDULER_CHAR) ?? BOT_CONSTANTS.CHITOSE_NUM;
    const profile = getReleasedCharacterByNum(charNum) ?? getDefaultCharacterProfile();
    const systemPrompt = buildCharacterSystemPrompt(profile, 'chat');

    const dueForRemind = this.deps.taskStore.getDueForRemind(Date.now(), MAX_PROCESS_PER_RUN);
    for (const task of dueForRemind) {
      await this.deliverReminder(task, charNum, systemPrompt);
    }

    const overdue = this.deps.taskStore.getOverdue(Date.now(), MAX_PROCESS_PER_RUN);
    for (const task of overdue) {
      await this.deliverOverdue(task, charNum, systemPrompt);
    }

    const forNudge = this.deps.taskStore.getForPeriodicNudge(
      Date.now(),
      PERIODIC_NUDGE_INTERVAL_MS,
      MAX_PROCESS_PER_RUN,
    );
    for (const task of forNudge) {
      await this.deliverNudge(task, charNum, systemPrompt);
    }
  }

  private async deliverReminder(task: TaskRecord, charNum: string, systemPrompt: string): Promise<void> {
    try {
      const messageText = await generateReminderMessage(this.deps.ai, systemPrompt, task);
      const speechText = formatSpeech(charNum, `${mentionPrefix(task)}${messageText}`);
      await this.deps.misskeyClient.postToUser(speechText, task.userId);

      if (task.remindType === 'schedule') {
        this.deps.taskStore.markDone(task.id, Date.now());
        this.deps.trustStore.recordScheduleNotification(task.userId);
      } else if (task.remindType === 'alert') {
        // remind_at を残したままだと次tick以降も getDueForRemind に該当し続け、無限に再送されてしまう
        this.deps.taskStore.clearRemindAt(task.id);
      }
      logger.info(`[TaskScheduler] Delivered reminder for task #${task.id} to ${task.userId}`);
    } catch (err) {
      logger.error(`[TaskScheduler] Failed to deliver reminder for task #${task.id}:`, err);
    }
  }

  private async deliverOverdue(task: TaskRecord, charNum: string, systemPrompt: string): Promise<void> {
    try {
      const messageText = await generateOverdueMessage(this.deps.ai, systemPrompt, task);
      const speechText = formatSpeech(charNum, `${mentionPrefix(task)}${messageText}`);
      await this.deps.misskeyClient.postToUser(speechText, task.userId);
      this.deps.taskStore.markDueNotified(task.id);
      logger.info(`[TaskScheduler] Delivered overdue notice for task #${task.id} to ${task.userId}`);
    } catch (err) {
      logger.error(`[TaskScheduler] Failed to deliver overdue notice for task #${task.id}:`, err);
    }
  }

  private async deliverNudge(task: TaskRecord, charNum: string, systemPrompt: string): Promise<void> {
    try {
      const messageText = await generateNudgeMessage(this.deps.ai, systemPrompt, task);
      const speechText = formatSpeech(charNum, `${mentionPrefix(task)}${messageText}`);
      await this.deps.misskeyClient.postToUser(speechText, task.userId);
      this.deps.taskStore.markNudged(task.id, Date.now());
      logger.info(`[TaskScheduler] Delivered periodic nudge for task #${task.id} to ${task.userId}`);
    } catch (err) {
      logger.error(`[TaskScheduler] Failed to deliver periodic nudge for task #${task.id}:`, err);
    }
  }
}

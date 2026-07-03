// 時間帯別自発投稿スケジューラー（F-02: 深夜雑談モード拡張）

import type { AIProvider } from '../../ai/index.js';
import type { MisskeyClient } from '../../misskey/client.js';
import { getReleasedCharacterByNum, getDefaultCharacterProfile } from '../character/loader.js';
import { buildCharacterSystemPrompt } from '../character/prompt-builder.js';
import { BotStateStore, STATE_KEY_SCHEDULER_CHAR } from '../../storage/bot-state.js';
import type { ReminderStore } from '../../storage/reminder.js';
import { WeeklyPollScheduler } from './weekly-poll.js';
import { ReminderScheduler } from './reminder-scheduler.js';
import { formatSpeech } from '../responder/emoji.js';
import { logger } from '../../utils/logger.js';
import { BOT_CONSTANTS } from '../../config/constants.js';

// ----------------------------------------------------------------
// 時間帯スロット定義
// ----------------------------------------------------------------

interface TimeSlot {
  /** JST 開始時刻（0〜23） */
  readonly startHour: number;
  /** JST 終了時刻（exclusive）。startHour より小さい場合は0時をまたぐ */
  readonly endHour: number;
  /** ログ用ラベル */
  readonly label: string;
  /** AI プロンプトに付加する時間帯固有の指示 */
  readonly promptAddendum: string;
}

const TIME_SLOTS: readonly TimeSlot[] = [
  {
    startHour: 6,
    endHour: 8,
    label: '朝',
    promptAddendum:
      '朝の時間帯（6〜8時）です。元気でテキパキした口調で、軽い挨拶や作業開始の声かけをひとことつぶやいてください。',
  },
  {
    startHour: 12,
    endHour: 13,
    label: '昼',
    promptAddendum:
      '昼の時間帯（12〜13時）です。落ち着いた口調で、お昼らしい短いつぶやきをひとことしてください。',
  },
  {
    startHour: 17,
    endHour: 19,
    label: '夕方',
    promptAddendum:
      '夕方の時間帯（17〜19時）です。お疲れ様の声かけや夕方らしいつぶやきをひとことしてください。',
  },
  {
    startHour: 23,
    endHour: 5, // 0時をまたぐ（翌5時まで）
    label: '深夜',
    promptAddendum:
      '深夜の時間帯（23〜翌5時）です。ほっこり・哲学的・少し眠そうなトーンで、作業中のフォロワーに寄り添う言葉をひとことつぶやいてください。',
  },
];

// ----------------------------------------------------------------
// AI プロンプト
// ----------------------------------------------------------------

/**
 * 担当キャラクターのシステムプロンプトを構築する。
 * botState から担当番号を取得し、DB のプロフィールを使って動的生成する。
 * 担当が未設定の場合は 000(チトセ) のデフォルトプロンプトにフォールバックする。
 */
function buildSchedulerSystemPrompt(botState: BotStateStore): string {
  const charNum = botState.getState(STATE_KEY_SCHEDULER_CHAR) ?? BOT_CONSTANTS.CHITOSE_NUM;
  const profile = getReleasedCharacterByNum(charNum) ?? getDefaultCharacterProfile();
  const base = buildCharacterSystemPrompt(profile, 'chat');

  return `${base}

【自発投稿の制約】
- 台詞部分のみ出力すること（書式は呼び出し元が付与するため、台詞テキストだけ返す）
- 50文字以内
- 反社会的・著しく性的な表現は絶対に行わない
- 未公開のナンバーテールズ設定・台詞・ストーリーを自動生成しない`;
}

// ----------------------------------------------------------------
// ユーティリティ
// ----------------------------------------------------------------

/** 現在の JST 時刻（時）を返す */
function getJSTHour(): number {
  return (new Date().getUTCHours() + 9) % 24;
}

/** 1〜2時間のランダムなクールダウン（ms）を返す */
function randomCooldownMs(): number {
  const range = BOT_CONSTANTS.SCHEDULER_MAX_COOLDOWN_MS - BOT_CONSTANTS.SCHEDULER_MIN_COOLDOWN_MS;
  return BOT_CONSTANTS.SCHEDULER_MIN_COOLDOWN_MS + Math.random() * range;
}

/**
 * 指定時刻がいずれかのスロットに該当すれば、そのスロットを返す
 * 0時またぎスロット（endHour < startHour）も正しく判定する
 */
function getActiveSlot(hour: number): TimeSlot | null {
  for (const slot of TIME_SLOTS) {
    if (slot.endHour <= slot.startHour) {
      // 0時またぎスロット（例: 23〜5）
      if (hour >= slot.startHour || hour < slot.endHour) return slot;
    } else {
      if (hour >= slot.startHour && hour < slot.endHour) return slot;
    }
  }
  return null;
}

// ----------------------------------------------------------------
// PostScheduler クラス
// ----------------------------------------------------------------

export interface SchedulerDeps {
  ai: AIProvider;
  misskeyClient: MisskeyClient;
  botState: BotStateStore;
  reminderStore: ReminderStore;
}

/**
 * 時間帯別自発投稿スケジューラー
 *
 * 動作:
 * - SCHEDULER_CHECK_INTERVAL_MS（10分）ごとに JST 時刻を確認
 * - 定義済みスロット（朝/昼/夕方/深夜）に該当し、クールダウンが切れていれば投稿
 * - クールダウンはスロット横断で共有（1〜2時間ランダム）
 * - 週次 Poll スケジューラー（WeeklyPollScheduler）も内包して同時管理
 */
export class PostScheduler {
  private lastPostedAt: number | null = null;
  private nextCooldownMs: number;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private readonly weeklyPoll: WeeklyPollScheduler;
  private readonly reminderScheduler: ReminderScheduler;

  constructor(private readonly deps: SchedulerDeps) {
    this.nextCooldownMs = randomCooldownMs();
    this.weeklyPoll = new WeeklyPollScheduler({
      ai: deps.ai,
      misskeyClient: deps.misskeyClient,
      botState: deps.botState,
    });
    this.reminderScheduler = new ReminderScheduler({
      ai: deps.ai,
      misskeyClient: deps.misskeyClient,
      botState: deps.botState,
      reminderStore: deps.reminderStore,
    });
  }

  start(): void {
    this.intervalHandle = setInterval(
      () => void this.tick(),
      BOT_CONSTANTS.SCHEDULER_CHECK_INTERVAL_MS,
    );
    this.weeklyPoll.start();
    this.reminderScheduler.start();
    logger.info('Post scheduler started');
  }

  stop(): void {
    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    this.weeklyPoll.stop();
    this.reminderScheduler.stop();
  }

  private isOnCooldown(): boolean {
    if (this.lastPostedAt === null) return false;
    return Date.now() - this.lastPostedAt < this.nextCooldownMs;
  }

  private async tick(): Promise<void> {
    const slot = getActiveSlot(getJSTHour());
    if (slot === null) return;
    if (this.isOnCooldown()) return;

    // 月曜7時: 就任挨拶（B-4）— 就任挨拶を送ったら通常スロット投稿はスキップ
    const hour = getJSTHour();
    const dayOfWeek = new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCDay();
    if (dayOfWeek === 1 && hour === 7) {
      await this.weeklyPoll.postInaugurationGreeting();
      this.lastPostedAt = Date.now();
      this.nextCooldownMs = randomCooldownMs();
      return;
    }

    try {
      const systemPrompt = buildSchedulerSystemPrompt(this.deps.botState);
      const charNum = this.deps.botState.getState(STATE_KEY_SCHEDULER_CHAR) ?? BOT_CONSTANTS.CHITOSE_NUM;
      const result = await this.deps.ai.chat(
        [
          {
            role: 'system',
            content: `${systemPrompt}\n\n【現在の時間帯】\n${slot.promptAddendum}`,
          },
          { role: 'user', content: 'つぶやきをひとつ投稿してください。' },
        ],
        { maxTokens: 80, temperature: 0.9 },
      );
      const speechText = formatSpeech(charNum, result.text.trim());
      await this.deps.misskeyClient.post(speechText);
      this.lastPostedAt = Date.now();
      this.nextCooldownMs = randomCooldownMs();
      logger.info(`[${slot.label}] Scheduled post sent: "${speechText.slice(0, 40)}..."`);
    } catch (err) {
      logger.error('Scheduler post error:', err);
    }
  }
}
